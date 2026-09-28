import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@caau/database';
import {
  AuthorizationService,
  bodyObject,
  text,
  uuid,
} from '../authorization/authorization.service.js';
import {
  type Actor,
  deny,
  eventOperations,
  isHeadquartersSuperAdmin,
} from '../authorization/policy.js';
import type {
  TeamProfileDto,
  TeamViewDto,
  EventDivisionViewDto,
} from './teams.dto.js';
type Tx = Prisma.TransactionClient;
type Master = Prisma.TeamGetPayload<{ include: { members: true } }>;
type Entry = Prisma.EventTeamGetPayload<Record<string, never>>;
type Division = Prisma.EventDivisionGetPayload<Record<string, never>>;
const fields = {
  name: 120,
  contactName: 80,
  contactPhone: 40,
  province: 60,
  city: 60,
  district: 60,
  address: 300,
  shortName: 40,
  clubName: 120,
  introduction: 2000,
  notes: 2000,
};
function profile(input: unknown): TeamProfileDto {
  const body = bodyObject(input, Object.keys(fields));
  const result: Record<string, string> = {};
  for (const [key, max] of Object.entries(fields)) {
    const value = body[key];
    result[key] = [
      'name',
      'contactName',
      'contactPhone',
      'province',
      'city',
    ].includes(key)
      ? text(value, max)
      : value === undefined || value === ''
        ? ''
        : text(value, max);
  }
  if (!/^[+\d][\d\s()-]{5,39}$/.test(result.contactPhone!))
    throw new BadRequestException('Invalid contact phone');
  return result as unknown as TeamProfileDto;
}
function change(input: unknown) {
  const body = bodyObject(input, ['expectedRevision', 'profile', 'active']);
  if (
    !Number.isSafeInteger(body.expectedRevision) ||
    Number(body.expectedRevision) < 1 ||
    typeof body.active !== 'boolean'
  )
    throw new BadRequestException('Invalid revision or active');
  return {
    expectedRevision: Number(body.expectedRevision),
    active: body.active,
    profile: profile(body.profile),
  };
}
const json = (value: TeamProfileDto) => ({ ...value }) as Prisma.InputJsonValue;
@Injectable()
export class TeamsService {
  constructor(private readonly auth: AuthorizationService) {}
  private organizations(actor: Actor) {
    return actor.memberships
      .filter(
        (m) => m.active && ['ORGANIZER', 'EVENT_MANAGER'].includes(m.role),
      )
      .map((m) => m.organizationId);
  }
  private visible(actor: Actor): Prisma.TeamWhereInput {
    return isHeadquartersSuperAdmin(actor)
      ? {}
      : {
          OR: [
            { organizationId: { in: this.organizations(actor) } },
            { members: { some: { userId: actor.id, active: true } } },
          ],
        };
  }
  private editable(actor: Actor, team: Master) {
    return (
      isHeadquartersSuperAdmin(actor) ||
      team.members.some((m) => m.active && m.userId === actor.id) ||
      (!team.members.some((m) => m.active) &&
        this.organizations(actor).includes(team.organizationId))
    );
  }
  private async master(tx: Tx, actor: Actor, id: string, edit = false) {
    const row = await tx.team.findFirst({
      where: { AND: [{ id: uuid(id) }, this.visible(actor)] },
      include: { members: true },
    });
    if (!row || (edit && !this.editable(actor, row))) deny();
    return row;
  }
  private async event(tx: Tx, actor: Actor, eventId: string) {
    uuid(eventId);
    if (!(await tx.event.findUnique({ where: { id: eventId } }))) deny();
    await eventOperations(tx, actor, eventId);
  }
  private view(row: Master | Entry, actor: Actor): TeamViewDto {
    const master = 'members' in row;
    return {
      id: row.id,
      teamId: master ? row.id : row.teamId,
      organizationId: master ? row.organizationId : '',
      eventId: master ? '' : row.eventId,
      divisionId: master ? null : row.divisionId,
      profile: row.profile as unknown as TeamProfileDto,
      active: row.active,
      revision: row.revision,
      sourceTeamRevision: master ? row.revision : row.sourceTeamRevision,
      bound: master && row.members.some((m) => m.active),
      canEdit: master ? this.editable(actor, row) : true,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  private viewDivision(row: Division): EventDivisionViewDto {
    return {
      id: row.id,
      eventId: row.eventId,
      name: row.name,
      active: row.active,
      revision: row.revision,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  private async requireDivision(tx: Tx, eventId: string, value: unknown) {
    const id = uuid(value);
    const division = await tx.eventDivision.findFirst({
      where: { id, eventId, active: true },
    });
    if (!division) throw new BadRequestException('请选择本赛事有效竞赛组别');
    return division;
  }
  listDivisions(token: string, eventId: string) {
    return this.auth.run(
      token,
      'eventDivisions.list',
      eventId,
      {},
      async (tx, actor) => {
        await this.event(tx, actor, eventId);
        return (
          await tx.eventDivision.findMany({
            where: { eventId },
            orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
          })
        ).map((row) => this.viewDivision(row));
      },
    );
  }
  createDivision(token: string, eventId: string, input: unknown) {
    return this.auth.run(
      token,
      'eventDivisions.create',
      eventId,
      input,
      async (tx, actor) => {
        await this.event(tx, actor, eventId);
        const body = bodyObject(input, ['id', 'name']);
        const id = uuid(body.id);
        const name = text(body.name, 120);
        const existing = await tx.eventDivision.findUnique({ where: { id } });
        if (existing) {
          if (
            existing.eventId !== eventId ||
            existing.name !== name ||
            existing.createdBy !== actor.id
          )
            throw new ConflictException('组别创建冲突');
          return this.viewDivision(existing);
        }
        const row = await tx.eventDivision.create({
          data: { id, eventId, name, createdBy: actor.id, updatedBy: actor.id },
        });
        await tx.eventDivisionVersion.create({
          data: {
            id: randomUUID(),
            divisionId: id,
            name,
            active: true,
            revision: 1,
            actorId: actor.id,
          },
        });
        return this.viewDivision(row);
      },
      { retries: 2, retryUnique: true },
    );
  }
  updateDivision(token: string, eventId: string, id: string, input: unknown) {
    return this.auth.run(
      token,
      'eventDivisions.update',
      id,
      { ...bodyObject(input, ['name', 'active', 'expectedRevision']), eventId },
      async (tx, actor) => {
        await this.event(tx, actor, eventId);
        const body = bodyObject(input, ['name', 'active', 'expectedRevision']);
        const divisionId = uuid(id);
        const name = text(body.name, 120);
        if (
          typeof body.active !== 'boolean' ||
          !Number.isSafeInteger(body.expectedRevision) ||
          Number(body.expectedRevision) < 1
        )
          throw new BadRequestException('Invalid division revision or active');
        const previous = await tx.eventDivision.findFirst({
          where: { id: divisionId, eventId },
        });
        if (!previous) deny();
        if (
          !body.active &&
          (await tx.eventTeam.count({
            where: { eventId, divisionId, active: true },
          }))
        )
          throw new ConflictException('组别仍有参赛球队，请先归组或移出');
        const changed = await tx.eventDivision.updateMany({
          where: {
            id: divisionId,
            eventId,
            revision: Number(body.expectedRevision),
          },
          data: {
            name,
            active: body.active,
            revision: { increment: 1 },
            updatedBy: actor.id,
            updatedAt: new Date(),
          },
        });
        if (changed.count !== 1)
          throw new ConflictException('组别已更新，请刷新后重试');
        await tx.eventDivisionVersion.create({
          data: {
            id: randomUUID(),
            divisionId,
            name,
            active: body.active,
            revision: Number(body.expectedRevision) + 1,
            actorId: actor.id,
          },
        });
        return this.viewDivision(
          (await tx.eventDivision.findUnique({ where: { id: divisionId } }))!,
        );
      },
    );
  }
  organizationsList(token: string) {
    return this.auth.run(
      token,
      'teams.organizations',
      undefined,
      {},
      (tx, actor) =>
        tx.organization.findMany({
          where: isHeadquartersSuperAdmin(actor)
            ? {}
            : { id: { in: this.organizations(actor) } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
    );
  }
  list(token: string) {
    return this.auth.run(
      token,
      'teams.list',
      undefined,
      {},
      async (tx, actor) =>
        (
          await tx.team.findMany({
            where: this.visible(actor),
            include: { members: true },
            orderBy: { createdAt: 'desc' },
          })
        ).map((row) => this.view(row, actor)),
    );
  }
  create(token: string, input: unknown) {
    return this.auth.run(
      token,
      'teams.create',
      undefined,
      input,
      (tx, actor) => this.createInTransaction(tx, actor, input),
      { retries: 2, retryUnique: true },
    );
  }
  /** Reuse the existing create policy inside a caller's authorized transaction. */
  async createInTransaction(tx: Tx, actor: Actor, input: unknown) {
    const body = bodyObject(input, [
      'id',
      'organizationId',
      'eventId',
      'divisionId',
      'profile',
    ]);
    const id = uuid(body.id),
      organizationId = uuid(body.organizationId),
      p = profile(body.profile);
    const eventId = body.eventId === undefined ? undefined : uuid(body.eventId);
    if (!eventId && body.divisionId !== undefined)
      throw new BadRequestException('组别只能用于赛事参赛记录');
    if (
      !isHeadquartersSuperAdmin(actor) &&
      !this.organizations(actor).includes(organizationId)
    )
      deny();
    if (eventId) await this.event(tx, actor, eventId);
    const divisionId = eventId
      ? (await this.requireDivision(tx, eventId, body.divisionId)).id
      : undefined;
    const creationHash = createHash('sha256')
      .update(
        JSON.stringify({ organizationId, eventId, divisionId, profile: p }),
      )
      .digest('hex');
    const previous = await tx.team.findUnique({
      where: { id },
      include: { members: true },
    });
    if (previous) {
      if (
        previous.createdBy !== actor.id ||
        previous.creationHash !== creationHash
      )
        throw new ConflictException('Creation conflict');
      return this.view(previous, actor);
    }
    const row = await tx.team.create({
      data: {
        id,
        organizationId,
        profile: json(p),
        creationHash,
        createdBy: actor.id,
        updatedBy: actor.id,
      },
      include: { members: true },
    });
    await tx.teamVersion.create({
      data: {
        id: randomUUID(),
        teamId: id,
        profile: json(p),
        active: true,
        revision: 1,
        actorId: actor.id,
      },
    });
    if (eventId) await this.attach(tx, actor, eventId, divisionId!, row);
    return this.view(row, actor);
  }
  update(token: string, id: string, input: unknown) {
    return this.auth.run(
      token,
      'teams.update',
      id,
      input,
      async (tx, actor) => {
        await this.master(tx, actor, id, true);
        const c = change(input);
        const updated = await tx.team.updateMany({
          where: { id, revision: c.expectedRevision },
          data: {
            profile: json(c.profile),
            active: c.active,
            revision: { increment: 1 },
            updatedBy: actor.id,
            updatedAt: new Date(),
          },
        });
        if (updated.count !== 1)
          throw new ConflictException('资料已更新，请刷新后重试');
        await tx.teamVersion.create({
          data: {
            id: randomUUID(),
            teamId: id,
            profile: json(c.profile),
            active: c.active,
            revision: c.expectedRevision + 1,
            actorId: actor.id,
          },
        });
        return this.view(await this.master(tx, actor, id), actor);
      },
    );
  }
  listEvent(token: string, eventId: string) {
    return this.auth.run(
      token,
      'eventTeams.list',
      eventId,
      {},
      async (tx, actor) => {
        await this.event(tx, actor, eventId);
        return (
          await tx.eventTeam.findMany({
            where: { eventId },
            orderBy: { createdAt: 'desc' },
          })
        ).map((row) => this.view(row, actor));
      },
    );
  }
  private async attach(
    tx: Tx,
    actor: Actor,
    eventId: string,
    divisionId: string,
    team: Master,
  ) {
    const existing = await tx.eventTeam.findUnique({
      where: { eventId_teamId: { eventId, teamId: team.id } },
    });
    if (existing) {
      if (existing.divisionId !== divisionId)
        throw new ConflictException('球队已参赛，改组请编辑本赛事球队');
      return existing; // Retry never refreshes an existing snapshot.
    }
    if (!team.active) throw new ConflictException('归档球队不能新增到赛事');
    const row = await tx.eventTeam.create({
      data: {
        id: randomUUID(),
        eventId,
        teamId: team.id,
        divisionId,
        profile: team.profile as Prisma.InputJsonValue,
        sourceTeamRevision: team.revision,
        createdBy: actor.id,
        updatedBy: actor.id,
      },
    });
    await tx.eventTeamVersion.create({
      data: {
        id: randomUUID(),
        eventTeamId: row.id,
        divisionId,
        profile: row.profile as Prisma.InputJsonValue,
        active: true,
        revision: 1,
        actorId: actor.id,
      },
    });
    return row;
  }
  add(token: string, eventId: string, input: unknown) {
    return this.auth.run(
      token,
      'eventTeams.add',
      eventId,
      input,
      async (tx, actor) => {
        await this.event(tx, actor, eventId);
        const body = bodyObject(input, ['teamId', 'divisionId']);
        const team = await this.master(tx, actor, uuid(body.teamId));
        const divisionId = (
          await this.requireDivision(tx, eventId, body.divisionId)
        ).id;
        return this.view(
          await this.attach(tx, actor, eventId, divisionId, team),
          actor,
        );
      },
      { retries: 2, retryUnique: true },
    );
  }
  updateEvent(token: string, eventId: string, id: string, input: unknown) {
    return this.auth.run(
      token,
      'eventTeams.update',
      id,
      {
        ...bodyObject(input, [
          'expectedRevision',
          'profile',
          'active',
          'divisionId',
        ]),
        eventId,
      },
      async (tx, actor) => {
        await this.event(tx, actor, eventId);
        const body = bodyObject(input, [
          'expectedRevision',
          'profile',
          'active',
          'divisionId',
        ]);
        const c = change({
          expectedRevision: body.expectedRevision,
          profile: body.profile,
          active: body.active,
        });
        const previous = await tx.eventTeam.findFirst({
          where: { id, eventId },
        });
        if (!previous) deny();
        const divisionId =
          body.divisionId === undefined
            ? previous.divisionId
            : (await this.requireDivision(tx, eventId, body.divisionId)).id;
        if (!divisionId && c.active)
          throw new BadRequestException('参赛球队须先选择组别');
        if (divisionId && c.active)
          await this.requireDivision(tx, eventId, divisionId);
        if (
          divisionId &&
          divisionId !== previous.divisionId &&
          previous.divisionId
        ) {
          const schedule = await tx.eventSchedule.findUnique({
            where: { eventId },
            select: { matches: true },
          });
          const matches = Array.isArray(schedule?.matches)
            ? schedule.matches
            : [];
          if (
            matches.some(
              (match) =>
                match &&
                typeof match === 'object' &&
                !Array.isArray(match) &&
                (match.homeEventTeamId === id || match.awayEventTeamId === id),
            )
          )
            throw new ConflictException(
              '球队已进入当前赛程，请先处理赛程再改组',
            );
        }
        const changed = await tx.eventTeam.updateMany({
          where: { id, eventId, revision: c.expectedRevision },
          data: {
            profile: json(c.profile),
            active: c.active,
            divisionId,
            revision: { increment: 1 },
            updatedBy: actor.id,
            updatedAt: new Date(),
          },
        });
        if (changed.count !== 1)
          throw new ConflictException('资料已更新，请刷新后重试');
        await tx.eventTeamVersion.create({
          data: {
            id: randomUUID(),
            eventTeamId: id,
            divisionId,
            profile: json(c.profile),
            active: c.active,
            revision: c.expectedRevision + 1,
            actorId: actor.id,
          },
        });
        return this.view(
          (await tx.eventTeam.findUnique({ where: { id } }))!,
          actor,
        );
      },
    );
  }
}
