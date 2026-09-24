import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAgentModel,
  intentSchema,
  modelFailureMetadata,
  qwenIntentSystemPrompt,
  routePrompt,
  RuleAgentModelAdapter,
} from '../dist/modules/ai/model-adapter.js';
import { AiService, mergeAgentIntent } from '../dist/modules/ai/ai.service.js';
import {
  beijingDay,
  resolveDateRange,
  queryPlanSchema,
  scheduleTools,
} from '../dist/modules/ai/schedule-tools.js';
import { calculateAdjustmentPreview } from '../dist/modules/scheduling/scheduling.algorithm.js';
import {
  periodDates,
  expandDays,
  planningIssues,
  planningPending,
  planningProposalSchema,
  parseUserDates,
} from '../dist/modules/ai/planning.js';

test('page event and match context cannot turn CHAT or PLAN into task continuation', () => {
  const resolve = (...args) =>
    AiService.prototype.resolveDialogueRoute.call({}, ...args);
  for (const step of ['LOCATE_EVENT', 'LOCATE_MATCH']) {
    const task = { id: 'task', step };
    const body = {
      message: '你好，能给我简单介绍一下你自己',
      taskId: task.id,
      eventId: 'event',
      matchId: 'match',
    };
    assert.equal(resolve('CHAT', task, body), 'CHAT');
    assert.equal(
      resolve('PLAN', task, { ...body, message: 'D队只能在周三参加比赛' }),
      'PLAN',
    );
    assert.equal(
      resolve('CLARIFY', task, {
        ...body,
        message: '把周六第二场移到周日十点',
      }),
      'CONTINUE',
    );
  }
});

test('simulated model extracts the supported Chinese schedule adjustment intent', async () => {
  const intent = await new RuleAgentModelAdapter().parse(
    '把周六第二场比赛改到周日十点',
  );
  assert.deepEqual(intent, {
    sourceWeekday: 6,
    sourceOrdinal: 2,
    targetWeekday: 7,
    targetHour: 10,
    targetMinute: 0,
  });
  assert.equal(
    (
      await new RuleAgentModelAdapter().parse(
        '改到周日十一点 把周六第二场比赛改到周日十点',
      )
    ).targetHour,
    11,
  );
  assert.deepEqual(await new RuleAgentModelAdapter().parse('上午十点'), {
    targetHour: 10,
    targetMinute: 0,
  });
  assert.deepEqual(await new RuleAgentModelAdapter().parse('再晚半小时'), {
    targetOffsetMinutes: 30,
  });
  assert.equal(
    (await new RuleAgentModelAdapter().parse('改到周三十点')).targetHour,
    10,
  );
  assert.deepEqual(await new RuleAgentModelAdapter().parse('换成周六第三场'), {
    sourceWeekday: 6,
    sourceOrdinal: 3,
  });
});

test('conversation router separates chat, task continuation and unsupported operations', async () => {
  const model = new RuleAgentModelAdapter();
  const empty = { history: [] };
  assert.equal(await model.route('你好', empty), 'CHAT');
  assert.equal(await model.route('七支球队适合什么赛制？', empty), 'CHAT');
  assert.equal(await model.route('怎么安排比较好？', empty), 'CHAT');
  assert.equal(await model.route('把周六第二场移到周日', empty), 'START');
  assert.equal(await model.route('请批量重排整套赛程', empty), 'UNSUPPORTED');
  assert.equal(await model.route('帮我登记俱乐部', empty), 'UNSUPPORTED');
  assert.equal(await model.route('上午十点', empty), 'CLARIFY');
  const waiting = {
    history: [],
    task: {
      goal: '把周六第二场移到周日',
      step: 'WAITING_PARAMETERS',
      pendingFields: ['targetTime'],
      preview: null,
    },
  };
  assert.equal(await model.route('赛制规则是什么？', waiting), 'CHAT');
  assert.equal(await model.route('上午十点', waiting), 'CONTINUE');
  assert.equal(await model.route('好的', waiting), 'CHAT');
  assert.equal(await model.route('查2027-06-05的赛程', empty), 'QUERY');
  assert.equal(await model.route('刚才那场的场地呢？', waiting), 'QUERY');
  assert.equal(await model.route('把周六第二场移到周日', waiting), 'CONTINUE');
  assert.equal(
    await model.route('把刚才那场改到周日十点', {
      history: [],
      lastQuery: { eventId: 'synthetic', matchId: 'synthetic' },
    }),
    'START',
  );
  assert.equal(
    await model.route('如果把刚才那场改到周日会怎样？', {
      history: [],
      lastQuery: { eventId: 'synthetic', matchId: 'synthetic' },
    }),
    'CHAT',
  );
  assert.match(
    await model.chat('七支球队适合什么赛制？', empty, 'CHAT'),
    /21场/,
  );
  assert.match(routePrompt(waiting), /普通问题/);
});

test('planning routing, extraction and date expansion remain separate from execution', async () => {
  const model = new RuleAgentModelAdapter();
  const empty = { history: [] };
  const planning = {
    ...empty,
    planning: {
      id: 'plan',
      eventId: 'event',
      revision: 1,
      status: 'COLLECTING',
      conditions: [],
      pending: [],
    },
  };
  assert.equal(await model.route('请收集整周排程需求', empty), 'PLAN');
  assert.equal(
    await model.route(
      '收集排程需求，赛事日期范围 2027-06-01 到 2027-06-07',
      empty,
    ),
    'PLAN',
  );
  assert.equal(await model.route('D队只能周三', empty), 'PLAN');
  assert.equal(await model.route('改成周三和周五', planning), 'PLAN');
  assert.equal(await model.route('取消D队时间限制', planning), 'PLAN');
  assert.equal(await model.route('好的', planning), 'CHAT');
  assert.equal(
    await model.route('请批量重排整套赛程', planning),
    'UNSUPPORTED',
  );
  assert.equal(await model.route('确认当前需求单', planning), 'CLARIFY');
  assert.deepEqual((await model.planPlanning('D队只能周三')).changes[0], {
    operation: 'ADD',
    kind: 'TEAM_WINDOW',
    teamName: 'D队',
    availability: 'ONLY',
    weekdays: [3],
    dates: [],
    startTime: undefined,
    endTime: undefined,
    priority: 'MUST',
  });
  assert.equal(
    (await model.planPlanning('改成周三和周五')).changes[0].operation,
    'REPLACE',
  );
  assert.equal(
    (await model.planPlanning('取消D队时间限制')).changes[0].operation,
    'REMOVE',
  );
  assert.equal(
    planningProposalSchema.safeParse({
      changes: [
        {
          operation: 'ADD',
          kind: 'TEAM_WINDOW',
          teamName: 'D队',
          weekdays: [8],
        },
      ],
    }).success,
    false,
  );
  assert.deepEqual(periodDates('2027-06-01', '2027-06-07')?.length, 7);
  assert.equal(periodDates('2027-02-30', '2027-03-01'), null);
  assert.deepEqual(
    expandDays({ from: '2027-06-01', to: '2027-06-07' }, [3, 5], []),
    ['2027-06-02', '2027-06-04'],
  );
  assert.deepEqual(parseUserDates('2027年6月1日到2027年6月7日'), [
    '2027-06-01',
    '2027-06-07',
  ]);
  const only = {
    id: 'a',
    kind: 'TEAM_WINDOW',
    eventId: 'e',
    priority: 'MUST',
    confirmation: 'PENDING',
    sourceTurnIds: ['x'],
    teamId: 'd',
    teamLabel: 'D队',
    availability: 'ONLY',
    dates: ['2027-06-02'],
    startTime: '09:00',
    endTime: '12:00',
  };
  assert.equal(
    planningIssues([only, { ...only, id: 'b', availability: 'BLOCK' }]).length,
    1,
  );
  assert.equal(
    planningIssues([
      only,
      {
        ...only,
        id: 'b',
        availability: 'BLOCK',
        startTime: '13:00',
        endTime: '14:00',
      },
    ]).length,
    0,
  );
  assert.equal(planningPending([], []).length, 1);
});

test('read-only registry validates tools and resolves Beijing relative dates across week and year', async () => {
  const model = new RuleAgentModelAdapter();
  assert.equal(
    (await model.planQuery('查2027-06-05赛程')).tool,
    'schedule.list',
  );
  assert.equal((await model.planQuery('刚才那场详情')).tool, 'schedule.match');
  assert.equal(
    queryPlanSchema.safeParse({ tool: 'schedule.publish' }).success,
    false,
  );
  assert.equal(Object.keys(scheduleTools).length, 2);
  assert.ok(
    Object.values(scheduleTools).every(
      (tool) => tool.mutates === false && tool.permission === 'schedule.read',
    ),
  );
  assert.deepEqual(
    resolveDateRange(
      { tool: 'schedule.list', relative: 'THIS_WEEK' },
      new Date('2026-12-31T15:59:59Z'),
    ),
    { from: '2026-12-28', to: '2027-01-03' },
  );
  assert.deepEqual(
    resolveDateRange(
      { tool: 'schedule.list', relative: 'THIS_WEEK' },
      new Date('2026-12-31T16:00:00Z'),
    ),
    { from: '2026-12-28', to: '2027-01-03' },
  );
  assert.deepEqual(
    resolveDateRange(
      { tool: 'schedule.list', relative: 'WEDNESDAY' },
      new Date('2027-01-03T17:00:00Z'),
    ),
    { from: '2027-01-06', to: '2027-01-06' },
  );
  assert.equal(beijingDay('2027-06-04T16:30:00Z'), '2027-06-05');
  assert.deepEqual(
    resolveDateRange(
      { tool: 'schedule.list', relative: 'THIS_WEEK' },
      new Date('2027-01-03T15:59:59Z'),
    ),
    { from: '2026-12-28', to: '2027-01-03' },
  );
  assert.throws(() =>
    resolveDateRange({ tool: 'schedule.list', dateFrom: '2027-02-30' }),
  );
  assert.throws(() =>
    resolveDateRange({
      tool: 'schedule.list',
      dateFrom: '2027-01-01',
      dateTo: '2027-03-01',
    }),
  );
});

test('Qwen schema and prompt distinguish source match from target time', () => {
  assert.match(intentSchema.shape.sourceWeekday.description, /原比赛.*周六.*6/);
  assert.match(intentSchema.shape.sourceOrdinal.description, /当天.*第二场.*2/);
  assert.match(intentSchema.shape.targetWeekday.description, /目标星期/);
  assert.match(intentSchema.shape.targetDate.description, /明确日历日期/);
  assert.match(intentSchema.shape.targetHour.description, /北京时间.*24小时制/);
  assert.match(intentSchema.shape.targetMinute.description, /整点.*0/);
  assert.match(intentSchema.shape.targetOffsetMinutes.description, /分钟偏移/);
  const prompt = qwenIntentSystemPrompt({ targetWeekday: 7 });
  assert.match(prompt, /来源比赛/);
  assert.match(prompt, /目标时间/);
  assert.match(prompt, /sourceWeekday=6, sourceOrdinal=2/);
  assert.match(prompt, /只返回本轮/);
  assert.match(prompt, /不得选择赛事或比赛，不得执行任何修改/);
});

test('Qwen adapter preserves full replies and logs only safe per-phase metadata', async () => {
  const key = 'synthetic-secret-never-log';
  const model = createAgentModel({
    CAAU_QWEN_API_KEY: key,
    CAAU_QWEN_BASE_URL: 'https://dashscope.example.test/compatible/v1',
  });
  assert.equal(model.rawModel.timeout, 18000);
  assert.equal(model.chatModel.timeout, 45000);
  const raw = {
    usage_metadata: { input_tokens: 12, output_tokens: 34, total_tokens: 46 },
  };
  model.chatModel = {
    invoke: async () => ({ ...raw, content: '答'.repeat(4001) }),
  };
  model.routeModel = {
    invoke: async () => ({ raw, parsed: { kind: 'CHAT' } }),
  };
  model.model = { invoke: async () => ({ raw, parsed: { targetHour: 10 } }) };
  const previous = console.info;
  const logs = [];
  console.info = (...items) => logs.push(items.join(' '));
  try {
    assert.equal(await model.route('私密路由输入', { history: [] }), 'CHAT');
    assert.equal(
      await model.chat('私密聊天输入', { history: [] }, 'CHAT'),
      '答'.repeat(4001),
    );
    assert.deepEqual(await model.parse('私密意图输入', {}), { targetHour: 10 });
    model.routeModel = {
      invoke: async () => {
        throw { status: 429, message: '私密供应商回复', key };
      },
    };
    await assert.rejects(
      model.route('私密路由输入', { history: [] }),
      (error) => error.status === 503,
    );
  } finally {
    console.info = previous;
  }
  assert.deepEqual(
    logs.map(
      (line) => JSON.parse(line.slice('CAAU agent model '.length)).phase,
    ),
    ['route', 'chat', 'intent', 'route'],
  );
  assert.deepEqual(
    JSON.parse(logs[0].slice('CAAU agent model '.length)).tokens,
    { input: 12, output: 34, total: 46 },
  );
  assert.deepEqual(
    JSON.parse(logs[3].slice('CAAU agent model '.length)).category,
    'rate_limit',
  );
  assert.deepEqual(
    JSON.parse(logs[3].slice('CAAU agent model '.length)).providerStatus,
    429,
  );
  assert.ok(!logs.join('').includes(key));
  assert.ok(!logs.join('').includes('私密'));
});

test('provider failures are classified without serializing errors or prompts', () => {
  assert.deepEqual(
    modelFailureMetadata({
      name: 'APIConnectionTimeoutError',
      message: 'sensitive',
    }),
    {
      category: 'timeout',
      providerStatus: null,
      errorType: 'APIConnectionTimeoutError',
      networkCode: null,
    },
  );
  assert.deepEqual(
    modelFailureMetadata({ status: 503, message: 'sensitive' }),
    {
      category: 'provider_http',
      providerStatus: 503,
      errorType: 'other',
      networkCode: null,
    },
  );
  assert.deepEqual(
    modelFailureMetadata({ code: 'ECONNRESET', message: 'sensitive' }),
    {
      category: 'connection',
      providerStatus: null,
      errorType: 'other',
      networkCode: 'ECONNRESET',
    },
  );
  assert.deepEqual(
    modelFailureMetadata({ status: 429, message: 'sensitive' }),
    {
      category: 'rate_limit',
      providerStatus: 429,
      errorType: 'other',
      networkCode: null,
    },
  );
});

test('model status exposes host and credential presence but never the key', () => {
  const key = 'synthetic-secret-never-return';
  const status = createAgentModel({
    CAAU_QWEN_API_KEY: key,
    CAAU_QWEN_MODEL: 'qwen-synthetic',
    CAAU_QWEN_BASE_URL: 'https://dashscope.example.test/compatible/v1',
  }).status();
  assert.equal(status.mode, 'QWEN');
  assert.equal(status.modelName, 'qwen-synthetic');
  assert.equal(status.baseUrlHost, 'dashscope.example.test');
  assert.equal(status.credentialsConfigured, true);
  assert.ok(!JSON.stringify(status).includes(key));
});

test('intent merge invalidates mutually exclusive and derived schedule fields', () => {
  const known = {
    sourceWeekday: 6,
    sourceOrdinal: 2,
    sourceMatchId: '10000000-0000-4000-8000-000000000002',
    targetWeekday: 7,
    targetDate: '2027-06-06',
    targetHour: 23,
    targetMinute: 30,
    targetStartAt: '2027-06-06T15:30:00.000Z',
  };
  const sourceChanged = mergeAgentIntent(known, {
    sourceWeekday: 6,
    sourceOrdinal: 3,
  });
  assert.equal(sourceChanged.sourceMatchId, undefined);
  assert.equal(sourceChanged.targetStartAt, undefined);
  const explicitDate = mergeAgentIntent(known, {
    targetDate: '2027-06-08',
    targetHour: 10,
    targetMinute: 0,
  });
  assert.equal(explicitDate.targetWeekday, undefined);
  assert.equal(explicitDate.targetDate, '2027-06-08');
  const explicitWeekday = mergeAgentIntent(explicitDate, {
    targetWeekday: 7,
  });
  assert.equal(explicitWeekday.targetDate, undefined);
  const crossWeek = mergeAgentIntent(known, { targetOffsetMinutes: 60 });
  assert.equal(crossWeek.targetWeekday, undefined);
  assert.equal(crossWeek.targetDate, '2027-06-07');
  assert.equal(crossWeek.targetHour, 0);
  assert.equal(crossWeek.targetMinute, 30);
  assert.equal(crossWeek.targetStartAt, '2027-06-06T16:30:00.000Z');
});

test('adjustment preview uses deterministic validation without mutating input', () => {
  const before = {
    id: '10000000-0000-4000-8000-000000000001',
    round: 1,
    order: 1,
    homeEventTeamId: '20000000-0000-4000-8000-000000000001',
    awayEventTeamId: '20000000-0000-4000-8000-000000000002',
    homeSourceMatchId: '',
    awaySourceMatchId: '',
    homeLabel: 'A',
    awayLabel: 'B',
    startAt: '2027-06-05T01:00:00.000Z',
    venue: 'Court A',
  };
  const matches = [before];
  const result = calculateAdjustmentPreview(
    {
      teamIds: [before.homeEventTeamId, before.awayEventTeamId],
      venues: ['Court A'],
      startDate: '2027-06-05',
      endDate: '2027-06-06',
      dailyStart: '09:00',
      dailyEnd: '18:00',
      durationMinutes: 40,
      bufferMinutes: 10,
      minRestMinutes: 60,
    },
    matches,
    [
      { id: before.homeEventTeamId, name: 'A', active: true },
      { id: before.awayEventTeamId, name: 'B', active: true },
    ],
    before.id,
    '2027-06-06T02:00:00.000Z',
    'Court A',
  );
  assert.equal(result.after.startAt, '2027-06-06T02:00:00.000Z');
  assert.equal(result.issues.length, 0);
  assert.equal(matches[0].startAt, '2027-06-05T01:00:00.000Z');
});
