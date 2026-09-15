import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  createAuthorizationDatabase,
  localTestIdentities,
  localTestOrganizations,
  prepareLocalTestIdentities,
  type Prisma,
} from '@caau/database';
import { localIdentityKeys, roles, taskActions } from './authorization.dto.js';
import {
  deny,
  eventManager,
  hasRole,
  taskPolicy,
  type Actor,
} from './policy.js';

export interface AuthorizationConfig {
  databaseUrl?: string;
  localIdentity: boolean;
}
export interface AuthRequest {
  headers: { authorization?: string };
  token?: string;
}
export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value))
    throw new BadRequestException('UUID required');
  return value.toLowerCase();
}
export function bodyObject(
  input: unknown,
  keys: string[],
): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !keys.includes(k))
  )
    throw new BadRequestException('Invalid body');
  return input as Record<string, unknown>;
}
export function text(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new BadRequestException('Invalid text');
  return value.trim();
}

// Only allowlisted IDs, enums and booleans; never names, arbitrary body, or tokens.
function auditContext(input: unknown): Prisma.InputJsonObject {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input).filter(
      ([key, value]) =>
        ([
          'userId',
          'organizationId',
          'eventId',
          'memberId',
          'handlerGrantId',
          'reviewerGrantId',
          'handlerMemberId',
          'reviewerMemberId',
        ].includes(key) &&
          (value === null ||
            (typeof value === 'string' && uuidPattern.test(value)))) ||
        (key === 'active' && typeof value === 'boolean') ||
        (key === 'expectedRevision' &&
          Number.isInteger(value) &&
          Number(value) > 0) ||
        (key === 'role' && roles.includes(value as (typeof roles)[number])) ||
        (key === 'action' &&
          taskActions.includes(value as (typeof taskActions)[number])),
    ),
  );
}

@Injectable()
export class AuthorizationService {
  private readonly database;
  constructor(private readonly config: AuthorizationConfig) {
    this.database = config.databaseUrl
      ? createAuthorizationDatabase(config.databaseUrl)
      : undefined;
  }
  async onModuleDestroy() {
    await this.database?.close();
  }
  private db() {
    if (!this.config.localIdentity || !this.database)
      throw new ServiceUnavailableException('Local identity unavailable');
    return this.database.client;
  }
  localIdentityOptions() {
    this.db();
    return localTestIdentities.map((identity) => ({
      key: identity.key,
      displayName: identity.displayName,
      organizationName:
        localTestOrganizations.find(
          (organization) => organization.id === identity.organizationId,
        )?.name ?? '',
      role: identity.role,
    }));
  }
  async issueLocalTestSession(input: unknown) {
    const db = this.db();
    const body = bodyObject(input, ['identity']);
    if (
      typeof body.identity !== 'string' ||
      !localIdentityKeys.includes(
        body.identity as (typeof localIdentityKeys)[number],
      )
    )
      throw new BadRequestException('Invalid fixed identity');
    const identity = localTestIdentities.find(
      (candidate) => candidate.key === body.identity,
    )!;
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    try {
      await db.$transaction(
        async (tx) => {
          await prepareLocalTestIdentities(tx);
          const user = await tx.internalUser.findUnique({
            where: { id: identity.userId },
            include: { memberships: true },
          });
          if (
            !user?.active ||
            !user.memberships.some(
              (member) =>
                member.active &&
                member.organizationId === identity.organizationId &&
                member.role === identity.role,
            )
          )
            throw new ForbiddenException('Fixed local identity is inactive');
          await tx.session.create({
            data: {
              userId: identity.userId,
              tokenHash: hashToken(token),
              expiresAt,
            },
          });
          await tx.auditRecord.create({
            data: {
              actorId: identity.userId,
              action: 'session.local.issue',
              resourceId: identity.userId,
              outcome: 'ALLOWED',
              requestId: randomUUID(),
            },
          });
        },
        { isolationLevel: 'Serializable' },
      );
      return {
        identity: identity.key,
        token,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Local identity unavailable');
    }
  }
  private async actor(tx: Prisma.TransactionClient, token: string) {
    const session = await tx.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: { memberships: true } } },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.user.active
    )
      throw new UnauthorizedException('Invalid session');
    return session.user;
  }
  async reloadActor(tx: Prisma.TransactionClient, token: string) {
    return this.actor(tx, token);
  }
  async authenticate(request: AuthRequest) {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
      request.headers.authorization ?? '',
    );
    try {
      if (!match?.[1])
        throw new UnauthorizedException('Bearer session required');
      await this.actor(this.db(), match[1]);
      request.token = match[1];
    } catch (error) {
      if (this.config.localIdentity && this.database) {
        try {
          await this.database.client.auditRecord.create({
            data: {
              action: 'session.authenticate',
              outcome: 'DENIED',
              requestId: randomUUID(),
            },
          });
        } catch {
          throw new ServiceUnavailableException('Authorization unavailable');
        }
      }
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Authorization unavailable');
    }
  }
  execute(token: string, action: string, resource?: string, input?: unknown) {
    return this.run(token, action, resource, input, (tx, actor, id) =>
      this.dispatch(tx, actor, token, action, id, input),
    );
  }
  async run<T>(
    token: string,
    action: string,
    resource: string | undefined,
    input: unknown,
    work: (
      tx: Prisma.TransactionClient,
      actor: Actor,
      id: string | undefined,
    ) => Promise<T>,
    options: { retries?: number; timeout?: number; retryUnique?: boolean } = {},
  ): Promise<T> {
    const db = this.db();
    const requestId = randomUUID();
    const context = auditContext(input);
    let actorId: string | undefined;
    try {
      return await db.$transaction(
        async (tx) => {
          const actor = await this.actor(tx, token);
          actorId = actor.id;
          const id = resource === undefined ? undefined : uuid(resource);
          const result = await work(tx, actor, id);
          await tx.auditRecord.create({
            data: {
              actorId,
              action,
              resourceId:
                id ??
                (typeof result === 'object' && result && 'id' in result
                  ? String(result.id)
                  : undefined),
              outcome: 'ALLOWED',
              requestId,
              context,
            },
          });
          return result;
        },
        { isolationLevel: 'Serializable', timeout: options.timeout ?? 5000 },
      );
    } catch (error) {
      const databaseError = error as {
        code?: string;
        meta?: {
          code?: string;
          driverAdapterError?: { cause?: { originalCode?: string } };
        };
      };
      const sqlState =
        databaseError.meta?.code ??
        databaseError.meta?.driverAdapterError?.cause?.originalCode;
      const serializationConflict =
        databaseError.code === 'P2034' ||
        (databaseError.code === 'P2010' &&
          ['40001', '40P01'].includes(sqlState ?? ''));
      if (
        (serializationConflict ||
          (options.retryUnique && databaseError.code === 'P2002')) &&
        (options.retries ?? 0) > 0
      )
        return this.run(token, action, resource, input, work, {
          ...options,
          retries: options.retries! - 1,
        });
      try {
        await db.auditRecord.create({
          data: {
            actorId,
            action,
            resourceId:
              resource && uuidPattern.test(resource) ? resource : undefined,
            outcome: 'DENIED',
            requestId,
            context,
          },
        });
      } catch {
        throw new ServiceUnavailableException('Authorization unavailable');
      }
      if (error instanceof HttpException) throw error;
      const code = (error as { code?: string }).code;
      if (
        serializationConflict ||
        ['P2002', 'P2003', 'P2025'].includes(code ?? '')
      )
        throw new ConflictException('Conflicting authorization change');
      throw new ServiceUnavailableException('Authorization unavailable');
    }
  }
  async createEventAnchor(
    tx: Prisma.TransactionClient,
    actor: Actor,
  ): Promise<{ id: string }> {
    return (await this.dispatch(
      tx,
      actor,
      '',
      'event.create',
      undefined,
      undefined,
    )) as { id: string };
  }
  async requireEventManager(
    tx: Prisma.TransactionClient,
    actor: Actor,
    eventId: string,
  ) {
    if (hasRole(actor, 'ORGANIZER')) deny();
    await eventManager(tx, actor, eventId);
  }
  async assignTaskAnchor(
    tx: Prisma.TransactionClient,
    actor: Actor,
    eventId: string,
    organizationId: string,
    handlerMemberId: string,
    reviewerMemberId: string,
    taskId?: string,
  ) {
    await this.requireEventManager(tx, actor, eventId);
    const handler = await tx.organizationMember.findUnique({
      where: { id: handlerMemberId },
      include: { user: true },
    });
    const reviewer = await tx.organizationMember.findUnique({
      where: { id: reviewerMemberId },
      include: { user: { include: { memberships: true } } },
    });
    if (
      !handler?.active ||
      !handler.user.active ||
      handler.role !== 'ORGANIZER' ||
      handler.organizationId !== organizationId ||
      !reviewer?.active ||
      !reviewer.user.active ||
      reviewer.role !== 'REVIEWER' ||
      reviewer.userId === handler.userId ||
      reviewer.user.memberships.some(
        (m) =>
          m.active &&
          (m.role === 'ORGANIZER' || m.organizationId === organizationId),
      )
    )
      deny();
    const grant = (memberId: string) =>
      tx.eventGrant.upsert({
        where: { eventId_memberId: { eventId, memberId } },
        create: { eventId, memberId },
        update: {},
      });
    const handlerGrant = await grant(handler.id);
    const reviewerGrant = await grant(reviewer.id);
    if (!handlerGrant.active || !reviewerGrant.active) deny();
    const data = {
      eventId,
      handlerGrantId: handlerGrant.id,
      reviewerGrantId: reviewerGrant.id,
    };
    return taskId
      ? tx.taskScope.update({ where: { id: taskId }, data })
      : tx.taskScope.create({ data });
  }
  async directory(tx: Prisma.TransactionClient, actor: Actor) {
    if (
      (!hasRole(actor, 'EVENT_MANAGER') && !hasRole(actor, 'SYSTEM_ADMIN')) ||
      hasRole(actor, 'ORGANIZER')
    )
      deny();
    const administrator = hasRole(actor, 'SYSTEM_ADMIN');
    const members = await tx.organizationMember.findMany({
      where: {
        active: true,
        user: { active: true },
        ...(administrator
          ? {}
          : {
              role: {
                in: ['ORGANIZER', 'REVIEWER'] as Array<
                  'ORGANIZER' | 'REVIEWER'
                >,
              },
            }),
      },
      select: { id: true, userId: true, organizationId: true, role: true },
      orderBy: { id: 'asc' },
    });
    return {
      users: await tx.internalUser.findMany({
        where: {
          active: true,
          ...(administrator
            ? {}
            : { id: { in: members.map((m) => m.userId) } }),
        },
        select: { id: true, displayName: true },
        orderBy: { id: 'asc' },
      }),
      organizations: await tx.organization.findMany({
        where: administrator
          ? {}
          : { id: { in: members.map((m) => m.organizationId) } },
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      }),
      members,
    };
  }
  private async dispatch(
    tx: Prisma.TransactionClient,
    actor: Actor,
    token: string,
    action: string,
    id: string | undefined,
    input: unknown,
  ): Promise<unknown> {
    if (action === 'session.me') return { id: actor.id };
    if (action === 'session.logout') {
      await tx.session.update({
        where: { tokenHash: hashToken(token) },
        data: { revokedAt: new Date() },
      });
      return { id: actor.id };
    }
    if (action.startsWith('admin.')) {
      if (!hasRole(actor, 'SYSTEM_ADMIN')) deny();
      if (action === 'admin.user.create') {
        const b = bodyObject(input, ['displayName']);
        return tx.internalUser.create({
          data: { displayName: text(b.displayName, 80) },
          select: { id: true },
        });
      }
      if (action === 'admin.organization.create') {
        const b = bodyObject(input, ['name']);
        return tx.organization.create({
          data: { name: text(b.name, 120) },
          select: { id: true },
        });
      }
      if (action === 'admin.member.create') {
        const b = bodyObject(input, ['userId', 'organizationId', 'role']);
        if (!roles.includes(b.role as (typeof roles)[number]))
          throw new BadRequestException('Invalid role');
        return tx.organizationMember.create({
          data: {
            userId: uuid(b.userId),
            organizationId: uuid(b.organizationId),
            role: b.role as (typeof roles)[number],
          },
          select: { id: true },
        });
      }
      if (action === 'admin.user.active' || action === 'admin.member.active') {
        const b = bodyObject(input, ['active']);
        if (typeof b.active !== 'boolean')
          throw new BadRequestException('Boolean required');
        return action === 'admin.user.active'
          ? tx.internalUser.update({
              where: { id: id! },
              data: { active: b.active },
              select: { id: true },
            })
          : tx.organizationMember.update({
              where: { id: id! },
              data: { active: b.active },
              select: { id: true },
            });
      }
      if (action === 'admin.grant.create') {
        const b = bodyObject(input, ['eventId', 'memberId']);
        const member = await tx.organizationMember.findUnique({
          where: { id: uuid(b.memberId) },
          include: { user: true },
        });
        if (
          !member?.active ||
          !member.user.active ||
          member.role === 'SYSTEM_ADMIN'
        )
          deny();
        return tx.eventGrant.create({
          data: { eventId: uuid(b.eventId), memberId: member.id },
          select: { id: true },
        });
      }
      if (action === 'admin.grant.active') {
        const b = bodyObject(input, ['active']);
        if (typeof b.active !== 'boolean')
          throw new BadRequestException('Boolean required');
        return tx.eventGrant.update({
          where: { id: id! },
          data: { active: b.active },
          select: { id: true },
        });
      }
      if (action === 'admin.grant.delete') {
        const referenced = await tx.assignmentHistory.count({
          where: {
            OR: [
              { handlerGrantId: id! },
              { reviewerGrantId: id! },
              { previousHandlerGrantId: id! },
              { previousReviewerGrantId: id! },
            ],
          },
        });
        const individualReferences = await tx.individualAssignmentHistory.count(
          {
            where: {
              OR: [{ handlerGrantId: id! }, { previousHandlerGrantId: id! }],
            },
          },
        );
        if (referenced || individualReferences)
          throw new ConflictException(
            'Historical assignment grants must be retained; deactivate membership to revoke access',
          );
        return tx.eventGrant.delete({
          where: { id: id! },
          select: { id: true },
        });
      }
      if (action === 'admin.audit.read')
        return tx.auditRecord.findMany({
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: 100,
        });
      deny();
    }
    if (action === 'event.create') {
      const member = actor.memberships.find(
        (m) => m.active && m.role === 'EVENT_MANAGER',
      );
      if (!member || hasRole(actor, 'ORGANIZER')) deny();
      const event = await tx.eventScope.create({
        data: {},
        select: { id: true },
      });
      await tx.eventGrant.create({
        data: { eventId: event.id, memberId: member.id },
      });
      return event;
    }
    if (action === 'event.read') {
      const grants = await tx.eventGrant.count({
        where: {
          eventId: id!,
          active: true,
          member: {
            userId: actor.id,
            active: true,
            role: { not: 'SYSTEM_ADMIN' },
          },
        },
      });
      if (!grants) deny();
      return { id };
    }
    if (action === 'task.create') {
      const b = bodyObject(input, ['eventId', 'handlerGrantId']);
      const eventId = uuid(b.eventId);
      await eventManager(tx, actor, eventId);
      if (hasRole(actor, 'ORGANIZER')) deny();
      const handler = await tx.eventGrant.findUnique({
        where: { id: uuid(b.handlerGrantId) },
        include: { member: { include: { user: true } } },
      });
      if (
        !handler ||
        !handler.active ||
        handler.eventId !== eventId ||
        handler.member.role !== 'ORGANIZER' ||
        !handler.member.active ||
        !handler.member.user.active
      )
        deny();
      return tx.taskScope.create({
        data: { eventId, handlerGrantId: handler.id },
        select: { id: true },
      });
    }
    if (action === 'task.reviewer.assign') {
      const b = bodyObject(input, ['reviewerGrantId']);
      const task = await tx.taskScope.findUnique({
        where: { id: id! },
        include: { handler: { include: { member: true } } },
      });
      if (!task) deny();
      await eventManager(tx, actor, task.eventId);
      if (hasRole(actor, 'ORGANIZER')) deny();
      if (await tx.materialTask.findUnique({ where: { id: id! } }))
        throw new ConflictException(
          'Use the business task assignment operation',
        );
      const reviewerGrantId =
        b.reviewerGrantId === null ? null : uuid(b.reviewerGrantId);
      if (reviewerGrantId) {
        const grant = await tx.eventGrant.findUnique({
          where: { id: reviewerGrantId },
          include: {
            member: { include: { user: { include: { memberships: true } } } },
          },
        });
        if (
          !grant ||
          !grant.active ||
          grant.eventId !== task.eventId ||
          grant.member.role !== 'REVIEWER' ||
          !grant.member.active ||
          !grant.member.user.active ||
          grant.member.userId === task.handler.member.userId ||
          grant.member.user.memberships.some(
            (m) =>
              m.active &&
              (m.organizationId === task.handler.member.organizationId ||
                m.role === 'ORGANIZER'),
          )
        )
          deny();
      }
      return tx.taskScope.update({
        where: { id: id! },
        data: { reviewerGrantId },
        select: { id: true },
      });
    }
    if (action === 'task.read' || action === 'task.access') {
      const b =
        action === 'task.access'
          ? bodyObject(input, ['action'])
          : { action: 'task.read' };
      if (!taskActions.includes(b.action as (typeof taskActions)[number]))
        throw new BadRequestException('Invalid action');
      await taskPolicy(tx, actor, id!, String(b.action));
      return { id };
    }
    deny();
  }
}
