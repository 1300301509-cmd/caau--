import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
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
  isHeadquartersSuperAdmin,
  taskPolicy,
  type Actor,
} from '../authorization/policy.js';
import {
  assignIndividualHandler,
  appendIndividualAssignment,
  individualPolicy,
  individualTasks,
} from '../authorization/individual-policy.js';
import { initializeExecution } from '../workflow/execution.js';
import {
  FILE_EXTENSIONS,
  MAX_FILE_BYTES,
  PrivateStore,
  verifyFile,
} from '../workflow/private-store.js';
import { safeFilename } from '../workflow/filename.js';
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
  individualChannel: true,
  scope: {
    include: {
      handler: { include: { member: { include: { organization: true } } } },
      reviewer: { include: { member: true } },
    },
  },
  requirements: {
    include: { templateAttachments: { include: { template: true } } },
  },
  templateUploads: true,
} satisfies Prisma.MaterialTaskInclude;
type LoadedTask = Prisma.MaterialTaskGetPayload<{
  include: typeof includeTask;
}>;
function visibleTasks(actor: Actor): Prisma.MaterialTaskWhereInput {
  return { OR: [legacyVisibleTasks(actor), individualTasks(actor)] };
}
function legacyVisibleTasks(actor: Actor): Prisma.MaterialTaskWhereInput {
  if (isHeadquartersSuperAdmin(actor)) return {};
  if (hasRole(actor, 'ORGANIZER'))
    return {
      state: 'PUBLISHED',
      scope: {
        handler: {
          active: true,
          member: { userId: actor.id, active: true, role: 'ORGANIZER' },
        },
      },
    };
  if (hasRole(actor, 'REVIEWER'))
    return {
      state: 'PUBLISHED',
      scope: {
        reviewer: {
          active: true,
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
            active: true,
            member: { userId: actor.id, role: 'EVENT_MANAGER', active: true },
          },
        },
      },
    },
  };
}
function visibleEvents(actor: Actor): Prisma.EventWhereInput {
  if (isHeadquartersSuperAdmin(actor)) return {};
  if (!hasRole(actor, 'ORGANIZER') && !hasRole(actor, 'REVIEWER'))
    return {
      scope: {
        grants: {
          some: {
            active: true,
            member: { userId: actor.id, active: true, role: 'EVENT_MANAGER' },
          },
        },
      },
    };
  return {
    OR: [
      { tasks: { some: visibleTasks(actor) } },
      {
        informationGrants: {
          some: {
            active: true,
            member: { userId: actor.id, active: true, user: { active: true } },
          },
        },
      },
    ],
  };
}
function templateView(file: {
  id: string;
  materialId: string;
  originalName: string;
  extension: string;
  expectedBytes: number;
}) {
  return {
    id: file.id,
    materialId: file.materialId,
    name: file.originalName,
    extension: file.extension,
    bytes: file.expectedBytes,
    originalNameKnown: true,
  };
}
function view(t: LoadedTask) {
  const templateFiles =
    t.state === 'PUBLISHED'
      ? (t.requirements[0]?.templateAttachments.map((a) =>
          templateView(a.template),
        ) ?? [])
      : t.templateUploads
          .filter((f) => f.state === 'CONFIRMED')
          .map(templateView);
  return {
    id: t.id,
    eventId: t.eventId,
    title: t.title,
    state: t.state,
    revision: t.revision,
    organizationId: t.scope.handler.member.organizationId,
    organizationName: t.scope.handler.member.organization.name,
    handlerMemberId: t.scope.handler.memberId,
    reviewerMemberId: t.scope.reviewer?.memberId ?? null,
    individualChannel: !!t.individualChannel,
    requirements:
      t.state === 'PUBLISHED'
        ? t.requirements[0]!.configuration
        : Object.keys(t.configuration as object).length
          ? t.configuration
          : null,
    requirementVersion: t.requirements[0]?.version ?? null,
    templateFiles,
    publishedAt: t.publishedAt?.toISOString() ?? null,
  };
}
@Injectable()
export class MaterialsService {
  constructor(
    private readonly auth: AuthorizationService,
    private readonly store: PrivateStore,
  ) {}
  async createIndividualTask(
    tx: Prisma.TransactionClient,
    actor: Actor,
    input: unknown,
  ) {
    const b = bodyObject(input, [
      'eventId',
      'organizationId',
      'handlerMemberId',
      'title',
    ]);
    const eventId = uuid(b.eventId),
      taskId = randomUUID();
    await this.auth.requireEventManager(tx, actor, eventId);
    const scope = await assignIndividualHandler(
      tx,
      actor,
      eventId,
      uuid(b.organizationId),
      uuid(b.handlerMemberId),
      taskId,
    );
    await tx.materialTask.create({
      data: {
        id: taskId,
        eventId,
        title: text(b.title, 160),
        configuration: {},
      },
    });
    await appendIndividualAssignment(tx, {
      taskId,
      handlerGrantId: scope.handlerGrantId,
      generation: 1,
      actorId: actor.id,
    });
    return { id: taskId };
  }
  execute(
    token: string,
    action: string,
    resource?: string,
    input?: unknown,
    stream?: IncomingMessage,
  ) {
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
            canReviewHostingApplications:
              isHeadquartersSuperAdmin(actor) ||
              (await tx.hostingApplicationReviewGrant.count({
                where: {
                  active: true,
                  member: {
                    userId: actor.id,
                    active: true,
                    user: { active: true },
                  },
                },
              })) > 0,
          };
        if (action === 'workspace.directory')
          return this.auth.directory(tx, actor);
        if (action === 'events.create') {
          const b = bodyObject(input, ['name', 'description']);
          const name = text(b.name, 120);
          const description = text(b.description, 2000);
          const scope = await this.auth.createEventAnchor(tx, actor);
          const event = await tx.event.create({
            data: { id: scope.id, name, description, createdBy: actor.id },
            select: {
              id: true,
              name: true,
              description: true,
              lifecycleState: true,
              createdAt: true,
            },
          });
          return { ...event, profile: null };
        }
        if (action === 'events.list') {
          const events = await tx.event.findMany({
            where: visibleEvents(actor),
            select: {
              id: true,
              name: true,
              description: true,
              lifecycleState: true,
              profileVersions: {
                select: { profile: true },
                orderBy: { version: 'desc' },
                take: 1,
              },
              createdAt: true,
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          });
          return events.map(({ profileVersions, ...event }) => ({
            ...event,
            profile: profileVersions[0]?.profile ?? null,
          }));
        }
        if (action === 'events.read') {
          const event = await tx.event.findFirst({
            where: { AND: [{ id: id! }, visibleEvents(actor)] },
            select: {
              id: true,
              name: true,
              description: true,
              lifecycleState: true,
              profileVersions: {
                select: { profile: true },
                orderBy: { version: 'desc' },
                take: 1,
              },
              createdAt: true,
            },
          });
          if (!event) deny();
          const { profileVersions, ...result } = event;
          return { ...result, profile: profileVersions[0]?.profile ?? null };
        }
        if (action.startsWith('template.')) {
          const template =
            action === 'template.create'
              ? null
              : await tx.templateUpload.findUnique({ where: { id: id! } });
          const taskId = template?.taskId ?? id!;
          await tx.$queryRaw`SELECT id FROM "MaterialTask" WHERE id=${taskId}::uuid FOR UPDATE`;
          const task = await tx.materialTask.findUnique({
            where: { id: taskId },
            include: includeTask,
          });
          if (!task) deny();
          const manager = () =>
            this.auth.requireEventManager(tx, actor, task.eventId);
          const config =
            task.state === 'DRAFT'
              ? requirements(task.configuration, !!task.individualChannel)
              : requirements(
                  task.requirements[0]!.configuration,
                  !!task.individualChannel,
                );
          if (action === 'template.create') {
            await manager();
            if (task.state !== 'DRAFT')
              throw new ConflictException(
                'Published task templates are protected',
              );
            const b = bodyObject(input, [
              'materialId',
              'originalName',
              'extension',
              'expectedBytes',
              'sha256',
            ]);
            const material = config.materials.find(
              (m) => m.id === uuid(b.materialId),
            );
            if (
              !material ||
              typeof b.extension !== 'string' ||
              !FILE_EXTENSIONS.includes(b.extension) ||
              !Number.isInteger(b.expectedBytes) ||
              Number(b.expectedBytes) < 1 ||
              Number(b.expectedBytes) > MAX_FILE_BYTES ||
              typeof b.sha256 !== 'string' ||
              !/^[a-f0-9]{64}$/.test(b.sha256)
            )
              throw new BadRequestException(
                'Invalid template metadata or unsupported format',
              );
            const existing = await tx.templateUpload.findUnique({
              where: { taskId_materialId: { taskId, materialId: material.id } },
            });
            if (existing)
              throw new ConflictException(
                'Remove the current draft template before replacing it',
              );
            const now = (
              await tx.$queryRaw<
                Array<{ now: Date }>
              >`SELECT clock_timestamp() AS now`
            )[0]!.now;
            return tx.templateUpload.create({
              data: {
                taskId,
                materialId: material.id,
                actorId: actor.id,
                storageKey: randomUUID(),
                originalName: safeFilename(b.originalName, b.extension)!,
                extension: b.extension,
                expectedBytes: Number(b.expectedBytes),
                sha256: b.sha256,
                expiresAt: new Date(now.getTime() + 30 * 60000),
              },
              select: { id: true, state: true, expiresAt: true },
            });
          }
          if (!template) deny();
          if (
            action === 'template.content' ||
            action === 'template.confirm' ||
            action === 'template.remove'
          ) {
            await manager();
            if (task.state !== 'DRAFT')
              throw new ConflictException(
                'Published task templates are protected',
              );
            const now = (
              await tx.$queryRaw<
                Array<{ now: Date }>
              >`SELECT clock_timestamp() AS now`
            )[0]!.now;
            if (action === 'template.remove') {
              await tx.templateUpload.delete({ where: { id: template.id } });
              return { id: template.id };
            }
            if (action === 'template.confirm' && template.state === 'CONFIRMED')
              return {
                id: template.id,
                state: template.state,
                expiresAt: template.expiresAt,
              };
            if (template.state !== 'PENDING' || template.expiresAt <= now)
              throw new ConflictException(
                'Template upload expired or already confirmed',
              );
            if (action === 'template.content') {
              if (
                !stream ||
                stream.headers['content-type']?.split(';')[0] !==
                  'application/octet-stream'
              )
                throw new BadRequestException(
                  'Binary upload requires application/octet-stream',
                );
              await this.store.put(
                template.storageKey,
                stream,
                template.expectedBytes,
              );
              return { id: template.id };
            }
            let bytes: Buffer;
            try {
              bytes = await this.store.read(template.storageKey);
            } catch {
              throw new ConflictException('Template upload not completed');
            }
            verifyFile(
              bytes,
              template.extension,
              template.expectedBytes,
              template.sha256,
            );
            return tx.templateUpload.update({
              where: { id: template.id },
              data: { state: 'CONFIRMED', confirmedAt: now },
              select: { id: true, state: true, expiresAt: true },
            });
          }
          if (action === 'template.info' || action === 'template.download') {
            if (task.state !== 'PUBLISHED' || template.state !== 'CONFIRMED')
              deny();
            const allowed =
              isHeadquartersSuperAdmin(actor) ||
              (hasRole(actor, 'ORGANIZER') &&
                task.scope.handler.member.userId === actor.id &&
                task.scope.handler.member.active &&
                task.scope.handler.member.role === 'ORGANIZER');
            if (!allowed) deny();
            const snapshot = await tx.templateAttachment.findFirst({
              where: { templateId: template.id, requirement: { taskId } },
              select: { templateId: true },
            });
            if (!snapshot) deny();
            const info = templateView(template);
            if (action === 'template.info') return info;
            let bytes: Buffer;
            try {
              bytes = await this.store.read(template.storageKey);
            } catch {
              throw new ConflictException('Confirmed template is unavailable');
            }
            verifyFile(
              bytes,
              template.extension,
              template.expectedBytes,
              template.sha256,
            );
            return { data: bytes, info };
          }
          deny();
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
          else if (task.individualChannel)
            await individualPolicy(tx, actor, task.id, 'read');
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
          const configuration = uploadCompatible(
            requirements(b.requirements, !!task.individualChannel),
          );
          return view(
            await tx.materialTask.update({
              where: { id: task.id, revision: task.revision },
              data: { configuration, revision: { increment: 1 } },
              include: includeTask,
            }),
          );
        }
        if (action === 'materials.assign') {
          if (task.individualChannel)
            throw new ConflictException(
              'Use individual task handover after publication',
            );
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
            requirements(task.configuration, !!task.individualChannel),
          );
          // Revalidate current users/members and conflicts at publication, not only on creation.
          if (task.individualChannel)
            await assignIndividualHandler(
              tx,
              actor,
              task.eventId,
              task.scope.handler.member.organizationId,
              task.scope.handler.memberId,
              task.id,
            );
          else
            await this.auth.assignTaskAnchor(
              tx,
              actor,
              task.eventId,
              task.scope.handler.member.organizationId,
              task.scope.handler.memberId,
              task.scope.reviewer!.memberId,
              task.id,
            );
          const templates = await tx.templateUpload.findMany({
            where: { taskId: task.id },
          });
          for (const file of templates) {
            if (
              file.state !== 'CONFIRMED' ||
              !configuration.materials.some((m) => m.id === file.materialId)
            )
              throw new ConflictException(
                'Template must be confirmed before publication',
              );
            let bytes: Buffer;
            try {
              bytes = await this.store.read(file.storageKey);
            } catch {
              throw new ConflictException('Confirmed template is unavailable');
            }
            verifyFile(bytes, file.extension, file.expectedBytes, file.sha256);
          }
          const snapshot = await tx.requirementVersion.create({
            data: {
              taskId: task.id,
              version: 1,
              configuration,
              createdBy: actor.id,
            },
          });
          if (templates.length)
            await tx.templateAttachment.createMany({
              data: templates.map((file) => ({
                requirementVersionId: snapshot.id,
                materialId: file.materialId,
                templateId: file.id,
              })),
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
