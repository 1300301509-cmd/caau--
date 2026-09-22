import { ServiceUnavailableException } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

export type AgentTaskParameters = {
  sourceWeekday?: number;
  sourceOrdinal?: number;
  sourceMatchId?: string;
  targetWeekday?: number;
  targetDate?: string;
  targetHour?: number;
  targetMinute?: number;
  targetStartAt?: string;
  venue?: string;
};

export type AgentIntentPatch = Partial<AgentTaskParameters> & {
  targetOffsetMinutes?: number;
};

const weekday = new Map([
  ['一', 1],
  ['二', 2],
  ['三', 3],
  ['四', 4],
  ['五', 5],
  ['六', 6],
  ['日', 7],
  ['天', 7],
]);
const chineseNumber = new Map([
  ['一', 1],
  ['二', 2],
  ['三', 3],
  ['四', 4],
  ['五', 5],
  ['六', 6],
  ['七', 7],
  ['八', 8],
  ['九', 9],
  ['十', 10],
]);
function number(value?: string) {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  if (value.startsWith('十'))
    return 10 + (chineseNumber.get(value[1] ?? '') ?? 0);
  if (value.endsWith('十'))
    return (chineseNumber.get(value[0] ?? '') ?? 0) * 10;
  return chineseNumber.get(value);
}

export interface AgentModelAdapter {
  readonly mode: 'SIMULATED' | 'QWEN';
  parse(message: string, known: AgentTaskParameters): Promise<AgentIntentPatch>;
}

export class RuleAgentModelAdapter implements AgentModelAdapter {
  readonly mode = 'SIMULATED' as const;
  async parse(message: string): Promise<AgentIntentPatch> {
    const source =
      /周([一二三四五六日天])(?:[^，。]*?)([一二三四五六七八九十\d]+)场/.exec(
        message,
      );
    const targetWeekday =
      /(?:改|移|调)[^，。]*?(?:到|至)周([一二三四五六日天])/.exec(message);
    const targetDate = /(?:改|移|调)[^，。]*?(?:到|至)(\d{4}-\d{2}-\d{2})/.exec(
      message,
    );
    const clock =
      /(上午|早上|下午|晚上)?([一二三四五六七八九十\d]+)点(半|(?:[0-5]?\d)分)?/.exec(
        message.replace(/周[一二三四五六日天]/g, ''),
      );
    let hour = number(clock?.[2]);
    if (
      hour !== undefined &&
      ['下午', '晚上'].includes(clock?.[1] ?? '') &&
      hour < 12
    )
      hour += 12;
    const minute =
      clock?.[3] === '半'
        ? 30
        : clock?.[3]
          ? Number(clock[3].replace('分', ''))
          : clock
            ? 0
            : undefined;
    const offset = /再晚半小时/.test(message)
      ? 30
      : /再晚一小时/.test(message)
        ? 60
        : undefined;
    return {
      ...(source
        ? {
            sourceWeekday: weekday.get(source[1]!),
            sourceOrdinal: number(source[2]),
          }
        : {}),
      ...(targetWeekday
        ? { targetWeekday: weekday.get(targetWeekday[1]!) }
        : {}),
      ...(targetDate ? { targetDate: targetDate[1] } : {}),
      ...(hour === undefined ? {} : { targetHour: hour }),
      ...(minute === undefined ? {} : { targetMinute: minute }),
      ...(offset === undefined ? {} : { targetOffsetMinutes: offset }),
    };
  }
}

const intentSchema = z.object({
  sourceWeekday: z.number().int().min(1).max(7).optional(),
  sourceOrdinal: z.number().int().min(1).max(100).optional(),
  targetWeekday: z.number().int().min(1).max(7).optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  targetHour: z.number().int().min(0).max(23).optional(),
  targetMinute: z.number().int().min(0).max(59).optional(),
  targetOffsetMinutes: z.number().int().min(-1440).max(1440).optional(),
});

export class QwenAgentModelAdapter implements AgentModelAdapter {
  readonly mode = 'QWEN' as const;
  private readonly model;
  constructor(apiKey: string, model: string, baseURL: string) {
    this.model = new ChatOpenAI({
      apiKey,
      model,
      temperature: 0,
      configuration: { baseURL },
      timeout: 8000,
      maxRetries: 0,
    }).withStructuredOutput(intentSchema, {
      name: 'schedule_adjustment_intent_patch',
    });
  }
  async parse(
    message: string,
    known: AgentTaskParameters,
  ): Promise<AgentIntentPatch> {
    try {
      return await this.model.invoke([
        {
          role: 'system',
          content:
            '只提取本轮对赛程调整条件的新增或修改，省略未提及字段。星期一到日用1到7；“再晚半小时”输出targetOffsetMinutes=30。不得选择赛事/比赛或执行操作。已知结构化条件仅用于理解指代：' +
            JSON.stringify(known),
        },
        { role: 'user', content: message },
      ]);
    } catch {
      throw new ServiceUnavailableException('Agent model unavailable');
    }
  }
}

export function createAgentModel(
  env: NodeJS.ProcessEnv = process.env,
): AgentModelAdapter {
  const apiKey = env.CAAU_QWEN_API_KEY?.trim();
  if (!apiKey) return new RuleAgentModelAdapter();
  return new QwenAgentModelAdapter(
    apiKey,
    env.CAAU_QWEN_MODEL?.trim() || 'qwen-plus',
    env.CAAU_QWEN_BASE_URL?.trim() ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
  );
}
