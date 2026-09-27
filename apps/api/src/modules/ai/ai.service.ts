import { requestScope } from '../governance/request-context.js';
import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { studioInput, studioState } from '../../studio/state.js';
import type { z } from 'zod';
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
  eventOperationsScope,
  isHeadquartersSuperAdmin,
  scheduleDraftAdjust,
  scheduleRead,
  scheduleReadScope,
  type Actor,
} from '../authorization/policy.js';
import { SchedulingService } from '../scheduling/scheduling.service.js';
import { PlanningService } from './planning.service.js';
import { personalMemoryContent } from './memory-policy.js';
import { AgentSkillService, type RuntimeSkills } from './skill.service.js';
import { requireAgentTool } from './tool-registry.js';
import type { CandidateService } from './candidate.service.js';
import { planningProposalSchema, type PlanningProposal } from './planning.js';
import type { ScheduleMatchDto } from '../scheduling/scheduling.dto.js';
import {
  beijingDay,
  beijingTime,
  explicitOrdinal,
  explicitRelative,
  queryPlanSchema,
  resolveDateRange,
  resolveTeam,
  scheduleTools,
  type QueryPlan,
  type QueryToolResult,
} from './schedule-tools.js';
import type {
  AgentIntentPatch,
  AgentModelAdapter,
  AgentTaskParameters,
  ConversationContext,
  ConversationRoute,
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
  | 'ERROR'
  | 'CHAT'
  | 'CLARIFY'
  | 'UNSUPPORTED'
  | 'QUERY'
  | 'PLAN'
  | 'NEED_TEAM';
type Candidate = { id: string; label: string; detail?: string };
type MessageBody = {
  message: string;
  eventId?: string;
  matchId?: string;
  teamId?: string;
  planningId?: string;
  planningRevision?: number;
  taskId?: string;
  newTask: boolean;
};
type RuntimeContext = {
  token: string;
  sessionId: string;
  message: string;
  eventId?: string;
  matchId?: string;
  taskId?: string;
  skills?: RuntimeSkills;
};
const json = (value: unknown) => value as Prisma.InputJsonValue;
type QuerySource = {
  eventId: string;
  matchId?: string;
  matchIds?: string[];
  revision: number;
  status: 'DRAFT' | 'PUBLISHED';
};
type QueryResponse = {
  status: 'QUERY' | 'NEED_EVENT' | 'NEED_MATCH' | 'CLARIFY';
  message: string;
  candidates: Candidate[];
  source?: QuerySource;
};
const maxTurnCharacters = 4000;
const modelContextExcerpt = (content: string) => {
  const characters = Array.from(content);
  return characters.length <= 600
    ? content
    : `${characters.slice(0, 400).join('')}…（仅模型上下文节选）${characters.slice(-180).join('')}`;
};
const summaryExcerpt = (content: string) => {
  const characters = Array.from(content);
  return characters.length <= 240
    ? content
    : `${characters.slice(0, 150).join('')}…（摘要输入节选）${characters.slice(-70).join('')}`;
};
const personalMemoryProposal = (message: string) => {
  const value = /^(?:请|帮我)?记住[：:，\s]*(.{2,300})[。！!]?$/s
    .exec(message.trim())?.[1]
    ?.trim();
  if (!value) return null;
  // Business requirements belong to the versioned planning request, not a
  // cross-session personal preference. Ambiguous requests stay in chat.
  return personalMemoryContent(value) ? value : null;
};
const completeAnswer = (answer: string) => {
  if (Array.from(answer).length > maxTurnCharacters)
    throw new BadGatewayException(
      '模型回答超过 4000 字上限，未保存；请缩小问题范围后重试',
    );
  return answer;
};
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

const DialogState = Annotation.Root({
  message: Annotation<string>(),
  context: Annotation<ConversationContext>(),
  kind: Annotation<ConversationRoute>(),
  answer: Annotation<string>(),
});

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
  private readonly dialogGraph;
  private readonly runtime = new AsyncLocalStorage<RuntimeContext>();

  constructor(
    private readonly auth: AuthorizationService,
    private readonly model: AgentModelAdapter,
    private readonly scheduling: SchedulingService,
    databaseUrl?: string,
    private readonly planning = new PlanningService(),
    private readonly candidates?: CandidateService,
    private readonly skills?: AgentSkillService,
  ) {
    this.checkpoint = databaseUrl
      ? createAgentCheckpointer(databaseUrl)
      : undefined;
    const saver = this.checkpoint?.saver ?? new MemorySaver();
    // Stateless conversation graph: the authorized AgentTurn rows, not a model
    // checkpoint, are the source of truth. No AgentTask is allocated for chat.
    this.dialogGraph = new StateGraph(DialogState)
      .addNode('route', async (state) => ({
        kind: await this.model.route(state.message, state.context),
      }))
      .addNode('respond_chat', async (state) => {
        const runtime = this.context();
        const checked = await this.checkedDialogueContext(
          runtime.token,
          runtime.sessionId,
          {
            message: runtime.message,
            eventId: runtime.eventId,
            matchId: runtime.matchId,
            taskId: runtime.taskId,
            newTask: false,
          },
        );
        return {
          answer: await this.model.chat(
            state.message,
            { ...checked.context, skills: runtime.skills },
            state.kind as 'CHAT' | 'CLARIFY' | 'UNSUPPORTED',
          ),
        };
      })
      .addEdge(START, 'route')
      .addConditionalEdges(
        'route',
        (state) =>
          state.kind === 'START' ||
          state.kind === 'CONTINUE' ||
          state.kind === 'QUERY' ||
          state.kind === 'PLAN'
            ? 'other'
            : 'chat',
        { other: END, chat: 'respond_chat' },
      )
      .addEdge('respond_chat', END)
      .compile();
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

  private async visibleConfirmation(
    tx: Tx,
    actor: Actor,
    ticket: AgentTicketRow | null | undefined,
  ) {
    if (!ticket || ticket.state !== 'PENDING') return ticket ?? null;
    const allowed = await tx.event.findFirst({
      where: { AND: [{ id: ticket.eventId }, eventOperationsScope(actor)] },
      select: { id: true },
    });
    return allowed ? ticket : null;
  }

  private async validateSessionAccess(
    tx: Tx,
    actor: Actor,
    sessionId: string,
    taskId?: string,
  ) {
    const session = await tx.agentSession.findFirst({
      where: { id: sessionId, ownerId: actor.id },
      include: {
        tasks: { orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] },
        planningRequests: { orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] },
      },
    });
    if (!session) deny();
    // Scan *all* query turns, not just the 20 visible ones: a session with
    // historical read-only data is still protected after its grant is revoked.
    const queryTurns = await tx.agentTurn.findMany({
      where: {
        sessionId,
        role: 'ASSISTANT',
        structured: { path: ['kind'], equals: 'QUERY' },
      },
      orderBy: { sequence: 'asc' },
      select: { structured: true },
    });
    const querySources: QuerySource[] = queryTurns.map((turn) => {
      const stored = turn.structured as { source?: Partial<QuerySource> };
      const source = stored?.source;
      if (
        !source ||
        typeof source.eventId !== 'string' ||
        typeof source.revision !== 'number' ||
        !['DRAFT', 'PUBLISHED'].includes(source.status ?? '') ||
        (source.matchId !== undefined && typeof source.matchId !== 'string') ||
        (source.matchIds !== undefined &&
          (!Array.isArray(source.matchIds) ||
            source.matchIds.some((id) => typeof id !== 'string')))
      )
        deny();
      return source as QuerySource;
    });
    const eventIds = new Set(
      [
        session.currentEventId,
        ...session.tasks.map((task) => task.eventId),
        ...querySources.map((source) => source.eventId),
      ].filter((id): id is string => !!id),
    );
    for (const eventId of eventIds) await scheduleRead(tx, actor, eventId);
    // Unlike read-only schedule history, planning conditions are editable
    // business data. Every historical planning event needs operation access,
    // even when there is no active single-match task or recent planning turn.
    for (const request of session.planningRequests) {
      if (request.ownerId !== actor.id || request.type !== 'SCHEDULE_PLANNING')
        deny();
      await this.planning.view(tx, actor, request);
    }
    const task = taskId
      ? session.tasks.find((candidate) => candidate.id === taskId)
      : session.tasks[0];
    if (taskId && !task) deny();
    const recentQuery = querySources.at(-1);
    return {
      session,
      task,
      planning: session.planningRequests[0],
      lastQuery: recentQuery
        ? {
            eventId: recentQuery.eventId,
            ...(recentQuery.matchId ? { matchId: recentQuery.matchId } : {}),
          }
        : undefined,
    };
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
    requireAgentTool('schedule.draft.adjust', 'DRAFT_WRITE');
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
    const { session, planning } = await this.validateSessionAccess(
      tx,
      actor,
      id,
    );
    const loaded = await tx.agentSession.findUniqueOrThrow({
      where: { id },
      include: {
        pendingQuestion: true,
        turns: { orderBy: { sequence: 'desc' }, take: 20 },
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
    const visibleTicket = task
      ? await this.visibleConfirmation(tx, actor, task.confirmationTickets?.[0])
      : null;
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
      task: task
        ? this.taskView({
            ...task,
            confirmationTickets: visibleTicket ? [visibleTicket] : [],
          })
        : null,
      planningRequest: planning
        ? await this.planning.view(tx, actor, planning)
        : null,
      pendingQuestion:
        loaded.pendingQuestion &&
        loaded.pendingQuestion.expiresAt > new Date() &&
        planning?.id === loaded.pendingQuestion.planningId &&
        planning.revision === loaded.pendingQuestion.planningRevision
          ? {
              kind: loaded.pendingQuestion.kind,
              question: loaded.pendingQuestion.question,
              planningId: loaded.pendingQuestion.planningId,
              planningRevision: loaded.pendingQuestion.planningRevision,
              expiresAt: loaded.pendingQuestion.expiresAt.toISOString(),
            }
          : null,
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
      'teamId',
      'planningId',
      'planningRevision',
      'taskId',
      'newTask',
    ]);
    if (body.newTask !== undefined && typeof body.newTask !== 'boolean')
      throw new ConflictException('Invalid new task flag');
    if (body.newTask && body.taskId)
      throw new ConflictException('New task cannot continue an existing task');
    if (
      body.planningRevision !== undefined &&
      (!Number.isSafeInteger(body.planningRevision) ||
        Number(body.planningRevision) < 1)
    )
      throw new ConflictException('Invalid planning revision');
    return {
      message: text(body.message, 2000),
      ...(body.eventId ? { eventId: uuid(body.eventId) } : {}),
      ...(body.matchId ? { matchId: uuid(body.matchId) } : {}),
      ...(body.teamId ? { teamId: uuid(body.teamId) } : {}),
      ...(body.planningId ? { planningId: uuid(body.planningId) } : {}),
      ...(body.planningRevision !== undefined
        ? { planningRevision: Number(body.planningRevision) }
        : {}),
      ...(body.taskId ? { taskId: uuid(body.taskId) } : {}),
      newTask: body.newTask === true,
    };
  }

  private async prepareInvocation(
    token: string,
    sessionId: string,
    body: MessageBody,
    expectedTask?: { id: string; revision: number },
  ) {
    requireAgentTool('schedule.adjust.preview', 'PREVIEW');
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
          !body.newTask &&
          !switchedEvent &&
          expectedTask &&
          (task?.id !== expectedTask.id ||
            task.revision !== expectedTask.revision)
        )
          throw new ConflictException(
            'Task changed while interpreting the message; refresh and retry',
          );
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

  private async checkedDialogueContext(
    token: string,
    sessionId: string,
    body: MessageBody,
  ) {
    return this.auth.run(
      token,
      'agent.dialogue.context',
      sessionId,
      {},
      async (tx, actor) => {
        const { session, task, planning, lastQuery } =
          await this.validateSessionAccess(tx, actor, sessionId, body.taskId);
        if (
          body.planningId &&
          !session.planningRequests.some(
            (request) => request.id === body.planningId,
          )
        )
          deny();
        if (body.eventId) await scheduleRead(tx, actor, body.eventId);
        const turns = await tx.agentTurn.findMany({
          where: {
            sessionId,
            sequence: { gt: session.summarizedThroughSequence },
          },
          orderBy: { sequence: 'desc' },
          take: 30,
          select: { role: true, content: true },
        });
        const memories = await tx.agentMemory.findMany({
          where: { ownerId: actor.id, status: 'ACTIVE' },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: 30,
          select: { content: true },
        });
        const pending = await tx.agentPendingQuestion.findUnique({
          where: { sessionId },
        });
        if (
          pending &&
          ((body.eventId && body.eventId !== pending.eventId) || body.newTask)
        )
          await tx.agentPendingQuestion.delete({ where: { sessionId } });
        const pendingQuestion =
          pending &&
          !body.newTask &&
          (!body.eventId || body.eventId === pending.eventId) &&
          pending.expiresAt > new Date() &&
          planning?.id === pending.planningId &&
          planning.revision === pending.planningRevision
            ? pending
            : null;
        const skills = await this.skills?.activeInTransaction(tx);
        return {
          task,
          pendingQuestion,
          context: {
            skills,
            ...(session.contextSummary
              ? { summary: session.contextSummary }
              : {}),
            personalMemories: memories.map((memory) => memory.content),
            history: turns.reverse().map((turn) => ({
              role: turn.role as 'USER' | 'ASSISTANT',
              content: modelContextExcerpt(turn.content),
            })),
            ...(lastQuery ? { lastQuery } : {}),
            ...(planning
              ? {
                  planning: {
                    id: planning.id,
                    eventId: planning.eventId,
                    revision: planning.revision,
                    status: planning.status,
                    conditions: (
                      planning.conditions as unknown as unknown[]
                    ).slice(0, 12),
                    pending: planning.pending as unknown as string[],
                  },
                }
              : {}),
            ...(task
              ? {
                  task: {
                    step: task.step,
                    eventId: task.eventId ?? undefined,
                    matchId: task.matchId ?? undefined,
                    goal: task.goal,
                    pendingFields: strings(task.pendingFields),
                    preview:
                      task.step === 'PREVIEW_READY' ? task.preview : null,
                  },
                }
              : {}),
          } satisfies ConversationContext,
        };
      },
    );
  }

  // Compact only conversation context. Task/planning state and current business
  // facts remain in their own authoritative tables. A failed model call leaves
  // the original turns intact and never blocks the user's next message.
  private async refreshConversationSummary(token: string, sessionId: string) {
    const source = await this.auth.run(
      token,
      'agent.memory.context.read',
      sessionId,
      {},
      async (tx, actor) => {
        const { session } = await this.validateSessionAccess(
          tx,
          actor,
          sessionId,
        );
        const turns = await tx.agentTurn.findMany({
          where: {
            sessionId,
            sequence: { gt: session.summarizedThroughSequence },
          },
          orderBy: { sequence: 'asc' },
          take: 100,
          select: { sequence: true, role: true, content: true },
        });
        if (turns.length <= 30) return null;
        const segment = turns.slice(0, -20);
        return {
          previous: session.contextSummary,
          previousThrough: session.summarizedThroughSequence,
          through: segment.at(-1)!.sequence,
          turns: segment.map((turn) => ({
            role: turn.role as 'USER' | 'ASSISTANT',
            content: summaryExcerpt(turn.content),
          })),
        };
      },
    );
    if (!source) return;
    let summary: string;
    try {
      summary = await this.model.summarize(source.previous, source.turns);
    } catch {
      return;
    }
    if (!summary.trim() || [...summary].length > 2000) return;
    await this.auth.run(
      token,
      'agent.memory.context.update',
      sessionId,
      {},
      async (tx, actor) => {
        await this.validateSessionAccess(tx, actor, sessionId);
        await tx.agentSession.updateMany({
          where: {
            id: sessionId,
            ownerId: actor.id,
            summarizedThroughSequence: source.previousThrough,
          },
          data: {
            contextSummary: summary,
            summarizedThroughSequence: source.through,
          },
        });
        return {};
      },
    );
  }

  // A session row atomically allocates two consecutive ordinals. Concurrent
  // writers serialize on that row; Serializable conflicts retry the whole
  // authorization/append transaction, never an individual turn.
  private async appendTurns(
    tx: Tx,
    sessionId: string,
    userContent: string,
    assistantContent: string,
    userStructured: Prisma.InputJsonValue,
    assistantStructured: Prisma.InputJsonValue,
    sourceTurnId?: string,
  ) {
    completeAnswer(assistantContent);
    const { nextTurnSequence } = await tx.agentSession.update({
      where: { id: sessionId },
      data: { nextTurnSequence: { increment: 2 }, updatedAt: new Date() },
      select: { nextTurnSequence: true },
    });
    await tx.agentTurn.createMany({
      data: [
        {
          id: sourceTurnId ?? randomUUID(),
          sessionId,
          sequence: nextTurnSequence - 2,
          role: 'USER',
          content: userContent,
          structured: userStructured,
        },
        {
          id: randomUUID(),
          sessionId,
          sequence: nextTurnSequence - 1,
          role: 'ASSISTANT',
          content: assistantContent,
          structured: assistantStructured,
        },
      ],
    });
  }

  private async saveDialogue(
    token: string,
    sessionId: string,
    body: MessageBody,
    kind: 'CHAT' | 'CLARIFY' | 'UNSUPPORTED',
    answer: string,
  ) {
    completeAnswer(answer);
    return this.auth.run(
      token,
      'agent.dialogue.result',
      sessionId,
      {},
      async (tx, actor) => {
        const { task } = await this.validateSessionAccess(
          tx,
          actor,
          sessionId,
          body.taskId,
        );
        if (body.eventId) await scheduleRead(tx, actor, body.eventId);
        await this.appendTurns(
          tx,
          sessionId,
          body.message,
          answer,
          json({ kind }),
          json({ kind }),
        );
        const ticket = task
          ? await tx.agentConfirmationTicket.findFirst({
              where: { taskId: task.id },
              orderBy: { createdAt: 'desc' },
            })
          : null;
        const visibleTicket = await this.visibleConfirmation(tx, actor, ticket);
        return {
          sessionId,
          status: kind,
          message: answer,
          candidates: [],
          planningRequest: await this.planning.latest(tx, actor, sessionId),
          task: task
            ? this.taskView({
                ...task,
                confirmationTickets: visibleTicket ? [visibleTicket] : [],
              })
            : null,
        };
      },
      { retries: 24 },
    );
  }

  private async planScheduleQuery(
    token: string,
    sessionId: string,
    body: MessageBody,
    skills?: RuntimeSkills,
  ): Promise<QueryPlan> {
    const { context } = await this.checkedDialogueContext(
      token,
      sessionId,
      body,
    );
    const plan = await this.model.planQuery(body.message, {
      ...context,
      skills,
    });
    const parsed = queryPlanSchema.safeParse(plan);
    if (!parsed.success)
      throw new BadGatewayException('Invalid read-only query proposal');
    return parsed.data;
  }

  // Tool execution is always in a fresh actor transaction. The model only
  // proposes structured input; registry schemas, scope and business read use
  // the current server identity and the scheduling use case.
  private async executeScheduleQuery(
    token: string,
    sessionId: string,
    body: MessageBody,
    plan: QueryPlan,
  ): Promise<QueryResponse> {
    let range: ReturnType<typeof resolveDateRange>;
    try {
      const explicitDates = [
        ...body.message.matchAll(/(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})日?/g),
      ].map(
        (match) =>
          `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}`,
      );
      const today = beijingDay(new Date().toISOString());
      const relativeDay = /今天|今日|明天|昨天|昨日/.test(body.message)
        ? new Date(
            Date.parse(`${today}T00:00:00Z`) +
              (/明天/.test(body.message)
                ? 1
                : /昨天|昨日/.test(body.message)
                  ? -1
                  : 0) *
                86400000,
          )
            .toISOString()
            .slice(0, 10)
        : undefined;
      if (
        !explicitDates.length &&
        !relativeDay &&
        /\d{1,2}月\d{1,2}日/.test(body.message)
      )
        throw new Error('Year required');
      range = resolveDateRange({
        ...plan,
        relative:
          explicitDates.length || relativeDay
            ? undefined
            : explicitRelative(body.message),
        dateFrom: explicitDates[0] ?? relativeDay,
        dateTo: explicitDates[1] ?? explicitDates[0] ?? relativeDay,
      });
    } catch {
      return {
        status: 'CLARIFY',
        message: '请提供有效的北京时间日期，单次日期范围不超过 31 天。',
        candidates: [],
      };
    }
    return this.auth.run(
      token,
      'agent.query.read',
      sessionId,
      {},
      async (tx, actor) => {
        const { session, task, lastQuery } = await this.validateSessionAccess(
          tx,
          actor,
          sessionId,
          body.taskId,
        );
        const events = await tx.event.findMany({
          where: scheduleReadScope(actor),
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
        // Resolve names against the authorized catalog, not arbitrary model
        // strings (models sometimes put '刚才那场' or a date in eventName).
        const mentioned = events.filter((event) =>
          body.message.includes(event.name),
        );
        const proposed = plan.eventName?.trim();
        const explicitName = mentioned.length
          ? undefined
          : proposed &&
              body.message.includes(proposed) &&
              !/(?:刚才|上次|那场|这场|本赛事|当前赛事|第.{1,5}场|\d{4}-\d{2}-\d{2})/.test(
                proposed,
              ) &&
              !/^(?:比赛|赛程|赛事|场地|详情)$/.test(proposed)
            ? proposed
            : undefined;
        const named = mentioned.length
          ? mentioned
          : explicitName
            ? events.filter((event) => event.name.includes(explicitName))
            : [];
        if (explicitName && named.length === 0)
          return {
            status: 'CLARIFY',
            message: '在当前可读取的赛事中未找到该名称；请核对赛事名称。',
            candidates: [],
          };
        const eventId =
          mentioned.length || explicitName
            ? named.length === 1
              ? named[0]!.id
              : undefined
            : (task?.eventId ??
              lastQuery?.eventId ??
              body.eventId ??
              session.currentEventId ??
              undefined);
        if (!eventId) {
          const choices = mentioned.length || explicitName ? named : events;
          return {
            status: 'NEED_EVENT',
            message: `请明确选择要查询的赛事；页面浏览位置不会自动切换正在进行的任务。${choices.length > 20 ? `当前有 ${choices.length} 个候选，仅显示前 20 个；也可输入准确赛事名称。` : ''}`,
            candidates: choices.slice(0, 20).map((event) => ({
              id: event.id,
              label: event.name,
            })),
          };
        }
        // Explicitly selected event IDs must still pass the scheduling policy.
        const event = await tx.event.findUnique({
          where: { id: eventId },
          select: { name: true },
        });
        await scheduleRead(tx, actor, eventId);
        if (!event) deny();
        const view = await this.scheduling.readInTransaction(
          tx,
          actor,
          eventId,
        );
        const referencesMatch = /(?:刚才那场|那场|这场)/.test(body.message);
        const ordinal = explicitOrdinal(body.message);
        const toolName =
          body.matchId || referencesMatch || ordinal
            ? 'schedule.match'
            : plan.tool;
        const registered = requireAgentTool(toolName, 'READ');
        const tool = scheduleTools[toolName];
        if (
          tool.mutates ||
          tool.permission !== registered.permission ||
          !tool.schema.safeParse(plan).success
        )
          throw new BadGatewayException('Invalid read-only tool arguments');
        const mentionedTeams = [
          ...new Set(
            view.matches.flatMap((match) => [match.homeLabel, match.awayLabel]),
          ),
        ]
          .filter((label) => !!label && body.message.includes(label))
          .sort((a, b) => b.length - a.length);
        const proposedTeam = plan.teamName
          ?.trim()
          .replace(/^(?:查询|查|看看|找)/, '');
        const teamName =
          mentionedTeams[0] ??
          (proposedTeam &&
          body.message.includes(proposedTeam) &&
          /(?:队|team)/i.test(body.message)
            ? proposedTeam
            : undefined);
        const teamId =
          plan.teamId && body.message.includes(plan.teamId)
            ? plan.teamId
            : undefined;
        const team = resolveTeam(view, teamName, teamId);
        const source: QuerySource = {
          eventId,
          revision: view.revision,
          status: view.status,
        };
        const prefix = `赛事：${event.name}；赛程：${view.exists ? (view.status === 'DRAFT' ? '草稿' : '已发布') : '尚未生成'} V${view.revision}；北京日期：${range ? (range.from === range.to ? range.from : `${range.from} 至 ${range.to}`) : '未指定（当前整个赛程）'}。`;
        if ((teamId || teamName) && !team.teamId) {
          return {
            status: 'CLARIFY',
            message: `${prefix}${team.choices.length > 1 ? `找到 ${team.choices.length} 支同名/近似球队：${team.choices.slice(0, 8).join('、')}${team.choices.length > 8 ? '等，请缩小查询范围' : ''}。请提供准确球队标识。` : '当前赛程中未找到这支球队的场次；请核对球队名称。不能据此断言球队有空。'}`,
            candidates: [],
            source,
          };
        }
        const reference =
          body.matchId ??
          (plan.matchId && body.message.includes(plan.matchId)
            ? plan.matchId
            : undefined) ??
          (referencesMatch ? lastQuery?.matchId : undefined);
        if (referencesMatch && !reference && !ordinal)
          return {
            status: 'CLARIFY',
            message: `${prefix}没有可确认的上一场比赛，请先查询并明确选择具体场次。`,
            candidates: [],
            source,
          };
        const result: QueryToolResult = tool.execute(view, {
          range,
          teamId: team.teamId,
          matchId: reference,
          ordinal,
        });
        source.matchIds = result.matches
          .slice(0, result.type === 'match' ? 10 : 5)
          .map((match) => match.id);
        if (result.total === 0)
          return {
            status: 'QUERY',
            message: `${prefix}${view.exists ? '没有查到符合条件的已安排比赛；不能据此断言球队有空。' : '尚无赛程，不能据此断言球队有空。'}`,
            candidates: [],
            source,
          };
        if (result.type === 'match' && result.total !== 1)
          return {
            status: 'NEED_MATCH',
            message: `${prefix}找到 ${result.total} 场候选比赛，请明确选择一场${result.total > 10 ? '；仅显示前 10 场，请缩小查询范围' : ''}。`,
            candidates: result.matches.slice(0, 10).map((match) => ({
              id: match.id,
              label: `${match.homeLabel} vs ${match.awayLabel}`,
              detail: `${match.startAt ? beijingTime(match.startAt) : '待安排'} · ${match.venue}`,
            })),
            source,
          };
        const rows = result.matches.map(
          (match) =>
            `${match.homeLabel} vs ${match.awayLabel}；${match.startAt ? `${beijingTime(match.startAt)}（北京时间）` : '尚未安排时间'}；场地：${match.venue || '待安排'}；比赛 ID：${match.id}`,
        );
        const selected =
          result.type === 'match'
            ? result.matches[0]
            : result.total === 1
              ? result.matches[0]
              : undefined;
        if (selected) source.matchId = selected.id;
        return {
          status: 'QUERY',
          message: `${prefix}${result.type === 'list' ? `共 ${result.total} 场，以下显示 ${result.matches.length} 场${result.total > result.matches.length ? '；请缩小查询范围查看其余场次' : ''}：` : '比赛详情：'}\n${rows.join('\n')}`,
          candidates: [],
          source,
        };
      },
    );
  }

  private async saveScheduleQuery(
    token: string,
    sessionId: string,
    body: MessageBody,
    response: QueryResponse,
  ) {
    if (!response.source) {
      const saved = await this.saveDialogue(
        token,
        sessionId,
        body,
        'CLARIFY',
        response.message,
      );
      const candidates = response.candidates.length
        ? await this.auth.run(
            token,
            'agent.query.choices',
            sessionId,
            {},
            async (tx, actor) => {
              await this.validateSessionAccess(
                tx,
                actor,
                sessionId,
                body.taskId,
              );
              const readable = new Set(
                (
                  await tx.event.findMany({
                    where: scheduleReadScope(actor),
                    select: { id: true },
                  })
                ).map((event) => event.id),
              );
              return response.candidates.filter((candidate) =>
                readable.has(candidate.id),
              );
            },
          )
        : [];
      return { ...saved, status: response.status, candidates };
    }
    completeAnswer(response.message);
    return this.auth.run(
      token,
      'agent.query.result',
      sessionId,
      {},
      async (tx, actor) => {
        const { task } = await this.validateSessionAccess(
          tx,
          actor,
          sessionId,
          body.taskId,
        );
        const source = response.source!;
        await scheduleRead(tx, actor, source.eventId);
        const current = await tx.eventSchedule.findUnique({
          where: { eventId: source.eventId },
          select: { revision: true, status: true },
        });
        if (
          (current?.revision ?? 0) !== source.revision ||
          (current && current.status !== source.status)
        )
          throw new ConflictException('Schedule changed; query again');
        await this.appendTurns(
          tx,
          sessionId,
          body.message,
          response.message,
          json({ kind: 'QUERY' }),
          json({
            kind: 'QUERY',
            source,
            tool:
              response.status === 'QUERY'
                ? 'schedule.read'
                : 'schedule.clarify',
          }),
        );
        const ticket = task
          ? await tx.agentConfirmationTicket.findFirst({
              where: { taskId: task.id },
              orderBy: { createdAt: 'desc' },
            })
          : null;
        const visibleTicket = await this.visibleConfirmation(tx, actor, ticket);
        return {
          sessionId,
          status: response.status,
          message: response.message,
          candidates: response.candidates,
          planningRequest: await this.planning.latest(tx, actor, sessionId),
          task: task
            ? this.taskView({
                ...task,
                confirmationTickets: visibleTicket ? [visibleTicket] : [],
              })
            : null,
        };
      },
      { retries: 5 },
    );
  }

  private async planRequirements(
    token: string,
    sessionId: string,
    body: MessageBody,
    skills?: RuntimeSkills,
  ): Promise<PlanningProposal> {
    const { context } = await this.checkedDialogueContext(
      token,
      sessionId,
      body,
    );
    const result = await this.model.planPlanning(body.message, {
      ...context,
      skills,
    });
    const parsed = planningProposalSchema.safeParse(result);
    if (!parsed.success)
      throw new BadGatewayException('Invalid planning proposal');
    return parsed.data;
  }

  private async saveRequirements(
    token: string,
    sessionId: string,
    body: MessageBody,
    proposal: PlanningProposal,
    resolved?: {
      message: string;
      planningId: string;
      planningRevision: number;
    },
  ) {
    requireAgentTool('schedule.requirements.collect', 'REQUIREMENTS');
    return this.auth.run(
      token,
      'agent.planning.collect',
      sessionId,
      {},
      async (tx, actor) => {
        const { task } = await this.validateSessionAccess(
          tx,
          actor,
          sessionId,
          body.taskId,
        );
        if (resolved) {
          const pending = await tx.agentPendingQuestion.findUnique({
            where: { sessionId },
          });
          if (
            !pending ||
            pending.kind !== 'ROUND_ROBIN' ||
            pending.planningId !== resolved.planningId ||
            pending.planningRevision !== resolved.planningRevision ||
            pending.expiresAt <= new Date()
          )
            throw new ConflictException(
              'Clarification changed; refresh and retry',
            );
        }
        const sourceTurnId = randomUUID();
        const result = await this.planning.apply(
          tx,
          actor,
          {
            sessionId,
            message: resolved?.message ?? body.message,
            eventId: body.eventId,
            planningId: resolved?.planningId ?? body.planningId,
            planningRevision:
              resolved?.planningRevision ?? body.planningRevision,
            teamId: body.teamId,
          },
          proposal,
          sourceTurnId,
        );
        const pendingQuestion = await this.syncPlanningQuestion(
          tx,
          sessionId,
          result.planning,
        );
        await this.appendTurns(
          tx,
          sessionId,
          body.message,
          result.message,
          json({
            kind: 'PLAN',
            eventId: result.planning?.eventId ?? null,
            ...(resolved ? { answeredQuestion: 'ROUND_ROBIN' } : {}),
          }),
          json({
            kind: 'PLAN',
            eventId: result.planning?.eventId ?? null,
            planningId: result.planning?.id ?? null,
            revision: result.planning?.revision ?? null,
          }),
          sourceTurnId,
        );
        const ticket = task
          ? await tx.agentConfirmationTicket.findFirst({
              where: { taskId: task.id },
              orderBy: { createdAt: 'desc' },
            })
          : null;
        const visibleTicket = await this.visibleConfirmation(tx, actor, ticket);
        return {
          sessionId,
          status: result.status,
          message: result.message,
          candidates: result.candidates,
          task: task
            ? this.taskView({
                ...task,
                confirmationTickets: visibleTicket ? [visibleTicket] : [],
              })
            : null,
          planningRequest:
            result.planning ??
            (await this.planning.latest(tx, actor, sessionId)),
          pendingQuestion,
        };
      },
      { retries: 5 },
    );
  }

  private async syncPlanningQuestion(
    tx: Tx,
    sessionId: string,
    planning: Awaited<ReturnType<PlanningService['latest']>>,
  ) {
    if (!planning) return null;
    const first = planning.pending[0];
    const kind = first
      ? /起始日期|日期范围/.test(first)
        ? 'START_DATE'
        : /对阵规则|单循环/.test(first)
          ? 'ROUND_ROBIN'
          : null
      : null;
    if (!kind || !first) {
      await tx.agentPendingQuestion.deleteMany({ where: { sessionId } });
      return null;
    }
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await tx.agentPendingQuestion.upsert({
      where: { sessionId },
      create: {
        sessionId,
        kind,
        planningId: planning.id,
        eventId: planning.eventId,
        planningRevision: planning.revision,
        question: first.slice(0, 500),
        expiresAt,
      },
      update: {
        kind,
        planningId: planning.id,
        eventId: planning.eventId,
        planningRevision: planning.revision,
        question: first.slice(0, 500),
        expiresAt,
        updatedAt: new Date(),
      },
    });
    return {
      kind,
      question: first.slice(0, 500),
      planningId: planning.id,
      planningRevision: planning.revision,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async confirmPlanningRequest(
    token: string,
    planningId: string,
    input: unknown,
  ) {
    const body = bodyObject(input, ['expectedRevision']);
    if (
      !Number.isSafeInteger(body.expectedRevision) ||
      Number(body.expectedRevision) < 1
    )
      throw new ConflictException('Invalid planning revision');
    const id = uuid(planningId);
    return this.auth.run(
      token,
      'agent.planning.confirm',
      id,
      {},
      async (tx, actor) => {
        const request = await tx.agentPlanningRequest.findUnique({
          where: { id },
        });
        if (!request || request.ownerId !== actor.id) deny();
        await this.validateSessionAccess(tx, actor, request.sessionId);
        return this.planning.confirm(
          tx,
          actor,
          id,
          Number(body.expectedRevision),
        );
      },
      { retries: 5 },
    );
  }

  private resolveDialogueRoute(
    routed: ConversationRoute,
    activeTask:
      | { step: string; eventId?: string | null; matchId?: string | null }
      | undefined,
    body: MessageBody,
    lastQuery?: { eventId: string; matchId?: string },
    planning?: ConversationContext['planning'],
  ): ConversationRoute {
    // The production model's structured route is the semantic decision.
    // Keep only task-state validation here; the simulated adapter below still
    // exercises legacy fixtures without granting any business capability.
    if (this.model?.status().mode === 'QWEN') {
      if (
        routed === 'CONTINUE' &&
        (!activeTask ||
          ![
            'LOCATE_EVENT',
            'LOCATE_MATCH',
            'WAITING_PARAMETERS',
            'PREVIEW_READY',
          ].includes(activeTask.step))
      )
        return 'CLARIFY';
      return routed;
    }
    let kind = routed;
    if (
      /(?:收集|记录|建立|添加|修改|取消|撤销).*(?:排程需求|排程要求|排程约束|球队时间限制)/.test(
        body.message,
      ) &&
      !/(?:生成|覆盖|执行|发布|重排|增加比赛|修改赛制|改变晋级)/.test(
        body.message,
      )
    )
      kind = 'PLAN';
    if (
      kind === 'PLAN' &&
      /(?:生成|覆盖|执行|发布|重排|增加比赛|修改赛制|改变晋级)/.test(
        body.message,
      )
    )
      return 'UNSUPPORTED';
    if (
      kind === 'PLAN' &&
      /(?:确认|提交|保存)(?:这份|当前|排程)?需求(?:单)?/.test(body.message)
    )
      return 'CLARIFY';
    if (
      planning &&
      /^(?:取消|撤销|改成|改为|修改|补充|新增)/.test(body.message) &&
      /(?:队|周[一二三四五六日天]|时间|日期|条件|对阵)/.test(body.message) &&
      kind !== 'UNSUPPORTED'
    )
      kind = 'PLAN';
    if (
      kind === 'PLAN' &&
      /^(?:如果|假如|怎么|如何|为什么|讨论)/.test(body.message)
    )
      return 'CHAT';
    if (
      /^(?:如果|假如)/.test(body.message) &&
      /(?:会怎样|怎么样|影响|可以吗|好吗)/.test(body.message)
    )
      return 'CHAT';
    const pointsToQuery =
      !!lastQuery?.matchId && /(?:刚才那场|那场|这场)/.test(body.message);
    if (
      pointsToQuery &&
      /(?:改到|移到|调整到|推迟到|提前到)/.test(body.message) &&
      !/(?:如果|假如|怎样|怎么样|影响|会不会|好吗|可以吗|？|\?)/.test(
        body.message,
      ) &&
      kind !== 'UNSUPPORTED'
    )
      kind =
        activeTask?.eventId === lastQuery!.eventId &&
        activeTask?.matchId === lastQuery!.matchId
          ? 'CONTINUE'
          : 'START';
    if (kind === 'QUERY') {
      if (
        /(?:整[套个周]|全部|所有|批量|重排|指定对阵|登记俱乐部|发布赛程|审批|审核|物料)/.test(
          body.message,
        )
      )
        return 'UNSUPPORTED';
      if (/(?:改期|改到|移到|调整到|推迟到|提前到)/.test(body.message))
        return 'CLARIFY';
    }
    // A bare time/relative correction refers to the authorized active task,
    // never to a new schedule operation. Model labels alone are not authority.
    const continuationOnly =
      /^(?:上午|下午|早上|晚上|再晚|再早|改到\d{4}-\d{2}-\d{2}|移到\d{4}-\d{2}-\d{2}|换成周|选择第|选第)/.test(
        body.message.trim(),
      ) && !/(?:[?？]|怎么样|影响|为什么|好不好|可以吗)/.test(body.message);
    if (continuationOnly && kind !== 'UNSUPPORTED')
      kind =
        activeTask &&
        [
          'LOCATE_EVENT',
          'LOCATE_MATCH',
          'WAITING_PARAMETERS',
          'PREVIEW_READY',
        ].includes(activeTask.step)
          ? 'CONTINUE'
          : 'CLARIFY';
    // Defense in depth: model routing is never a grant to an unsupported tool.
    if (kind === 'START' || kind === 'CONTINUE') {
      if (
        /(?:整[套个周]|全部|所有|批量|重排|指定对阵|登记俱乐部|发布赛程|审批|审核|物料)/.test(
          body.message,
        )
      )
        kind = 'UNSUPPORTED';
      else if (
        kind === 'CONTINUE' &&
        (!activeTask ||
          ![
            'LOCATE_EVENT',
            'LOCATE_MATCH',
            'WAITING_PARAMETERS',
            'PREVIEW_READY',
          ].includes(activeTask.step))
      )
        kind = 'CLARIFY';
    }
    if (
      (kind === 'START' || kind === 'CONTINUE' || kind === 'CLARIFY') &&
      body.matchId &&
      activeTask?.step === 'LOCATE_MATCH'
    )
      kind = 'CONTINUE';
    if (
      (kind === 'START' || kind === 'CONTINUE' || kind === 'CLARIFY') &&
      body.eventId &&
      activeTask?.step === 'LOCATE_EVENT' &&
      body.taskId
    )
      kind = 'CONTINUE';
    return kind;
  }

  private adjustmentInput(
    kind: 'START' | 'CONTINUE',
    body: MessageBody,
    lastQuery?: { eventId: string; matchId?: string },
  ): MessageBody {
    if (kind !== 'START') return body;
    const reference =
      lastQuery?.matchId && /(?:刚才那场|那场|这场)/.test(body.message)
        ? lastQuery
        : undefined;
    return {
      ...body,
      ...(reference
        ? { eventId: reference.eventId, matchId: reference.matchId }
        : {}),
      taskId: undefined,
      newTask: true,
    };
  }

  /** Development-only graph. Credentials stay in the closure, never graph state.
   * Entry module restricts this to a disposable local test database.
   * Shares model adapters, routing policy and all business node implementations.
   */
  createStudioGraph(token: string) {
    type StudioState = z.infer<typeof studioState>;
    const body = (state: StudioState): MessageBody =>
      this.parseMessage({
        message: state.message,
        ...(state.eventId ? { eventId: state.eventId } : {}),
        ...(state.matchId ? { matchId: state.matchId } : {}),
        ...(state.teamId ? { teamId: state.teamId } : {}),
        ...(state.planningId ? { planningId: state.planningId } : {}),
        ...(state.planningRevision
          ? { planningRevision: state.planningRevision }
          : {}),
        newTask: state.newTask === true,
      });
    const checked = (state: StudioState) =>
      this.checkedDialogueContext(token, state.sessionId, body(state));
    const node =
      (action: (state: WorkflowState) => Promise<Partial<WorkflowState>>) =>
      (state: StudioState) => {
        // Studio can resume at a paused node; recheck access before every step.
        return checked(state).then(() =>
          this.runtime.run(
            {
              token,
              sessionId: state.sessionId,
              message: state.message,
              eventId: state.eventId || undefined,
              matchId: state.explicitMatchId || undefined,
            },
            () => action(state),
          ),
        );
      };
    return new StateGraph({ stateSchema: studioState, input: studioInput })
      .addNode('load_context', async (state) => {
        const sessionId =
          state.sessionId || (await this.createSession(token, {})).id;
        const { context } = await checked({ ...state, sessionId });
        return { sessionId, context, answer: '', reply: null };
      })
      .addNode('generate_candidate', async (state) => {
        await checked(state);
        if (
          !this.candidates ||
          !state.planningId ||
          !state.planningRevision ||
          !state.candidateConfig
        )
          throw new ConflictException(
            '先确认需求并显式填写候选赛程配置/基础版本；不可猜测业务默认值。',
          );
        return {
          candidateResult: await this.candidates.generate(
            token,
            state.planningId,
            {
              expectedRevision: state.planningRevision,
              baselineRevision: state.candidateBaselineRevision,
              format: 'ROUND_ROBIN',
              configSource: state.candidateConfigSource,
              config: state.candidateConfig,
              fixedMatchIds: state.candidateFixedMatchIds,
            },
          ),
        };
      })
      .addNode('validate_candidate', async (state) => {
        await checked(state);
        if (
          !this.candidates ||
          !state.planningId ||
          !state.candidateResult ||
          typeof state.candidateResult !== 'object' ||
          !('id' in state.candidateResult)
        )
          throw new ConflictException(
            '候选不可用，请重新核对已确认需求与配置。',
          );
        const result = await this.candidates.get(
          token,
          state.planningId,
          String(state.candidateResult.id),
        );
        return { candidateResult: result, reply: null };
      })
      .addNode('intent_router', async (state) => {
        const { task, context } = await checked(state);
        const routed = await this.model.route(state.message, context);
        return {
          kind: this.resolveDialogueRoute(
            routed,
            task,
            body(state),
            context.lastQuery,
            context.planning,
          ),
        };
      })
      .addNode('respond_chat', async (state) => {
        const { context } = await checked(state);
        return {
          answer: await this.model.chat(
            state.message,
            context,
            state.kind as 'CHAT' | 'CLARIFY' | 'UNSUPPORTED',
          ),
        };
      })
      .addNode('plan_query', async (state) => {
        await checked(state);
        return {
          queryPlan: await this.planScheduleQuery(
            token,
            state.sessionId,
            body(state),
          ),
        };
      })
      .addNode('execute_query', async (state) => {
        await checked(state);
        return {
          queryResult: await this.executeScheduleQuery(
            token,
            state.sessionId,
            body(state),
            state.queryPlan as QueryPlan,
          ),
        };
      })
      .addNode('save_query', async (state) => {
        await checked(state);
        return {
          reply: await this.saveScheduleQuery(
            token,
            state.sessionId,
            body(state),
            state.queryResult as QueryResponse,
          ),
          matchId: '',
        };
      })
      .addNode('plan_requirements', async (state) => {
        await checked(state);
        return {
          planningProposal: await this.planRequirements(
            token,
            state.sessionId,
            body(state),
          ),
        };
      })
      .addNode('save_requirements', async (state) => {
        await checked(state);
        const reply = await this.saveRequirements(
          token,
          state.sessionId,
          body(state),
          state.planningProposal as PlanningProposal,
        );
        return {
          reply,
          planningId: reply.planningRequest?.id ?? '',
          planningRevision: reply.planningRequest?.revision ?? 0,
          teamId: '',
        };
      })
      .addNode('save_dialogue', async (state) => ({
        reply: await this.saveDialogue(
          token,
          state.sessionId,
          body(state),
          state.kind as 'CHAT' | 'CLARIFY' | 'UNSUPPORTED',
          state.answer,
        ),
        newTask: false,
      }))
      .addNode('prepare_task', async (state) => {
        const { context } = await checked(state);
        const input = this.adjustmentInput(
          state.kind as 'START' | 'CONTINUE',
          body(state),
          context.lastQuery,
        );
        const { task } = await this.prepareInvocation(
          token,
          state.sessionId,
          input,
        );
        return {
          workflowVersion: 2,
          taskId: task.id,
          revision: task.revision,
          step: task.step,
          eventId: input.eventId || task.eventId || '',
          matchId: input.matchId || task.matchId || '',
          explicitMatchId: input.matchId || '',
          baselineRevision: task.baselineRevision ?? 0,
          parameters: parameters(task.parameters),
          pendingFields: strings(task.pendingFields),
          candidates: [],
          route: 'respond' as const,
          status: 'ERROR' as const,
          responseMessage: '',
          newTask: false,
        };
      })
      .addNode(
        'authorize_context',
        node((state) => this.authorizeNode(state)),
      )
      .addNode(
        'parse_intent',
        node((state) => this.parseIntentNode(state)),
      )
      .addNode(
        'locate_resources',
        node((state) => this.locateResourcesNode(state)),
      )
      .addNode(
        'deterministic_preview',
        node((state) => this.previewNode(state)),
      )
      .addNode(
        'return_result',
        node((state) => this.resultNode(state)),
      )
      .addNode('inspect_result', async (state) => ({
        reply: await this.getSession(token, state.sessionId),
        // An inferred match must not become an explicit match selection next turn.
        matchId: '',
      }))
      .addEdge(START, 'load_context')
      .addConditionalEdges(
        'load_context',
        (state) =>
          state.message.trim() === '生成整套候选赛程预览'
            ? 'candidate'
            : 'dialogue',
        {
          candidate: 'generate_candidate',
          dialogue: 'intent_router',
        },
      )
      .addEdge('generate_candidate', 'validate_candidate')
      .addEdge('validate_candidate', END)
      .addConditionalEdges(
        'intent_router',
        (state) =>
          state.kind === 'START' || state.kind === 'CONTINUE'
            ? 'business'
            : state.kind === 'QUERY'
              ? 'query'
              : state.kind === 'PLAN'
                ? 'planning'
                : 'chat',
        {
          business: 'prepare_task',
          query: 'plan_query',
          planning: 'plan_requirements',
          chat: 'respond_chat',
        },
      )
      .addEdge('plan_requirements', 'save_requirements')
      .addEdge('save_requirements', END)
      .addEdge('plan_query', 'execute_query')
      .addEdge('execute_query', 'save_query')
      .addEdge('save_query', END)
      .addEdge('respond_chat', 'save_dialogue')
      .addEdge('save_dialogue', END)
      .addEdge('prepare_task', 'authorize_context')
      .addEdge('authorize_context', 'parse_intent')
      .addEdge('parse_intent', 'locate_resources')
      .addConditionalEdges('locate_resources', (state) => state.route, {
        preview: 'deterministic_preview',
        respond: 'return_result',
      })
      .addEdge('deterministic_preview', 'return_result')
      .addEdge('return_result', 'inspect_result')
      .addEdge('inspect_result', END)
      .compile();
  }

  async message(token: string, sessionId: string, input: unknown) {
    const body = this.parseMessage(input);
    const scope = requestScope.getStore();
    if (scope) scope.sessionId = sessionId;
    await this.refreshConversationSummary(token, sessionId);
    // Read and authorize every historical task BEFORE sending any history or
    // preview to either the router or chat model. A revoked session fails closed.
    const {
      task: activeTask,
      context,
      pendingQuestion,
    } = await this.checkedDialogueContext(token, sessionId, body);
    const skills = context.skills;
    if (
      pendingQuestion?.kind === 'ROUND_ROBIN' &&
      /^(?:是|是的|对|对的|没错|确定|确认|可以|好的)[。！!，,\s]*$/.test(
        body.message.trim(),
      )
    ) {
      const resolved = {
        message: '每队与其他队都交手一次',
        planningId: pendingQuestion.planningId,
        planningRevision: pendingQuestion.planningRevision,
      };
      const proposal = await this.planRequirements(
        token,
        sessionId,
        { ...body, message: resolved.message },
        skills,
      );
      return this.saveRequirements(token, sessionId, body, proposal, resolved);
    }
    const suggestedMemory = personalMemoryProposal(body.message);
    if (suggestedMemory) {
      const response = await this.saveDialogue(
        token,
        sessionId,
        body,
        'CHAT',
        `我可以把“${suggestedMemory}”作为你的个人偏好，用于后续对话。请点击“保存这条记忆”确认；这不会成为赛事规则或排赛条件。`,
      );
      return { ...response, suggestedMemory };
    }
    if (scope) {
      scope.taskId = activeTask?.id;
    }
    const dialog = await this.runtime.run(
      {
        token,
        sessionId,
        message: body.message,
        eventId: body.eventId,
        matchId: body.matchId,
        taskId: body.taskId,
        skills,
      },
      () =>
        this.dialogGraph.invoke({
          message: body.message,
          context: { ...context, skills },
        }),
    );
    const kind = this.resolveDialogueRoute(
      dialog.kind,
      activeTask,
      body,
      context.lastQuery,
      context.planning,
    );
    if (kind === 'PLAN') {
      const proposal = await this.planRequirements(
        token,
        sessionId,
        body,
        skills,
      );
      return this.saveRequirements(token, sessionId, body, proposal);
    }
    if (kind === 'QUERY') {
      const plan = await this.planScheduleQuery(token, sessionId, body, skills);
      const result = await this.executeScheduleQuery(
        token,
        sessionId,
        body,
        plan,
      );
      return this.saveScheduleQuery(token, sessionId, body, result);
    }
    if (kind !== 'START' && kind !== 'CONTINUE') {
      const response =
        (dialog.kind === kind && dialog.answer) ||
        (await this.model.chat(
          body.message,
          {
            ...(await this.checkedDialogueContext(token, sessionId, body))
              .context,
            skills,
          },
          kind,
        ));
      return this.saveDialogue(token, sessionId, body, kind, response);
    }
    const workflowBody = this.adjustmentInput(kind, body, context.lastQuery);
    const prepared = await this.prepareInvocation(
      token,
      sessionId,
      workflowBody,
      activeTask ?? undefined,
    );
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
        eventId:
          workflowBody.eventId ?? prepared.sessionCurrentEventId ?? undefined,
        matchId: workflowBody.matchId,
        skills,
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
        const visibleTicket = await this.visibleConfirmation(
          tx,
          actor,
          confirmation,
        );
        return this.taskView({
          ...current!,
          confirmationTickets: visibleTicket ? [visibleTicket] : [],
        });
      },
    );
    return {
      sessionId,
      status: state.status,
      message: state.responseMessage,
      candidates: state.candidates,
      task,
      planningRequest: await this.auth.run(
        token,
        'agent.planning.view',
        sessionId,
        {},
        async (tx, actor) => {
          await this.validateSessionAccess(tx, actor, sessionId);
          return this.planning.latest(tx, actor, sessionId);
        },
      ),
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
      context.skills?.TOOL_SELECTION?.instructions,
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
        const canConfirm = !!(await tx.event.findFirst({
          where: {
            AND: [{ id: preview.eventId }, eventOperationsScope(actor)],
          },
          select: { id: true },
        }));
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
        if (canConfirm)
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
        return { revision: state.revision + 1, canConfirm };
      },
    );
    return {
      revision: result.revision,
      step: 'PREVIEW_READY',
      pendingFields: [],
      status: 'PREVIEW' as const,
      responseMessage: !result.canConfirm
        ? '已生成只读预览。当前账号没有保存赛程草稿的权限，未创建确认票据。'
        : preview.issues.length
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
        await this.appendTurns(
          tx,
          context.sessionId,
          context.message,
          state.responseMessage,
          json({ taskId: state.taskId }),
          json({
            taskId: state.taskId,
            eventId: state.eventId || null,
            matchId: state.matchId || null,
            pendingFields: state.pendingFields,
          }),
        );
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
      { retries: 5 },
    );
  }
}
