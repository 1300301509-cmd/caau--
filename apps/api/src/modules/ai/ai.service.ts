import {
  ConflictException,
  ForbiddenException,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import {
  Annotation,
  END,
  MemorySaver,
  START,
  StateGraph,
} from '@langchain/langgraph';
import { createAgentCheckpointer, type Prisma } from '@caau/database';
import {
  AuthorizationService,
  bodyObject,
  text,
  uuid,
} from '../authorization/authorization.service.js';
import {
  deny,
  isHeadquartersSuperAdmin,
  scheduleDraftAdjust,
  scheduleRead,
  scheduleReadScope,
  type Actor,
} from '../authorization/policy.js';
import { SchedulingService } from '../scheduling/scheduling.service.js';
import type { ScheduleMatchDto } from '../scheduling/scheduling.dto.js';
import type {
  AgentIntentPatch,
  AgentModelAdapter,
  AgentTaskParameters,
} from './model-adapter.js';

type Tx = Prisma.TransactionClient;
type AgentTaskRow = Prisma.AgentTaskGetPayload<Record<string, never>>;
type AgentTicketRow = Prisma.AgentConfirmationTicketGetPayload<
  Record<string, never>
>;
type TaskStep =
  | 'LOCATE_EVENT'
  | 'LOCATE_MATCH'
  | 'WAITING_PARAMETERS'
  | 'PREVIEW_READY'
  | 'STALE'
  | 'FAILED'
  | 'EXECUTED'
  | 'CANCELLED';
type ReplyStatus =
  | 'NEED_EVENT'
  | 'NEED_MATCH'
  | 'NEED_PARAMETERS'
  | 'PREVIEW'
  | 'STALE'
  | 'ERROR';
type Candidate = { id: string; label: string; detail?: string };
type MessageBody = {
  message: string;
  eventId?: string;
  matchId?: string;
  taskId?: string;
  newTask: boolean;
};
type RuntimeContext = {
  token: string;
  sessionId: string;
  message: string;
  eventId?: string;
  matchId?: string;
};
const json = (value: unknown) => value as Prisma.InputJsonValue;
const confirmationTool = {
  name: 'schedule.draft.adjust',
  version: 'v1',
} as const;
type ConfirmationSummary = {
  homeLabel: string;
  awayLabel: string;
  beforeStartAt: string;
  beforeVenue: string;
  afterStartAt: string;
  afterVenue: string;
};
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const confirmationHash = (input: {
  ownerId: string;
  eventId: string;
  matchId: string;
  startAt: string;
  venue: string;
  expectedRevision: number;
  summary: ConfirmationSummary;
}) =>
  digest([
    input.ownerId,
    input.eventId,
    input.matchId,
    input.startAt,
    input.venue,
    input.expectedRevision,
    input.summary.homeLabel,
    input.summary.awayLabel,
    input.summary.beforeStartAt,
    input.summary.beforeVenue,
    input.summary.afterStartAt,
    input.summary.afterVenue,
    confirmationTool.name,
    confirmationTool.version,
  ]);
const strings = (value: Prisma.JsonValue): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
const parameters = (value: Prisma.JsonValue): AgentTaskParameters =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AgentTaskParameters)
    : {};

const GraphState = Annotation.Root({
  workflowVersion: Annotation<number>(),
  taskId: Annotation<string>(),
  sessionId: Annotation<string>(),
  revision: Annotation<number>(),
  step: Annotation<string>(),
  eventId: Annotation<string>(),
  matchId: Annotation<string>(),
  baselineRevision: Annotation<number>(),
  parameters: Annotation<AgentTaskParameters>(),
  pendingFields: Annotation<string[]>(),
  candidates: Annotation<Candidate[]>(),
  route: Annotation<'preview' | 'respond'>(),
  status: Annotation<ReplyStatus>(),
  responseMessage: Annotation<string>(),
});
type WorkflowState = typeof GraphState.State;

function localParts(iso: string) {
  const value = new Date(Date.parse(iso) + 8 * 60 * 60 * 1000).toISOString();
  return { date: value.slice(0, 10), time: value.slice(11, 16) };
}
function weekday(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}
function dateForWeekday(source: string, targetWeekday: number) {
  const sourceDate = localParts(source).date;
  const day = new Date(`${sourceDate}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + targetWeekday - weekday(sourceDate));
  return day.toISOString().slice(0, 10);
}
function instant(date: string, hour: number, minute: number) {
  return new Date(
    `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+08:00`,
  ).toISOString();
}
function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function mergeAgentIntent(
  known: AgentTaskParameters,
  patch: AgentIntentPatch,
) {
  const next = { ...known };
  const sourceChanged =
    patch.sourceWeekday !== undefined || patch.sourceOrdinal !== undefined;
  if (sourceChanged) {
    delete next.sourceMatchId;
    delete next.targetStartAt;
  }
  for (const key of [
    'sourceWeekday',
    'sourceOrdinal',
    'targetHour',
    'targetMinute',
    'venue',
  ] as const)
    if (patch[key] !== undefined) next[key] = patch[key] as never;

  if (patch.targetWeekday !== undefined) {
    next.targetWeekday = patch.targetWeekday;
    delete next.targetDate;
  }
  // A calendar date is more specific than a weekday if both occur in one turn.
  if (patch.targetDate !== undefined) {
    next.targetDate = patch.targetDate;
    delete next.targetWeekday;
  }
  const absoluteTargetChanged =
    patch.targetWeekday !== undefined ||
    patch.targetDate !== undefined ||
    patch.targetHour !== undefined ||
    patch.targetMinute !== undefined;
  if (absoluteTargetChanged) delete next.targetStartAt;

  if (patch.targetOffsetMinutes !== undefined) {
    if (!sourceChanged && !absoluteTargetChanged && known.targetStartAt) {
      const shifted = new Date(
        Date.parse(known.targetStartAt) + patch.targetOffsetMinutes * 60 * 1000,
      );
      next.targetStartAt = shifted.toISOString();
      const local = localParts(next.targetStartAt);
      next.targetDate = local.date;
      next.targetHour = Number(local.time.slice(0, 2));
      next.targetMinute = Number(local.time.slice(3, 5));
      delete next.targetWeekday;
    } else if (next.targetHour !== undefined) {
      const total =
        next.targetHour * 60 +
        (next.targetMinute ?? 0) +
        patch.targetOffsetMinutes;
      const dayDelta = Math.floor(total / 1440);
      const normalized = ((total % 1440) + 1440) % 1440;
      next.targetHour = Math.floor(normalized / 60);
      next.targetMinute = normalized % 60;
      if (dayDelta && next.targetWeekday !== undefined) {
        next.targetWeekday =
          ((next.targetWeekday - 1 + dayDelta + 700) % 7) + 1;
        delete next.targetDate;
      } else if (dayDelta && next.targetDate)
        next.targetDate = shiftDate(next.targetDate, dayDelta);
      delete next.targetStartAt;
    }
  }
  return next;
}
function matchLabel(match: ScheduleMatchDto) {
  return `第${match.order}场 · ${match.homeLabel} vs ${match.awayLabel}`;
}

@Injectable()
export class AiService implements OnModuleDestroy {
  private readonly checkpoint;
  private readonly graph;
  private readonly runtime = new AsyncLocalStorage<RuntimeContext>();

  constructor(
    private readonly auth: AuthorizationService,
    private readonly model: AgentModelAdapter,
    private readonly scheduling: SchedulingService,
    databaseUrl?: string,
  ) {
    this.checkpoint = databaseUrl
      ? createAgentCheckpointer(databaseUrl)
      : undefined;
    const saver = this.checkpoint?.saver ?? new MemorySaver();
    this.graph = new StateGraph(GraphState)
      .addNode('authorize_context', (state) => this.authorizeNode(state))
      .addNode('parse_intent', (state) => this.parseIntentNode(state))
      .addNode('locate_resources', (state) => this.locateResourcesNode(state))
      .addNode('deterministic_preview', (state) => this.previewNode(state))
      .addNode('return_result', (state) => this.resultNode(state))
      .addEdge(START, 'authorize_context')
      .addEdge('authorize_context', 'parse_intent')
      .addEdge('parse_intent', 'locate_resources')
      .addConditionalEdges('locate_resources', (state) => state.route, {
        preview: 'deterministic_preview',
        respond: 'return_result',
      })
      .addEdge('deterministic_preview', 'return_result')
      .addEdge('return_result', END)
      .compile({ checkpointer: saver });
  }

  async onModuleDestroy() {
    await this.checkpoint?.close();
  }

  private context() {
    const context = this.runtime.getStore();
    if (!context) throw new Error('Agent runtime context unavailable');
    return context;
  }

  private ticketView(ticket: AgentTicketRow) {
    return {
      id: ticket.id,
      actorId: ticket.ownerId,
      actorDisplayName: ticket.actorDisplayName,
      eventId: ticket.eventId,
      eventName: ticket.eventName,
      matchId: ticket.matchId,
      expectedRevision: ticket.expectedRevision,
      parameterHash: ticket.parameterHash,
      toolVersion: ticket.toolVersion,
      expiresAt: ticket.expiresAt.toISOString(),
      state: ticket.state as 'PENDING' | 'EXECUTED' | 'CANCELLED',
      parameterSummary: ticket.parameterSummary,
    };
  }

  private taskView(task: {
    id: string;
    goal: string;
    step: string;
    eventId: string | null;
    matchId: string | null;
    baselineRevision: number | null;
    parameters: Prisma.JsonValue;
    pendingFields: Prisma.JsonValue;
    preview: Prisma.JsonValue | null;
    previewExpiresAt: Date | null;
    confirmationTickets?: AgentTicketRow[];
  }) {
    return {
      id: task.id,
      goal: task.goal,
      step: task.step as TaskStep,
      eventId: task.eventId,
      matchId: task.matchId,
      baselineRevision: task.baselineRevision,
      parameters: parameters(task.parameters),
      pendingFields: strings(task.pendingFields),
      preview: task.step === 'PREVIEW_READY' ? task.preview : null,
      confirmation: task.confirmationTickets?.[0]
        ? this.ticketView(task.confirmationTickets[0])
        : null,
      expiresAt: task.previewExpiresAt?.toISOString() ?? null,
    };
  }

  private async validateSessionAccess(
    tx: Tx,
    actor: Actor,
    sessionId: string,
    taskId?: string,
  ) {
    const session = await tx.agentSession.findFirst({
      where: { id: sessionId, ownerId: actor.id },
      include: { tasks: { orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] } },
    });
    if (!session) deny();
    const eventIds = new Set(
      [
        session.currentEventId,
        ...session.tasks.map((task) => task.eventId),
      ].filter((id): id is string => !!id),
    );
    for (const eventId of eventIds) await scheduleRead(tx, actor, eventId);
    const task = taskId
      ? session.tasks.find((candidate) => candidate.id === taskId)
      : session.tasks[0];
    if (taskId && !task) deny();
    return { session, task };
  }

  async getModelStatus(token: string) {
    await this.auth.run(
      token,
      'agent.model.status',
      undefined,
      {},
      async (_tx, actor) => {
        if (!isHeadquartersSuperAdmin(actor)) deny();
        return true;
      },
    );
    return this.model.status();
  }

  async testModelConnection(token: string) {
    await this.auth.run(
      token,
      'agent.model.test',
      undefined,
      {},
      async (_tx, actor) => {
        if (!isHeadquartersSuperAdmin(actor)) deny();
        return true;
      },
    );
    return this.model.testConnection();
  }

  confirmScheduleAdjustment(token: string, ticketId: string, input: unknown) {
    const body = bodyObject(input, ['eventId', 'matchId', 'parameterHash']);
    const eventId = uuid(body.eventId);
    const matchId = uuid(body.matchId);
    const parameterHash = text(body.parameterHash, 64);
    if (!/^[0-9a-f]{64}$/.test(parameterHash))
      throw new ConflictException('Confirmation parameters changed');
    return this.auth.run(
      token,
      'schedule.draft.adjust',
      ticketId,
      input,
      async (tx, actor) => {
        await tx.$queryRaw`SELECT "id" FROM "AgentConfirmationTicket" WHERE "id"=${ticketId}::uuid FOR UPDATE`;
        const ticket = await tx.agentConfirmationTicket.findUnique({
          where: { id: ticketId },
          include: { receipt: true, task: true },
        });
        if (
          !ticket ||
          ticket.ownerId !== actor.id ||
          ticket.task.ownerId !== actor.id
        )
          deny();
        if (ticket.eventId !== eventId || ticket.matchId !== matchId)
          throw new ConflictException('Confirmation resource changed');
        await scheduleDraftAdjust(tx, actor, ticket.eventId);
        if (ticket.receipt) {
          if (ticket.parameterHash !== parameterHash) {
            throw new ConflictException('Confirmation parameters changed');
          }
          return {
            ...(ticket.receipt.result as object),
            replayed: true,
          };
        }
        if (ticket.state !== 'PENDING')
          throw new ConflictException('Confirmation is no longer pending');
        if (ticket.expiresAt <= new Date())
          throw new ConflictException('Confirmation expired; preview again');
        if (
          ticket.parameterHash !== parameterHash ||
          ticket.toolName !== confirmationTool.name ||
          ticket.toolVersion !== confirmationTool.version
        )
          throw new ConflictException('Confirmation parameters changed');
        const summary =
          ticket.parameterSummary as unknown as ConfirmationSummary;
        const actualHash = confirmationHash({
          ownerId: ticket.ownerId,
          eventId: ticket.eventId,
          matchId: ticket.matchId,
          startAt: ticket.startAt.toISOString(),
          venue: ticket.venue,
          expectedRevision: ticket.expectedRevision,
          summary,
        });
        if (
          actualHash !== ticket.parameterHash ||
          ticket.task.eventId !== ticket.eventId ||
          ticket.task.matchId !== ticket.matchId ||
          ticket.task.baselineRevision !== ticket.expectedRevision ||
          ticket.task.step !== 'PREVIEW_READY'
        )
          throw new ConflictException('Confirmation binding changed');
        const schedule = await this.scheduling.adjustInTransaction(
          tx,
          actor,
          ticket.eventId,
          ticket.matchId,
          {
            commandId: ticket.commandId,
            expectedRevision: ticket.expectedRevision,
            startAt: ticket.startAt.toISOString(),
            venue: ticket.venue,
          },
        );
        const result = {
          ticketId: ticket.id,
          commandId: ticket.commandId,
          replayed: false,
          eventId: ticket.eventId,
          matchId: ticket.matchId,
          revision: schedule.revision,
          status: 'DRAFT' as const,
          issues: schedule.issues,
        };
        await tx.agentCommandReceipt.create({
          data: {
            id: randomUUID(),
            ticketId: ticket.id,
            commandId: ticket.commandId,
            ownerId: actor.id,
            eventId: ticket.eventId,
            matchId: ticket.matchId,
            parameterHash: ticket.parameterHash,
            result: json(result),
          },
        });
        await tx.agentConfirmationTicket.update({
          where: { id: ticket.id },
          data: { state: 'EXECUTED', consumedAt: new Date() },
        });
        await tx.agentTask.update({
          where: { id: ticket.taskId },
          data: {
            step: 'EXECUTED',
            pendingFields: json([]),
            previewExpiresAt: null,
            revision: { increment: 1 },
            updatedAt: new Date(),
          },
        });
        await tx.agentSession.update({
          where: { id: ticket.task.sessionId },
          data: { updatedAt: new Date() },
        });
        return result;
      },
      { retries: 3, retryUnique: true, timeout: 10_000 },
    );
  }

  cancelScheduleAdjustment(token: string, ticketId: string) {
    return this.auth.run(
      token,
      'agent.schedule.cancel',
      ticketId,
      {},
      async (tx, actor) => {
        await tx.$queryRaw`SELECT "id" FROM "AgentConfirmationTicket" WHERE "id"=${ticketId}::uuid FOR UPDATE`;
        const ticket = await tx.agentConfirmationTicket.findUnique({
          where: { id: ticketId },
        });
        if (!ticket || ticket.ownerId !== actor.id) deny();
        await scheduleRead(tx, actor, ticket.eventId);
        if (ticket.state === 'EXECUTED')
          throw new ConflictException('Confirmation was already executed');
        if (ticket.state === 'CANCELLED')
          return { id: ticket.id, state: 'CANCELLED' as const };
        const updated = await tx.agentConfirmationTicket.update({
          where: { id: ticket.id },
          data: { state: 'CANCELLED', consumedAt: new Date() },
        });
        const newer = await tx.agentConfirmationTicket.count({
          where: { taskId: ticket.taskId, createdAt: { gt: ticket.createdAt } },
        });
        if (!newer)
          await tx.agentTask.updateMany({
            where: { id: ticket.taskId, step: 'PREVIEW_READY' },
            data: {
              step: 'CANCELLED',
              pendingFields: json([]),
              previewExpiresAt: null,
              revision: { increment: 1 },
              updatedAt: new Date(),
            },
          });
        return { id: updated.id, state: 'CANCELLED' as const };
      },
      { retries: 3 },
    );
  }

  createSession(token: string, input: unknown) {
    const body = bodyObject(input ?? {}, ['currentEventId']);
    return this.auth.run(
      token,
      'agent.session.create',
      undefined,
      {},
      async (tx, actor) => {
        const currentEventId = body.currentEventId
          ? uuid(body.currentEventId)
          : null;
        if (currentEventId) await scheduleRead(tx, actor, currentEventId);
        const session = await tx.agentSession.create({
          data: { id: randomUUID(), ownerId: actor.id, currentEventId },
        });
        return this.sessionView(tx, actor, session.id);
      },
    );
  }

  listSessions(token: string) {
    return this.auth.run(
      token,
      'agent.session.list',
      undefined,
      {},
      async (tx, actor) => {
        const rows = await tx.agentSession.findMany({
          where: { ownerId: actor.id },
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          take: 30,
        });
        const result = [];
        for (const row of rows) {
          try {
            result.push(await this.sessionView(tx, actor, row.id));
          } catch (error) {
            if (!(error instanceof ForbiddenException)) throw error;
            // A revoked session is not resumable; do not disclose its content.
          }
        }
        return result;
      },
    );
  }

  getSession(token: string, id: string) {
    return this.auth.run(
      token,
      'agent.session.read',
      id,
      {},
      async (tx, actor) => this.sessionView(tx, actor, id),
    );
  }

  private async sessionView(tx: Tx, actor: Actor, id: string) {
    const { session } = await this.validateSessionAccess(tx, actor, id);
    const loaded = await tx.agentSession.findUniqueOrThrow({
      where: { id },
      include: {
        turns: { orderBy: { createdAt: 'desc' }, take: 20 },
        tasks: {
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          take: 1,
          include: {
            confirmationTickets: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });
    let task = loaded.tasks[0] ?? null;
    if (task?.eventId && task.step === 'PREVIEW_READY') {
      const schedule = await tx.eventSchedule.findUnique({
        where: { eventId: task.eventId },
      });
      if (
        !schedule ||
        schedule.revision !== task.baselineRevision ||
        !task.previewExpiresAt ||
        task.previewExpiresAt <= new Date()
      ) {
        await tx.agentConfirmationTicket.updateMany({
          where: { taskId: task.id, state: 'PENDING' },
          data: { state: 'CANCELLED', consumedAt: new Date() },
        });
        task = await tx.agentTask.update({
          where: { id: task.id },
          data: {
            step: 'STALE',
            preview: json({}),
            previewExpiresAt: null,
            pendingFields: json([]),
            revision: { increment: 1 },
            updatedAt: new Date(),
          },
          include: {
            confirmationTickets: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });
      }
    }
    const receiptEventId = loaded.currentEventId ?? task?.eventId;
    const receipt = receiptEventId
      ? await tx.agentCommandReceipt.findFirst({
          where: {
            ownerId: actor.id,
            eventId: receiptEventId,
            ticket: { task: { sessionId: session.id } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        })
      : null;
    return {
      id: session.id,
      summary: loaded.summary,
      currentEventId: loaded.currentEventId,
      currentMatchId: loaded.currentMatchId,
      updatedAt: loaded.updatedAt.toISOString(),
      turns: loaded.turns.reverse().map((turn) => ({
        id: turn.id,
        role: turn.role as 'USER' | 'ASSISTANT',
        content: turn.content,
        createdAt: turn.createdAt.toISOString(),
      })),
      task: task ? this.taskView(task) : null,
      lastExecution: receipt
        ? {
            executedAt: receipt.createdAt.toISOString(),
            result: receipt.result,
          }
        : null,
    };
  }

  private parseMessage(input: unknown): MessageBody {
    const body = bodyObject(input, [
      'message',
      'eventId',
      'matchId',
      'taskId',
      'newTask',
    ]);
    if (body.newTask !== undefined && typeof body.newTask !== 'boolean')
      throw new ConflictException('Invalid new task flag');
    if (body.newTask && body.taskId)
      throw new ConflictException('New task cannot continue an existing task');
    return {
      message: text(body.message, 2000),
      ...(body.eventId ? { eventId: uuid(body.eventId) } : {}),
      ...(body.matchId ? { matchId: uuid(body.matchId) } : {}),
      ...(body.taskId ? { taskId: uuid(body.taskId) } : {}),
      newTask: body.newTask === true,
    };
  }

  private async prepareInvocation(
    token: string,
    sessionId: string,
    body: MessageBody,
  ) {
    return this.auth.run(
      token,
      'agent.workflow.prepare',
      sessionId,
      {},
      async (tx, actor) => {
        const { session, task: requested } = await this.validateSessionAccess(
          tx,
          actor,
          sessionId,
          body.taskId,
        );
        let task = requested;
        const switchedEvent =
          body.eventId && task?.eventId && body.eventId !== task.eventId;
        if (
          body.newTask ||
          switchedEvent ||
          (!body.taskId &&
            ['FAILED', 'STALE', 'EXECUTED', 'CANCELLED'].includes(
              task?.step ?? '',
            ))
        )
          task = undefined;
        if (!task) {
          task = await tx.agentTask.create({
            data: {
              id: randomUUID(),
              sessionId,
              ownerId: actor.id,
              goal: body.message.slice(0, 500),
              step: 'LOCATE_EVENT',
              eventId: body.eventId ?? null,
              checkpointThreadId: randomUUID(),
            },
          });
        }
        return { task, sessionCurrentEventId: session.currentEventId };
      },
    );
  }

  async message(token: string, sessionId: string, input: unknown) {
    const body = this.parseMessage(input);
    const prepared = await this.prepareInvocation(token, sessionId, body);
    const config = {
      configurable: { thread_id: prepared.task.checkpointThreadId },
    };
    const snapshot = await this.graph.getState(config);
    const saved = snapshot.values as Partial<WorkflowState>;
    const recoverable =
      saved.workflowVersion === 2 && saved.taskId === prepared.task.id;
    const initial: Partial<WorkflowState> = recoverable
      ? {
          taskId: prepared.task.id,
          sessionId,
          revision: prepared.task.revision,
        }
      : {
          workflowVersion: 2,
          taskId: prepared.task.id,
          sessionId,
          revision: prepared.task.revision,
          step: prepared.task.step,
          eventId: prepared.task.eventId ?? '',
          matchId: prepared.task.matchId ?? '',
          baselineRevision: prepared.task.baselineRevision ?? 0,
          parameters: parameters(prepared.task.parameters),
          pendingFields: strings(prepared.task.pendingFields),
          candidates: [],
          route: 'respond',
          status: 'ERROR',
          responseMessage: '',
        };
    const state = await this.runtime.run(
      {
        token,
        sessionId,
        message: body.message,
        eventId: body.eventId ?? prepared.sessionCurrentEventId ?? undefined,
        matchId: body.matchId,
      },
      () => this.graph.invoke(initial, config),
    );
    const task = await this.auth.run(
      token,
      'agent.task.read',
      prepared.task.id,
      {},
      async (tx, actor) => {
        const { task: current } = await this.validateSessionAccess(
          tx,
          actor,
          sessionId,
          prepared.task.id,
        );
        const confirmation = await tx.agentConfirmationTicket.findFirst({
          where: { taskId: current!.id },
          orderBy: { createdAt: 'desc' },
        });
        return {
          ...current!,
          confirmationTickets: confirmation ? [confirmation] : [],
        };
      },
    );
    return {
      sessionId,
      status: state.status,
      message: state.responseMessage,
      candidates: state.candidates,
      task: this.taskView(task),
    };
  }

  private authorizeNode(state: WorkflowState) {
    const context = this.context();
    return this.auth.run(
      context.token,
      'agent.workflow.authorize',
      state.taskId,
      {},
      async (tx, actor) => {
        await this.validateSessionAccess(
          tx,
          actor,
          context.sessionId,
          state.taskId,
        );
        return {};
      },
    );
  }

  private async parseIntentNode(state: WorkflowState) {
    const context = this.context();
    const patch = await this.model.parse(
      context.message,
      state.parameters ?? {},
    );
    const next = mergeAgentIntent(state.parameters ?? {}, patch);
    if (context.matchId) {
      next.sourceMatchId = context.matchId;
      delete next.targetStartAt;
    }
    return { parameters: next };
  }

  private async locateResourcesNode(state: WorkflowState) {
    const context = this.context();
    return this.auth.run(
      context.token,
      'agent.workflow.locate',
      state.taskId,
      {},
      async (tx, actor) => {
        const { task } = await this.validateSessionAccess(
          tx,
          actor,
          context.sessionId,
          state.taskId,
        );
        if (!task || task.revision !== state.revision)
          throw new ConflictException(
            'Agent task changed; retry with latest state',
          );
        const events = await tx.event.findMany({
          where: scheduleReadScope(actor),
          select: { id: true, name: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        });
        const requestedEventId =
          context.eventId || state.eventId || task.eventId;
        const event = requestedEventId
          ? events.find((candidate) => candidate.id === requestedEventId)
          : events.length === 1
            ? events[0]
            : undefined;
        if (requestedEventId && !event) deny();
        if (!event) {
          return this.saveLocatedState(tx, task, {
            state,
            step: 'LOCATE_EVENT',
            eventId: null,
            matchId: null,
            baselineRevision: null,
            pendingFields: ['eventId'],
            candidateEventIds: events.map((item) => item.id),
            candidateMatchIds: [],
            parameters: state.parameters,
            status: 'NEED_EVENT',
            message: events.length
              ? '请先选择要调整的赛事，我不会替你猜测。'
              : '当前账号没有可操作的赛事。',
            candidates: events.map((item) => ({
              id: item.id,
              label: item.name,
            })),
          });
        }
        await scheduleRead(tx, actor, event.id);
        const schedule = await tx.eventSchedule.findUnique({
          where: { eventId: event.id },
        });
        if (!schedule) {
          return this.saveLocatedState(tx, task, {
            state,
            step: 'FAILED',
            eventId: event.id,
            matchId: null,
            baselineRevision: null,
            pendingFields: [],
            candidateEventIds: [],
            candidateMatchIds: [],
            parameters: {},
            status: 'ERROR',
            message: '当前赛事还没有可读取的赛程，未生成任何预览。',
            candidates: [],
          });
        }
        const matches = schedule.matches as unknown as ScheduleMatchDto[];
        const next = { ...state.parameters };
        let selected = next.sourceMatchId
          ? matches.find((match) => match.id === next.sourceMatchId)
          : undefined;
        if (next.sourceMatchId && !selected) deny();
        let matchCandidates: ScheduleMatchDto[] = [];
        if (!selected && next.sourceWeekday && next.sourceOrdinal) {
          const byDate = new Map<string, ScheduleMatchDto[]>();
          for (const match of matches.filter((item) => item.startAt)) {
            const date = localParts(match.startAt).date;
            if (weekday(date) !== next.sourceWeekday) continue;
            byDate.set(date, [...(byDate.get(date) ?? []), match]);
          }
          matchCandidates = [...byDate.values()]
            .map(
              (items) =>
                items.sort(
                  (a, b) =>
                    Date.parse(a.startAt) - Date.parse(b.startAt) ||
                    a.order - b.order,
                )[next.sourceOrdinal! - 1],
            )
            .filter((item): item is ScheduleMatchDto => !!item);
          if (matchCandidates.length === 1) selected = matchCandidates[0];
        }
        if (!selected) {
          const choices = matchCandidates.length ? matchCandidates : matches;
          return this.saveLocatedState(tx, task, {
            state,
            step: 'LOCATE_MATCH',
            eventId: event.id,
            matchId: null,
            baselineRevision: schedule.revision,
            pendingFields: ['sourceMatchId'],
            candidateEventIds: [],
            candidateMatchIds: choices.map((match) => match.id),
            parameters: next,
            status: 'NEED_MATCH',
            message:
              matchCandidates.length > 1
                ? '找到多场符合描述的比赛，请明确选择；我不会擅自决定。'
                : '没有唯一定位到比赛，请选择具体场次。',
            candidates: choices.slice(0, 20).map((match) => ({
              id: match.id,
              label: matchLabel(match),
              detail: `${localParts(match.startAt).date} ${localParts(match.startAt).time} · ${match.venue}`,
            })),
          });
        }
        next.sourceMatchId = selected.id;
        if (next.targetWeekday !== undefined)
          next.targetDate = dateForWeekday(
            selected.startAt,
            next.targetWeekday,
          );
        const pendingFields: string[] = [];
        if (!next.targetDate) pendingFields.push('targetDate');
        if (next.targetHour === undefined) pendingFields.push('targetTime');
        if (pendingFields.length) {
          return this.saveLocatedState(tx, task, {
            state,
            step: 'WAITING_PARAMETERS',
            eventId: event.id,
            matchId: selected.id,
            baselineRevision: schedule.revision,
            pendingFields,
            candidateEventIds: [],
            candidateMatchIds: [],
            parameters: next,
            status: 'NEED_PARAMETERS',
            message: pendingFields.includes('targetTime')
              ? '已定位比赛，请补充目标开赛时间。'
              : '已定位比赛，请补充目标日期或星期。',
            candidates: [],
          });
        }
        next.targetMinute ??= 0;
        next.targetStartAt = instant(
          next.targetDate!,
          next.targetHour!,
          next.targetMinute,
        );
        next.venue ??= selected.venue;
        return this.saveLocatedState(tx, task, {
          state,
          step: 'WAITING_PARAMETERS',
          eventId: event.id,
          matchId: selected.id,
          baselineRevision: schedule.revision,
          pendingFields: [],
          candidateEventIds: [],
          candidateMatchIds: [],
          parameters: next,
          status: 'NEED_PARAMETERS',
          message: '',
          candidates: [],
          route: 'preview',
        });
      },
    );
  }

  private async saveLocatedState(
    tx: Tx,
    task: AgentTaskRow,
    input: {
      state: WorkflowState;
      step: TaskStep;
      eventId: string | null;
      matchId: string | null;
      baselineRevision: number | null;
      pendingFields: string[];
      candidateEventIds: string[];
      candidateMatchIds: string[];
      parameters: AgentTaskParameters;
      status: ReplyStatus;
      message: string;
      candidates: Candidate[];
      route?: 'preview' | 'respond';
    },
  ) {
    const changed = await tx.agentTask.updateMany({
      where: { id: task.id, revision: input.state.revision },
      data: {
        step: input.step,
        eventId: input.eventId,
        matchId: input.matchId,
        baselineRevision: input.baselineRevision,
        parameters: json(input.parameters),
        pendingFields: json(input.pendingFields),
        candidateEventIds: json(input.candidateEventIds),
        candidateMatchIds: json(input.candidateMatchIds),
        preview: input.step === 'PREVIEW_READY' ? undefined : json({}),
        previewExpiresAt: null,
        revision: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    if (changed.count !== 1)
      throw new ConflictException(
        'Agent task changed; retry with latest state',
      );
    return {
      workflowVersion: 2,
      revision: input.state.revision + 1,
      step: input.step,
      eventId: input.eventId ?? '',
      matchId: input.matchId ?? '',
      baselineRevision: input.baselineRevision ?? 0,
      parameters: input.parameters,
      pendingFields: input.pendingFields,
      candidates: input.candidates,
      route: input.route ?? 'respond',
      status: input.status,
      responseMessage: input.message,
    };
  }

  private async previewNode(state: WorkflowState) {
    const context = this.context();
    const preview = await this.scheduling.previewAdjustment(
      context.token,
      state.eventId,
      {
        expectedRevision: state.baselineRevision,
        matchId: state.matchId,
        startAt: state.parameters.targetStartAt,
        venue: state.parameters.venue,
      },
    );
    const result = await this.auth.run(
      context.token,
      'agent.workflow.preview',
      state.taskId,
      {},
      async (tx, actor) => {
        const { task } = await this.validateSessionAccess(
          tx,
          actor,
          context.sessionId,
          state.taskId,
        );
        if (!task || task.revision !== state.revision)
          throw new ConflictException(
            'Agent task changed; retry with latest state',
          );
        const event = await tx.event.findUnique({
          where: { id: preview.eventId },
          select: { name: true },
        });
        if (!event) deny();
        const consumedAt = new Date();
        await tx.agentConfirmationTicket.updateMany({
          where: { taskId: task.id, state: 'PENDING' },
          data: { state: 'CANCELLED', consumedAt },
        });
        const summary: ConfirmationSummary = {
          homeLabel: preview.before.homeLabel,
          awayLabel: preview.before.awayLabel,
          beforeStartAt: preview.before.startAt,
          beforeVenue: preview.before.venue,
          afterStartAt: preview.after.startAt,
          afterVenue: preview.after.venue,
        };
        const parameterHash = confirmationHash({
          ownerId: actor.id,
          eventId: preview.eventId,
          matchId: preview.after.id,
          startAt: preview.after.startAt,
          venue: preview.after.venue,
          expectedRevision: preview.baselineRevision,
          summary,
        });
        await tx.agentConfirmationTicket.create({
          data: {
            id: randomUUID(),
            taskId: task.id,
            ownerId: actor.id,
            actorDisplayName: actor.displayName,
            eventId: preview.eventId,
            eventName: event.name,
            matchId: preview.after.id,
            startAt: new Date(preview.after.startAt),
            venue: preview.after.venue,
            expectedRevision: preview.baselineRevision,
            parameterSummary: json(summary),
            parameterHash,
            toolName: confirmationTool.name,
            toolVersion: confirmationTool.version,
            commandId: randomUUID(),
            state: 'PENDING',
            expiresAt: new Date(preview.expiresAt),
          },
        });
        const changed = await tx.agentTask.updateMany({
          where: { id: task.id, revision: state.revision },
          data: {
            step: 'PREVIEW_READY',
            preview: json(preview),
            previewExpiresAt: new Date(preview.expiresAt),
            pendingFields: json([]),
            revision: { increment: 1 },
            updatedAt: new Date(),
          },
        });
        if (changed.count !== 1)
          throw new ConflictException(
            'Agent task changed; retry with latest state',
          );
        return state.revision + 1;
      },
    );
    return {
      revision: result,
      step: 'PREVIEW_READY',
      pendingFields: [],
      status: 'PREVIEW' as const,
      responseMessage: preview.issues.length
        ? `预览已生成，确定性校验发现 ${preview.issues.length} 项冲突。此操作尚未保存。`
        : '预览已生成，确定性校验未发现冲突。此操作尚未保存。',
      candidates: [],
    };
  }

  private resultNode(state: WorkflowState) {
    const context = this.context();
    return this.auth.run(
      context.token,
      'agent.workflow.result',
      state.taskId,
      {},
      async (tx, actor) => {
        await this.validateSessionAccess(
          tx,
          actor,
          context.sessionId,
          state.taskId,
        );
        await tx.agentTurn.createMany({
          data: [
            {
              id: randomUUID(),
              sessionId: context.sessionId,
              role: 'USER',
              content: context.message,
              structured: json({ taskId: state.taskId }),
            },
            {
              id: randomUUID(),
              sessionId: context.sessionId,
              role: 'ASSISTANT',
              content: state.responseMessage,
              structured: json({
                taskId: state.taskId,
                eventId: state.eventId || null,
                matchId: state.matchId || null,
                pendingFields: state.pendingFields,
              }),
            },
          ],
        });
        await tx.agentSession.update({
          where: { id: context.sessionId },
          data: {
            currentEventId: state.eventId || null,
            currentMatchId: state.matchId || null,
            summary: context.message.slice(0, 2000),
            updatedAt: new Date(),
          },
        });
        return {};
      },
    );
  }
}
