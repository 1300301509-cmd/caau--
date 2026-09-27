import { z } from 'zod';
import { randomUUID } from 'node:crypto';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/);
export const planningChangeSchema = z.object({
  operation: z.enum(['ADD', 'REPLACE', 'REMOVE']),
  kind: z.enum([
    'DATE_RANGE',
    'TEAM_WINDOW',
    'MATCHUP',
    'FORMAT',
    'DAYPART_CAPACITY',
  ]),
  eventName: z.string().max(120).optional(),
  teamName: z
    .string()
    .max(120)
    .describe('TEAM_WINDOW 或 MATCHUP 所述的完整原话球队名，不要自行缩写')
    .optional(),
  // Model-supplied IDs are untrusted hints. Only exact IDs typed by the user
  // may be considered, and event participation is checked in the transaction.
  teamId: z.string().max(64).optional(),
  opponentName: z.string().max(120).optional(),
  opponentId: z.string().max(64).optional(),
  from: date.optional(),
  to: date.optional(),
  durationDays: z
    .number()
    .int()
    .min(1)
    .max(31)
    .describe('用户明确说出的排程天数；包含开始当日，不猜测开始日期')
    .optional(),
  format: z
    .enum(['ROUND_ROBIN'])
    .describe('只有用户明确要求每两支队伍都交手一次或单循环时填写')
    .optional(),
  daypart: z
    .enum(['MORNING', 'AFTERNOON', 'EVENING'])
    .describe('仅 DAYPART_CAPACITY 使用；球队只能周三不是一天中的时段')
    .optional(),
  maxMatchesPerDay: z.number().int().min(0).max(66).optional(),
  capacityScope: z.enum(['EVENT', 'VENUE']).optional(),
  dates: z
    .array(date)
    .max(31)
    .describe('仅用户本轮说出完整年份日期时填写，不能根据当前赛期推算')
    .optional(),
  weekdays: z
    .array(z.number().int().min(1).max(7))
    .max(7)
    .describe(
      'TEAM_WINDOW 的星期，周一=1、周二=2、周三=3、周四=4、周五=5、周六=6、周日=7',
    )
    .optional(),
  startTime: clock.optional(),
  endTime: clock.optional(),
  availability: z
    .enum(['AVAILABLE', 'ONLY', 'BLOCK'])
    .describe('TEAM_WINDOW：只能=ONLY，不能=BLOCK，可在=AVAILABLE')
    .optional(),
  matchup: z.enum(['PREFER', 'AVOID']).optional(),
  priority: z.enum(['MUST', 'PREFER']).optional(),
});
export const planningProposalSchema = z.object({
  goal: z.enum(['WHOLE_SCHEDULE', 'UPDATE_REQUIREMENTS']).optional(),
  changes: z.array(planningChangeSchema).max(8),
  unhandled: z.array(z.string().max(160)).max(4).optional(),
});
export const legacyPlanningProposalSchema = z.object({
  changes: z
    .array(
      planningChangeSchema
        .omit({ daypart: true, maxMatchesPerDay: true, capacityScope: true })
        .extend({
          kind: z.enum(['DATE_RANGE', 'TEAM_WINDOW', 'MATCHUP', 'FORMAT']),
        }),
    )
    .max(8),
});
export type PlanningChange = z.infer<typeof planningChangeSchema>;
export type PlanningProposal = z.infer<typeof planningProposalSchema>;
export type PlanningCondition = {
  id: string;
  kind: PlanningChange['kind'];
  eventId: string;
  priority: 'MUST' | 'PREFER';
  confirmation: 'PENDING' | 'CONFIRMED';
  sourceTurnIds: string[];
  from?: string;
  to?: string;
  durationDays?: number;
  scheduleGoal?: boolean;
  dateSource?: 'USER' | 'EVENT_PROFILE' | 'EVENT_SCHEDULE';
  format?: 'ROUND_ROBIN';
  daypart?: 'MORNING' | 'AFTERNOON' | 'EVENING';
  maxMatchesPerDay?: number;
  capacityScope?: 'EVENT' | 'VENUE';
  teamId?: string;
  teamLabel?: string;
  opponentId?: string;
  opponentLabel?: string;
  dates?: string[];
  weekdays?: number[];
  startTime?: string;
  endTime?: string;
  availability?: 'AVAILABLE' | 'ONLY' | 'BLOCK';
  matchup?: 'PREFER' | 'AVOID';
};
export type UnresolvedPlanningChange = {
  change: PlanningChange;
  teamId?: string;
  teamLabel?: string;
  opponentId?: string;
  opponentLabel?: string;
  sourceTurnIds: string[];
};
const dateMs = (day: string) => Date.parse(`${day}T00:00:00.000Z`);
export function validDay(value: string) {
  const time = dateMs(value);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === value
  );
}
export function parseUserDates(message: string) {
  return [...message.matchAll(/(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})日?/g)].map(
    (match) =>
      `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}`,
  );
}
export function requestedDurationDays(message: string) {
  const match =
    /(?:在|用|限|共|为|要|需|需要|计划|安排|，|,|\s)?\s*(\d{1,3}|十)\s*天(?:内|之内|完成|解决|排完|结束)?/.exec(
      message,
    );
  return match ? (match[1] === '十' ? 10 : Number(match[1])) : null;
}
export function endAfterDays(start: string, days: number) {
  if (!validDay(start) || !Number.isInteger(days) || days < 1 || days > 31)
    return null;
  return new Date(dateMs(start) + (days - 1) * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function isWholeScheduleRequest(message: string) {
  return (
    !/^(?:怎么|如何|为什么|是否|能否)/.test(message.trim()) &&
    /(?:帮我|请|我要|想|需要|给我|重新|再).{0,12}(?:编排|排|生成|重排)(?:一下|一份|一个|整套|整个|全部|本次|这次)?(?:比赛|赛程|对阵)|(?:编排|重排|生成)(?:整套|整个|全部)(?:比赛|赛程)/.test(
      message,
    ) &&
    !/(?:发布|覆盖|保存|提交|审批|修改晋级|改变晋级|登记俱乐部|创建俱乐部|物料登记)/.test(
      message,
    )
  );
}
export function explicitRoundRobin(message: string) {
  return /(?:每队|每支球队|每支队伍|所有队伍|全部队伍|所有球队).{0,20}(?:与|和|跟)(?:其他|其余|每支|每个|所有)(?:队|球队|队伍).{0,12}(?:交手|比赛|对阵|打一场|打一次)|(?:单循环|每两队)(?:.{0,14}(?:交手|比赛|对阵|一场|一次))?/.test(
    message,
  );
}
export function periodDates(from: string, to: string) {
  if (
    !validDay(from) ||
    !validDay(to) ||
    from > to ||
    dateMs(to) - dateMs(from) > 30 * 86400000
  )
    return null;
  const dates: string[] = [];
  for (let at = dateMs(from); at <= dateMs(to); at += 86400000)
    dates.push(new Date(at).toISOString().slice(0, 10));
  return dates;
}
export function expandDays(
  period: PlanningCondition | undefined,
  weekdays: number[],
  dates: string[],
) {
  if (!period?.from || !period.to) return null;
  const all = periodDates(period.from, period.to);
  if (!all || dates.some((day) => !validDay(day) || !all.includes(day)))
    return null;
  const selected = new Set(dates);
  for (const day of all)
    if (
      weekdays.includes(
        ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1,
      )
    )
      selected.add(day);
  return [...selected].sort();
}
export function planningIssues(conditions: PlanningCondition[]) {
  const issues: string[] = [];
  const capacities = conditions.filter(
    (item) => item.kind === 'DAYPART_CAPACITY',
  );
  for (const condition of capacities) {
    if (
      condition.startTime &&
      condition.endTime &&
      condition.startTime >= condition.endTime
    )
      issues.push(
        `${daypartLabel(condition.daypart)}的开始时间必须早于结束时间。`,
      );
    for (const other of capacities) {
      if (other.id === condition.id || other.id < condition.id) continue;
      if (
        condition.startTime &&
        condition.endTime &&
        other.startTime &&
        other.endTime &&
        condition.startTime < other.endTime &&
        other.startTime < condition.endTime
      )
        issues.push(
          `${daypartLabel(condition.daypart)}与${daypartLabel(other.daypart)}的时段重叠，请调整时间。`,
        );
    }
  }
  const period = conditions.find((item) => item.kind === 'DATE_RANGE');
  if (period?.from && period.to) {
    const allowed = new Set(periodDates(period.from, period.to) ?? []);
    for (const condition of conditions.filter(
      (item) => item.kind === 'TEAM_WINDOW',
    ))
      if (condition.dates?.some((day) => !allowed.has(day)))
        issues.push(
          `${condition.teamLabel ?? condition.teamId}的要求超出当前赛事日期范围；请修订该条件。`,
        );
  }
  for (const left of conditions.filter(
    (item) =>
      item.kind === 'TEAM_WINDOW' &&
      ['ONLY', 'AVAILABLE'].includes(item.availability ?? ''),
  )) {
    const blocked = conditions.filter(
      (item) =>
        item.kind === 'TEAM_WINDOW' &&
        item.teamId === left.teamId &&
        item.availability === 'BLOCK',
    );
    for (const other of blocked) {
      const overlap = (left.dates ?? []).filter((day) =>
        other.dates?.includes(day),
      );
      if (
        overlap.length &&
        (left.startTime ?? '00:00') < (other.endTime ?? '24:00') &&
        (other.startTime ?? '00:00') < (left.endTime ?? '24:00')
      )
        issues.push(
          `${left.teamLabel ?? left.teamId}的“可参加”和“不能参加”在 ${overlap.join('、')} 时段重叠${left.priority === 'PREFER' || other.priority === 'PREFER' ? '（含尽量满足条件）' : ''}；请先明确取舍。`,
        );
    }
    if (left.availability === 'ONLY' && left.priority === 'MUST') {
      for (const other of conditions.filter(
        (item) =>
          item.kind === 'TEAM_WINDOW' &&
          item.teamId === left.teamId &&
          item.availability === 'AVAILABLE' &&
          item.priority === 'MUST',
      )) {
        const outside = (other.dates ?? []).filter(
          (day) => !(left.dates ?? []).includes(day),
        );
        if (outside.length)
          issues.push(
            `${left.teamLabel ?? left.teamId}的“只能安排”与另一条“可安排”在 ${outside.join('、')} 不一致；请确认具体可用日期。`,
          );
      }
    }
  }
  const pairs = conditions.filter((item) => item.kind === 'MATCHUP');
  for (const pair of pairs)
    if (
      pairs.some(
        (other) =>
          other.id !== pair.id &&
          [other.teamId, other.opponentId].sort().join(':') ===
            [pair.teamId, pair.opponentId].sort().join(':') &&
          other.matchup !== pair.matchup,
      )
    ) {
      const label = `${pair.teamLabel ?? pair.teamId}／${pair.opponentLabel ?? pair.opponentId}`;
      if (!issues.some((item) => item.includes(label)))
        issues.push(`${label}同时要求倾向对阵和避免对阵；请明确偏好。`);
    }
  return issues;
}
export function planningPending(
  conditions: PlanningCondition[],
  unresolved: UnresolvedPlanningChange[],
) {
  const pending: string[] = [];
  const period = conditions.find((item) => item.kind === 'DATE_RANGE');
  if (!period?.from || !period.to)
    pending.push(
      period?.scheduleGoal && period.durationDays
        ? `当前赛事没有可用的开始日期；请给出包含年份的起始日期，我会从当天起计算 ${period.durationDays} 天。`
        : '请明确包含年份的赛事日期范围（不超过 31 天）。',
    );
  if (
    period?.scheduleGoal &&
    !conditions.some((item) => item.kind === 'FORMAT')
  )
    pending.push(
      '请确认对阵规则：是否每两支参赛球队各交手一次（单循环）？“每队比过一场”不能确定这一点。',
    );
  if (unresolved.length)
    pending.push(
      '已有球队时段描述尚未转换为明确日期；请先补全赛事日期范围或具体日期。',
    );
  const capacities = conditions.filter(
    (item) => item.kind === 'DAYPART_CAPACITY',
  );
  if (capacities.length) {
    const missingTimes = capacities.filter(
      (item) => !item.startTime || !item.endTime,
    );
    if (missingTimes.length)
      pending.push(
        `请说明${missingTimes.map((item) => daypartLabel(item.daypart)).join('、')}分别从几点到几点。`,
      );
    const missingCounts = capacities.filter(
      (item) => item.maxMatchesPerDay === undefined,
    );
    if (missingCounts.length)
      pending.push(
        `请说明${missingCounts.map((item) => daypartLabel(item.daypart)).join('、')}每天最多安排几场。`,
      );
    const missingScopes = capacities.filter((item) => !item.capacityScope);
    if (missingScopes.length)
      pending.push(
        `请确认${missingScopes.map((item) => daypartLabel(item.daypart)).join('、')}的每日场数上限按整个赛事合计，还是每个场地分别计算。`,
      );
  }
  return pending;
}
export const daypartLabel = (value?: PlanningCondition['daypart']) =>
  ({ MORNING: '上午', AFTERNOON: '下午', EVENING: '晚上' })[value ?? 'MORNING'];
export function conditionSummary(condition: PlanningCondition) {
  const strength = condition.priority === 'MUST' ? '必须满足' : '尽量满足';
  if (condition.kind === 'DATE_RANGE')
    return `赛事日期 ${condition.from ?? '待明确'} 至 ${condition.to ?? '待明确'}${condition.durationDays ? `，共 ${condition.durationDays} 天` : ''}${condition.dateSource === 'EVENT_PROFILE' ? '，起点来自赛事资料' : condition.dateSource === 'EVENT_SCHEDULE' ? '，起点来自当前赛程配置' : ''}（${strength}）`;
  if (condition.kind === 'FORMAT')
    return `单循环：每两支参赛球队各交手一次（${strength}）`;
  if (condition.kind === 'DAYPART_CAPACITY')
    return `${daypartLabel(condition.daypart)} ${condition.startTime ?? '待明确'}—${condition.endTime ?? '待明确'}，${condition.capacityScope === 'VENUE' ? '每个场地' : condition.capacityScope === 'EVENT' ? '整个赛事' : '统计范围待明确'}每天最多 ${condition.maxMatchesPerDay ?? '待明确'} 场（${strength}）`;
  if (condition.kind === 'TEAM_WINDOW')
    return `${condition.teamLabel ?? condition.teamId}：${condition.availability === 'ONLY' ? '只在' : condition.availability === 'BLOCK' ? '不在' : '可在'} ${condition.dates?.join('、') ?? ''} ${condition.startTime ?? '00:00'}—${condition.endTime ?? '24:00'} 安排（${strength}，仅本次排程要求）`;
  return `${condition.teamLabel ?? condition.teamId} 与 ${condition.opponentLabel ?? condition.opponentId}：${condition.matchup === 'PREFER' ? '倾向相遇' : '尽量避免相遇'}（${strength}，不新增对阵）`;
}
export function newCondition(
  base: Omit<PlanningCondition, 'id' | 'confirmation'>,
): PlanningCondition {
  return { ...base, id: randomUUID(), confirmation: 'PENDING' };
}
