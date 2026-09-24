import { z } from 'zod';
import { randomUUID } from 'node:crypto';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/);
export const planningChangeSchema = z.object({
  operation: z.enum(['ADD', 'REPLACE', 'REMOVE']),
  kind: z.enum(['DATE_RANGE', 'TEAM_WINDOW', 'MATCHUP']),
  eventName: z.string().max(120).optional(),
  teamName: z.string().max(120).optional(),
  // Model-supplied IDs are untrusted hints. Only exact IDs typed by the user
  // may be considered, and event participation is checked in the transaction.
  teamId: z.string().max(64).optional(),
  opponentName: z.string().max(120).optional(),
  opponentId: z.string().max(64).optional(),
  from: date.optional(),
  to: date.optional(),
  dates: z.array(date).max(31).optional(),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  startTime: clock.optional(),
  endTime: clock.optional(),
  availability: z.enum(['AVAILABLE', 'ONLY', 'BLOCK']).optional(),
  matchup: z.enum(['PREFER', 'AVOID']).optional(),
  priority: z.enum(['MUST', 'PREFER']).optional(),
});
export const planningProposalSchema = z.object({
  changes: z.array(planningChangeSchema).max(8),
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
  if (!conditions.some((item) => item.kind === 'DATE_RANGE'))
    pending.push('请明确包含年份的赛事日期范围（不超过 31 天）。');
  if (unresolved.length)
    pending.push(
      '已有球队时段描述尚未转换为明确日期；请先补全赛事日期范围或具体日期。',
    );
  return pending;
}
export function conditionSummary(condition: PlanningCondition) {
  const strength = condition.priority === 'MUST' ? '必须满足' : '尽量满足';
  if (condition.kind === 'DATE_RANGE')
    return `赛事日期 ${condition.from} 至 ${condition.to}（${strength}）`;
  if (condition.kind === 'TEAM_WINDOW')
    return `${condition.teamLabel ?? condition.teamId}：${condition.availability === 'ONLY' ? '只在' : condition.availability === 'BLOCK' ? '不在' : '可在'} ${condition.dates?.join('、') ?? ''} ${condition.startTime ?? '00:00'}—${condition.endTime ?? '24:00'} 安排（${strength}，仅本次排程要求）`;
  return `${condition.teamLabel ?? condition.teamId} 与 ${condition.opponentLabel ?? condition.opponentId}：${condition.matchup === 'PREFER' ? '倾向相遇' : '尽量避免相遇'}（${strength}，不新增对阵）`;
}
export function newCondition(
  base: Omit<PlanningCondition, 'id' | 'confirmation'>,
): PlanningCondition {
  return { ...base, id: randomUUID(), confirmation: 'PENDING' };
}
