import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@caau/database';
import {
  AuthorizationService,
  bodyObject,
  text,
  uuid,
} from '../authorization/authorization.service.js';
import { deny, eventOperations, type Actor } from '../authorization/policy.js';
import type {
  EventStaffProfileDto,
  EventStaffViewDto,
} from './event-staff.dto.js';

function profile(input: unknown): EventStaffProfileDto {
  const b = bodyObject(input, [
    'name',
    'roles',
    'duties',
    'contactPhone',
    'organization',
    'notes',
  ]);
  if (!Array.isArray(b.roles) || b.roles.length < 1 || b.roles.length > 10)
    throw new BadRequestException('请选择1至10项岗位');
  const optional = (value: unknown, max: number) =>
    value === '' || value === undefined ? '' : text(value, max);
  const phone = optional(b.contactPhone, 40);
  if (phone && !/^[+\d][\d\s()-]{5,39}$/.test(phone))
    throw new BadRequestException('Invalid phone');
  return {
    name: text(b.name, 80),
    roles: [...new Set(b.roles.map((role) => text(role, 80)))],
    duties: optional(b.duties, 1000),
    contactPhone: phone,
    organization: optional(b.organization, 120),
    notes: optional(b.notes, 1000),
  };
}
function view(row: Prisma.EventStaffGetPayload<object>): EventStaffViewDto {
  return {
    id: row.id,
    eventId: row.eventId,
    profile: row.profile as unknown as EventStaffProfileDto,
    active: row.active,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
  };
}
const json = (value: unknown) => value as Prisma.InputJsonValue;

@Injectable()
export class EventStaffService {
  constructor(private readonly auth: AuthorizationService) {}
  private async access(
    tx: Prisma.TransactionClient,
    actor: Actor,
    eventId: string,
  ) {
    uuid(eventId);
    if (
      !(await tx.event.findUnique({
        where: { id: eventId },
        select: { id: true },
      }))
    )
      deny();
    await eventOperations(tx, actor, eventId);
  }
  list(token: string, eventId: string) {
    return this.auth.run(
      token,
      'eventStaff.list',
      eventId,
      {},
      async (tx, actor) => {
        await this.access(tx, actor, eventId);
        return (
          await tx.eventStaff.findMany({
            where: { eventId },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          })
        ).map(view);
      },
    );
  }
  create(token: string, eventId: string, input: unknown) {
    return this.auth.run(
      token,
      'eventStaff.create',
      eventId,
      input,
      async (tx, actor) => {
        await this.access(tx, actor, eventId);
        const body = bodyObject(input, ['id', 'profile']);
        const id = uuid(body.id),
          values = profile(body.profile);
        const existing = await tx.eventStaff.findUnique({
          where: { id },
          include: { versions: { where: { revision: 1 } } },
        });
        if (existing) {
          if (existing.eventId !== eventId || existing.createdBy !== actor.id)
            deny();
          if (
            JSON.stringify(profile(existing.versions[0]?.profile)) !==
            JSON.stringify(values)
          )
            throw new ConflictException('重复请求内容不一致');
          return view(existing);
        }
        const row = await tx.eventStaff.create({
          data: {
            id,
            eventId,
            profile: json(values),
            createdBy: actor.id,
            updatedBy: actor.id,
          },
        });
        await tx.eventStaffVersion.create({
          data: {
            id: randomUUID(),
            staffId: id,
            profile: row.profile as Prisma.InputJsonValue,
            active: true,
            revision: 1,
            actorId: actor.id,
          },
        });
        return view(row);
      },
      { retries: 2, retryUnique: true },
    );
  }
  update(token: string, eventId: string, id: string, input: unknown) {
    return this.auth.run(
      token,
      'eventStaff.update',
      id,
      input,
      async (tx, actor) => {
        await this.access(tx, actor, eventId);
        const body = bodyObject(input, [
          'profile',
          'active',
          'expectedRevision',
        ]);
        const values = profile(body.profile);
        if (
          typeof body.active !== 'boolean' ||
          !Number.isSafeInteger(body.expectedRevision) ||
          Number(body.expectedRevision) < 1
        )
          throw new BadRequestException('Invalid active/revision');
        const existing = await tx.eventStaff.findFirst({
          where: { id: uuid(id), eventId },
        });
        if (!existing) deny();
        const changed = await tx.eventStaff.updateMany({
          where: { id, eventId, revision: Number(body.expectedRevision) },
          data: {
            profile: json(values),
            active: body.active,
            revision: { increment: 1 },
            updatedBy: actor.id,
            updatedAt: new Date(),
          },
        });
        if (changed.count !== 1)
          throw new ConflictException('人员已更新，请刷新后重试');
        const row = await tx.eventStaff.findUniqueOrThrow({ where: { id } });
        await tx.eventStaffVersion.create({
          data: {
            id: randomUUID(),
            staffId: id,
            profile: row.profile as Prisma.InputJsonValue,
            active: row.active,
            revision: row.revision,
            actorId: actor.id,
          },
        });
        return view(row);
      },
      { retries: 2 },
    );
  }
  history(token: string, eventId: string, id: string) {
    return this.auth.run(
      token,
      'eventStaff.history',
      id,
      {},
      async (tx, actor) => {
        await this.access(tx, actor, eventId);
        if (
          !(await tx.eventStaff.findFirst({ where: { eventId, id: uuid(id) } }))
        )
          deny();
        const rows = await tx.eventStaffVersion.findMany({
          where: { staffId: id },
          orderBy: { revision: 'desc' },
        });
        const actors = await tx.internalUser.findMany({
          where: { id: { in: [...new Set(rows.map((r) => r.actorId))] } },
          select: { id: true, displayName: true },
        });
        return rows.map((row) => ({
          profile: row.profile as unknown as EventStaffProfileDto,
          active: row.active,
          revision: row.revision,
          actorId: row.actorId,
          actorName:
            actors.find((a) => a.id === row.actorId)?.displayName ?? '历史账号',
          createdAt: row.createdAt.toISOString(),
        }));
      },
    );
  }
}
