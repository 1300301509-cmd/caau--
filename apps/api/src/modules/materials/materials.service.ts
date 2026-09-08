import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '@caau/database';
import {
  AuthorizationService,
  bodyObject,
  text,
  uuid,
} from '../authorization/authorization.service.js';
import {
  deny,
  hasRole,
  taskPolicy,
  type Actor,
} from '../authorization/policy.js';
import { initializeExecution } from '../workflow/execution.js';
import { FILE_EXTENSIONS, MAX_FILE_BYTES } from '../workflow/private-store.js';
import { requirements, revision } from './requirements.js';

function uploadCompatible(config: ReturnType<typeof requirements>) {
  if (
    config.materials.some(
      (m) =>
        m.maxBytes > MAX_FILE_BYTES ||
        m.formats.some((f) => !FILE_EXTENSIONS.includes(f)),
    )
  )
    throw new BadRequestException(
      'Requirements exceed current upload capabilities',
    );
  return config;
}

const includeTask = {
  scope: {
    include: {
      handler: { include: { member: true } },
      reviewer: { include: { member: true } },
    },
  },
  requirements: true,
} satisfies Prisma.MaterialTaskInclude;
type LoadedTask = Prisma.MaterialTaskGetPayload<{
  include: typeof includeTask;
}>;
function visibleTasks(actor: Actor): Prisma.MaterialTaskWhereInput {
  if (hasRole(actor, 'ORGANIZER'))
    return {
      state: 'PUBLISHED',
      scope: {
        handler: {
          member: { userId: actor.id, active: true, role: 'ORGANIZER' },
        },
      },
    };
  if (hasRole(actor, 'REVIEWER'))
    return {
      state: 'PUBLISHED',
      scope: {
        reviewer: {
          member: { userId: actor.id, active: true, role: 'REVIEWER' },
        },
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
    event: {
      scope: {
        grants: {
          some: {
            member: { userId: actor.id, role: 'EVENT_MANAGER', active: true },
          },
        },
      },
    },
  };
}
function visibleEvents(actor: Actor): Prisma.EventWhereInput {
  if (!hasRole(actor, 'ORGANIZER') && !hasRole(actor, 'REVIEWER'))
    return {
      scope: {
        grants: {
          some: {
            member: { userId: actor.id, active: true, role: 'EVENT_MANAGER' },
          },
        },
      },
    };
  return { tasks: { some: visibleTasks(actor) } };
}
function view(t: LoadedTask) {
  return {
    id: t.id,
    eventId: t.eventId,
    title: t.title,
    state: t.state,
    revision: t.revision,
    organizationId: t.scope.handler.member.organizationId,
    handlerMemberId: t.scope.handler.memberId,
    reviewerMemberId: t.scope.reviewer!.memberId,
    requirements:
      t.state === 'PUBLISHED'
        ? t.requirements[0]!.configuration
        : Object.keys(t.configuration as object).length
          ? t.configuration
          : null,
    requirementVersion: t.requirements[0]?.version ?? null,
    publishedAt: t.publishedAt?.toISOString() ?? null,
  };
}
@Injectable()
export class MaterialsService {
  constructor(private readonly auth: AuthorizationService) {}
  execute(token: string, action: string, resource?: string, input?: unknown) {
    return this.auth.run(
      token,
      action,
      resource,
      input,
      async (tx, actor, id) => {
        if (action === 'workspace.identity')
          return {
            id: actor.id,
            displayName: actor.displayName,
            roles: [
              ...new Set(
                actor.memberships.filter((m) => m.active).map((m) => m.role),
              ),
            ],
          };
        if (action === 'workspace.directory')
          return this.auth.directory(tx, actor);
        if (action === 'events.create') {
          const b = bodyObject(input, ['name', 'description']);
          const name = text(b.name, 120);
          const description = text(b.description, 2000);
          const scope = await this.auth.createEventAnchor(tx, actor);
          return tx.event.create({
            data: { id: scope.id, name, description, createdBy: actor.id },
            select: {
              id: true,
              name: true,
              description: true,
              createdAt: true,
            },
          });
        }
        if (action === 'events.list')
          return tx.event.findMany({
            where: visibleEvents(actor),
            select: {
              id: true,
              name: true,
              description: true,
              createdAt: true,
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          });
        if (action === 'events.read') {
          const event = await tx.event.findFirst({
            where: { AND: [{ id: id! }, visibleEvents(actor)] },
            select: {
              id: true,
              name: true,
              description: true,
              createdAt: true,
            },
          });
          if (!event) deny();
          return event;
        }
        if (action === 'materials.list')
          return (
            await tx.materialTask.findMany({
              where: visibleTasks(actor),
              include: includeTask,
              orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            })
          ).map(view);
        if (action === 'materials.create') {
          const b = bodyObject(input, [
            'eventId',
            'title',
            'organizationId',
            'handlerMemberId',
            'reviewerMemberId',
          ]);
          const eventId = uuid(b.eventId);
          const title = text(b.title, 160);
          await this.auth.requireEventManager(tx, actor, eventId);
          if (!(await tx.event.findUnique({ where: { id: eventId } }))) deny();
          const scope = await this.auth.assignTaskAnchor(
            tx,
            actor,
            eventId,
            uuid(b.organizationId),
            uuid(b.handlerMemberId),
            uuid(b.reviewerMemberId),
          );
          const task = await tx.materialTask.create({
            data: { id: scope.id, eventId, title, configuration: {} },
            include: includeTask,
          });
          await tx.assignmentHistory.create({
            data: {
              taskId: task.id,
              handlerGrantId: scope.handlerGrantId,
              reviewerGrantId: scope.reviewerGrantId!,
              actorId: actor.id,
            },
          });
          return view(task);
        }
        const task = await tx.materialTask.findUnique({
          where: { id: id! },
          include: includeTask,
        });
        if (!task) deny();
        if (action === 'materials.read') {
          if (task.state === 'DRAFT')
            await this.auth.requireEventManager(tx, actor, task.eventId);
          else await taskPolicy(tx, actor, task.id, 'task.read');
          return view(task);
        }
        await this.auth.requireEventManager(tx, actor, task.eventId);
        if (action === 'materials.publish' && task.state === 'PUBLISHED') {
          bodyObject(input, ['expectedRevision']);
          revision((input as Record<string, unknown>).expectedRevision);
          return view(task);
        }
        if (task.state !== 'DRAFT')
          throw new ConflictException(
            'Published task is protected; changes are not available in this segment',
          );
        const keys =
          action === 'materials.configure'
            ? ['expectedRevision', 'requirements']
            : action === 'materials.assign'
              ? [
                  'expectedRevision',
                  'organizationId',
                  'handlerMemberId',
                  'reviewerMemberId',
                ]
              : ['expectedRevision'];
        const b = bodyObject(input, keys);
        if (revision(b.expectedRevision) !== task.revision)
          throw new ConflictException('Task changed; refresh before saving');
        if (action === 'materials.configure') {
          const configuration = uploadCompatible(requirements(b.requirements));
          return view(
            await tx.materialTask.update({
              where: { id: task.id, revision: task.revision },
              data: { configuration, revision: { increment: 1 } },
              include: includeTask,
            }),
          );
        }
        if (action === 'materials.assign') {
          if (
            uuid(b.organizationId) !== task.scope.handler.member.organizationId
          )
            throw new ConflictException(
              'Cross-organization transfer is not supported; close and create a new task',
            );
          const scope = await this.auth.assignTaskAnchor(
            tx,
            actor,
            task.eventId,
            uuid(b.organizationId),
            uuid(b.handlerMemberId),
            uuid(b.reviewerMemberId),
            task.id,
          );
          await tx.assignmentHistory.create({
            data: {
              taskId: task.id,
              previousHandlerGrantId: task.scope.handlerGrantId,
              previousReviewerGrantId: task.scope.reviewerGrantId,
              handlerGrantId: scope.handlerGrantId,
              reviewerGrantId: scope.reviewerGrantId!,
              actorId: actor.id,
            },
          });
          return view(
            await tx.materialTask.update({
              where: { id: task.id, revision: task.revision },
              data: { revision: { increment: 1 } },
              include: includeTask,
            }),
          );
        }
        if (action === 'materials.publish') {
          const configuration = uploadCompatible(
            requirements(task.configuration),
          );
          // Revalidate current users/members and conflicts at publication, not only on creation.
          await this.auth.assignTaskAnchor(
            tx,
            actor,
            task.eventId,
            task.scope.handler.member.organizationId,
            task.scope.handler.memberId,
            task.scope.reviewer!.memberId,
            task.id,
          );
          await tx.requirementVersion.create({
            data: {
              taskId: task.id,
              version: 1,
              configuration,
              createdBy: actor.id,
            },
          });
          await initializeExecution(tx, task.id, configuration);
          return view(
            await tx.materialTask.update({
              where: { id: task.id, revision: task.revision },
              data: {
                state: 'PUBLISHED',
                publishedAt: new Date(),
                revision: { increment: 1 },
              },
              include: includeTask,
            }),
          );
        }
        deny();
      },
    );
  }
}
