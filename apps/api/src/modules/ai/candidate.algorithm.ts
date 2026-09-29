import { randomUUID } from 'node:crypto';
import type {
  ScheduleConfigDto,
  ScheduleIssueDto,
  ScheduleMatchDto,
} from '../scheduling/scheduling.dto.js';
import {
  roundRobinByDivision,
  scheduleSlots,
  validateSchedule,
  type ScheduleTeam,
} from '../scheduling/scheduling.algorithm.js';
import { periodDates, type PlanningCondition } from './planning.js';

type Team = ScheduleTeam;
type Slot = { time: number; startAt: string; venue: string };
type Outcome = 'FOUND' | 'PROVEN_CONFLICT' | 'SEARCH_LIMIT';
export type PreferenceReport = {
  conditionId: string;
  status: 'SATISFIED' | 'UNMET' | 'NOT_APPLICABLE';
  reason: string;
};
export type CandidateCalculation = {
  outcome: Outcome;
  matches: ScheduleMatchDto[];
  issues: ScheduleIssueDto[];
  preferences: PreferenceReport[];
  explored: number;
};
const duration = (config: ScheduleConfigDto) => config.durationMinutes * 60000;
const dayOf = (slot: Slot) =>
  new Date(slot.time + 8 * 3600000).toISOString().slice(0, 10);
const mins = (clock: string) =>
  clock === '24:00'
    ? 1440
    : Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
const minuteOf = (slot: Slot) => {
  const time = new Date(slot.time + 8 * 3600000).toISOString().slice(11, 16);
  return mins(time);
};
const capacityConditions = (conditions: PlanningCondition[]) =>
  conditions.filter(
    (item) => item.kind === 'DAYPART_CAPACITY' && item.priority === 'MUST',
  );
const dailyCount = (conditions: PlanningCondition[]) =>
  conditions.find(
    (item) => item.kind === 'DAILY_COUNT' && item.priority === 'MUST',
  );
const completeDayparts = (conditions: PlanningCondition[]) =>
  new Set(capacityConditions(conditions).map((item) => item.daypart)).size ===
  3;
function inDaypart(
  slot: Slot,
  config: ScheduleConfigDto,
  condition: PlanningCondition,
) {
  const start = minuteOf(slot);
  return (
    !!condition.startTime &&
    !!condition.endTime &&
    start >= mins(condition.startTime) &&
    start + config.durationMinutes <= mins(condition.endTime)
  );
}
function capacityAllowed(
  slot: Slot,
  config: ScheduleConfigDto,
  conditions: PlanningCondition[],
  used: ScheduleMatchDto[],
) {
  const capacities = capacityConditions(conditions);
  const daily = dailyCount(conditions);
  if (daily) {
    if (daily.maxMatchesPerDay === undefined || !daily.capacityScope)
      return false;
    const day = dayOf(slot);
    const count = used.filter(
      (match) =>
        !!match.startAt &&
        dayOf({
          time: Date.parse(match.startAt),
          startAt: match.startAt,
          venue: match.venue,
        }) === day &&
        (daily.capacityScope === 'EVENT' || match.venue === slot.venue),
    ).length;
    if (count >= daily.maxMatchesPerDay) return false;
  }
  // A complete three-part daily plan cannot spill matches into gaps between
  // its windows. A partial limit constrains its named window only.
  if (
    completeDayparts(conditions) &&
    !capacities.some((item) => inDaypart(slot, config, item))
  )
    return false;
  return capacities.every((condition) => {
    if (
      condition.startTime &&
      condition.endTime &&
      minuteOf(slot) < mins(condition.endTime) &&
      minuteOf(slot) + config.durationMinutes > mins(condition.startTime) &&
      !inDaypart(slot, config, condition)
    )
      return false;
    if (!inDaypart(slot, config, condition)) return true;
    if (condition.maxMatchesPerDay === undefined || !condition.capacityScope)
      return false;
    const day = dayOf(slot);
    const count = used.filter((match) => {
      if (!match.startAt) return false;
      const other = {
        time: Date.parse(match.startAt),
        startAt: match.startAt,
        venue: match.venue,
      };
      return (
        dayOf(other) === day &&
        (condition.capacityScope === 'EVENT' || match.venue === slot.venue) &&
        inDaypart(other, config, condition)
      );
    }).length;
    return count < condition.maxMatchesPerDay;
  });
}
function exactCountIssues(
  config: ScheduleConfigDto,
  matches: ScheduleMatchDto[],
  conditions: PlanningCondition[],
): ScheduleIssueDto[] {
  const exact = conditions.filter(
    (item) =>
      (item.kind === 'DAYPART_CAPACITY' || item.kind === 'DAILY_COUNT') &&
      item.priority === 'MUST' &&
      item.countMode === 'EXACT',
  );
  if (!exact.length) return [];
  const dates = periodDates(config.startDate, config.endDate) ?? [];
  const issues: ScheduleIssueDto[] = [];
  for (const condition of exact) {
    for (const date of dates) {
      const venues =
        condition.capacityScope === 'VENUE' ? config.venues : [null];
      for (const venue of venues) {
        const count = matches.filter((match) => {
          if (!match.startAt || (venue && match.venue !== venue)) return false;
          const slot = {
            time: Date.parse(match.startAt),
            startAt: match.startAt,
            venue: match.venue,
          };
          return (
            dayOf(slot) === date &&
            (condition.kind === 'DAILY_COUNT' ||
              inDaypart(slot, config, condition))
          );
        }).length;
        if (count !== condition.maxMatchesPerDay)
          issues.push({
            code: 'DAILY_EXACT_COUNT',
            message: `${date}${venue ? ` ${venue}` : ''}${condition.kind === 'DAILY_COUNT' ? '全天' : `${condition.daypart === 'MORNING' ? '上午' : condition.daypart === 'AFTERNOON' ? '下午' : '晚上'}`}要求恰好 ${condition.maxMatchesPerDay} 场，当前为 ${count} 场。`,
            matchIds: [],
          });
      }
    }
  }
  return issues;
}
function windowContains(
  slot: Slot,
  config: ScheduleConfigDto,
  condition: PlanningCondition,
) {
  const start = minuteOf(slot);
  return (
    !!condition.dates?.includes(dayOf(slot)) &&
    start >= mins(condition.startTime ?? '00:00') &&
    start + config.durationMinutes <= mins(condition.endTime ?? '24:00')
  );
}
function windowOverlaps(
  slot: Slot,
  config: ScheduleConfigDto,
  condition: PlanningCondition,
) {
  const start = minuteOf(slot);
  return (
    !!condition.dates?.includes(dayOf(slot)) &&
    start < mins(condition.endTime ?? '24:00') &&
    start + config.durationMinutes > mins(condition.startTime ?? '00:00')
  );
}
function relates(match: ScheduleMatchDto, condition: PlanningCondition) {
  return (
    match.homeEventTeamId === condition.teamId ||
    match.awayEventTeamId === condition.teamId
  );
}
function hardAllowed(
  match: ScheduleMatchDto,
  slot: Slot,
  config: ScheduleConfigDto,
  conditions: PlanningCondition[],
) {
  return conditions.every(
    (condition) =>
      !relates(match, condition) ||
      condition.kind !== 'TEAM_WINDOW' ||
      condition.priority !== 'MUST' ||
      ((condition.availability !== 'ONLY' ||
        windowContains(slot, config, condition)) &&
        (condition.availability !== 'BLOCK' ||
          !windowOverlaps(slot, config, condition))),
  );
}
function preferenceReports(
  matches: ScheduleMatchDto[],
  config: ScheduleConfigDto,
  conditions: PlanningCondition[],
): PreferenceReport[] {
  return conditions
    .filter((condition) => condition.priority === 'PREFER')
    .map((condition) => {
      if (condition.kind !== 'TEAM_WINDOW')
        return {
          conditionId: condition.id,
          status: 'NOT_APPLICABLE',
          reason:
            '单循环中的每对球队本来就交手一次；未指定提前的日期或轮次，不能计算额外收益。',
        };
      const relevant = matches.filter((match) => relates(match, condition));
      if (!relevant.length || relevant.some((match) => !match.startAt))
        return {
          conditionId: condition.id,
          status: 'NOT_APPLICABLE',
          reason: '尚未找到完整候选，不能判断该偏好。',
        };
      const satisfied = relevant.every((match) => {
        const slot = {
          startAt: match.startAt,
          time: Date.parse(match.startAt),
          venue: match.venue,
        };
        return condition.availability === 'BLOCK'
          ? !windowOverlaps(slot, config, condition)
          : windowContains(slot, config, condition);
      });
      return {
        conditionId: condition.id,
        status: satisfied ? 'SATISFIED' : 'UNMET',
        reason: satisfied
          ? '相关场次均符合所述时段。'
          : '至少一场相关比赛未能放入偏好时段；时间/场地/休息与其它必须条件优先，当前搜索不保证全局偏好最优。',
      };
    });
}
// Independent of the search: recompute all feasibility and format invariants from the returned matches.
export function auditCandidate(
  config: ScheduleConfigDto,
  teams: Team[],
  matches: ScheduleMatchDto[],
  conditions: PlanningCondition[],
  fixed: ScheduleMatchDto[],
): ScheduleIssueDto[] {
  const issues = [...validateSchedule(config, matches, teams)];
  const issue = (code: string, message: string, matchIds: string[]) =>
    issues.push({ code, message, matchIds });
  const pair = (match: ScheduleMatchDto) =>
    [match.homeEventTeamId, match.awayEventTeamId].sort().join(':');
  const selected = config.teamIds.map((id) =>
    teams.find((team) => team.id === id),
  );
  const divisionCounts = new Map<string, number>();
  for (const team of selected) {
    if (!team?.divisionId) continue;
    divisionCounts.set(
      team.divisionId,
      (divisionCounts.get(team.divisionId) ?? 0) + 1,
    );
  }
  const expected = [...divisionCounts.values()].reduce(
    (count, size) => count + (size * (size - 1)) / 2,
    0,
  );
  const pairs = new Set<string>();
  if (new Set(matches.map((match) => match.order)).size !== matches.length)
    issue(
      'FORMAT_ORDER',
      '候选场次顺序重复，请核对固定范围和当前参赛记录。',
      [],
    );
  if (matches.length !== expected)
    issue('FORMAT_COUNT', '单循环场次数量不完整。', []);
  for (const match of matches) {
    if (
      !config.teamIds.includes(match.homeEventTeamId) ||
      !config.teamIds.includes(match.awayEventTeamId) ||
      match.homeEventTeamId === match.awayEventTeamId ||
      pairs.has(pair(match))
    )
      issue('FORMAT_PAIR', '参赛记录/对阵重复或非法。', [match.id]);
    pairs.add(pair(match));
    if (match.startAt) {
      const slot = {
        time: Date.parse(match.startAt),
        startAt: match.startAt,
        venue: match.venue,
      };
      if (!hardAllowed(match, slot, config, conditions))
        issue('HARD_WINDOW', '场次违反必须满足的球队时段。', [match.id]);
    }
  }
  const capacityMatches: ScheduleMatchDto[] = [];
  for (const match of matches.filter((item) => item.startAt)) {
    const slot = {
      time: Date.parse(match.startAt),
      startAt: match.startAt,
      venue: match.venue,
    };
    if (!capacityAllowed(slot, config, conditions, capacityMatches))
      issue(
        'DAYPART_CAPACITY',
        '场次超出每日分时段场数上限，或落在完整分时段计划之外。',
        [match.id],
      );
    capacityMatches.push(match);
  }
  issues.push(...exactCountIssues(config, matches, conditions));
  for (let i = 0; i < matches.length; i++)
    for (const other of matches.slice(i + 1)) {
      const match = matches[i]!;
      if (
        match.startAt &&
        other.startAt &&
        match.venue === other.venue &&
        Math.abs(Date.parse(match.startAt) - Date.parse(other.startAt)) <
          (config.durationMinutes + config.bufferMinutes) * 60000
      )
        issue('VENUE_BUFFER', '同一场地比赛间隔不足。', [match.id, other.id]);
    }
  for (const match of fixed) {
    const found = matches.find((item) => pair(item) === pair(match));
    if (
      !found ||
      found.id !== match.id ||
      found.startAt !== match.startAt ||
      found.venue !== match.venue ||
      found.round !== match.round ||
      found.order !== match.order ||
      (found.divisionId ?? null) !== (match.divisionId ?? null) ||
      (found.divisionLabel ?? '') !== (match.divisionLabel ?? '')
    )
      issue('FIXED_MATCH', '受保护场次被调整。', [match.id]);
  }
  return issues;
}

export function calculateCandidate(
  config: ScheduleConfigDto,
  teams: Team[],
  conditions: PlanningCondition[],
  baseline: ScheduleMatchDto[],
  fixedMatchIds: string[],
  scope?: {
    targetDivisionIds: string[];
    preservedMatches: ScheduleMatchDto[];
  },
): CandidateCalculation {
  const teamMap = new Map(teams.map((team) => [team.id, team]));
  const targets = scope ? new Set(scope.targetDivisionIds) : null;
  const preserved =
    scope?.preservedMatches.map((match) => ({ ...match })) ?? [];
  const generated = roundRobinByDivision(
    config.teamIds
      .map((id) => teamMap.get(id)!)
      .filter((team) => !targets || targets.has(team.divisionId!)),
    randomUUID,
  );
  const matches = [...preserved, ...generated];
  const prior = new Map(
    baseline.map((match) => [
      [match.homeEventTeamId, match.awayEventTeamId].sort().join(':'),
      match,
    ]),
  );
  const fixed = baseline.filter((match) => fixedMatchIds.includes(match.id));
  for (const match of generated) {
    const before = prior.get(
      [match.homeEventTeamId, match.awayEventTeamId].sort().join(':'),
    );
    if (before) match.id = before.id;
    if (before && fixedMatchIds.includes(before.id)) {
      match.startAt = before.startAt;
      match.venue = before.venue;
      match.round = before.round;
      match.order = before.order;
    }
  }
  if (scope) {
    // Other divisions keep their complete baseline rows. Reuse a target pair's
    // prior order where possible, then fill only unoccupied event-wide orders.
    const occupied = new Set(preserved.map((match) => match.order));
    for (const match of generated.filter((item) =>
      fixedMatchIds.includes(item.id),
    ))
      occupied.add(match.order);
    for (const match of generated.filter(
      (item) => !fixedMatchIds.includes(item.id),
    )) {
      const previous = prior.get(
        [match.homeEventTeamId, match.awayEventTeamId].sort().join(':'),
      );
      if (previous?.order && !occupied.has(previous.order)) {
        match.order = previous.order;
      } else {
        let order = 1;
        while (occupied.has(order)) order += 1;
        match.order = order;
      }
      occupied.add(match.order);
    }
  }
  const available = scheduleSlots(config).filter((slot) =>
    capacityAllowed(slot, config, conditions, []),
  );
  const empty = (
    outcome: Outcome,
    issues: ScheduleIssueDto[],
    explored: number,
  ): CandidateCalculation => ({
    outcome,
    matches: [],
    issues,
    preferences: preferenceReports([], config, conditions),
    explored,
  });
  if (available.length > 3000 || matches.length > 66)
    return empty(
      'SEARCH_LIMIT',
      [
        {
          code: 'SEARCH_LIMIT',
          message: '当前时隙/场次数量超出本版计算限额；不能据此宣称无解。',
          matchIds: [],
        },
      ],
      0,
    );
  const exactDayparts = capacityConditions(conditions).filter(
    (item) => item.countMode === 'EXACT',
  );
  const exactDaily = dailyCount(conditions);
  const days = periodDates(config.startDate, config.endDate)?.length ?? 0;
  const countAcrossEvent = (item: PlanningCondition) =>
    (item.maxMatchesPerDay ?? 0) *
    (item.capacityScope === 'VENUE' ? config.venues.length : 1);
  const exactDaypartsPerDay = exactDayparts.reduce(
    (sum, item) => sum + countAcrossEvent(item),
    0,
  );
  const dailyLimit = exactDaily && countAcrossEvent(exactDaily);
  const completeDaypartLimit = completeDayparts(conditions)
    ? capacityConditions(conditions).reduce(
        (sum, item) => sum + countAcrossEvent(item),
        0,
      )
    : null;
  if (
    exactDaily &&
    dailyLimit !== undefined &&
    (exactDaypartsPerDay > dailyLimit ||
      (exactDaily.countMode === 'EXACT' &&
        completeDaypartLimit !== null &&
        dailyLimit > completeDaypartLimit))
  )
    return empty(
      'PROVEN_CONFLICT',
      [
        {
          code: 'DAILY_EXACT_COUNT',
          message: '每日总场数与分时段场数相互冲突，条件必然无法同时满足。',
          matchIds: [],
        },
      ],
      0,
    );
  const requiredDaypartMatches = days * exactDaypartsPerDay;
  const requiredDailyMatches =
    exactDaily?.countMode === 'EXACT' ? days * countAcrossEvent(exactDaily) : 0;
  if (
    requiredDaypartMatches > matches.length ||
    requiredDailyMatches > matches.length
  )
    return empty(
      'PROVEN_CONFLICT',
      [
        {
          code: 'DAILY_EXACT_COUNT',
          message:
            '逐日必须安排的场数超过所选组别单循环的总场次，条件必然冲突。',
          matchIds: [],
        },
      ],
      0,
    );
  if (available.length < matches.length)
    return empty(
      'PROVEN_CONFLICT',
      [
        {
          code: 'SLOT_CAPACITY',
          message: '总可用场地时隙少于单循环必需场次，条件必然冲突。',
          matchIds: [],
        },
      ],
      0,
    );
  for (const match of matches) {
    if (!available.some((slot) => hardAllowed(match, slot, config, conditions)))
      return empty(
        'PROVEN_CONFLICT',
        [
          {
            code: 'HARD_WINDOW',
            message:
              '至少一组必需对阵在当前时间/场地中没有任何符合球队硬条件的时隙。',
            matchIds: [match.id],
          },
        ],
        0,
      );
  }
  if (fixed.length) {
    // Invalid fixed positions cannot be moved. Only the pre-existing fixed subset is audited here.
    const issues = auditCandidate(
      config,
      teams,
      fixed,
      conditions,
      fixed,
    ).filter(
      (issue) =>
        issue.code !== 'FORMAT_COUNT' && issue.code !== 'DAILY_EXACT_COUNT',
    );
    if (issues.length) return empty('PROVEN_CONFLICT', issues, 0);
  }
  const ordered = [...generated].sort(
    (a, b) =>
      Number(!!b.startAt) - Number(!!a.startAt) ||
      a.round - b.round ||
      a.order - b.order,
  );
  const used: ScheduleMatchDto[] = [...preserved];
  let explored = 0;
  let limited = false;
  const deadline = Date.now() + 1500;
  const fits = (match: ScheduleMatchDto, slot: Slot) => {
    if (!hardAllowed(match, slot, config, conditions)) return false;
    if (!capacityAllowed(slot, config, conditions, used)) return false;
    const rest = config.minRestMinutes * 60000;
    const end = slot.time + duration(config);
    return used.every((other) => {
      const start2 = Date.parse(other.startAt);
      const end2 = start2 + duration(config);
      const venueCollision =
        other.venue === slot.venue &&
        slot.time < end2 + config.bufferMinutes * 60000 &&
        start2 < end + config.bufferMinutes * 60000;
      const sameTeam = [match.homeEventTeamId, match.awayEventTeamId].some(
        (id) => id === other.homeEventTeamId || id === other.awayEventTeamId,
      );
      return (
        !venueCollision &&
        (!sameTeam || end + rest <= start2 || end2 + rest <= slot.time)
      );
    });
  };
  const search = (index: number): boolean => {
    if (++explored > 12000 || Date.now() >= deadline) {
      limited = true;
      return false;
    }
    if (index === ordered.length)
      return exactCountIssues(config, used, conditions).length === 0;
    const match = ordered[index]!;
    if (match.startAt) {
      const slot = {
        time: Date.parse(match.startAt),
        startAt: match.startAt,
        venue: match.venue,
      };
      if (!fits(match, slot)) return false;
      used.push(match);
      const solved = search(index + 1);
      used.pop();
      return solved;
    }
    const choices = available.filter((slot) => fits(match, slot));
    // Local preference ordering only; never relax hard constraints or claim global optimum.
    choices.sort((left, right) => {
      const score = (slot: Slot) =>
        conditions.filter(
          (condition) =>
            condition.kind === 'TEAM_WINDOW' &&
            condition.priority === 'PREFER' &&
            relates(match, condition) &&
            (condition.availability === 'BLOCK'
              ? !windowOverlaps(slot, config, condition)
              : windowContains(slot, config, condition)),
        ).length;
      return (
        score(right) - score(left) ||
        left.time - right.time ||
        left.venue.localeCompare(right.venue)
      );
    });
    for (const slot of choices) {
      match.startAt = slot.startAt;
      match.venue = slot.venue;
      used.push(match);
      if (search(index + 1)) return true;
      used.pop();
      match.startAt = '';
      match.venue = '';
      if (limited) break;
    }
    return false;
  };
  if (!search(0))
    return empty(
      'SEARCH_LIMIT',
      [
        {
          code: 'SEARCH_LIMIT',
          message: limited
            ? '达到本版搜索时间/节点限额，尚未找到方案；不能判断无解。'
            : '当前固定顺序搜索未找到方案，尚不能证明所有安排方式无解。',
          matchIds: [],
        },
      ],
      explored,
    );
  const issues = auditCandidate(config, teams, matches, conditions, fixed);
  if (issues.length)
    return empty(
      'SEARCH_LIMIT',
      [
        {
          code: 'VALIDATION_FAILED',
          message: '独立校验未通过；未返回不可靠候选。',
          matchIds: [],
        },
        ...issues,
      ],
      explored,
    );
  return {
    outcome: 'FOUND',
    matches,
    issues,
    preferences: preferenceReports(matches, config, conditions),
    explored,
  };
}
