import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
  eventOperations,
  eventOperationsScope,
  type Actor,
} from '../authorization/policy.js';
import { calculateAdjustmentPreview } from '../scheduling/scheduling.algorithm.js';
import type {
  ScheduleConfigDto,
  ScheduleMatchDto,
} from '../scheduling/scheduling.dto.js';
import type { AgentIntent, AgentModelAdapter } from './model-adapter.js';

type Tx = Prisma.TransactionClient;
type TaskStep =
  | 'LOCATE_EVENT'
  | 'LOCATE_MATCH'
  | 'PREVIEW_READY'
  | 'STALE'
  | 'FAILED';
const json = (value: unknown) => value as Prisma.InputJsonValue;
const GraphState = Annotation.Root({
  taskId: Annotation<string>(),
  step: Annotation<string>(),
  eventId: Annotation<string>(),
  matchId: Annotation<string>(),
  baselineRevision: Annotation<number>(),
});

function localParts(iso: string) {
  const value = new Date(Date.parse(iso) + 8 * 60 * 60 * 1000).toISOString();
  return { date: value.slice(0, 10), time: value.slice(11, 16) };
}
function weekday(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}
function targetInstant(source: string, intent: AgentIntent) {
  if (intent.targetWeekday === undefined || intent.targetHour === undefined)
    return undefined;
  const sourceDate = localParts(source).date;
  const delta = intent.targetWeekday - weekday(sourceDate);
  const day = new Date(`${sourceDate}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + delta);
  const date = day.toISOString().slice(0, 10);
  return new Date(
    `${date}T${String(intent.targetHour).padStart(2, '0')}:${String(intent.targetMinute ?? 0).padStart(2, '0')}:00+08:00`,
  ).toISOString();
}
function matchLabel(match: ScheduleMatchDto) {
  return `第${match.order}场 · ${match.homeLabel} vs ${match.awayLabel}`;
}

@Injectable()
export class AiService implements OnModuleDestroy {
  private readonly checkpoint;
  private readonly graph;
  constructor(
    private readonly auth: AuthorizationService,
    private readonly model: AgentModelAdapter,
    databaseUrl?: string,
  ) {
    this.checkpoint = databaseUrl
      ? createAgentCheckpointer(databaseUrl)
      : undefined;
    const saver = this.checkpoint?.saver ?? new MemorySaver();
    this.graph = new StateGraph(GraphState)
      .addNode('persist', (state) => state)
      .addEdge(START, 'persist')
      .addEdge('persist', END)
      .compile({ checkpointer: saver });
  }

  async onModuleDestroy() {
    await this.checkpoint?.close();
  }

  private taskView(task: {
    id: string;
    goal: string;
    step: string;
    eventId: string | null;
    matchId: string | null;
    baselineRevision: number | null;
    preview: Prisma.JsonValue | null;
    previewExpiresAt: Date | null;
  }) {
    return {
      id: task.id,
      goal: task.goal,
      step: task.step as TaskStep,
      eventId: task.eventId,
      matchId: task.matchId,
      baselineRevision: task.baselineRevision,
      preview: task.step === 'PREVIEW_READY' ? task.preview : null,
      expiresAt: task.previewExpiresAt?.toISOString() ?? null,
    };
  }

  private async persistCheckpoint(task: {
    id: string;
    checkpointThreadId: string;
    step: string;
    eventId: string | null;
    matchId: string | null;
    baselineRevision: number | null;
  }) {
    await this.graph.invoke(
      {
        taskId: task.id,
        step: task.step,
        eventId: task.eventId ?? '',
        matchId: task.matchId ?? '',
        baselineRevision: task.baselineRevision ?? 0,
      },
      { configurable: { thread_id: task.checkpointThreadId } },
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
        if (currentEventId) await eventOperations(tx, actor, currentEventId);
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
          where: {
            ownerId: actor.id,
            OR: [
              { currentEventId: null },
              { currentEvent: eventOperationsScope(actor) },
            ],
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          take: 30,
        });
        return Promise.all(
          rows.map((row) => this.sessionView(tx, actor, row.id)),
        );
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
    const session = await tx.agentSession.findFirst({
      where: { id, ownerId: actor.id },
      include: {
        turns: { orderBy: { createdAt: 'desc' }, take: 20 },
        tasks: { orderBy: { updatedAt: 'desc' }, take: 1 },
      },
    });
    if (!session) deny();
    let task = session.tasks[0] ?? null;
    if (session.currentEventId)
      await eventOperations(tx, actor, session.currentEventId);
    if (task?.eventId) await eventOperations(tx, actor, task.eventId);
    if (task?.eventId) {
      const schedule = await tx.eventSchedule.findUnique({
        where: { eventId: task.eventId },
      });
      if (
        task.step === 'PREVIEW_READY' &&
        (!schedule ||
          schedule.revision !== task.baselineRevision ||
          !task.previewExpiresAt ||
          task.previewExpiresAt <= new Date())
      ) {
        task = await tx.agentTask.update({
          where: { id: task.id },
          data: {
            step: 'STALE',
            preview: json({}),
            previewExpiresAt: null,
            updatedAt: new Date(),
          },
        });
      }
    }
    return {
      id: session.id,
      summary: session.summary,
      currentEventId: session.currentEventId,
      currentMatchId: session.currentMatchId,
      updatedAt: session.updatedAt.toISOString(),
      turns: session.turns.reverse().map((turn) => ({
        id: turn.id,
        role: turn.role as 'USER' | 'ASSISTANT',
        content: turn.content,
        createdAt: turn.createdAt.toISOString(),
      })),
      task: task ? this.taskView(task) : null,
    };
  }

  async message(token: string, sessionId: string, input: unknown) {
    const body = bodyObject(input, ['message', 'eventId', 'matchId']);
    const message = text(body.message, 2000);
    const existingGoal = await this.auth.run(
      token,
      'agent.session.prepare',
      sessionId,
      {},
      async (tx, actor) => {
        const session = await tx.agentSession.findFirst({
          where: { id: sessionId, ownerId: actor.id },
          include: { tasks: { orderBy: { updatedAt: 'desc' }, take: 1 } },
        });
        if (!session) deny();
        return session.tasks[0]?.goal ?? '';
      },
    );
    const intent = await this.model.parse(`${message} ${existingGoal}`.trim());
    const result = await this.auth.run(
      token,
      'agent.message.create',
      sessionId,
      {},
      async (tx, actor) => {
        const session = await tx.agentSession.findFirst({
          where: { id: sessionId, ownerId: actor.id },
        });
        if (!session) deny();
        await tx.agentTurn.create({
          data: { id: randomUUID(), sessionId, role: 'USER', content: message },
        });
        const events = await tx.event.findMany({
          where: eventOperationsScope(actor),
          select: { id: true, name: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        });
        const requestedEvent = body.eventId
          ? uuid(body.eventId)
          : session.currentEventId;
        const event = requestedEvent
          ? events.find((candidate) => candidate.id === requestedEvent)
          : events.length === 1
            ? events[0]
            : undefined;
        if (requestedEvent && !event) deny();
        const taskId = randomUUID();
        const checkpointThreadId = randomUUID();
        if (!event) {
          const task = await tx.agentTask.create({
            data: {
              id: taskId,
              sessionId,
              ownerId: actor.id,
              goal: message,
              step: 'LOCATE_EVENT',
              checkpointThreadId,
            },
          });
          const reply = events.length
            ? '请先选择要调整的赛事，我不会替你猜测。'
            : '当前账号没有可操作的赛事。';
          await this.saveReply(tx, sessionId, reply, null, null);
          return {
            status: 'NEED_EVENT' as const,
            message: reply,
            candidates: events.map((item) => ({
              id: item.id,
              label: item.name,
            })),
            task,
          };
        }
        await eventOperations(tx, actor, event.id);
        const schedule = await tx.eventSchedule.findUnique({
          where: { eventId: event.id },
        });
        if (!schedule) {
          const task = await tx.agentTask.create({
            data: {
              id: taskId,
              sessionId,
              ownerId: actor.id,
              goal: message,
              step: 'FAILED',
              eventId: event.id,
              checkpointThreadId,
            },
          });
          const reply = '当前赛事还没有可读取的赛程，未生成任何预览。';
          await this.saveReply(tx, sessionId, reply, event.id, null);
          return {
            status: 'ERROR' as const,
            message: reply,
            candidates: [],
            task,
          };
        }
        const matches = schedule.matches as unknown as ScheduleMatchDto[];
        let selected = body.matchId
          ? matches.find((match) => match.id === uuid(body.matchId))
          : undefined;
        if (body.matchId && !selected) deny();
        if (
          !selected &&
          session.currentMatchId &&
          intent.sourceWeekday === undefined
        )
          selected = matches.find(
            (match) => match.id === session.currentMatchId,
          );
        let candidates: ScheduleMatchDto[] = [];
        if (!selected && intent.sourceWeekday && intent.sourceOrdinal) {
          const byDate = new Map<string, ScheduleMatchDto[]>();
          for (const match of matches.filter((item) => item.startAt)) {
            const date = localParts(match.startAt).date;
            if (weekday(date) !== intent.sourceWeekday) continue;
            byDate.set(date, [...(byDate.get(date) ?? []), match]);
          }
          candidates = [...byDate.values()]
            .map(
              (items) =>
                items.sort(
                  (a, b) =>
                    Date.parse(a.startAt) - Date.parse(b.startAt) ||
                    a.order - b.order,
                )[intent.sourceOrdinal! - 1],
            )
            .filter((item): item is ScheduleMatchDto => !!item);
          if (candidates.length === 1) selected = candidates[0];
        }
        if (!selected) {
          const task = await tx.agentTask.create({
            data: {
              id: taskId,
              sessionId,
              ownerId: actor.id,
              goal: message,
              step: 'LOCATE_MATCH',
              eventId: event.id,
              baselineRevision: schedule.revision,
              checkpointThreadId,
            },
          });
          const reply =
            candidates.length > 1
              ? '找到多场符合描述的比赛，请明确选择；我不会擅自决定。'
              : '没有唯一定位到比赛，请选择具体场次。';
          await this.saveReply(tx, sessionId, reply, event.id, null);
          return {
            status: 'NEED_MATCH' as const,
            message: reply,
            candidates: (candidates.length ? candidates : matches)
              .slice(0, 20)
              .map((match) => ({
                id: match.id,
                label: matchLabel(match),
                detail: `${localParts(match.startAt).date} ${localParts(match.startAt).time} · ${match.venue}`,
              })),
            task,
          };
        }
        const startAt = targetInstant(selected.startAt, intent);
        if (!startAt)
          throw new BadRequestException('Target weekday and time required');
        const config = schedule.config as unknown as ScheduleConfigDto;
        const teams = await tx.eventTeam.findMany({
          where: { eventId: event.id },
          orderBy: { createdAt: 'asc' },
        });
        const preview = calculateAdjustmentPreview(
          config,
          matches,
          teams.map((team) => ({
            id: team.id,
            active: team.active,
            name:
              typeof team.profile === 'object' &&
              team.profile &&
              !Array.isArray(team.profile) &&
              typeof team.profile.name === 'string'
                ? team.profile.name
                : '未命名球队',
          })),
          selected.id,
          startAt,
          selected.venue,
        );
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
        const storedPreview = {
          eventId: event.id,
          baselineRevision: schedule.revision,
          ...preview,
          expiresAt: expiresAt.toISOString(),
        };
        const task = await tx.agentTask.create({
          data: {
            id: taskId,
            sessionId,
            ownerId: actor.id,
            goal: message,
            step: 'PREVIEW_READY',
            eventId: event.id,
            matchId: selected.id,
            baselineRevision: schedule.revision,
            preview: json(storedPreview),
            previewExpiresAt: expiresAt,
            checkpointThreadId,
          },
        });
        const reply = preview.issues.length
          ? `预览已生成，确定性校验发现 ${preview.issues.length} 项冲突。此操作尚未保存。`
          : '预览已生成，确定性校验未发现冲突。此操作尚未保存。';
        await this.saveReply(
          tx,
          sessionId,
          reply,
          event.id,
          selected.id,
          message,
        );
        return {
          status: 'PREVIEW' as const,
          message: reply,
          candidates: [],
          task,
        };
      },
    );
    await this.persistCheckpoint(result.task);
    return {
      sessionId,
      status: result.status,
      message: result.message,
      candidates: result.candidates,
      task: this.taskView(result.task),
    };
  }

  private async saveReply(
    tx: Tx,
    sessionId: string,
    content: string,
    eventId: string | null,
    matchId: string | null,
    summary?: string,
  ) {
    await tx.agentTurn.create({
      data: {
        id: randomUUID(),
        sessionId,
        role: 'ASSISTANT',
        content,
        structured: { eventId, matchId },
      },
    });
    await tx.agentSession.update({
      where: { id: sessionId },
      data: {
        currentEventId: eventId,
        currentMatchId: matchId,
        summary: summary?.slice(0, 2000) ?? undefined,
        updatedAt: new Date(),
      },
    });
  }
}
