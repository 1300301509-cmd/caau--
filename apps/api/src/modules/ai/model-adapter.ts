import { ServiceUnavailableException } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

export type AgentIntent = {
  sourceWeekday?: number;
  sourceOrdinal?: number;
  targetWeekday?: number;
  targetHour?: number;
  targetMinute?: number;
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
  parse(message: string): Promise<AgentIntent>;
}

export class RuleAgentModelAdapter implements AgentModelAdapter {
  readonly mode = 'SIMULATED' as const;
  async parse(message: string): Promise<AgentIntent> {
    const source =
      /周([一二三四五六日天])(?:[^，。]*?)([一二三四五六七八九十\d]+)场/.exec(
        message,
      );
    const target =
      /(?:改|移|调)[^，。]*?(?:到|至)周([一二三四五六日天])(?:[^\d一二三四五六七八九十]*)([一二三四五六七八九十\d]+)点(?:([0-5]?\d)分)?/.exec(
        message,
      );
    return {
      sourceWeekday: source ? weekday.get(source[1]!) : undefined,
      sourceOrdinal: number(source?.[2]),
      targetWeekday: target ? weekday.get(target[1]!) : undefined,
      targetHour: number(target?.[2]),
      targetMinute: target?.[3] ? Number(target[3]) : 0,
    };
  }
}

const intentSchema = z.object({
  sourceWeekday: z.number().int().min(1).max(7).optional(),
  sourceOrdinal: z.number().int().min(1).max(100).optional(),
  targetWeekday: z.number().int().min(1).max(7).optional(),
  targetHour: z.number().int().min(0).max(23).optional(),
  targetMinute: z.number().int().min(0).max(59).optional(),
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
      name: 'schedule_adjustment_intent',
    });
  }
  async parse(message: string): Promise<AgentIntent> {
    try {
      return await this.model.invoke([
        {
          role: 'system',
          content:
            '只提取赛程调整中的来源星期、来源当天场次序号、目标星期和北京时间。不要选择赛事或比赛，不要执行操作。星期一到日用1到7。',
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
