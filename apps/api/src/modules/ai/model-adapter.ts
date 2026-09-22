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

export type AgentModelConnectionResult = {
  status: 'NOT_TESTED' | 'SUCCEEDED' | 'FAILED' | 'NOT_APPLICABLE';
  testedAt: string | null;
  message: string;
};
export type AgentModelStatus = {
  mode: 'SIMULATED' | 'QWEN';
  modelName: string;
  baseUrlHost: string | null;
  credentialsConfigured: boolean;
  lastConnectionTest: AgentModelConnectionResult;
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
function host(baseURL?: string) {
  if (!baseURL) return null;
  try {
    return new URL(baseURL).hostname;
  } catch {
    return null;
  }
}

export const agentModelUnavailable = () =>
  new ServiceUnavailableException('Agent model unavailable');

export interface AgentModelAdapter {
  readonly mode: 'SIMULATED' | 'QWEN';
  parse(message: string, known: AgentTaskParameters): Promise<AgentIntentPatch>;
  status(): AgentModelStatus;
  testConnection(): Promise<AgentModelStatus>;
}

export class RuleAgentModelAdapter implements AgentModelAdapter {
  readonly mode = 'SIMULATED' as const;
  private lastConnectionTest: AgentModelConnectionResult = {
    status: 'NOT_TESTED',
    testedAt: null,
    message: '尚未执行连接测试',
  };
  async parse(message: string): Promise<AgentIntentPatch> {
    const source =
      /周([一二三四五六日天])(?:[^，。]*?)([一二三四五六七八九十\d]+)场/.exec(
        message,
      );
    const sourceOrdinal =
      source?.[2] ??
      /(?:换成|改成|选择)?第?([一二三四五六七八九十\d]+)场/.exec(message)?.[1];
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
      ...(source ? { sourceWeekday: weekday.get(source[1]!) } : {}),
      ...(sourceOrdinal ? { sourceOrdinal: number(sourceOrdinal) } : {}),
      ...(targetWeekday
        ? { targetWeekday: weekday.get(targetWeekday[1]!) }
        : {}),
      ...(targetDate ? { targetDate: targetDate[1] } : {}),
      ...(hour === undefined ? {} : { targetHour: hour }),
      ...(minute === undefined ? {} : { targetMinute: minute }),
      ...(offset === undefined ? {} : { targetOffsetMinutes: offset }),
    };
  }
  status(): AgentModelStatus {
    return {
      mode: this.mode,
      modelName: 'deterministic-rule-parser',
      baseUrlHost: null,
      credentialsConfigured: false,
      lastConnectionTest: this.lastConnectionTest,
    };
  }
  async testConnection() {
    this.lastConnectionTest = {
      status: 'NOT_APPLICABLE',
      testedAt: new Date().toISOString(),
      message: '模拟模式不连接外部模型',
    };
    return this.status();
  }
}

export const intentSchema = z.object({
  sourceWeekday: z
    .number()
    .int()
    .min(1)
    .max(7)
    .optional()
    .describe(
      '原比赛所在星期，周一=1、周日=7；“周六第二场”中的周六必须返回6。',
    ),
  sourceOrdinal: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('原比赛在当天按开赛时间排序后的序号；“第二场”必须返回2。'),
  targetWeekday: z
    .number()
    .int()
    .min(1)
    .max(7)
    .optional()
    .describe('调整后的目标星期，周一=1、周日=7。'),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('调整后的明确日历日期，格式为YYYY-MM-DD。'),
  targetHour: z
    .number()
    .int()
    .min(0)
    .max(23)
    .optional()
    .describe('目标北京时间小时，使用24小时制。'),
  targetMinute: z
    .number()
    .int()
    .min(0)
    .max(59)
    .optional()
    .describe('目标分钟；整点必须返回0。'),
  targetOffsetMinutes: z
    .number()
    .int()
    .min(-1440)
    .max(1440)
    .optional()
    .describe('相对当前目标时间的分钟偏移；“再晚半小时”返回30。'),
});

export function qwenIntentSystemPrompt(known: AgentTaskParameters) {
  return [
    '你是赛程调整意图提取器，只返回本轮用户明确新增或修改的字段。',
    '严格区分两类信息：',
    '1. 来源比赛：用户说的是原比赛在哪一天、是当天按开赛时间排序后的第几场；提取为 sourceWeekday 和 sourceOrdinal。',
    '2. 目标时间：用户要把比赛改到哪一天、几点；提取为 targetWeekday 或 targetDate，以及 targetHour、targetMinute。',
    '星期一到星期日使用1到7。整点的 targetMinute 必须为0。“再晚半小时”提取 targetOffsetMinutes=30。',
    '只返回本轮明确提到的新增或修改字段，不重复未提到的已知字段。不得选择赛事或比赛，不得执行任何修改。',
    '示例输入：“把周六第二场比赛改到周日十点”',
    '示例输出：sourceWeekday=6, sourceOrdinal=2, targetWeekday=7, targetHour=10, targetMinute=0',
    '以下已知结构化条件仅用于理解本轮指代，不要因此重复输出：' +
      JSON.stringify(known),
  ].join('\n');
}

export class QwenAgentModelAdapter implements AgentModelAdapter {
  readonly mode = 'QWEN' as const;
  private readonly rawModel;
  private readonly model;
  private lastConnectionTest: AgentModelConnectionResult = {
    status: 'NOT_TESTED',
    testedAt: null,
    message: '尚未执行连接测试',
  };
  constructor(
    private readonly apiKey: string,
    private readonly modelName: string,
    private readonly baseURL: string,
  ) {
    this.rawModel = new ChatOpenAI({
      apiKey,
      model: modelName,
      temperature: 0,
      configuration: { baseURL },
      timeout: 8000,
      maxRetries: 0,
    });
    this.model = this.rawModel.withStructuredOutput(intentSchema, {
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
          content: qwenIntentSystemPrompt(known),
        },
        { role: 'user', content: message },
      ]);
    } catch {
      throw agentModelUnavailable();
    }
  }
  status(): AgentModelStatus {
    return {
      mode: this.mode,
      modelName: this.modelName,
      baseUrlHost: host(this.baseURL),
      credentialsConfigured: !!this.apiKey,
      lastConnectionTest: this.lastConnectionTest,
    };
  }
  async testConnection() {
    try {
      await this.rawModel.invoke([
        { role: 'system', content: '这是连接测试，只回复 OK。' },
        { role: 'user', content: 'ping' },
      ]);
      this.lastConnectionTest = {
        status: 'SUCCEEDED',
        testedAt: new Date().toISOString(),
        message: '连接测试成功',
      };
    } catch {
      this.lastConnectionTest = {
        status: 'FAILED',
        testedAt: new Date().toISOString(),
        message: '连接测试失败',
      };
    }
    return this.status();
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
