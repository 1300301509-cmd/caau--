import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@caau/database';
import {
  deny,
  eventOperations,
  eventOperationsScope,
  type Actor,
} from '../authorization/policy.js';
import {
  conditionSummary,
  endAfterDays,
  expandDays,
  newCondition,
  parseUserDates,
  periodDates,
  planningIssues,
  planningPending,
  validDay,
  type PlanningChange,
  type PlanningCondition,
  type PlanningProposal,
  type UnresolvedPlanningChange,
} from './planning.js';

type Tx = Prisma.TransactionClient;
type Request = Prisma.AgentPlanningRequestGetPayload<Record<string, never>>;
type Context = {
  sessionId: string;
  message: string;
  eventId?: string;
  planningId?: string;
  planningRevision?: number;
  teamId?: string;
};
type Candidate = { id: string; label: string; detail?: string };
export type PlanningView = {
  id: string;
  type: 'SCHEDULE_PLANNING';
  eventId: string;
  eventName: string;
  revision: number;
  status: 'COLLECTING' | 'CONFIRMED' | 'STALE';
  confirmedRevision: number | null;
  conditions: PlanningCondition[];
  sourceTurns: { id: string; content: string }[];
  pending: string[];
  issues: string[];
  summary: string;
  updatedAt: string;
};
export type PlanningResponse = {
  status: 'PLAN' | 'NEED_EVENT' | 'NEED_TEAM' | 'CLARIFY';
  message: string;
  candidates: Candidate[];
  planning: PlanningView | null;
};
const json = (value: unknown) => value as Prisma.InputJsonValue;
const conditionsOf = (row: Request) =>
  row.conditions as unknown as PlanningCondition[];
const unresolvedOf = (row: Request) =>
  row.unresolved as unknown as UnresolvedPlanningChange[];
const nameOf = (profile: Prisma.JsonValue) => {
  const name = (profile as { name?: unknown } | null)?.name;
  return typeof name === 'string' ? name : '';
};
const weekdaysIn = (message: string) =>
  [...message.matchAll(/周([一二三四五六日天])/g)].map(
    (match) =>
      (
        ({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }) as Record<
          string,
          number
        >
      )[match[1]!]!,
  );
const periodOf = (conditions: PlanningCondition[]) =>
  conditions.find((item) => item.kind === 'DATE_RANGE');
const uniqueIds = (ids: string[]) => [...new Set(ids)];
// A model-supplied hint is not a user's explicit selection merely because a
// short substring (e.g. "063" in a team name) happens to occur in the message.
const literalParticipantId = (id: string | undefined, message: string) =>
  !!id &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) &&
  message.includes(id);

@Injectable()
export class PlanningService {
  async view(tx: Tx, actor: Actor, row: Request): Promise<PlanningView> {
    if (row.ownerId !== actor.id || row.type !== 'SCHEDULE_PLANNING') deny();
    await eventOperations(tx, actor, row.eventId);
    const event = await tx.event.findUnique({
      where: { id: row.eventId },
      select: { name: true },
    });
    if (!event) deny();
    const conditions = conditionsOf(row);
    const teamIds = uniqueIds(
      conditions.flatMap((condition) =>
        [condition.teamId, condition.opponentId].filter(
          (id): id is string => !!id,
        ),
      ),
    );
    const participants = teamIds.length
      ? await tx.eventTeam.findMany({
          where: { eventId: row.eventId, id: { in: teamIds } },
          select: { id: true, active: true },
        })
      : [];
    if (participants.length !== teamIds.length) deny();
    const issues = planningIssues(conditions);
    const period = conditions.find((item) => item.kind === 'DATE_RANGE');
    if (period?.scheduleGoal) {
      const currentProfile = await tx.eventProfileVersion.findFirst({
        where: { eventId: row.eventId },
        orderBy: { version: 'desc' },
        select: { profile: true },
      });
      const profile = currentProfile?.profile as
        | { startDate?: unknown; endDate?: unknown }
        | undefined;
      if (
        (period.dateSource === 'EVENT_PROFILE' &&
          profile?.startDate !== period.from) ||
        (typeof profile?.startDate === 'string' &&
          !!period.from &&
          period.from < profile.startDate) ||
        (typeof profile?.endDate === 'string' &&
          !!period.to &&
          period.to > profile.endDate)
      )
        issues.push(
          '赛事资料中的起止日期已变化或不足以覆盖该需求，请核对赛事日期。',
        );
    }
    const inactive = participants.filter((participant) => !participant.active);
    if (inactive.length)
      issues.push(
        `有 ${inactive.length} 条参赛记录已停用：确认不再代表当前参赛名单，请移除相应要求或联系赛事管理员。`,
      );
    const pending = planningPending(conditions, unresolvedOf(row));
    const sources = uniqueIds([
      ...conditions.flatMap((condition) => condition.sourceTurnIds),
      ...unresolvedOf(row).flatMap((item) => item.sourceTurnIds),
    ]);
    const sourceTurns = sources.length
      ? await tx.agentTurn.findMany({
          where: {
            id: { in: sources },
            sessionId: row.sessionId,
            role: 'USER',
          },
          select: { id: true, content: true },
        })
      : [];
    return {
      id: row.id,
      type: 'SCHEDULE_PLANNING',
      eventId: row.eventId,
      eventName: event.name,
      revision: row.revision,
      status:
        (inactive.length || issues.length) && row.status === 'CONFIRMED'
          ? 'STALE'
          : (row.status as 'COLLECTING' | 'CONFIRMED'),
      confirmedRevision: row.confirmedRevision,
      conditions,
      sourceTurns,
      pending,
      issues,
      summary: conditions.length
        ? `${conditions.slice(0, 8).map(conditionSummary).join('；')}${conditions.length > 8 ? `；另有 ${conditions.length - 8} 条，详见条件清单` : ''}`
        : '尚未记录可确认的排程条件。',
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  async latest(tx: Tx, actor: Actor, sessionId: string) {
    const row = await tx.agentPlanningRequest.findFirst({
      where: { sessionId, ownerId: actor.id },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    return row ? this.view(tx, actor, row) : null;
  }
  async confirm(tx: Tx, actor: Actor, id: string, expectedRevision: number) {
    const row = await tx.agentPlanningRequest.findUnique({ where: { id } });
    if (!row || row.ownerId !== actor.id) deny();
    const current = await this.view(tx, actor, row);
    if (row.revision !== expectedRevision)
      throw new ConflictException(
        'Planning request changed; refresh before confirming',
      );
    if (current.issues.length)
      throw new ConflictException(
        'Planning conditions are no longer valid; revise requirements',
      );
    if (
      row.status === 'CONFIRMED' &&
      row.confirmedRevision === expectedRevision
    )
      return current;
    if (!current.conditions.length || current.pending.length)
      throw new ConflictException(
        'Planning request has missing or conflicting requirements',
      );
    const changed = await tx.agentPlanningRequest.updateMany({
      where: { id, revision: expectedRevision, status: 'COLLECTING' },
      data: {
        status: 'CONFIRMED',
        confirmedRevision: expectedRevision,
        conditions: json(
          current.conditions.map((condition) => ({
            ...condition,
            confirmation: 'CONFIRMED',
          })),
        ),
        updatedAt: new Date(),
      },
    });
    if (changed.count !== 1)
      throw new ConflictException(
        'Planning request changed; refresh before confirming',
      );
    return this.view(
      tx,
      actor,
      await tx.agentPlanningRequest.findUniqueOrThrow({ where: { id } }),
    );
  }
  async apply(
    tx: Tx,
    actor: Actor,
    context: Context,
    proposal: PlanningProposal,
    sourceTurnId: string,
  ): Promise<PlanningResponse> {
    // Structured output can carry fields from another condition kind. Ignore
    // those fields and collapse identical proposals before resolving a team;
    // the authenticated business data and original user turn remain decisive.
    const changes = [
      ...new Map(
        proposal.changes.map((change) => {
          const normalized: PlanningChange =
            change.kind === 'TEAM_WINDOW'
              ? {
                  operation: change.operation,
                  kind: 'TEAM_WINDOW',
                  eventName: change.eventName,
                  teamName: change.teamName,
                  teamId: change.teamId,
                  dates: change.dates,
                  weekdays: change.weekdays,
                  startTime: change.startTime,
                  endTime: change.endTime,
                  availability: change.availability,
                  priority: change.priority,
                }
              : change;
          return [JSON.stringify(normalized), normalized] as const;
        }),
      ).values(),
    ];
    const owned = await tx.agentPlanningRequest.findMany({
      where: { sessionId: context.sessionId, ownerId: actor.id },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    const requested = context.planningId
      ? owned.find((row) => row.id === context.planningId)
      : owned[0];
    if (context.planningId && !requested) deny();
    const events = await tx.event.findMany({
      where: eventOperationsScope(actor),
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const mentioned = events.filter((event) =>
      context.message.includes(event.name),
    );
    const named = changes
      .map((change) => change.eventName)
      .filter(
        (value): value is string =>
          !!value &&
          context.message.includes(value) &&
          !/(?:本赛事|这个赛事|刚才|日期|周[一二三四五六日天])/.test(value),
      );
    const byName = mentioned.length
      ? mentioned
      : named.length
        ? events.filter((event) =>
            named.some((name) => event.name.includes(name)),
          )
        : [];
    if (named.length && !byName.length)
      return {
        status: 'CLARIFY',
        message: '在当前可规划的赛事中未找到所述名称，请核对赛事。',
        candidates: [],
        planning: null,
      };
    const chosenId = byName.length
      ? byName.length === 1
        ? byName[0]!.id
        : undefined
      : (requested?.eventId ?? context.eventId);
    if (!chosenId) {
      const choices = byName.length ? byName : events;
      return {
        status: 'NEED_EVENT',
        message: `请先明确选择要收集排程要求的赛事；当前只收集需求，不生成或覆盖赛程。${choices.length > 20 ? '仅显示前 20 个候选，请输入准确赛事名。' : ''}`,
        candidates: choices
          .slice(0, 20)
          .map((event) => ({ id: event.id, label: event.name })),
        planning: null,
      };
    }
    await eventOperations(tx, actor, chosenId);
    const event = await tx.event.findUnique({
      where: { id: chosenId },
      select: { name: true },
    });
    if (!event) deny();
    const row = owned.find((item) => item.eventId === chosenId);
    if (row && context.planningRevision !== row.revision)
      throw new ConflictException(
        'Planning revision required or changed; refresh and retry',
      );
    if (!row && context.planningRevision !== undefined)
      throw new ConflictException(
        'Planning request changed; refresh before editing',
      );
    const teams = (
      await tx.eventTeam.findMany({
        where: { eventId: chosenId, active: true },
        select: { id: true, profile: true },
      })
    ).map((team) => ({ id: team.id, name: nameOf(team.profile) }));
    if (
      context.teamId &&
      !teams.some((team) => team.id === context.teamId) &&
      !(
        changes.every((change) => change.operation === 'REMOVE') &&
        row &&
        conditionsOf(row).some((item) => item.teamId === context.teamId)
      )
    )
      deny();
    let conditions = row
      ? structuredClone(conditionsOf(row))
      : ([] as PlanningCondition[]);
    let unresolved = row
      ? structuredClone(unresolvedOf(row))
      : ([] as UnresolvedPlanningChange[]);
    const answer = (
      status: PlanningResponse['status'],
      message: string,
      candidates: Candidate[] = [],
    ): PlanningResponse => ({ status, message, candidates, planning: null });
    if (proposal.unhandled?.length)
      return answer(
        'CLARIFY',
        `本轮还有暂不能可靠记录的要求：${proposal.unhandled.join('；')}。请先核对，不能忽略这些条件后生成赛程。`,
      );
    const wholeRequest =
      proposal.goal === 'WHOLE_SCHEDULE' ||
      (!row &&
        changes.some(
          (change) =>
            change.kind === 'DATE_RANGE' && change.durationDays !== undefined,
        ));
    if (wholeRequest) {
      const days = changes.find(
        (change) => change.kind === 'DATE_RANGE',
      )?.durationDays;
      if (days !== undefined && (days < 1 || days > 31))
        return {
          status: 'CLARIFY',
          message: '单次候选排程目前最多支持 31 天，请明确不超过 31 天的范围。',
          candidates: [],
          planning: row ? await this.view(tx, actor, row) : null,
        };
      const explicitDates = parseUserDates(context.message);
      const latestProfile = await tx.eventProfileVersion.findFirst({
        where: { eventId: chosenId },
        orderBy: { version: 'desc' },
        select: { profile: true },
      });
      const profile = latestProfile?.profile as
        | { startDate?: unknown; endDate?: unknown }
        | undefined;
      const baseline = await tx.eventSchedule.findUnique({
        where: { eventId: chosenId },
        select: { config: true },
      });
      const currentConfig = baseline?.config as
        | { startDate?: unknown; endDate?: unknown }
        | undefined;
      const start =
        explicitDates[0] ??
        (typeof profile?.startDate === 'string' && validDay(profile.startDate)
          ? profile.startDate
          : typeof currentConfig?.startDate === 'string' &&
              validDay(currentConfig.startDate)
            ? currentConfig.startDate
            : undefined);
      const dateSource = explicitDates.length
        ? ('USER' as const)
        : typeof profile?.startDate === 'string' && start === profile.startDate
          ? ('EVENT_PROFILE' as const)
          : start
            ? ('EVENT_SCHEDULE' as const)
            : undefined;
      const end =
        days && start
          ? endAfterDays(start, days)
          : (explicitDates[1] ??
            (dateSource === 'EVENT_PROFILE' &&
            typeof profile?.endDate === 'string'
              ? profile.endDate
              : dateSource === 'EVENT_SCHEDULE' &&
                  typeof currentConfig?.endDate === 'string'
                ? currentConfig.endDate
                : undefined));
      if (start && end && !periodDates(start, end))
        return answer(
          'CLARIFY',
          '计算出的日期不在可用的 31 天范围内，请明确赛事起止日期。',
        );
      conditions = conditions.filter(
        (item) => item.kind !== 'DATE_RANGE' && item.kind !== 'FORMAT',
      );
      conditions.unshift(
        newCondition({
          kind: 'DATE_RANGE',
          eventId: chosenId,
          priority: 'MUST',
          ...(start ? { from: start } : {}),
          ...(end ? { to: end } : {}),
          ...(days ? { durationDays: days } : {}),
          scheduleGoal: true,
          ...(dateSource ? { dateSource } : {}),
          sourceTurnIds: [sourceTurnId],
        }),
      );
    }
    if (
      wholeRequest &&
      changes.some(
        (change) => change.kind === 'FORMAT' && change.format === 'ROUND_ROBIN',
      )
    ) {
      conditions = conditions.filter((item) => item.kind !== 'FORMAT');
      conditions.push(
        newCondition({
          kind: 'FORMAT',
          eventId: chosenId,
          priority: 'MUST',
          format: 'ROUND_ROBIN',
          sourceTurnIds: [sourceTurnId],
        }),
      );
    }
    const resolveTeam = (
      name: string | undefined,
      proposedId: string | undefined,
      kind: PlanningChange['kind'],
      opponent = false,
    ): {
      team?: (typeof teams)[number];
      message?: string;
      candidates?: Candidate[];
    } => {
      const exact = teams
        .filter((team) => team.name && context.message.includes(team.name))
        .sort((a, b) => b.name.length - a.name.length);
      const givenName = name
        ?.trim()
        .replace(/^(?:请让|让|把|和|与|查|取消|修改)/, '');
      const target =
        givenName && context.message.includes(givenName)
          ? givenName
          : undefined;
      const byText = exact.filter(
        (team) => !opponent || team.name !== exact[0]?.name,
      );
      const options = target
        ? teams.filter(
            (team) => team.name === target || team.name.includes(target),
          )
        : byText.length
          ? byText
          : [];
      const supplied = literalParticipantId(proposedId, context.message)
        ? proposedId
        : context.teamId;
      if (supplied) {
        const selected = teams.find(
          (team) =>
            team.id === supplied &&
            (!options.length ||
              options.some((choice) => choice.id === team.id)),
        );
        if (!selected) deny();
        return { team: selected };
      }
      if (options.length === 1) return { team: options[0] };
      if (!options.length)
        return {
          message: `${kind === 'TEAM_WINDOW' ? '请选择本赛事参赛球队' : opponent ? '请明确第二支参赛球队' : '请明确第一支参赛球队'}；不能根据名称猜测或使用球队主档案。`,
        };
      return {
        message: '同名或近似参赛球队不止一支，请明确选择赛事参赛记录。',
        candidates: options.slice(0, 12).map((team) => ({
          id: team.id,
          label: team.name,
          detail: `赛事参赛记录 ${team.id.slice(0, 8)}`,
        })),
      };
    };
    const clauses = context.message
      .split(/[，,；;。\n]/)
      .map((text) => text.trim())
      .filter(Boolean);
    if (
      changes.length === 1 &&
      changes[0]?.kind === 'TEAM_WINDOW' &&
      uniqueIds(
        teams
          .filter((team) => team.name && context.message.includes(team.name))
          .map((team) => team.name),
      ).length > 1
    )
      return answer(
        'CLARIFY',
        '本轮提到了多支球队，但只识别出一项要求；请分别说明每支球队的时段，避免遗漏。',
      );
    for (const change of changes.filter(
      (item) => !wholeRequest || !['DATE_RANGE', 'FORMAT'].includes(item.kind),
    )) {
      let sourceText = context.message;
      if (
        changes.length > 1 &&
        change.kind !== 'FORMAT' &&
        change.kind !== 'DAYPART_CAPACITY'
      ) {
        const candidates = clauses.filter((part) => {
          if (change.kind === 'DATE_RANGE')
            return parseUserDates(part).length === 2;
          const named = change.teamName?.replace(
            /^(?:希望|请让|尽量|让|与|和|把)/,
            '',
          );
          return (
            !!named &&
            part.includes(named) &&
            (change.kind !== 'TEAM_WINDOW' ||
              /(?:周[一二三四五六日天]|\d{4}[-年]|只能|不能|不可|可用|取消)/.test(
                part,
              ))
          );
        });
        if (candidates.length !== 1)
          return answer(
            'CLARIFY',
            '本轮包含多项要求，但无法逐条确认原话对应的球队或日期；请拆成独立消息说明。',
          );
        sourceText = candidates[0]!;
      }
      const dates = parseUserDates(sourceText);
      if (change.kind === 'DATE_RANGE') {
        if (change.operation === 'REMOVE') {
          conditions = conditions.filter((item) => item.kind !== 'DATE_RANGE');
          continue;
        }
        const previousPeriod = periodOf(conditions);
        const derivedEnd =
          dates.length === 1 &&
          previousPeriod?.scheduleGoal &&
          previousPeriod.durationDays
            ? endAfterDays(dates[0]!, previousPeriod.durationDays)
            : undefined;
        const from = dates[0];
        const to = dates[1] ?? derivedEnd;
        if (!from || !to || !periodDates(from, to))
          return answer(
            'CLARIFY',
            '请明确包含年份的起止日期，且开始不晚于结束；单次需求单日期范围不超过 31 天。',
          );
        conditions = conditions.filter((item) => item.kind !== 'DATE_RANGE');
        conditions.unshift(
          newCondition({
            kind: 'DATE_RANGE',
            eventId: chosenId,
            priority: 'MUST',
            from,
            to,
            ...(previousPeriod?.scheduleGoal ? { scheduleGoal: true } : {}),
            ...(derivedEnd && previousPeriod?.durationDays
              ? { durationDays: previousPeriod.durationDays }
              : {}),
            dateSource: 'USER',
            sourceTurnIds: previousPeriod?.scheduleGoal
              ? uniqueIds([...previousPeriod.sourceTurnIds, sourceTurnId])
              : [sourceTurnId],
          }),
        );
        continue;
      }
      if (change.kind === 'FORMAT') {
        if (change.operation === 'REMOVE') {
          conditions = conditions.filter((item) => item.kind !== 'FORMAT');
          continue;
        }
        if (change.format !== 'ROUND_ROBIN')
          return answer(
            'CLARIFY',
            '请明确是否采用单循环：每两支参赛球队各交手一次。',
          );
        conditions = conditions.filter((item) => item.kind !== 'FORMAT');
        conditions.push(
          newCondition({
            kind: 'FORMAT',
            eventId: chosenId,
            priority: 'MUST',
            format: 'ROUND_ROBIN',
            sourceTurnIds: [sourceTurnId],
          }),
        );
        continue;
      }
      if (change.kind === 'DAYPART_CAPACITY') {
        if (!change.daypart)
          return answer(
            'CLARIFY',
            '请明确要修改上午、下午还是晚上的场数要求。',
          );
        const previous = conditions.find(
          (item) =>
            item.kind === 'DAYPART_CAPACITY' && item.daypart === change.daypart,
        );
        conditions = conditions.filter(
          (item) =>
            !(
              item.kind === 'DAYPART_CAPACITY' &&
              item.daypart === change.daypart
            ),
        );
        if (change.operation === 'REMOVE') continue;
        const startTime = change.startTime ?? previous?.startTime;
        const endTime = change.endTime ?? previous?.endTime;
        const maxMatchesPerDay =
          change.maxMatchesPerDay ?? previous?.maxMatchesPerDay;
        const capacityScope = change.capacityScope ?? previous?.capacityScope;
        if (startTime && endTime && startTime >= endTime)
          return answer('CLARIFY', '时段的结束时间必须晚于开始时间。');
        conditions.push(
          newCondition({
            kind: 'DAYPART_CAPACITY',
            eventId: chosenId,
            priority: 'MUST',
            daypart: change.daypart,
            ...(startTime ? { startTime } : {}),
            ...(endTime ? { endTime } : {}),
            ...(maxMatchesPerDay !== undefined ? { maxMatchesPerDay } : {}),
            ...(capacityScope ? { capacityScope } : {}),
            sourceTurnIds: uniqueIds([
              ...(previous?.sourceTurnIds ?? []),
              sourceTurnId,
            ]),
          }),
        );
        continue;
      }
      if (change.kind === 'TEAM_WINDOW') {
        const existing = conditions.filter(
          (item) => item.kind === 'TEAM_WINDOW',
        );
        const pending = unresolved.filter(
          (item) => item.change.kind === 'TEAM_WINDOW',
        );
        const impliedId =
          !change.teamName &&
          !literalParticipantId(change.teamId, context.message) &&
          existing.length + pending.length === 1
            ? (existing[0]?.teamId ?? pending[0]?.teamId)
            : undefined;
        const removable =
          change.operation === 'REMOVE'
            ? uniqueIds(
                [
                  ...existing.map((item) => item.teamId),
                  ...pending.map((item) => item.teamId),
                ].filter((id): id is string => !!id),
              )
                .map((id) => ({
                  id,
                  name:
                    existing.find((item) => item.teamId === id)?.teamLabel ??
                    pending.find((item) => item.teamId === id)?.teamLabel ??
                    '',
                }))
                .filter((item) =>
                  context.teamId
                    ? item.id === context.teamId
                    : !!item.name && sourceText.includes(item.name),
                )
            : [];
        if (removable.length > 1)
          return answer(
            'NEED_TEAM',
            '同名条件有多条，请选择要撤销的赛事参赛记录。',
            removable.map((item) => ({
              id: item.id,
              label: item.name,
              detail: `参赛记录 ${item.id.slice(0, 8)}`,
            })),
          );
        const selected =
          removable.length === 1
            ? { team: removable[0] }
            : impliedId
              ? { team: teams.find((item) => item.id === impliedId) }
              : resolveTeam(change.teamName, change.teamId, change.kind);
        if (!selected.team)
          return answer(
            selected.candidates ? 'NEED_TEAM' : 'CLARIFY',
            selected.message ?? '请明确参赛球队。',
            selected.candidates,
          );
        const team = selected.team;
        if (change.operation === 'REMOVE') {
          conditions = conditions.filter(
            (item) => !(item.kind === 'TEAM_WINDOW' && item.teamId === team.id),
          );
          unresolved = unresolved.filter((item) => item.teamId !== team.id);
          continue;
        }
        const weekdays = uniqueIds(weekdaysIn(sourceText).map(String)).map(
          Number,
        );
        const providedDates = dates;
        if (!weekdays.length && !providedDates.length)
          return answer(
            'CLARIFY',
            '请明确球队要求适用的星期或包含年份的日期，不会猜测时间。',
          );
        if (
          (change.startTime && !sourceText.includes(change.startTime)) ||
          (change.endTime && !sourceText.includes(change.endTime))
        )
          return answer(
            'CLARIFY',
            '模型提出的起止时刻与本轮原话不符；请明确写出 HH:mm—HH:mm。',
          );
        if (
          !!change.startTime !== !!change.endTime ||
          (change.startTime &&
            change.endTime &&
            (change.startTime >= change.endTime || change.endTime === '00:00'))
        )
          return answer(
            'CLARIFY',
            '请提供明确且有效的开始和结束时间；不写入含糊时段。',
          );
        const old = [
          ...existing,
          ...pending.map(
            (item) =>
              ({
                ...item,
                teamId: item.teamId,
              }) as unknown as PlanningCondition,
          ),
        ].find((item) => item.teamId === team.id);
        const priority =
          /(?:必须|只能|不可|不能|禁止|绝对|尽量|优先|希望|最好)/.test(
            sourceText,
          )
            ? /(?:尽量|优先|希望|最好)/.test(sourceText)
              ? 'PREFER'
              : 'MUST'
            : (old?.priority ?? change.priority ?? 'MUST');
        const availability = /(?:只能|仅能|只在)/.test(sourceText)
          ? 'ONLY'
          : /(?:不安排|不可|不能|不在)/.test(sourceText)
            ? 'BLOCK'
            : /(?:可用|可以)/.test(sourceText)
              ? 'AVAILABLE'
              : (old?.availability ?? change.availability);
        if (!availability)
          return answer(
            'CLARIFY',
            '请说明球队是可用、只能在指定时段安排，还是不可用。',
          );
        if (
          !change.startTime &&
          !change.endTime &&
          /(?:上午|下午|早上|晚上|\d+点)/.test(sourceText)
        )
          return answer(
            'CLARIFY',
            '时段缺少明确的起止时刻，请补全；仅说星期时按全天记录。',
          );
        const replaceAll =
          change.operation === 'REPLACE' &&
          existing.filter((item) => item.teamId === team.id).length +
            pending.filter((item) => item.teamId === team.id).length <=
            1;
        const same = (item: { teamId?: string; availability?: string }) =>
          item.teamId === team.id &&
          (replaceAll || item.availability === availability);
        const previous = conditions.find(
          (item) => item.kind === 'TEAM_WINDOW' && same(item),
        );
        if (
          change.operation === 'REPLACE' &&
          !replaceAll &&
          !/只能|仅能|只在|不安排|不可|不能|不在|可用/.test(sourceText)
        )
          return answer(
            'CLARIFY',
            '该球队有多条时间要求；请说明要修改哪一条及其可用或不可用类别。',
          );
        conditions = conditions.filter(
          (item) => !(item.kind === 'TEAM_WINDOW' && same(item)),
        );
        unresolved = unresolved.filter(
          (item) =>
            !same({
              teamId: item.teamId,
              availability: item.change.availability,
            }),
        );
        const expanded = expandDays(
          periodOf(conditions),
          weekdays,
          providedDates,
        );
        if (!expanded) {
          if (periodOf(conditions))
            return answer(
              'CLARIFY',
              '所述日期不属于当前赛事日期范围，请先修订赛事日期或球队条件。',
            );
          if (
            providedDates.length &&
            !providedDates.every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))
          )
            return answer('CLARIFY', '日期格式无效，请提供完整的年份与日期。');
          unresolved.push({
            change: {
              ...change,
              weekdays,
              dates: providedDates,
              availability,
              priority,
            },
            teamId: team.id,
            teamLabel: team.name,
            sourceTurnIds: [sourceTurnId],
          });
          continue;
        }
        if (!expanded.length)
          return answer(
            'CLARIFY',
            '所选星期不在赛事日期范围内，请明确日期，不能推测其它周。',
          );
        const sameTime =
          previous &&
          (previous.startTime ?? '00:00') === (change.startTime ?? '00:00') &&
          (previous.endTime ?? '24:00') === (change.endTime ?? '24:00') &&
          previous.availability === availability;
        conditions.push(
          newCondition({
            kind: 'TEAM_WINDOW',
            eventId: chosenId,
            priority,
            teamId: team.id,
            teamLabel: team.name,
            dates:
              change.operation === 'ADD' && sameTime
                ? uniqueIds([...(previous.dates ?? []), ...expanded]).sort()
                : expanded,
            weekdays:
              change.operation === 'ADD' && sameTime
                ? uniqueIds(
                    [...(previous.weekdays ?? []), ...weekdays].map(String),
                  )
                    .map(Number)
                    .sort()
                : weekdays,
            availability,
            startTime: change.startTime ?? '00:00',
            endTime: change.endTime ?? '24:00',
            sourceTurnIds:
              change.operation === 'ADD' && sameTime
                ? uniqueIds([...previous.sourceTurnIds, sourceTurnId])
                : [sourceTurnId],
          }),
        );
        continue;
      }
      if (change.kind === 'MATCHUP') {
        if (
          !/(?:对阵|交手|相遇|碰面)/.test(sourceText) &&
          change.operation !== 'REMOVE'
        )
          return answer(
            'CLARIFY',
            '请明确具体两支球队和希望相遇或尽量避免相遇的含义。',
          );
        const matchup = /(?:避免|不要|不想)/.test(sourceText)
          ? 'AVOID'
          : /(?:希望|倾向|尽量)/.test(sourceText)
            ? 'PREFER'
            : undefined;
        if (!matchup && change.operation !== 'REMOVE')
          return answer(
            'CLARIFY',
            '“优先对阵”含义不明确：是希望两队交手，还是尽量避免交手？不会擅自增加比赛或改变赛制。',
          );
        if (/(?:必须|务必)/.test(sourceText) && change.operation !== 'REMOVE')
          return answer(
            'CLARIFY',
            '不能承诺新增两队比赛；可明确记录“尽量相遇”或“尽量避免”的偏好。',
          );
        const literalTeams = teams.filter(
          (team) => team.name && sourceText.includes(team.name),
        );
        const uniquePair =
          !change.teamName &&
          !change.opponentName &&
          !literalParticipantId(change.teamId, sourceText) &&
          !literalParticipantId(change.opponentId, sourceText) &&
          literalTeams.length === 2 &&
          literalTeams[0]!.name !== literalTeams[1]!.name;
        const first = uniquePair
          ? { team: literalTeams[0] }
          : resolveTeam(change.teamName, change.teamId, change.kind);
        if (!first.team)
          return answer(
            first.candidates ? 'NEED_TEAM' : 'CLARIFY',
            first.message ?? '请明确第一支参赛球队。',
            first.candidates,
          );
        const second = uniquePair
          ? { team: literalTeams[1] }
          : resolveTeam(
              change.opponentName,
              change.opponentId,
              change.kind,
              true,
            );
        if (!second.team)
          return answer(
            second.candidates ? 'NEED_TEAM' : 'CLARIFY',
            second.message ?? '请明确第二支参赛球队。',
            second.candidates,
          );
        if (first.team.id === second.team.id)
          return answer('CLARIFY', '两支对阵球队不能是同一参赛记录。');
        const pair = [first.team.id, second.team.id].sort().join(':');
        if (change.operation === 'REMOVE') {
          conditions = conditions.filter(
            (item) =>
              !(
                item.kind === 'MATCHUP' &&
                [item.teamId, item.opponentId].sort().join(':') === pair
              ),
          );
          continue;
        }
        conditions = conditions.filter(
          (item) =>
            !(
              item.kind === 'MATCHUP' &&
              item.matchup === matchup &&
              [item.teamId, item.opponentId].sort().join(':') === pair
            ),
        );
        conditions.push(
          newCondition({
            kind: 'MATCHUP',
            eventId: chosenId,
            priority: 'PREFER',
            teamId: first.team.id,
            teamLabel: first.team.name,
            opponentId: second.team.id,
            opponentLabel: second.team.name,
            matchup: matchup!,
            sourceTurnIds: [sourceTurnId],
          }),
        );
      }
    }
    // A newly specified period resolves pending weekday statements without
    // treating them as permanent team profile facts.
    const period = periodOf(conditions);
    if (period) {
      const remaining: UnresolvedPlanningChange[] = [];
      for (const item of unresolved) {
        const expanded = expandDays(
          period,
          item.change.weekdays ?? [],
          item.change.dates ?? [],
        );
        if (!expanded?.length) {
          remaining.push(item);
          continue;
        }
        conditions = conditions.filter(
          (entry) =>
            !(
              entry.kind === 'TEAM_WINDOW' &&
              entry.teamId === item.teamId &&
              entry.availability === item.change.availability
            ),
        );
        conditions.push(
          newCondition({
            kind: 'TEAM_WINDOW',
            eventId: chosenId,
            priority: item.change.priority ?? 'MUST',
            teamId: item.teamId,
            teamLabel: item.teamLabel,
            availability: item.change.availability,
            dates: expanded,
            weekdays: item.change.weekdays,
            startTime: item.change.startTime ?? '00:00',
            endTime: item.change.endTime ?? '24:00',
            sourceTurnIds: uniqueIds([...item.sourceTurnIds, sourceTurnId]),
          }),
        );
      }
      unresolved = remaining;
    }
    const substantiveChange =
      JSON.stringify(conditions) !==
        JSON.stringify(row ? conditionsOf(row) : []) ||
      JSON.stringify(unresolved) !==
        JSON.stringify(row ? unresolvedOf(row) : []);
    if (
      !row &&
      !changes.length &&
      !wholeRequest &&
      !/(?:收集|记录|建立|创建|开始).*(?:排程需求|排程要求|约束)/.test(
        context.message,
      )
    )
      return answer(
        'CLARIFY',
        '请明确是否要开始为某赛事收集排程需求；普通讨论不会建立需求单。',
      );
    if (row && !substantiveChange)
      return {
        status: 'CLARIFY',
        message:
          planningPending(conditions, unresolved)[0] ??
          '这轮没有新增或修改需求条件；请说明要调整的具体条件。',
        candidates: [],
        planning: await this.view(tx, actor, row),
      };
    if (conditions.length > 30 || unresolved.length > 10)
      return answer(
        'CLARIFY',
        '本次需求条目过多，请分批整理；未保存本轮变更。',
      );
    conditions = conditions.map((condition) => ({
      ...condition,
      confirmation: 'PENDING',
    }));
    const pending = planningPending(conditions, unresolved);
    let saved: Request;
    if (row) {
      const changed = await tx.agentPlanningRequest.updateMany({
        where: { id: row.id, revision: row.revision },
        data: {
          revision: { increment: 1 },
          status: 'COLLECTING',
          confirmedRevision: null,
          conditions: json(conditions),
          unresolved: json(unresolved),
          pending: json(pending),
          updatedAt: new Date(),
        },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          'Planning request changed; refresh before editing',
        );
      saved = await tx.agentPlanningRequest.findUniqueOrThrow({
        where: { id: row.id },
      });
    } else {
      saved = await tx.agentPlanningRequest.create({
        data: {
          id: randomUUID(),
          sessionId: context.sessionId,
          ownerId: actor.id,
          eventId: chosenId,
          conditions: json(conditions),
          unresolved: json(unresolved),
          pending: json(pending),
        },
      });
    }
    const view = await this.view(tx, actor, saved);
    return {
      status: 'PLAN',
      message: `已记录赛事「${event.name}」的排程需求单 V${view.revision}（${view.status === 'CONFIRMED' ? '已确认' : '待确认'}）。${view.summary}。${view.pending.length ? `待补：${view.pending.join('；')}。` : '待您点击“确认需求”后才算确认。'}${view.issues.length ? `可确定的矛盾：${view.issues.join('；')}。` : '暂未发现上述条件之间的明显矛盾；这不保证一定能排出来。'}本阶段不生成或覆盖赛程。`,
      candidates: [],
      planning: view,
    };
  }
}
