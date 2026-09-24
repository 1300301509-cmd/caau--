import { z } from 'zod';

export const studioInput = z.object({
  message: z.string().min(1).max(2000).describe('输入问题或单场改期要求'),
  eventId: z.string().default('').describe('可留空；仅使用工作台合成赛事 ID'),
  matchId: z.string().default('').describe('可留空；显式选择候选场次时填写'),
  teamId: z.string().default('').describe('可留空；明确选择同名参赛球队时填写'),
  planningId: z.string().default('').describe('可留空；续接已有需求单时使用'),
  planningRevision: z
    .number()
    .default(0)
    .describe('修改已有需求单时使用最近版本号'),
  candidateBaselineRevision: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('候选预览绑定的基础赛程版本，0 表示尚无赛程'),
  candidateConfigSource: z
    .enum(['EVENT_SCHEDULE', 'EXPLICIT'])
    .default('EXPLICIT')
    .describe('候选配置的明确来源'),
  candidateFixedMatchIds: z
    .array(z.string())
    .default([])
    .describe('明确核对的固定场次 ID；空数组表示明确不固定现有场次'),
  candidateConfig: z
    .object({
      teamIds: z.array(z.string()),
      venues: z.array(z.string()),
      startDate: z.string(),
      endDate: z.string(),
      dailyStart: z.string(),
      dailyEnd: z.string(),
      durationMinutes: z.number(),
      bufferMinutes: z.number(),
      minRestMinutes: z.number(),
    })
    .optional()
    .describe('必须提供全部字段；不会从聊天或模型猜测排赛业务默认值'),
  newTask: z.boolean().default(false).describe('需要新任务时设为 true'),
});
export const studioState = z.object({
  ...studioInput.shape,
  workflowVersion: z.number(),
  taskId: z.string(),
  sessionId: z.string(),
  revision: z.number(),
  step: z.string(),
  baselineRevision: z.number(),
  parameters: z.object({
    sourceWeekday: z.number().optional(),
    sourceOrdinal: z.number().optional(),
    sourceMatchId: z.string().optional(),
    targetWeekday: z.number().optional(),
    targetDate: z.string().optional(),
    targetHour: z.number().optional(),
    targetMinute: z.number().optional(),
    targetStartAt: z.string().optional(),
    venue: z.string().optional(),
  }),
  pendingFields: z.array(z.string()),
  candidates: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      detail: z.string().optional(),
    }),
  ),
  route: z.enum(['preview', 'respond']),
  status: z.enum([
    'NEED_EVENT',
    'NEED_MATCH',
    'NEED_PARAMETERS',
    'PREVIEW',
    'STALE',
    'ERROR',
    'CHAT',
    'CLARIFY',
    'UNSUPPORTED',
    'QUERY',
    'PLAN',
    'NEED_TEAM',
  ]),
  responseMessage: z.string(),
  context: z.object({
    history: z.array(
      z.object({ role: z.enum(['USER', 'ASSISTANT']), content: z.string() }),
    ),
    planning: z
      .object({
        id: z.string(),
        eventId: z.string(),
        revision: z.number(),
        status: z.string(),
        conditions: z.unknown(),
        pending: z.array(z.string()),
      })
      .optional(),
    lastQuery: z
      .object({ eventId: z.string(), matchId: z.string().optional() })
      .optional(),
    task: z
      .object({
        step: z.string(),
        eventId: z.string().optional(),
        matchId: z.string().optional(),
        goal: z.string(),
        pendingFields: z.array(z.string()),
        preview: z.unknown(),
      })
      .optional(),
  }),
  kind: z.enum([
    'CHAT',
    'CONTINUE',
    'START',
    'CLARIFY',
    'UNSUPPORTED',
    'QUERY',
    'PLAN',
  ]),
  answer: z.string(),
  queryPlan: z.unknown(),
  queryResult: z.unknown(),
  planningProposal: z.unknown(),
  candidateResult: z.unknown(),
  reply: z.unknown(),
  explicitMatchId: z.string(),
});
