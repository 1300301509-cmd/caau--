import { z } from 'zod';
import type {
  ScheduleMatchDto,
  ScheduleViewDto,
} from '../scheduling/scheduling.dto.js';

const day = /^\d{4}-\d{2}-\d{2}$/;
const uuid = z.string().uuid();
export const queryPlanSchema = z.object({
  tool: z.enum(['schedule.list', 'schedule.match']),
  eventName: z.string().max(120).optional(),
  dateFrom: z.string().regex(day).optional(),
  dateTo: z.string().regex(day).optional(),
  relative: z
    .enum([
      'THIS_WEEK',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
      'SUNDAY',
    ])
    .optional(),
  teamName: z.string().max(120).optional(),
  teamId: uuid.optional(),
  matchId: uuid.optional(),
  ordinal: z.number().int().min(1).max(1000).optional(),
});
export type QueryPlan = z.infer<typeof queryPlanSchema>;
export type DateRange = { from: string; to: string } | null;
export type QueryArguments = {
  range: DateRange;
  teamId?: string;
  matchId?: string;
  ordinal?: number;
};
export type QueryToolResult =
  | {
      type: 'list';
      matches: ScheduleMatchDto[];
      total: number;
      range: DateRange;
    }
  | {
      type: 'match';
      matches: ScheduleMatchDto[];
      total: number;
      range: DateRange;
    };

const validDate = (value: string) =>
  day.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
  new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
const addDays = (date: string, amount: number) =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + amount * 86400000)
    .toISOString()
    .slice(0, 10);
export function explicitRelative(message: string): QueryPlan['relative'] {
  const weekday = /周([一二三四五六日天])/.exec(message)?.[1];
  if (weekday) {
    const days: Record<string, NonNullable<QueryPlan['relative']>> = {
      一: 'MONDAY',
      二: 'TUESDAY',
      三: 'WEDNESDAY',
      四: 'THURSDAY',
      五: 'FRIDAY',
      六: 'SATURDAY',
      日: 'SUNDAY',
      天: 'SUNDAY',
    };
    return days[weekday];
  }
  if (/这周|本周/.test(message)) return 'THIS_WEEK';
  return undefined;
}
export function explicitOrdinal(message: string) {
  const text = /第([一二三四五六七八九十\d]+)场/.exec(message)?.[1];
  if (!text) return undefined;
  if (/^\d+$/.test(text)) return Number(text);
  const digit: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (text === '十') return 10;
  if (text.startsWith('十')) return 10 + (digit[text[1]!] ?? 0);
  if (text.endsWith('十')) return (digit[text[0]!] ?? 0) * 10;
  return digit[text];
}
export const beijingDay = (iso: string) =>
  new Date(Date.parse(iso) + 8 * 3600000).toISOString().slice(0, 10);
export const beijingTime = (iso: string) =>
  new Date(Date.parse(iso) + 8 * 3600000)
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ');

// Never trust model-provided relative dates: anchor them to the server clock in Beijing.
export function resolveDateRange(plan: QueryPlan, now = new Date()): DateRange {
  if (plan.relative) {
    const today = beijingDay(now.toISOString());
    const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    const monday = addDays(today, -(weekday === 0 ? 6 : weekday - 1));
    if (plan.relative === 'THIS_WEEK')
      return { from: monday, to: addDays(monday, 6) };
    const index = [
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
      'SUNDAY',
    ].indexOf(plan.relative);
    const target = addDays(monday, index);
    return { from: target, to: target };
  }
  if (!plan.dateFrom && !plan.dateTo) return null;
  const from = plan.dateFrom ?? plan.dateTo!;
  const to = plan.dateTo ?? plan.dateFrom!;
  if (
    !validDate(from) ||
    !validDate(to) ||
    from > to ||
    Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) >
      31 * 86400000
  )
    throw new Error('Invalid Beijing date range');
  return { from, to };
}

const within = (match: ScheduleMatchDto, range: DateRange) =>
  !range ||
  (!!match.startAt &&
    beijingDay(match.startAt) >= range.from &&
    beijingDay(match.startAt) <= range.to);
const matchTeams = (match: ScheduleMatchDto) =>
  [
    { id: match.homeEventTeamId, label: match.homeLabel },
    { id: match.awayEventTeamId, label: match.awayLabel },
  ].filter((team) => !!team.id);
export function resolveTeam(view: ScheduleViewDto, name?: string, id?: string) {
  if (!name && !id) return { teamId: undefined, choices: [] as string[] };
  const teams = new Map(
    view.matches.flatMap(matchTeams).map((team) => [team.id, team]),
  );
  const normalized = name?.trim().toLocaleLowerCase();
  const choices = [...teams.values()].filter((team) =>
    id ? team.id === id : team.label.toLocaleLowerCase().includes(normalized!),
  );
  if (choices.length !== 1)
    return {
      teamId: undefined,
      choices: choices.map((team) => `${team.label} (${team.id})`),
    };
  return { teamId: choices[0]!.id, choices: [] as string[] };
}

// The registry is deliberately closed: no dynamic tool names or database access.
export const scheduleTools = {
  'schedule.list': {
    name: 'schedule.list',
    purpose: '查询授权赛事指定日期范围和球队的比赛列表',
    permission: 'schedule.read',
    mutates: false,
    schema: queryPlanSchema.pick({
      dateFrom: true,
      dateTo: true,
      relative: true,
      teamName: true,
      teamId: true,
    }),
    execute(view: ScheduleViewDto, args: QueryArguments): QueryToolResult {
      const matches = view.matches
        .filter(
          (match) =>
            within(match, args.range) &&
            (!args.teamId ||
              match.homeEventTeamId === args.teamId ||
              match.awayEventTeamId === args.teamId),
        )
        .sort(
          (a, b) =>
            a.startAt.localeCompare(b.startAt) ||
            a.order - b.order ||
            a.id.localeCompare(b.id),
        );
      return {
        type: 'list',
        matches: matches.slice(0, 5),
        total: matches.length,
        range: args.range,
      };
    },
  },
  'schedule.match': {
    name: 'schedule.match',
    purpose: '查询授权赛事一场比赛的对阵、时间、场地和赛程版本',
    permission: 'schedule.read',
    mutates: false,
    schema: queryPlanSchema.pick({
      matchId: true,
      ordinal: true,
      dateFrom: true,
      dateTo: true,
      relative: true,
      teamName: true,
      teamId: true,
    }),
    execute(view: ScheduleViewDto, args: QueryArguments): QueryToolResult {
      const matches = view.matches.filter(
        (match) =>
          within(match, args.range) &&
          (!args.teamId ||
            match.homeEventTeamId === args.teamId ||
            match.awayEventTeamId === args.teamId) &&
          (!args.matchId || match.id === args.matchId) &&
          (!args.ordinal || match.order === args.ordinal),
      );
      return {
        type: 'match',
        matches,
        total: matches.length,
        range: args.range,
      };
    },
  },
} as const;
export type ScheduleToolName = keyof typeof scheduleTools;
