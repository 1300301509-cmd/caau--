import { randomUUID } from 'node:crypto';
import type {
  ScheduleConfigDto,
  ScheduleIssueDto,
  ScheduleMatchDto,
} from '../scheduling/scheduling.dto.js';
import {
  roundRobin,
  scheduleSlots,
  validateSchedule,
} from '../scheduling/scheduling.algorithm.js';
import type { PlanningCondition } from './planning.js';

type Team = { id: string; name: string; active: boolean };
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
  const expected = (config.teamIds.length * (config.teamIds.length - 1)) / 2;
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
      found.order !== match.order
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
): CandidateCalculation {
  const teamMap = new Map(teams.map((team) => [team.id, team]));
  const matches = roundRobin(
    config.teamIds.map((id) => teamMap.get(id)!),
    randomUUID,
  );
  const prior = new Map(
    baseline.map((match) => [
      [match.homeEventTeamId, match.awayEventTeamId].sort().join(':'),
      match,
    ]),
  );
  const fixed = baseline.filter((match) => fixedMatchIds.includes(match.id));
  for (const match of matches) {
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
  const available = scheduleSlots(config);
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
    ).filter((issue) => issue.code !== 'FORMAT_COUNT');
    if (issues.length) return empty('PROVEN_CONFLICT', issues, 0);
  }
  const ordered = [...matches].sort(
    (a, b) =>
      Number(!!b.startAt) - Number(!!a.startAt) ||
      a.round - b.round ||
      a.order - b.order,
  );
  const used: ScheduleMatchDto[] = [];
  let explored = 0;
  let limited = false;
  const deadline = Date.now() + 1500;
  const fits = (match: ScheduleMatchDto, slot: Slot) => {
    if (!hardAllowed(match, slot, config, conditions)) return false;
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
    if (index === ordered.length) return true;
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
