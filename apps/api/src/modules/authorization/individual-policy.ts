import type { Prisma } from '@caau/database';
import { deny, hasRole, eventManager, type Actor } from './policy.js';

export function individualTasks(actor: Actor): Prisma.MaterialTaskWhereInput {
  const published = {
    state: 'PUBLISHED' as const,
    individualChannel: { isNot: null },
  };
  if (hasRole(actor, 'ORGANIZER'))
    return {
      ...published,
      scope: {
        handler: {
          active: true,
          member: { userId: actor.id, active: true, role: 'ORGANIZER' },
        },
      },
    };
  if (hasRole(actor, 'REVIEWER'))
    return {
      ...published,
      event: {
        scope: {
          grants: {
            some: {
              active: true,
              member: { userId: actor.id, active: true, role: 'REVIEWER' },
            },
          },
        },
      },
      scope: {
        handler: {
          member: {
            userId: { not: actor.id },
            organizationId: {
              notIn: actor.memberships
                .filter((m) => m.active)
                .map((m) => m.organizationId),
            },
          },
        },
      },
    };
  return {
    ...published,
    event: {
      scope: {
        grants: {
          some: {
            active: true,
            member: { userId: actor.id, active: true, role: 'EVENT_MANAGER' },
          },
        },
      },
    },
  };
}
export async function individualPolicy(
  tx: Prisma.TransactionClient,
  actor: Actor,
  taskId: string,
  action: 'read' | 'write' | 'review' | 'draft',
) {
  const task = await tx.materialTask.findFirst({
    where: { AND: [{ id: taskId }, individualTasks(actor)] },
    include: { scope: { include: { handler: { include: { member: true } } } } },
  });
  if (!task) deny();
  if (action === 'write') {
    if (
      !hasRole(actor, 'ORGANIZER') ||
      hasRole(actor, 'REVIEWER') ||
      hasRole(actor, 'EVENT_MANAGER')
    )
      deny();
  } else if (action === 'review') {
    if (hasRole(actor, 'ORGANIZER') || !hasRole(actor, 'REVIEWER')) deny();
  } else if (action === 'draft' && hasRole(actor, 'REVIEWER')) deny();
  return task;
}
export async function appendIndividualAssignment(
  tx: Prisma.TransactionClient,
  data: Prisma.IndividualAssignmentHistoryCreateInput,
) {
  return tx.individualAssignmentHistory.create({ data });
}
export async function assignIndividualHandler(
  tx: Prisma.TransactionClient,
  actor: Actor,
  eventId: string,
  organizationId: string,
  memberId: string,
  taskId: string,
) {
  if (hasRole(actor, 'ORGANIZER')) deny();
  await eventManager(tx, actor, eventId);
  const member = await tx.organizationMember.findFirst({
    where: {
      id: memberId,
      organizationId,
      active: true,
      role: 'ORGANIZER',
      user: { active: true },
    },
  });
  if (!member) deny();
  const existing = await tx.taskScope.findUnique({
    where: { id: taskId },
    include: { handler: { include: { member: true } } },
  });
  if (
    existing &&
    (existing.eventId !== eventId ||
      existing.handler.member.organizationId !== organizationId)
  )
    deny();
  const grant = await tx.eventGrant.upsert({
    where: { eventId_memberId: { eventId, memberId } },
    create: { eventId, memberId },
    update: {},
  });
  if (!grant.active) deny();
  return existing
    ? tx.taskScope.update({
        where: { id: taskId },
        data: { handlerGrantId: grant.id },
      })
    : tx.taskScope.create({
        data: { id: taskId, eventId, handlerGrantId: grant.id },
      });
}
