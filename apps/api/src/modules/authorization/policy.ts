import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@caau/database';

export type Actor = Prisma.InternalUserGetPayload<{
  include: { memberships: true };
}>;
export function deny(): never {
  throw new ForbiddenException('Access denied');
}
export function hasRole(actor: Actor, role: string) {
  return actor.memberships.some((m) => m.active && m.role === role);
}
export function isHeadquartersSuperAdmin(actor: Actor) {
  return hasRole(actor, 'HEADQUARTERS_SUPER_ADMIN');
}

export function scheduleReadScope(actor: Actor): Prisma.EventWhereInput {
  if (isHeadquartersSuperAdmin(actor)) return {};
  const operations = eventOperationsScope(actor);
  return {
    OR: [
      {
        scope: {
          grants: {
            some: {
              active: true,
              member: {
                userId: actor.id,
                active: true,
                role: { not: 'SYSTEM_ADMIN' },
              },
            },
          },
        },
      },
      ...((operations.OR as Prisma.EventWhereInput[]) ?? []),
    ],
  };
}

/** Events where the actor can use the competition-operation modules. */
export function eventOperationsScope(actor: Actor): Prisma.EventWhereInput {
  if (isHeadquartersSuperAdmin(actor)) return {};
  return {
    OR: [
      {
        scope: {
          grants: {
            some: {
              active: true,
              member: {
                userId: actor.id,
                active: true,
                role: 'EVENT_MANAGER',
              },
            },
          },
        },
      },
      {
        organizerAppointments: {
          some: {
            active: true,
            organization: {
              hostingHandlerGrants: {
                some: {
                  active: true,
                  member: {
                    userId: actor.id,
                    active: true,
                    role: 'ORGANIZER',
                  },
                },
              },
            },
          },
        },
      },
    ],
  };
}
export async function eventManager(
  tx: Prisma.TransactionClient,
  actor: Actor,
  eventId: string,
) {
  if (isHeadquartersSuperAdmin(actor)) return;
  const grant = await tx.eventGrant.findFirst({
    where: {
      eventId,
      active: true,
      member: { userId: actor.id, active: true, role: 'EVENT_MANAGER' },
    },
  });
  if (!grant) deny();
}

export async function scheduleRead(
  tx: Prisma.TransactionClient,
  actor: Actor,
  eventId: string,
) {
  const event = await tx.event.findFirst({
    where: { AND: [{ id: eventId }, scheduleReadScope(actor)] },
    select: { id: true },
  });
  if (!event) deny();
}

export async function scheduleDraftAdjust(
  tx: Prisma.TransactionClient,
  actor: Actor,
  eventId: string,
) {
  await eventOperations(tx, actor, eventId);
}

export async function schedulePublish(
  tx: Prisma.TransactionClient,
  actor: Actor,
  eventId: string,
) {
  await eventOperations(tx, actor, eventId);
}

/** Write access for event-operation domains such as teams and scheduling. */
export async function eventOperations(
  tx: Prisma.TransactionClient,
  actor: Actor,
  eventId: string,
) {
  const event = await tx.event.findFirst({
    where: { AND: [{ id: eventId }, eventOperationsScope(actor)] },
    select: { id: true },
  });
  if (!event) deny();
}
export async function taskPolicy(
  tx: Prisma.TransactionClient,
  actor: Actor,
  taskId: string,
  action: string,
) {
  const task = await tx.taskScope.findUnique({
    where: { id: taskId },
    include: {
      handler: { include: { member: true } },
      reviewer: { include: { member: true } },
    },
  });
  if (!task) deny();
  if (isHeadquartersSuperAdmin(actor)) return task;
  const handler = task.handler.member;
  const reviewer = task.reviewer?.member;
  const ownOrganization = actor.memberships.some(
    (m) => m.active && m.organizationId === handler.organizationId,
  );
  const self = handler.userId === actor.id;
  const handles =
    self &&
    task.handler.active &&
    handler.active &&
    handler.role === 'ORGANIZER';
  const reviews =
    task.reviewer?.active &&
    reviewer?.userId === actor.id &&
    reviewer.active &&
    reviewer.role === 'REVIEWER' &&
    !self &&
    !ownOrganization;
  // An organizer identity must never leverage a second role to see other organizers.
  const organizer = hasRole(actor, 'ORGANIZER');
  if (organizer && !handles) deny();
  if (action === 'content.write') {
    if (
      !handles ||
      hasRole(actor, 'REVIEWER') ||
      hasRole(actor, 'EVENT_MANAGER')
    )
      deny();
  } else if (action === 'review') {
    if (!reviews || organizer) deny();
  } else if (action === 'task.read' || action === 'file.download') {
    if (!handles && !reviews) {
      if (organizer || hasRole(actor, 'REVIEWER')) deny();
      await eventManager(tx, actor, task.eventId);
    }
  } else deny();
  return task;
}
