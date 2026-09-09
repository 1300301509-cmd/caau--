import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
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
import { requirements, revision } from '../materials/requirements.js';
import {
  PrivateStore,
  FILE_EXTENSIONS,
  MAX_FILE_BYTES,
  digest,
  verifyFile,
} from './private-store.js';
import { safeFilename } from './filename.js';
import type { DeadlinesDto, EntryDto } from './workflow.dto.js';

function entries(input: unknown, materialIds: string[]): EntryDto[] {
  if (!Array.isArray(input) || input.length > 50)
    throw new BadRequestException('Invalid draft entries');
  const ids = new Set<string>();
  const files = new Set<string>();
  return input.map((value) => {
    const b = bodyObject(value, ['materialId', 'text', 'fileIds']);
    const materialId = uuid(b.materialId).toLowerCase();
    if (
      !materialIds.includes(materialId) ||
      ids.has(materialId) ||
      typeof b.text !== 'string' ||
      b.text.length > 4000 ||
      !Array.isArray(b.fileIds) ||
      b.fileIds.length > 10
    )
      throw new BadRequestException('Invalid material entry');
    ids.add(materialId);
    const fileIds = b.fileIds.map((value) => {
      const id = uuid(value);
      if (files.has(id)) throw new BadRequestException('Duplicate attachment');
      files.add(id);
      return id;
    });
    return { materialId, text: b.text, fileIds };
  });
}
const json = (value: unknown) => value as Prisma.InputJsonValue;
async function actorLabels<
  T extends { actorId: string; review?: { actorId: string } | null },
>(tx: Prisma.TransactionClient, rows: T[]) {
  const ids = [
    ...new Set(
      rows.flatMap((row) => [
        row.actorId,
        ...(row.review ? [row.review.actorId] : []),
      ]),
    ),
  ];
  const people = await tx.internalUser.findMany({
    where: { id: { in: ids } },
    select: { id: true, displayName: true },
  });
  const name = (id: string) =>
    people.find((p) => p.id === id)?.displayName ?? '历史人员（目录无姓名）';
  return rows.map((row) => ({
    ...row,
    actorName: name(row.actorId),
    ...(row.review
      ? { review: { ...row.review, actorName: name(row.review.actorId) } }
      : {}),
  }));
}
const submissionInclude = {
  review: true,
} satisfies Prisma.SubmissionVersionInclude;
const executionView = (e: {
  taskId: string;
  state: string;
  revision: number;
  generation: number;
  currentSubmissionId: string | null;
  deadlines: unknown;
}) => ({
  id: e.taskId,
  state: e.state,
  revision: e.revision,
  generation: e.generation,
  currentSubmissionId: e.currentSubmissionId,
  deadlines: e.deadlines,
});
@Injectable()
export class WorkflowService {
  constructor(
    private readonly auth: AuthorizationService,
    private readonly store: PrivateStore,
  ) {}
  private async draftAccess(
    tx: Prisma.TransactionClient,
    actor: Actor,
    taskId: string,
    edit: boolean,
  ) {
    if (!edit && hasRole(actor, 'REVIEWER')) deny();
    await taskPolicy(tx, actor, taskId, edit ? 'content.write' : 'task.read');
  }
  async execute(
    token: string,
    action: string,
    resource: string,
    input?: unknown,
    stream?: IncomingMessage,
  ): Promise<unknown> {
    return this.auth.run(
      token,
      action,
      resource,
      input,
      async (tx, actor, id) => {
        const upload = action.startsWith('file.')
          ? await tx.fileUpload.findUnique({ where: { id: id! } })
          : null;
        if (action.startsWith('file.') && !upload) deny();
        const taskId = upload?.taskId ?? id!;
        // Serialize all workflow mutations, including current authorization/generation checks.
        const locked = await tx.$queryRaw<
          Array<{ taskId: string }>
        >`SELECT "taskId" FROM "TaskExecution" WHERE "taskId" = ${taskId}::uuid FOR UPDATE`;
        if (!locked.length) deny();
        actor = await this.auth.reloadActor(tx, token);
        const task = await tx.materialTask.findUnique({
          where: { id: taskId },
          include: {
            requirements: true,
            scope: {
              include: {
                handler: { include: { member: true } },
                reviewer: true,
              },
            },
          },
        });
        if (!task || task.state !== 'PUBLISHED') deny();
        const execution = await tx.taskExecution.findUniqueOrThrow({
          where: { taskId },
        });
        const draft = await tx.materialDraft.findUniqueOrThrow({
          where: { taskId },
        });
        const config = requirements(task.requirements[0]!.configuration);
        const deadlines = execution.deadlines as unknown as DeadlinesDto;
        const now = (
          await tx.$queryRaw<
            Array<{ now: Date }>
          >`SELECT clock_timestamp() AS now`
        )[0]!.now;
        const manager = async () =>
          this.auth.requireEventManager(tx, actor, task.eventId);
        const mutable = () => {
          if (execution.state === 'CLOSED' || execution.state === 'APPROVED')
            throw new ConflictException('Task no longer accepts changes');
        };
        const editable = async () => {
          await this.draftAccess(tx, actor, taskId, true);
          if (execution.state !== 'EDITING')
            throw new ConflictException('Task is not editable');
        };
        const versionCheck = (value: unknown) => {
          if (revision(value) !== execution.revision)
            throw new ConflictException('Execution changed; refresh');
        };
        const savedEntries = () =>
          entries(
            draft.entries,
            config.materials.map((m) => m.id),
          );
        const validateFiles = async (values: EntryDto[], bind: boolean) => {
          for (const entry of values)
            for (const fileId of entry.fileIds) {
              const file = await tx.fileUpload.findUnique({
                where: { id: fileId },
              });
              if (
                !file ||
                file.taskId !== taskId ||
                file.materialId !== entry.materialId ||
                file.organizationId !==
                  task.scope.handler.member.organizationId ||
                file.state !== 'CONFIRMED' ||
                (file.generation !== execution.generation && !file.boundAt)
              )
                deny();
              let data: Buffer;
              try {
                data = await this.store.read(file.storageKey);
              } catch {
                throw new ConflictException(
                  'Confirmed attachment is unavailable',
                );
              }
              verifyFile(data, file.extension, file.expectedBytes, file.sha256);
              if (bind && !file.boundAt)
                await tx.fileUpload.update({
                  where: { id: fileId },
                  data: { boundAt: now },
                });
            }
        };
        if (action === 'workflow.read') {
          await taskPolicy(tx, actor, taskId, 'task.read');
          return executionView(execution);
        }
        if (action === 'draft.read' || action === 'draft.history') {
          await this.draftAccess(tx, actor, taskId, false);
          if (action === 'draft.history')
            return tx.draftEdit.findMany({
              where: { taskId },
              orderBy: { revision: 'asc' },
            });
          return {
            id: taskId,
            revision: draft.revision,
            entries: draft.entries,
            baseSubmissionId: draft.baseSubmissionId,
          };
        }
        if (action === 'draft.save') {
          await editable();
          const b = bodyObject(input, ['expectedRevision', 'entries']);
          if (revision(b.expectedRevision) !== draft.revision)
            throw new ConflictException('Draft changed; compare before saving');
          const values = entries(
            b.entries,
            config.materials.map((m) => m.id),
          );
          await validateFiles(values, true);
          const next = await tx.materialDraft.update({
            where: { taskId, revision: draft.revision },
            data: { revision: { increment: 1 }, entries: json(values) },
          });
          await tx.draftEdit.create({
            data: {
              taskId,
              revision: next.revision,
              entries: json(values),
              actorId: actor.id,
              kind: 'SAVE',
              occurredAt: now,
            },
          });
          return {
            id: taskId,
            revision: next.revision,
            entries: next.entries,
            baseSubmissionId: next.baseSubmissionId,
          };
        }
        if (action === 'upload.create') {
          await editable();
          const b = bodyObject(input, [
            'materialId',
            'extension',
            'expectedBytes',
            'sha256',
            'originalName',
          ]);
          const material = config.materials.find(
            (m) => m.id === uuid(b.materialId),
          );
          if (
            !material ||
            typeof b.extension !== 'string' ||
            !FILE_EXTENSIONS.includes(b.extension) ||
            !material.formats.includes(b.extension) ||
            !Number.isInteger(b.expectedBytes) ||
            Number(b.expectedBytes) < 1 ||
            Number(b.expectedBytes) >
              Math.min(MAX_FILE_BYTES, material.maxBytes) ||
            typeof b.sha256 !== 'string' ||
            !/^[a-f0-9]{64}$/.test(b.sha256)
          )
            throw new BadRequestException(
              'Invalid upload metadata or unsupported format',
            );
          return tx.fileUpload.create({
            data: {
              taskId,
              materialId: material.id,
              organizationId: task.scope.handler.member.organizationId,
              actorId: actor.id,
              generation: execution.generation,
              storageKey: randomUUID(),
              originalName: safeFilename(b.originalName, b.extension),
              extension: b.extension,
              expectedBytes: Number(b.expectedBytes),
              sha256: b.sha256,
              expiresAt: new Date(now.getTime() + 30 * 60000),
            },
            select: { id: true, state: true, expiresAt: true },
          });
        }
        if (action === 'file.content' || action === 'file.confirm') {
          await editable();
          if (
            upload!.organizationId !== task.scope.handler.member.organizationId
          )
            deny();
          if (
            upload!.state !== 'CONFIRMED' &&
            (upload!.generation !== execution.generation ||
              upload!.actorId !== actor.id)
          )
            deny();
          if (action === 'file.confirm' && upload!.state === 'CONFIRMED')
            return {
              id: upload!.id,
              state: upload!.state,
              expiresAt: upload!.expiresAt,
            };
          if (upload!.state !== 'PENDING' || upload!.expiresAt <= now)
            throw new ConflictException('Upload expired or already confirmed');
          if (action === 'file.content') {
            if (
              !stream ||
              stream.headers['content-type']?.split(';')[0] !==
                'application/octet-stream'
            )
              throw new BadRequestException(
                'Binary upload requires application/octet-stream',
              );
            await this.store.put(
              upload!.storageKey,
              stream,
              upload!.expectedBytes,
            );
            return { id: upload!.id };
          }
          let data: Buffer;
          try {
            data = await this.store.read(upload!.storageKey);
          } catch {
            throw new ConflictException('Upload not completed');
          }
          verifyFile(
            data,
            upload!.extension,
            upload!.expectedBytes,
            upload!.sha256,
          );
          return tx.fileUpload.update({
            where: { id: upload!.id },
            data: { state: 'CONFIRMED', confirmedAt: now },
            select: { id: true, state: true, expiresAt: true },
          });
        }
        if (action === 'file.download' || action === 'file.info') {
          await taskPolicy(tx, actor, taskId, 'file.download');
          if (
            upload!.state !== 'CONFIRMED' ||
            !upload!.boundAt ||
            upload!.organizationId !== task.scope.handler.member.organizationId
          )
            deny();
          const submitted = await tx.submissionAttachment.count({
            where: { fileId: upload!.id, taskId },
          });
          const inDraft = savedEntries().some((entry) =>
            entry.fileIds.includes(upload!.id),
          );
          if (
            (!inDraft && !submitted) ||
            (hasRole(actor, 'REVIEWER') && !submitted)
          )
            deny();
          const data = await this.store.read(upload!.storageKey);
          verifyFile(
            data,
            upload!.extension,
            upload!.expectedBytes,
            upload!.sha256,
          );
          const info = {
            id: upload!.id,
            name:
              upload!.originalName ??
              `material-${upload!.id}.${upload!.extension}`,
            extension: upload!.extension,
            bytes: upload!.expectedBytes,
            originalNameKnown: !!upload!.originalName,
          };
          return action === 'file.info' ? info : { data, info };
        }
        if (action === 'submission.list') {
          await taskPolicy(tx, actor, taskId, 'task.read');
          return actorLabels(
            tx,
            await tx.submissionVersion.findMany({
              where: { taskId },
              include: submissionInclude,
              orderBy: { version: 'asc' },
            }),
          );
        }
        if (action === 'submission.create') {
          await this.draftAccess(tx, actor, taskId, true);
          const b = bodyObject(input, [
            'idempotencyKey',
            'expectedDraftRevision',
          ]);
          const key = uuid(b.idempotencyKey);
          const expected = revision(b.expectedDraftRevision);
          const requestHash = digest(
            JSON.stringify({ expectedDraftRevision: expected }),
          );
          const command = await tx.submissionCommand.findUnique({
            where: { taskId_actorId_key: { taskId, actorId: actor.id, key } },
          });
          if (command) {
            if (command.requestHash !== requestHash)
              throw new ConflictException('Idempotency key payload differs');
            return (
              await actorLabels(tx, [
                await tx.submissionVersion.findUniqueOrThrow({
                  where: { id: command.submissionId },
                  include: submissionInclude,
                }),
              ])
            )[0];
          }
          await editable();
          if (draft.revision !== expected)
            throw new ConflictException('Draft changed');
          const values = savedEntries();
          for (const material of config.materials) {
            const entry = values.find((v) => v.materialId === material.id);
            if (
              material.required &&
              (!entry || (!entry.text.trim() && !entry.fileIds.length))
            )
              throw new BadRequestException('Required material is incomplete');
          }
          await validateFiles(values, false);
          const serverNow = (
            await tx.$queryRaw<
              Array<{ now: Date }>
            >`SELECT clock_timestamp() AS now`
          )[0]!.now;
          if (
            serverNow >= new Date(deadlines.task) ||
            deadlines.materials.some(
              (d) =>
                (config.materials.find((m) => m.id === d.id)?.required ||
                  values.some((v) => v.materialId === d.id)) &&
                serverNow >= new Date(d.deadline),
            )
          )
            throw new ConflictException(
              'Deadline passed; headquarters extension required',
            );
          const created = await tx.submissionVersion.create({
            data: {
              taskId,
              requirementVersionId: task.requirements[0]!.id,
              version: execution.nextVersion,
              generation: execution.generation,
              actorId: actor.id,
              submittedAt: serverNow,
              entries: json(values),
              deadlines: json(execution.deadlines),
            },
            include: submissionInclude,
          });
          const attachments = values.flatMap((v) =>
            v.fileIds.map((fileId) => ({
              fileId,
              taskId,
              submissionId: created.id,
            })),
          );
          if (attachments.length)
            await tx.submissionAttachment.createMany({ data: attachments });
          await tx.submissionCommand.create({
            data: {
              taskId,
              actorId: actor.id,
              key,
              requestHash,
              submissionId: created.id,
            },
          });
          await tx.taskExecution.update({
            where: { taskId },
            data: {
              state: 'SUBMITTED',
              currentSubmissionId: created.id,
              nextVersion: { increment: 1 },
              revision: { increment: 1 },
            },
          });
          return (await actorLabels(tx, [created]))[0];
        }
        if (action === 'review.create') {
          await taskPolicy(tx, actor, taskId, 'review');
          const b = bodyObject(input, ['submissionId', 'decision', 'issues']);
          const submissionId = uuid(b.submissionId);
          const submitted = await tx.submissionVersion.findUnique({
            where: { id: submissionId },
          });
          if (
            !submitted ||
            submitted.taskId !== taskId ||
            submitted.actorId === actor.id
          )
            deny();
          if (
            execution.state !== 'SUBMITTED' ||
            execution.currentSubmissionId !== submissionId ||
            (await tx.reviewRecord.findUnique({ where: { submissionId } }))
          )
            throw new ConflictException(
              'Submission already reviewed or not current',
            );
          if (
            !['PASS', 'RETURN'].includes(String(b.decision)) ||
            !Array.isArray(b.issues) ||
            b.issues.length > 50 ||
            (b.decision === 'PASS'
              ? b.issues.length !== 0
              : b.issues.length === 0)
          )
            throw new BadRequestException('Invalid review decision or issues');
          const issueIds = new Set<string>();
          const issues = b.issues.map((value) => {
            const issue = bodyObject(value, [
              'materialId',
              'reason',
              'instruction',
            ]);
            const materialId = uuid(issue.materialId);
            if (
              issueIds.has(materialId) ||
              !config.materials.some((m) => m.id === materialId)
            )
              throw new BadRequestException(
                'Unknown or duplicate issue material',
              );
            issueIds.add(materialId);
            return {
              materialId,
              reason: text(issue.reason, 2000),
              instruction: text(issue.instruction, 2000),
            };
          });
          const reviewed = await tx.reviewRecord.create({
            data: {
              submissionId,
              actorId: actor.id,
              decision: String(b.decision),
              issues: json(issues),
              reviewedAt: now,
            },
          });
          if (b.decision === 'RETURN') {
            const next = await tx.materialDraft.update({
              where: { taskId },
              data: {
                entries: json(submitted.entries),
                revision: { increment: 1 },
                baseSubmissionId: submitted.id,
              },
            });
            await tx.draftEdit.create({
              data: {
                taskId,
                revision: next.revision,
                entries: json(submitted.entries),
                actorId: actor.id,
                kind: 'RETURN',
                occurredAt: now,
              },
            });
          }
          await tx.taskExecution.update({
            where: { taskId },
            data: {
              state: b.decision === 'PASS' ? 'APPROVED' : 'EDITING',
              revision: { increment: 1 },
            },
          });
          return (await actorLabels(tx, [reviewed]))[0];
        }
        if (action === 'deadline.history') {
          await taskPolicy(tx, actor, taskId, 'task.read');
          return actorLabels(
            tx,
            await tx.deadlineHistory.findMany({
              where: { taskId },
              orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
            }),
          );
        }
        if (action === 'deadline.extend') {
          await manager();
          mutable();
          const b = bodyObject(input, [
            'expectedRevision',
            'newDeadline',
            'reason',
          ]);
          versionCheck(b.expectedRevision);
          const probe = requirements({ ...config, deadline: b.newDeadline });
          const nextDeadline = probe.deadline;
          if (
            [
              deadlines.task,
              ...deadlines.materials.map((d) => d.deadline),
            ].some((d) => new Date(nextDeadline) <= new Date(d)) ||
            new Date(nextDeadline) <= now
          )
            throw new BadRequestException(
              'Extension must be later than all previous deadlines and server time',
            );
          const next = {
            task: nextDeadline,
            materials: deadlines.materials.map((d) => ({
              ...d,
              deadline: nextDeadline,
            })),
          };
          await tx.deadlineHistory.create({
            data: {
              taskId,
              actorId: actor.id,
              occurredAt: now,
              reason: text(b.reason, 2000),
              previous: json(execution.deadlines),
              next,
            },
          });
          return executionView(
            await tx.taskExecution.update({
              where: { taskId },
              data: { deadlines: next, revision: { increment: 1 } },
            }),
          );
        }
        if (action === 'task.handover') {
          await manager();
          if (execution.state === 'CLOSED')
            throw new ConflictException('Closed task');
          const b = bodyObject(input, ['expectedRevision', 'handlerMemberId']);
          versionCheck(b.expectedRevision);
          const member = await tx.organizationMember.findUnique({
            where: { id: uuid(b.handlerMemberId) },
          });
          if (
            !member ||
            member.organizationId !== task.scope.handler.member.organizationId
          )
            throw new ConflictException(
              'Cross-organization transfer prohibited',
            );
          if (member.id === task.scope.handler.memberId)
            throw new ConflictException('Handler is unchanged');
          const scope = await this.auth.assignTaskAnchor(
            tx,
            actor,
            task.eventId,
            member.organizationId,
            member.id,
            task.scope.reviewer!.memberId,
            taskId,
          );
          await tx.assignmentHistory.create({
            data: {
              taskId,
              previousHandlerGrantId: task.scope.handlerGrantId,
              previousReviewerGrantId: task.scope.reviewerGrantId,
              handlerGrantId: scope.handlerGrantId,
              reviewerGrantId: scope.reviewerGrantId!,
              actorId: actor.id,
              createdAt: now,
            },
          });
          const next = await tx.materialDraft.update({
            where: { taskId },
            data: { revision: { increment: 1 } },
          });
          await tx.draftEdit.create({
            data: {
              taskId,
              revision: next.revision,
              entries: json(next.entries),
              actorId: actor.id,
              kind: 'HANDOVER',
              occurredAt: now,
            },
          });
          return executionView(
            await tx.taskExecution.update({
              where: { taskId },
              data: {
                revision: { increment: 1 },
                generation: { increment: 1 },
              },
            }),
          );
        }
        if (action === 'task.close') {
          await manager();
          const b = bodyObject(input, ['expectedRevision', 'reason']);
          versionCheck(b.expectedRevision);
          if (execution.state === 'CLOSED')
            throw new ConflictException('Already closed');
          return executionView(
            await tx.taskExecution.update({
              where: { taskId },
              data: {
                state: 'CLOSED',
                closedAt: now,
                closedBy: actor.id,
                closeReason: text(b.reason, 2000),
                revision: { increment: 1 },
              },
            }),
          );
        }
        deny();
      },
      { retries: stream ? 0 : 2, timeout: stream ? 15000 : 5000 },
    );
  }
}
