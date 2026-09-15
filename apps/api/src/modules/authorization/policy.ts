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
export async function eventManager(
  tx: Prisma.TransactionClient,
  actor: Actor,
  eventId: string,
) {
  const grant = await tx.eventGrant.findFirst({
    where: {
      eventId,
      active: true,
      member: { userId: actor.id, active: true, role: 'EVENT_MANAGER' },
    },
  });
  if (!grant) deny();
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
