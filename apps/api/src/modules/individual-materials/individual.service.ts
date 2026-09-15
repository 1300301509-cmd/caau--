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
import { deny, hasRole, type Actor } from '../authorization/policy.js';
import {
  individualPolicy,
  individualTasks,
} from '../authorization/individual-policy.js';
import { revision, requirements } from '../materials/requirements.js';
import {
  PrivateStore,
  digest,
  FILE_EXTENSIONS,
  MAX_FILE_BYTES,
  verifyFile,
} from '../workflow/private-store.js';
import { safeFilename } from '../workflow/filename.js';
import { advanceExecutionContext } from '../workflow/execution.js';
import { MaterialsService } from '../materials/materials.service.js';
import {
  individualStates,
  type IndividualContentDto,
} from './individual.dto.js';

type Tx = Prisma.TransactionClient;
type Material = Prisma.IndividualMaterialGetPayload<Record<string, never>>;
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const content = (value: unknown): IndividualContentDto => {
  const b = bodyObject(value, ['title', 'category', 'text', 'fileIds']);
  if (
    typeof b.category !== 'string' ||
    b.category.length > 120 ||
    typeof b.text !== 'string' ||
    b.text.length > 20000 ||
    !Array.isArray(b.fileIds) ||
    b.fileIds.length > 20
  )
    throw new BadRequestException('Invalid material content');
  const fileIds = b.fileIds.map(uuid);
  if (new Set(fileIds).size !== fileIds.length)
    throw new BadRequestException('Duplicate files');
  return {
    title: text(b.title, 160),
    category: b.category.trim(),
    text: b.text,
    fileIds,
  };
};
const uploadView = (f: {
  id: string;
  originalName: string;
  extension: string;
  expectedBytes: number;
  state: string;
}) => ({
  id: f.id,
  originalName: f.originalName,
  extension: f.extension,
  expectedBytes: f.expectedBytes,
  state: f.state,
});
const page = (v: unknown, fallback: number, max: number) => {
  const n = v === undefined ? fallback : Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max)
    throw new BadRequestException('Invalid pagination');
  return n;
};
async function now(tx: Tx) {
  return (
    await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
  )[0]!.now;
}
async function actorLabels(tx: Tx, ids: string[]) {
  return new Map(
    (
      await tx.internalUser.findMany({
        where: { id: { in: [...new Set(ids)] } },
        select: { id: true, displayName: true },
      })
    ).map((u) => [u.id, u.displayName]),
  );
}
function actionView(
  a: Prisma.IndividualActionGetPayload<Record<string, never>>,
  draft: boolean,
  names: Map<string, string>,
) {
  const d = a.detail as Record<string, Prisma.JsonValue>;
  return {
    id: a.id,
    revision: a.revision,
    action: a.action,
    fromState: a.fromState,
    toState: a.toState,
    submissionId: a.submissionId,
    actorId: a.actorId,
    actorName: names.get(a.actorId) ?? a.actorId,
    occurredAt: a.occurredAt.toISOString(),
    reason: typeof d.reason === 'string' ? d.reason : '',
    modification: typeof d.modification === 'string' ? d.modification : '',
    content: draft ? (d.content ?? null) : null,
  };
}
function submissionView(
  s: Prisma.IndividualSubmissionGetPayload<Record<string, never>>,
  names: Map<string, string>,
) {
  return {
    id: s.id,
    version: s.version,
    actorId: s.actorId,
    actorName: names.get(s.actorId) ?? s.actorId,
    generation: s.generation,
    content: s.content,
    occurredAt: s.occurredAt.toISOString(),
    deadline: s.deadline.toISOString(),
  };
}

@Injectable()
export class IndividualService {
  constructor(
    private readonly auth: AuthorizationService,
    private readonly store: PrivateStore,
    private readonly materials: MaterialsService,
  ) {}
  private async deadline(tx: Tx, m: Material) {
    const e = await tx.taskExecution.findUniqueOrThrow({
      where: { taskId: m.taskId },
    });
    const d = e.deadlines as unknown as {
      task: string;
      materials: Array<{ id: string; deadline: string }>;
    };
    const match = m.requirementItemId
      ? d.materials.find((x) => x.id === m.requirementItemId)
      : undefined;
    if (m.requirementItemId && !match)
      throw new ConflictException('Requirement deadline missing');
    return {
      e,
      deadline: new Date(
        Math.min(
          Date.parse(d.task),
          match ? Date.parse(match.deadline) : Infinity,
        ),
      ),
    };
  }
  private async view(tx: Tx, actor: Actor, m: Material) {
    const { e, deadline } = await this.deadline(tx, m);
    const s = m.currentSubmissionId
      ? await tx.individualSubmission.findUniqueOrThrow({
          where: { id: m.currentSubmissionId },
        })
      : null;
    const canDraft = !hasRole(actor, 'REVIEWER');
    const last = await tx.individualAction.findFirst({
      where: {
        materialId: m.id,
        ...(canDraft ? {} : { action: { notIn: ['CREATE', 'SAVE'] } }),
      },
      orderBy: { revision: 'desc' },
    });
    const names = await actorLabels(tx, [
      ...(s ? [s.actorId] : []),
      ...(last ? [last.actorId] : []),
    ]);
    return {
      id: m.id,
      taskId: m.taskId,
      state: m.state,
      revision: m.revision,
      draftRevision: canDraft ? m.draftRevision : 0,
      generation: e.generation,
      contextRevision: e.revision,
      closed: e.state === 'CLOSED',
      deadline: deadline.toISOString(),
      currentSubmissionId: m.currentSubmissionId,
      draft: canDraft ? m.draft : null,
      submission: s ? submissionView(s, names) : null,
      lastAction: last ? actionView(last, canDraft, names) : null,
    };
  }
  private async accessible(
    tx: Tx,
    actor: Actor,
    id: string,
    action: 'read' | 'write' | 'review' = 'read',
  ) {
    const m = await tx.individualMaterial.findUnique({ where: { id } });
    if (!m) deny();
    await individualPolicy(tx, actor, m.taskId, action);
    if (hasRole(actor, 'REVIEWER') && !m.currentSubmissionId) deny();
    return m;
  }
  async snapshot(token: string, input: unknown) {
    const b = bodyObject(input, [
      'taskId',
      'selectedId',
      'state',
      'offset',
      'limit',
    ]);
    const offset = page(b.offset, 0, 100000),
      take = page(b.limit, 20, 50);
    if (!take) throw new BadRequestException('Positive limit required');
    return this.auth.run(
      token,
      'individual.snapshot',
      undefined,
      undefined,
      async (tx, actor) => {
        const where: Prisma.IndividualMaterialWhereInput = {
          channel: { task: individualTasks(actor) },
          ...(hasRole(actor, 'REVIEWER')
            ? {
                currentSubmissionId: { not: null },
                state: { in: ['PENDING_REVIEW', 'IN_REVIEW'] },
              }
            : {}),
          ...(b.taskId ? { taskId: uuid(b.taskId) } : {}),
        };
        if (b.state !== undefined) {
          if (
            !individualStates.includes(
              b.state as (typeof individualStates)[number],
            )
          )
            throw new BadRequestException('Invalid state');
          where.state = b.state as (typeof individualStates)[number];
        }
        const items = await tx.individualMaterial.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: offset,
          take,
        });
        const selected = b.selectedId
          ? await this.accessible(tx, actor, uuid(b.selectedId))
          : null;
        return {
          serverTime: (await now(tx)).toISOString(),
          total: await tx.individualMaterial.count({ where }),
          items: await Promise.all(items.map((m) => this.view(tx, actor, m))),
          selected: selected ? await this.view(tx, actor, selected) : null,
        };
      },
      { retries: 3 },
    );
  }
  async history(token: string, id: string, input: unknown) {
    const b = bodyObject(input, ['offset', 'limit']);
    const skip = page(b.offset, 0, 100000),
      take = page(b.limit, 20, 50);
    if (!take) throw new BadRequestException('Positive limit required');
    return this.auth.run(
      token,
      'individual.history',
      id,
      undefined,
      async (tx, actor, id) => {
        const material = await this.accessible(tx, actor, id!);
        const canDraft = !hasRole(actor, 'REVIEWER');
        const where = {
          materialId: id!,
          ...(canDraft ? {} : { action: { notIn: ['CREATE', 'SAVE'] } }),
        };
        const actions = await tx.individualAction.findMany({
          where,
          orderBy: { revision: 'desc' },
          skip,
          take,
        });
        const submissions = await tx.individualSubmission.findMany({
          where: { materialId: id! },
          orderBy: { version: 'desc' },
          skip,
          take,
        });
        const names = await actorLabels(tx, [
          ...actions.map((a) => a.actorId),
          ...submissions.map((s) => s.actorId),
        ]);
        return {
          materialRevision: material.revision,
          serverTime: (await now(tx)).toISOString(),
          total: await tx.individualAction.count({ where }),
          actions: actions.map((a) => actionView(a, canDraft, names)),
          submissions: submissions.map((s) => submissionView(s, names)),
        };
      },
      { retries: 3 },
    );
  }
  async manage(
    token: string,
    op: 'create-task' | 'activate' | 'grant',
    resource: string | undefined,
    input: unknown,
  ) {
    if (op === 'grant')
      return this.auth.execute(token, 'admin.grant.active', resource, input);
    return this.auth.run(
      token,
      `individual.${op}`,
      resource,
      input,
      async (tx, actor, id) => {
        if (op === 'create-task') {
          const created = await this.materials.createIndividualTask(
            tx,
            actor,
            input,
          );
          await tx.taskMaterialChannel.create({
            data: { taskId: created.id, actorId: actor.id, source: 'NEW' },
          });
          return created;
        }
        const b = bodyObject(input, ['expectedRevision', 'reason']);
        text(b.reason, 2000);
        await tx.$queryRaw`SELECT "taskId" FROM "TaskExecution" WHERE "taskId"=${id}::uuid FOR UPDATE`;
        actor = await this.auth.reloadActor(tx, token);
        const task = await tx.materialTask.findUnique({ where: { id: id! } });
        if (!task) deny();
        await this.auth.requireEventManager(tx, actor, task.eventId);
        const e = await tx.taskExecution.findUnique({ where: { taskId: id! } });
        if (
          !e ||
          !['EDITING', 'SUBMITTED'].includes(e.state) ||
          e.revision !== revision(b.expectedRevision)
        )
          throw new ConflictException('Task cannot activate');
        await tx.taskMaterialChannel.create({
          data: {
            taskId: id!,
            actorId: actor.id,
            source: 'LEGACY',
            reason: text(b.reason, 2000),
          },
        });
        await advanceExecutionContext(tx, id!);
        return { id: id! };
      },
      { retries: 3 },
    );
  }
  async execute(
    token: string,
    op: 'create' | 'save' | 'submit' | 'start' | 'approve' | 'return',
    resource: string | undefined,
    input: unknown,
  ) {
    return this.auth.run(
      token,
      `individual.${op}`,
      resource,
      input,
      async (tx, actor, id) => {
        const b = bodyObject(
          input,
          op === 'create'
            ? ['id', 'taskId', 'key', 'requirementItemId', 'content']
            : op === 'save'
              ? ['expectedDraftRevision', 'generation', 'content']
              : [
                  'key',
                  'expectedRevision',
                  'generation',
                  'expectedDraftRevision',
                  'submissionId',
                  'reason',
                  'modification',
                ],
        );
        id = op === 'create' ? uuid(b.id) : id!;
        const existing = await tx.individualMaterial.findUnique({
          where: { id },
        });
        const taskId = op === 'create' ? uuid(b.taskId) : existing?.taskId;
        if (!taskId) deny();
        await tx.$queryRaw`SELECT "taskId" FROM "TaskExecution" WHERE "taskId"=${taskId}::uuid FOR SHARE`;
        await tx.$queryRaw`SELECT "id" FROM "IndividualMaterial" WHERE "id"=${id}::uuid FOR UPDATE`;
        actor = await this.auth.reloadActor(tx, token);
        const task = await individualPolicy(
          tx,
          actor,
          taskId,
          ['create', 'save', 'submit'].includes(op) ? 'write' : 'review',
        );
        let m = await tx.individualMaterial.findUnique({ where: { id } });
        if (m && m.taskId !== taskId) deny();
        if (op !== 'create' && !m) deny();
        if (m && hasRole(actor, 'REVIEWER') && !m.currentSubmissionId) deny();
        const e = await tx.taskExecution.findUniqueOrThrow({
          where: { taskId },
        });
        const key = op === 'save' ? null : uuid(b.key);
        // Canonicalize object keys recursively, not their insertion order.
        const canonical = (v: unknown): unknown =>
          Array.isArray(v)
            ? v.map(canonical)
            : v && typeof v === 'object'
              ? Object.fromEntries(
                  Object.entries(v)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([k, v]) => [k, canonical(v)]),
                )
              : v;
        const requestHash = digest(JSON.stringify(canonical({ op, ...b })));
        if (m && key) {
          const cmd = await tx.individualCommand.findUnique({
            where: {
              materialId_actorId_key: {
                materialId: id,
                actorId: actor.id,
                key,
              },
            },
          });
          if (cmd) {
            if (cmd.requestHash !== requestHash)
              throw new ConflictException({
                code: 'IDEMPOTENCY_MISMATCH',
                message: 'Key used with different request',
                current: await this.view(tx, actor, m),
              });
            return {
              ...(cmd.result as object),
              current: await this.view(tx, actor, m),
            };
          }
        }
        const conflict = async (message: string): Promise<never> => {
          throw new ConflictException({
            code: 'INDIVIDUAL_CONFLICT',
            message,
            ...(m ? { current: await this.view(tx, actor, m) } : {}),
          });
        };
        if (e.state === 'CLOSED') return conflict('Task is closed');
        if (op !== 'create' && e.generation !== revision(b.generation))
          return conflict('Assignment changed');
        const time = await now(tx);
        if (op === 'create') {
          if (m) return conflict('Material already exists');
          const value = content(b.content);
          if (value.fileIds.length)
            throw new BadRequestException(
              'Upload files after material creation',
            );
          const requirementItemId = b.requirementItemId
            ? uuid(b.requirementItemId)
            : null;
          if (requirementItemId) {
            const r = await tx.requirementVersion.findUniqueOrThrow({
              where: { taskId },
            });
            if (
              !requirements(r.configuration, true).materials.some(
                (x) => x.id === requirementItemId,
              )
            )
              deny();
          }
          m = await tx.individualMaterial.create({
            data: {
              id,
              taskId,
              organizationId: task.scope.handler.member.organizationId,
              requirementItemId,
              draft: json(value),
              actorId: actor.id,
            },
          });
          await tx.individualAction.create({
            data: {
              materialId: id,
              revision: 1,
              action: 'CREATE',
              fromState: 'DRAFT',
              toState: 'DRAFT',
              actorId: actor.id,
              occurredAt: time,
              detail: json({ content: value }),
            },
          });
        } else {
          if (!m) deny();
          if (op === 'save') {
            if (
              !['DRAFT', 'RETURNED'].includes(m.state) ||
              revision(b.expectedDraftRevision) !== m.draftRevision
            )
              return conflict('Draft changed or not editable');
            const value = content(b.content);
            await this.files(tx, m, value, e.generation, true, time);
            const previous = m;
            m = await tx.individualMaterial.update({
              where: { id, revision: m.revision },
              data: {
                draft: json(value),
                draftRevision: { increment: 1 },
                revision: { increment: 1 },
              },
            });
            await tx.individualAction.create({
              data: {
                materialId: id,
                submissionId: m.currentSubmissionId,
                revision: m.revision,
                action: 'SAVE',
                fromState: previous.state,
                toState: m.state,
                actorId: actor.id,
                occurredAt: time,
                detail: json({ content: value }),
              },
            });
            return {
              resultRevision: m.revision,
              resultSubmissionId: m.currentSubmissionId,
              current: await this.view(tx, actor, m),
            };
          }
          if (revision(b.expectedRevision) !== m.revision)
            return conflict('Material changed');
          const previous = m;
          let state: Material['state'];
          let detail: Prisma.InputJsonValue = {};
          let submissionId = m.currentSubmissionId;
          if (op === 'submit') {
            if (
              !['DRAFT', 'RETURNED'].includes(m.state) ||
              revision(b.expectedDraftRevision) !== m.draftRevision
            )
              return conflict('Draft changed or not editable');
            const value = content(m.draft);
            if (!value.text.trim() && !value.fileIds.length)
              throw new BadRequestException('Content or attachment required');
            const { deadline } = await this.deadline(tx, m);
            if (time >= deadline)
              return conflict(
                'Deadline elapsed; save draft and request extension',
              );
            await this.files(tx, m, value, e.generation, false, time);
            submissionId = randomUUID();
            await tx.individualSubmission.create({
              data: {
                id: submissionId,
                materialId: id,
                taskId,
                version: m.nextVersion,
                content: json(value),
                generation: e.generation,
                deadline,
                actorId: actor.id,
                occurredAt: time,
              },
            });
            if (value.fileIds.length)
              await tx.individualAttachment.createMany({
                data: value.fileIds.map((fileId) => ({
                  fileId,
                  submissionId: submissionId!,
                  materialId: id,
                  taskId,
                })),
              });
            state = 'PENDING_REVIEW';
          } else {
            if (uuid(b.submissionId) !== m.currentSubmissionId)
              return conflict('Submission changed');
            if (op === 'start') {
              if (m.state !== 'PENDING_REVIEW')
                return conflict('Review already started or finished');
              state = 'IN_REVIEW';
            } else {
              if (m.state !== 'IN_REVIEW')
                return conflict('Start review before deciding');
              state = op === 'approve' ? 'APPROVED' : 'RETURNED';
              if (op === 'return')
                detail = {
                  reason: text(b.reason, 2000),
                  modification: text(b.modification, 2000),
                };
            }
          }
          m = await tx.individualMaterial.update({
            where: { id, revision: m.revision },
            data: {
              state,
              currentSubmissionId: submissionId,
              revision: { increment: 1 },
              ...(op === 'submit' ? { nextVersion: { increment: 1 } } : {}),
            },
          });
          await tx.individualAction.create({
            data: {
              materialId: id,
              submissionId,
              revision: m.revision,
              action: op.toUpperCase(),
              fromState: previous.state,
              toState: m.state,
              actorId: actor.id,
              occurredAt: time,
              detail,
            },
          });
        }
        const result = {
          resultRevision: m.revision,
          resultSubmissionId: m.currentSubmissionId,
        };
        await tx.individualCommand.create({
          data: {
            materialId: id,
            actorId: actor.id,
            key: key!,
            requestHash,
            result,
          },
        });
        return { ...result, current: await this.view(tx, actor, m) };
      },
      { retries: 3, retryUnique: op === 'create' },
    );
  }
  private async files(
    tx: Tx,
    m: Material,
    value: IndividualContentDto,
    generation: number,
    bind: boolean,
    time: Date,
  ) {
    for (const id of value.fileIds) {
      const f = await tx.individualUpload.findUnique({ where: { id } });
      if (
        !f ||
        f.materialId !== m.id ||
        f.taskId !== m.taskId ||
        f.organizationId !== m.organizationId ||
        f.state !== 'CONFIRMED' ||
        (f.generation !== generation && !f.boundAt)
      )
        deny();
      await this.bytes(f);
      if (bind && !f.boundAt)
        await tx.individualUpload.update({
          where: { id },
          data: { boundAt: time },
        });
    }
  }
  private async bytes(f: {
    storageKey: string;
    extension: string;
    expectedBytes: number;
    sha256: string;
  }) {
    let bytes: Buffer;
    try {
      bytes = await this.store.read(f.storageKey);
    } catch {
      throw new ConflictException('Private object unavailable');
    }
    verifyFile(bytes, f.extension, f.expectedBytes, f.sha256);
    return bytes;
  }
  async file(
    token: string,
    op: 'intent' | 'content' | 'confirm' | 'info' | 'download',
    id: string,
    input?: unknown,
    stream?: IncomingMessage,
  ) {
    return this.auth.run(
      token,
      `individual.file.${op}`,
      id,
      input,
      async (tx, actor, id) => {
        const f =
          op === 'intent'
            ? null
            : await tx.individualUpload.findUnique({ where: { id: id! } });
        if (op !== 'intent' && !f) deny();
        const materialId = f?.materialId ?? id!;
        const initial = await tx.individualMaterial.findUnique({
          where: { id: materialId },
        });
        if (!initial) deny();
        await tx.$queryRaw`SELECT "taskId" FROM "TaskExecution" WHERE "taskId"=${initial.taskId}::uuid FOR SHARE`;
        await tx.$queryRaw`SELECT "id" FROM "IndividualMaterial" WHERE "id"=${materialId}::uuid FOR UPDATE`;
        actor = await this.auth.reloadActor(tx, token);
        const read = ['info', 'download'].includes(op);
        const m = await this.accessible(
          tx,
          actor,
          materialId,
          read ? 'read' : 'write',
        );
        const { e } = await this.deadline(tx, m);
        const time = await now(tx);
        if (
          !read &&
          (e.state === 'CLOSED' || !['DRAFT', 'RETURNED'].includes(m.state))
        )
          throw new ConflictException('Material not editable');
        if (op === 'intent') {
          const b = bodyObject(input, [
            'originalName',
            'extension',
            'expectedBytes',
            'sha256',
            'generation',
          ]);
          if (revision(b.generation) !== e.generation)
            throw new ConflictException('Assignment changed');
          if (
            typeof b.extension !== 'string' ||
            !FILE_EXTENSIONS.includes(b.extension) ||
            !Number.isInteger(b.expectedBytes) ||
            Number(b.expectedBytes) < 1 ||
            Number(b.expectedBytes) > MAX_FILE_BYTES ||
            typeof b.sha256 !== 'string' ||
            !/^[a-f0-9]{64}$/.test(b.sha256)
          )
            throw new BadRequestException('Invalid upload metadata');
          if (m.requirementItemId) {
            const req = await tx.requirementVersion.findUniqueOrThrow({
              where: { taskId: m.taskId },
            });
            const item = requirements(req.configuration, true).materials.find(
              (x) => x.id === m.requirementItemId,
            );
            if (
              !item ||
              !item.formats.includes(b.extension) ||
              Number(b.expectedBytes) > item.maxBytes
            )
              throw new BadRequestException('Requirement file limits exceeded');
          }
          return tx.individualUpload
            .create({
              data: {
                materialId,
                taskId: m.taskId,
                organizationId: m.organizationId,
                generation: e.generation,
                actorId: actor.id,
                storageKey: randomUUID(),
                originalName: safeFilename(
                  text(b.originalName, 180),
                  b.extension,
                )!,
                extension: b.extension,
                expectedBytes: Number(b.expectedBytes),
                sha256: b.sha256,
                expiresAt: new Date(time.getTime() + 1800000),
              },
            })
            .then(uploadView);
        }
        if (!f) deny();
        if (read) {
          const inDraft =
            !hasRole(actor, 'REVIEWER') &&
            content(m.draft).fileIds.includes(f.id);
          const historical = await tx.individualAttachment.count({
            where: { fileId: f.id, materialId },
          });
          if (f.state !== 'CONFIRMED' || (!inDraft && !historical)) deny();
          return op === 'info'
            ? uploadView(f)
            : { data: await this.bytes(f), info: uploadView(f) };
        }
        if (
          f.generation !== e.generation ||
          f.actorId !== actor.id ||
          f.expiresAt <= time
        )
          deny();
        if (op === 'content') {
          if (f.state !== 'PENDING' || !stream)
            throw new ConflictException('Upload already confirmed');
          await this.store.put(f.storageKey, stream, f.expectedBytes);
          return { id: f.id };
        }
        await this.bytes(f);
        return tx.individualUpload
          .update({
            where: { id: f.id },
            data: { state: 'CONFIRMED', confirmedAt: f.confirmedAt ?? time },
          })
          .then(uploadView);
      },
      { retries: op === 'content' ? 0 : 3, timeout: 15000 },
    );
  }
}
