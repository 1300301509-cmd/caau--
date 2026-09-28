import { BadRequestException } from '@nestjs/common';
import type {
  ScheduleConfigDto,
  ScheduleIssueDto,
  ScheduleMatchDto,
} from './scheduling.dto.js';

export type ScheduleTeam = {
  id: string;
  name: string;
  active: boolean;
  divisionId: string | null;
  divisionName?: string;
  divisionActive?: boolean;
};
type Team = ScheduleTeam;
type Slot = { startAt: string; venue: string; time: number };
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const day = 24 * 60 * 60 * 1000;
const minutes = (value: number) => value * 60 * 1000;
const instant = (date: string, time: string) =>
  Date.parse(`${date}T${time}:00+08:00`);

export function validateConfig(input: ScheduleConfigDto): ScheduleConfigDto {
  if (
    !input ||
    typeof input !== 'object' ||
    !Array.isArray(input.teamIds) ||
    !Array.isArray(input.venues) ||
    !datePattern.test(input.startDate) ||
    !datePattern.test(input.endDate) ||
    !timePattern.test(input.dailyStart) ||
    !timePattern.test(input.dailyEnd)
  )
    throw new BadRequestException('Invalid schedule configuration');
  const teamIds = [...new Set(input.teamIds)];
  const venues = [...new Set(input.venues.map((value) => value.trim()))];
  const validDay = (value: string) => {
    const time = Date.parse(`${value}T00:00:00Z`);
    return (
      Number.isFinite(time) &&
      new Date(time).toISOString().slice(0, 10) === value
    );
  };
  if (
    !validDay(input.startDate) ||
    !validDay(input.endDate) ||
    teamIds.length < 2 ||
    teamIds.length > 32 ||
    teamIds.length !== input.teamIds.length ||
    venues.length < 1 ||
    venues.length > 12 ||
    venues.some((value) => !value || value.length > 80) ||
    instant(input.startDate, '00:00') > instant(input.endDate, '00:00') ||
    instant(input.endDate, '00:00') - instant(input.startDate, '00:00') >
      30 * day ||
    instant(input.startDate, input.dailyStart) >=
      instant(input.startDate, input.dailyEnd) ||
    !Number.isSafeInteger(input.durationMinutes) ||
    input.durationMinutes < 10 ||
    input.durationMinutes > 240 ||
    !Number.isSafeInteger(input.bufferMinutes) ||
    input.bufferMinutes < 0 ||
    input.bufferMinutes > 120 ||
    !Number.isSafeInteger(input.minRestMinutes) ||
    input.minRestMinutes < 0 ||
    input.minRestMinutes > 1440
  )
    throw new BadRequestException('Invalid schedule configuration');
  return { ...input, teamIds, venues };
}

function dates(config: ScheduleConfigDto) {
  const result: string[] = [];
  const start = Date.parse(`${config.startDate}T00:00:00Z`);
  const end = Date.parse(`${config.endDate}T00:00:00Z`);
  for (let value = start; value <= end; value += day)
    result.push(new Date(value).toISOString().slice(0, 10));
  return result;
}

export function scheduleSlots(config: ScheduleConfigDto): Slot[] {
  const result: Slot[] = [];
  const step = minutes(config.durationMinutes + config.bufferMinutes);
  for (const date of dates(config)) {
    const end = instant(date, config.dailyEnd);
    for (
      let value = instant(date, config.dailyStart);
      value + minutes(config.durationMinutes) <= end;
      value += step
    )
      for (const venue of config.venues)
        result.push({
          time: value,
          startAt: new Date(value).toISOString(),
          venue,
        });
  }
  return result.sort(
    (a, b) => a.time - b.time || a.venue.localeCompare(b.venue),
  );
}

function emptyMatch(
  id: string,
  round: number,
  order: number,
  divisionId: string,
  divisionLabel: string,
): ScheduleMatchDto {
  return {
    id,
    divisionId,
    divisionLabel,
    round,
    order,
    homeEventTeamId: '',
    awayEventTeamId: '',
    homeSourceMatchId: '',
    awaySourceMatchId: '',
    homeLabel: '',
    awayLabel: '',
    startAt: '',
    venue: '',
  };
}

export function roundRobin(
  teams: Team[],
  ids: () => string,
  divisionId = teams[0]?.divisionId,
  orderOffset = 0,
  divisionLabel = teams[0]?.divisionName ?? '',
) {
  if (!divisionId) throw new BadRequestException('Teams require a division');
  const values: (Team | null)[] = [...teams];
  if (values.length % 2) values.push(null);
  const matches: ScheduleMatchDto[] = [];
  for (let round = 1; round < values.length; round += 1) {
    for (let index = 0; index < values.length / 2; index += 1) {
      const first = values[index];
      const second = values[values.length - 1 - index];
      if (!first || !second) continue;
      const match = emptyMatch(
        ids(),
        round,
        orderOffset + matches.length + 1,
        divisionId,
        divisionLabel,
      );
      const home = round % 2 === 0 && index === 0 ? second : first;
      const away = home === first ? second : first;
      match.homeEventTeamId = home.id;
      match.awayEventTeamId = away.id;
      match.homeLabel = home.name;
      match.awayLabel = away.name;
      matches.push(match);
    }
    values.splice(1, 0, values.pop()!);
  }
  return matches;
}

function elimination(
  teams: Team[],
  ids: () => string,
  divisionId: string,
  orderOffset: number,
  divisionLabel: string,
) {
  if (![2, 4, 8, 16, 32].includes(teams.length))
    throw new BadRequestException(
      'Single elimination requires 2/4/8/16/32 teams',
    );
  const rounds = Math.log2(teams.length);
  const byRound: ScheduleMatchDto[][] = [];
  const first: ScheduleMatchDto[] = [];
  for (let index = 0; index < teams.length; index += 2) {
    const match = emptyMatch(
      ids(),
      1,
      orderOffset + first.length + 1,
      divisionId,
      divisionLabel,
    );
    match.homeEventTeamId = teams[index]!.id;
    match.awayEventTeamId = teams[index + 1]!.id;
    match.homeLabel = teams[index]!.name;
    match.awayLabel = teams[index + 1]!.name;
    first.push(match);
  }
  byRound.push(first);
  for (let round = 2; round <= rounds; round += 1) {
    const previous = byRound[round - 2]!;
    const current: ScheduleMatchDto[] = [];
    for (let index = 0; index < previous.length; index += 2) {
      const match = emptyMatch(
        ids(),
        round,
        orderOffset + byRound.flat().length + current.length + 1,
        divisionId,
        divisionLabel,
      );
      match.homeSourceMatchId = previous[index]!.id;
      match.awaySourceMatchId = previous[index + 1]!.id;
      match.homeLabel = `第${previous[index]!.order}场胜者`;
      match.awayLabel = `第${previous[index + 1]!.order}场胜者`;
      current.push(match);
    }
    byRound.push(current);
  }
  return byRound.flat();
}

export function groupTeamsByDivision(teams: Team[]) {
  const groups = new Map<string, Team[]>();
  for (const team of teams) {
    if (!team.divisionId || team.divisionActive === false)
      throw new BadRequestException('Selected team has no active division');
    const group = groups.get(team.divisionId) ?? [];
    group.push(team);
    groups.set(team.divisionId, group);
  }
  for (const group of groups.values())
    if (group.length < 2)
      throw new BadRequestException(
        'Each selected division requires at least two teams',
      );
  return groups;
}

export function roundRobinByDivision(teams: Team[], ids: () => string) {
  const matches: ScheduleMatchDto[] = [];
  for (const [divisionId, group] of groupTeamsByDivision(teams))
    matches.push(
      ...roundRobin(
        group,
        ids,
        divisionId,
        matches.length,
        group[0]?.divisionName ?? '',
      ),
    );
  return matches;
}

function eliminationByDivision(teams: Team[], ids: () => string) {
  const matches: ScheduleMatchDto[] = [];
  for (const [divisionId, group] of groupTeamsByDivision(teams))
    matches.push(
      ...elimination(
        group,
        ids,
        divisionId,
        matches.length,
        group[0]?.divisionName ?? '',
      ),
    );
  return matches;
}

function schedule(matches: ScheduleMatchDto[], config: ScheduleConfigDto) {
  const available = scheduleSlots(config);
  const used = new Set<string>();
  const teamEnd = new Map<string, number>();
  const matchEnd = new Map<string, number>();
  for (const match of matches) {
    const earliestTeam = Math.max(
      ...[match.homeEventTeamId, match.awayEventTeamId]
        .filter(Boolean)
        .map(
          (id) =>
            (teamEnd.get(id) ?? -Infinity) + minutes(config.minRestMinutes),
        ),
      ...[match.homeSourceMatchId, match.awaySourceMatchId]
        .filter(Boolean)
        .map(
          (id) =>
            (matchEnd.get(id) ?? -Infinity) + minutes(config.minRestMinutes),
        ),
    );
    const slot = available.find(
      (candidate) =>
        !used.has(`${candidate.startAt}|${candidate.venue}`) &&
        candidate.time >= earliestTeam,
    );
    if (!slot) continue;
    match.startAt = slot.startAt;
    match.venue = slot.venue;
    used.add(`${slot.startAt}|${slot.venue}`);
    const end = slot.time + minutes(config.durationMinutes);
    if (match.homeEventTeamId) teamEnd.set(match.homeEventTeamId, end);
    if (match.awayEventTeamId) teamEnd.set(match.awayEventTeamId, end);
    matchEnd.set(match.id, end);
  }
}

export function validateSchedule(
  config: ScheduleConfigDto,
  matches: ScheduleMatchDto[],
  teams: Team[],
): ScheduleIssueDto[] {
  const issues: ScheduleIssueDto[] = [];
  const teamMap = new Map(teams.map((team) => [team.id, team]));
  const matchMap = new Map(matches.map((match) => [match.id, match]));
  const interval = minutes(config.durationMinutes);
  const add = (code: string, message: string, ids: string[]) =>
    issues.push({ code, message, matchIds: ids });
  for (const id of config.teamIds)
    if (!teamMap.get(id)?.active)
      add(
        'TEAM_UNAVAILABLE',
        '参赛球队已退出或当前不可用，请重新生成赛程。',
        [],
      );
    else if (!teamMap.get(id)?.divisionId)
      add('DIVISION_UNASSIGNED', '参赛球队尚未归组，请先确认组别。', []);
    else if (teamMap.get(id)?.divisionActive === false)
      add('DIVISION_UNAVAILABLE', '参赛组别已停用，请重新确认组别。', []);
  for (const match of matches) {
    if (!match.divisionId)
      add(
        'DIVISION_UNASSIGNED',
        `第${match.order}场缺少竞赛组别，不能重新发布。`,
        [match.id],
      );
    const currentDivisionName = teams.find(
      (team) => team.divisionId === match.divisionId,
    )?.divisionName;
    if (
      match.divisionId &&
      currentDivisionName &&
      match.divisionLabel !== currentDivisionName
    )
      add(
        'DIVISION_LABEL_STALE',
        `第${match.order}场组别名称已变化，请重新生成赛程。`,
        [match.id],
      );
    for (const teamId of [match.homeEventTeamId, match.awayEventTeamId].filter(
      Boolean,
    )) {
      const team = teamMap.get(teamId);
      if (!team || !config.teamIds.includes(teamId)) {
        add(
          'TEAM_REFERENCE_INVALID',
          `第${match.order}场引用的参赛球队不属于当前赛程。`,
          [match.id],
        );
        continue;
      }
      if (!team.divisionId || team.divisionActive === false) continue;
      if (team.divisionId !== match.divisionId)
        add('DIVISION_MISMATCH', `第${match.order}场球队与场次组别不一致。`, [
          match.id,
        ]);
    }
    for (const sourceId of [
      match.homeSourceMatchId,
      match.awaySourceMatchId,
    ].filter(Boolean)) {
      const source = matchMap.get(sourceId);
      if (!source || source.divisionId !== match.divisionId)
        add(
          'DIVISION_MISMATCH',
          `第${match.order}场前置比赛与场次组别不一致。`,
          [sourceId, match.id],
        );
    }
    if (!match.startAt || !match.venue) {
      add('UNSCHEDULED', `第${match.order}场没有可用的时间和场地。`, [
        match.id,
      ]);
      continue;
    }
    const start = Date.parse(match.startAt);
    if (!Number.isFinite(start)) {
      add('OUTSIDE_AVAILABILITY', `第${match.order}场的时间无效。`, [match.id]);
      continue;
    }
    const localDate = new Date(start + 8 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const localTime = new Date(start + 8 * 60 * 60 * 1000)
      .toISOString()
      .slice(11, 16);
    if (
      !Number.isFinite(start) ||
      localDate < config.startDate ||
      localDate > config.endDate ||
      localTime < config.dailyStart ||
      start + interval > instant(localDate, config.dailyEnd) ||
      !config.venues.includes(match.venue)
    )
      add(
        'OUTSIDE_AVAILABILITY',
        `第${match.order}场超出可用日期、时段或场地。`,
        [match.id],
      );
  }
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index]!;
    if (!current.startAt) continue;
    const start = Date.parse(current.startAt);
    for (const other of matches.slice(index + 1)) {
      if (!other.startAt) continue;
      const next = Date.parse(other.startAt);
      if (
        current.venue === other.venue &&
        start < next + interval &&
        next < start + interval
      )
        add('VENUE_OVERLAP', `${current.venue}存在比赛时间重叠。`, [
          current.id,
          other.id,
        ]);
      const shared = [current.homeEventTeamId, current.awayEventTeamId].find(
        (id) =>
          id && [other.homeEventTeamId, other.awayEventTeamId].includes(id),
      );
      if (
        shared &&
        Math.abs(next - start) < interval + minutes(config.minRestMinutes)
      )
        add(
          'TEAM_REST',
          `${teamMap.get(shared)?.name ?? '球队'}的休息时间不足。`,
          [current.id, other.id],
        );
    }
    for (const sourceId of [
      current.homeSourceMatchId,
      current.awaySourceMatchId,
    ].filter(Boolean)) {
      const source = matchMap.get(sourceId);
      if (
        !source?.startAt ||
        start <
          Date.parse(source.startAt) + interval + minutes(config.minRestMinutes)
      )
        add('DEPENDENCY_REST', `第${current.order}场早于前置比赛或休息不足。`, [
          sourceId,
          current.id,
        ]);
    }
  }
  return issues;
}

export function calculateAdjustmentPreview(
  config: ScheduleConfigDto,
  matches: ScheduleMatchDto[],
  teams: Team[],
  matchId: string,
  startAt: string,
  venue: string,
) {
  const before = matches.find((match) => match.id === matchId);
  if (!before) throw new BadRequestException('Match not found');
  const after = { ...before, startAt, venue };
  const candidate = matches.map((match) =>
    match.id === matchId ? after : match,
  );
  return {
    before,
    after,
    issues: validateSchedule(config, candidate, teams),
  };
}

export function generateSchedule(
  format: 'ROUND_ROBIN' | 'SINGLE_ELIMINATION',
  config: ScheduleConfigDto,
  teams: Team[],
  ids: () => string,
) {
  const selected = config.teamIds.map(
    (id) => teams.find((team) => team.id === id)!,
  );
  const matches =
    format === 'ROUND_ROBIN'
      ? roundRobinByDivision(selected, ids)
      : eliminationByDivision(selected, ids);
  schedule(matches, config);
  return { matches, issues: validateSchedule(config, matches, teams) };
}
