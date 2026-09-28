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
import type { TeamProfileDto, TeamViewDto } from './teams.dto.js';
type Tx = Prisma.TransactionClient;
type Master = Prisma.TeamGetPayload<{ include: { members: true } }>;
type Entry = Prisma.EventTeamGetPayload<Record<string, never>>;
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
      profile: row.profile as unknown as TeamProfileDto,
      active: row.active,
      revision: row.revision,
      sourceTeamRevision: master ? row.revision : row.sourceTeamRevision,
      bound: master && row.members.some((m) => m.active),
      canEdit: master ? this.editable(actor, row) : true,
      updatedAt: row.updatedAt.toISOString(),
    };
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
      'profile',
    ]);
    const id = uuid(body.id),
      organizationId = uuid(body.organizationId),
      p = profile(body.profile);
    const eventId = body.eventId === undefined ? undefined : uuid(body.eventId);
    if (
      !isHeadquartersSuperAdmin(actor) &&
      !this.organizations(actor).includes(organizationId)
    )
      deny();
    if (eventId) await this.event(tx, actor, eventId);
    const creationHash = createHash('sha256')
      .update(JSON.stringify({ organizationId, eventId, profile: p }))
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
    if (eventId) await this.attach(tx, actor, eventId, row);
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
  private async attach(tx: Tx, actor: Actor, eventId: string, team: Master) {
    const existing = await tx.eventTeam.findUnique({
      where: { eventId_teamId: { eventId, teamId: team.id } },
    });
    if (existing) return existing; // Retry never refreshes an existing snapshot.
    if (!team.active) throw new ConflictException('归档球队不能新增到赛事');
    const row = await tx.eventTeam.create({
      data: {
        id: randomUUID(),
        eventId,
        teamId: team.id,
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
        const body = bodyObject(input, ['teamId']);
        const team = await this.master(tx, actor, uuid(body.teamId));
        return this.view(await this.attach(tx, actor, eventId, team), actor);
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
        ...bodyObject(input, ['expectedRevision', 'profile', 'active']),
        eventId,
      },
      async (tx, actor) => {
        await this.event(tx, actor, eventId);
        const c = change(input);
        const previous = await tx.eventTeam.findFirst({
          where: { id, eventId },
        });
        if (!previous) deny();
        const changed = await tx.eventTeam.updateMany({
          where: { id, eventId, revision: c.expectedRevision },
          data: {
            profile: json(c.profile),
            active: c.active,
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
