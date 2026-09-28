import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chatPrompt,
  createAgentModel,
  intentSchema,
  modelFailureMetadata,
  qwenIntentSystemPrompt,
  routeSchema,
  teamProposalSchema,
  QwenAgentModelAdapter,
  routePrompt,
  RuleAgentModelAdapter,
} from '../dist/modules/ai/model-adapter.js';
import { agentSkillKeys } from '../dist/modules/ai/skill.service.js';
import { AiService, mergeAgentIntent } from '../dist/modules/ai/ai.service.js';
import {
  agentToolCatalog,
  requireAgentTool,
} from '../dist/modules/ai/tool-registry.js';
import {
  beijingDay,
  resolveDateRange,
  queryPlanSchema,
  scheduleTools,
} from '../dist/modules/ai/schedule-tools.js';
import { calculateAdjustmentPreview } from '../dist/modules/scheduling/scheduling.algorithm.js';
import {
  auditCandidate,
  calculateCandidate,
} from '../dist/modules/ai/candidate.algorithm.js';
import {
  periodDates,
  expandDays,
  planningIssues,
  planningPending,
  planningProposalSchema,
  parseUserDates,
  requestedDurationDays,
  endAfterDays,
  isWholeScheduleRequest,
  explicitRoundRobin,
} from '../dist/modules/ai/planning.js';

test('Qwen chat stream forwards real model chunks, propagates delivery denial and limits unfinished output', async () => {
  const model = new QwenAgentModelAdapter(
    'synthetic-key',
    'synthetic-model',
    'http://localhost',
  );
  model.chatModel = {
    stream: async function* () {
      yield { content: '赛'.repeat(80), id: 'provider-1' };
      yield {
        content: '程回答',
        usage_metadata: { input_tokens: 10, output_tokens: 83 },
      };
    },
  };
  const deltas = [];
  const answer = await model.chatStream(
    '问赛程',
    { history: [] },
    'CHAT',
    async (part) => {
      deltas.push(part);
    },
  );
  assert.equal(answer, '赛'.repeat(80) + '程回答');
  assert.deepEqual(deltas, ['赛'.repeat(80), '程回答']);
  const denied = new Error('permission denied');
  await assert.rejects(
    model.chatStream('问赛程', { history: [] }, 'CHAT', async () => {
      throw denied;
    }),
    (error) => error === denied,
  );
  model.chatModel = {
    stream: async function* () {
      yield { content: '长'.repeat(4001) };
    },
  };
  await assert.rejects(
    model.chatStream('长回答', { history: [] }, 'CHAT', async () => {}),
    (error) => error.getStatus?.() === 502,
  );
});

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

test('editable skills cannot register or upgrade executable tools', () => {
  const catalog = agentToolCatalog();
  assert.equal(
    catalog.find((tool) => tool.name === 'schedule.draft.adjust').confirmation,
    'BOUND_TICKET_BUTTON_OR_DIALOGUE',
  );
  assert.equal(
    catalog.find((tool) => tool.name === 'schedule.adjust.preview').permission,
    'schedule.read',
  );
  assert.equal(
    requireAgentTool('schedule.list', 'READ').permission,
    'schedule.read',
  );
  assert.throws(() => requireAgentTool('schedule.publish', 'DRAFT_WRITE'));
  assert.throws(() => requireAgentTool('schedule.draft.adjust', 'READ'));
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
  assert.deepEqual(
    await new RuleAgentModelAdapter().parse('把周一第二场改到周日上午十点半'),
    {
      sourceWeekday: 1,
      sourceOrdinal: 2,
      targetWeekday: 7,
      targetHour: 10,
      targetMinute: 30,
    },
  );
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
  assert.equal(await model.route('请批量重排整套赛程', empty), 'PLAN');
  assert.equal(
    await model.route('请批量重排整套赛程并发布赛程', empty),
    'UNSUPPORTED',
  );
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
  assert.equal(await model.route('确认执行', waiting), 'CLARIFY');
  const pending = {
    ...waiting,
    task: { ...waiting.task, step: 'PREVIEW_READY', pendingConfirmation: true },
  };
  assert.equal(await model.route('确认执行', pending), 'CONFIRM');
  assert.equal(await model.route('好的', pending), 'CHAT');
  assert.equal(await model.route('如果确认会影响什么？', pending), 'CHAT');
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
  assert.match(routePrompt(waiting), /编排整套赛程/);
});

test('team training consultation uses the chat route and versioned advisory skill', async () => {
  assert.ok(agentSkillKeys.includes('TEAM_TRAINING'));
  const route = routePrompt({
    history: [],
    planning: {
      id: 'planning-1',
      eventId: 'event-1',
      revision: 1,
      status: 'COLLECTING',
      conditions: [],
      pending: ['场地'],
    },
    teamAction: {
      id: 'team-action-1',
      eventId: 'event-1',
      revision: 1,
      state: 'COLLECTING',
      mode: 'REAL',
      profiles: [],
      missing: ['contactName'],
    },
  });
  assert.match(route, /“我应该怎么训练球队”是 CHAT，不是创建球队的 TEAM/);
  assert.match(route, /补充年龄、训练目标、频率等资料仍是 CHAT/);

  const defaultPrompt = chatPrompt({ history: [] }, 'CHAT');
  assert.match(defaultPrompt, /最多三组/);
  assert.match(defaultPrompt, /每周训练与休息/);
  assert.match(defaultPrompt, /不创建球队、不修改资料或赛程/);
  const customPrompt = chatPrompt(
    {
      history: [],
      skills: {
        TEAM_TRAINING: {
          id: 'skill-1',
          version: 2,
          instructions: '用教练指定的训练问题清单。',
        },
      },
    },
    'CHAT',
  );
  assert.match(customPrompt, /球队训练咨询 Skill v2：用教练指定的训练问题清单/);
  assert.match(customPrompt, /普通聊天及其它业务问题照常回答/);
  assert.doesNotMatch(customPrompt, /最多三组/);
  assert.match(customPrompt, /不授予球队或赛程读写能力/);

  const model = new QwenAgentModelAdapter(
    'synthetic-key',
    'synthetic-model',
    'http://localhost',
  );
  let sent;
  model.chatModel = {
    invoke: async (messages) => {
      sent = messages;
      return { content: '按已补充资料安排四周训练。' };
    },
  };
  assert.equal(
    await model.chat(
      '每周练三次，每次九十分钟',
      {
        history: [
          { role: 'USER', content: '我应该怎么训练球队？' },
          { role: 'ASSISTANT', content: '请补充项目、年龄和训练目标。' },
        ],
        skills: {
          TEAM_TRAINING: {
            id: 'skill-1',
            version: 2,
            instructions: '用教练指定的训练问题清单。',
          },
        },
      },
      'CHAT',
    ),
    '按已补充资料安排四周训练。',
  );
  assert.equal(sent.at(-1).content, '每周练三次，每次九十分钟');
  assert.equal(sent[1].content, '我应该怎么训练球队？');
  assert.match(sent[0].content, /球队训练咨询 Skill v2/);
});

test('Qwen structured route, not a production keyword matcher, proposes confirmation', async () => {
  const model = new QwenAgentModelAdapter(
    'synthetic-key',
    'synthetic-model',
    'http://localhost',
  );
  assert.equal(routeSchema.parse({ kind: 'CONFIRM' }).kind, 'CONFIRM');
  model.routeModel = {
    invoke: async () => ({ parsed: { kind: 'CONFIRM' }, raw: {} }),
  };
  const context = {
    history: [],
    task: {
      step: 'PREVIEW_READY',
      goal: 'single adjustment',
      pendingFields: [],
      preview: {},
      pendingConfirmation: true,
    },
  };
  assert.equal(await model.route('确认执行', context), 'CONFIRM');
  assert.equal(
    AiService.prototype.resolveDialogueRoute.call(
      { model },
      'CONFIRM',
      context.task,
      { message: '确认执行' },
    ),
    'CONFIRM',
  );
  assert.match(routePrompt(context), /pendingConfirmation/);
});

test('Qwen keeps team creation separate from an active scheduling requirement', async () => {
  const model = new QwenAgentModelAdapter(
    'synthetic-key',
    'synthetic-model',
    'http://localhost',
  );
  const seen = [];
  model.routeModel = {
    invoke: async (messages) => {
      seen.push(messages);
      return { parsed: { kind: 'TEAM' }, raw: {} };
    },
  };
  model.teamModel = {
    invoke: async (messages) => {
      seen.push(messages);
      return {
        parsed: { action: 'START', mode: 'REAL', profile: {} },
        raw: {},
      };
    },
  };
  const context = {
    history: [],
    planning: {
      id: 'planning-1',
      eventId: 'event-1',
      revision: 2,
      status: 'COLLECTING',
      conditions: [],
      pending: ['场地'],
    },
  };
  assert.equal(routeSchema.parse({ kind: 'TEAM' }).kind, 'TEAM');
  assert.equal(await model.route('帮我添加一支球队吧', context), 'TEAM');
  assert.equal(
    AiService.prototype.resolveDialogueRoute.call(
      { model },
      'TEAM',
      undefined,
      { message: '帮我添加一支球队吧' },
      undefined,
      context.planning,
    ),
    'TEAM',
  );
  assert.deepEqual(await model.planTeam('帮我添加一支球队吧', context), {
    action: 'START',
    mode: 'REAL',
    profile: {},
  });
  assert.match(JSON.stringify(seen[0]), /“帮我添加一支球队”是 TEAM/);
  assert.match(JSON.stringify(seen[1]), /缺失字段全部省略/);
});

test('team proposal accepts explicit test generation without fabricated real profile', async () => {
  assert.deepEqual(
    teamProposalSchema.parse({ action: 'START', mode: 'TEST', count: 3 }),
    { action: 'START', mode: 'TEST', count: 3 },
  );
  assert.equal(
    teamProposalSchema.safeParse({
      action: 'START',
      mode: 'TEST',
      count: 0,
    }).success,
    false,
  );
  const model = new QwenAgentModelAdapter(
    'synthetic-key',
    'synthetic-model',
    'http://localhost',
  );
  model.teamModel = {
    invoke: async () => ({
      parsed: { action: 'START', mode: 'TEST', count: 3 },
      raw: {},
    }),
  };
  assert.deepEqual(
    await model.planTeam('我在做测试，随机生成三支球队', { history: [] }),
    { action: 'START', mode: 'TEST', count: 3 },
  );
});

test('explicit retry of an executed team action stays on the team receipt path', async () => {
  const model = new QwenAgentModelAdapter(
    'synthetic-key',
    'synthetic-model',
    'http://localhost',
  );
  const seen = [];
  model.routeModel = {
    invoke: async (messages) => {
      seen.push(messages);
      return { parsed: { kind: 'TEAM' }, raw: {} };
    },
  };
  model.teamModel = {
    invoke: async (messages) => {
      seen.push(messages);
      return { parsed: { action: 'CONFIRM' }, raw: {} };
    },
  };
  const context = {
    history: [],
    teamAction: {
      id: 'team-action-1',
      eventId: 'event-1',
      revision: 2,
      state: 'EXECUTED',
      mode: 'TEST',
      profiles: [],
      missing: [],
    },
  };
  assert.equal(await model.route('重试刚才创建球队的操作', context), 'TEAM');
  assert.deepEqual(await model.planTeam('重试刚才创建球队的操作', context), {
    action: 'CONFIRM',
  });
  assert.match(JSON.stringify(seen[0]), /已执行的最近球队行动/);
  assert.match(JSON.stringify(seen[1]), /EXECUTED.*回放原行动/);
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
  assert.equal(await model.route('请批量重排整套赛程', planning), 'PLAN');
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
  const request = '帮我编排一下赛程，10天解决，要求所有队伍都必须比过一场';
  assert.equal(isWholeScheduleRequest(request), true);
  assert.equal(await model.route(request, empty), 'PLAN');
  assert.equal(requestedDurationDays(request), 10);
  assert.equal(explicitRoundRobin(request), false);
  assert.equal(explicitRoundRobin('每队与其他队都交手一次'), true);
  assert.equal(endAfterDays('2027-06-01', 10), '2027-06-10');
  assert.equal(endAfterDays('2027-12-27', 10), '2028-01-05');
  assert.equal(endAfterDays('2027-02-29', 10), null);
  assert.equal(requestedDurationDays('从2027年6月1日开始'), null);
  assert.deepEqual((await model.planPlanning(request)).changes, [
    { operation: 'ADD', kind: 'DATE_RANGE', durationDays: 10 },
  ]);
  assert.equal((await model.planPlanning(request)).goal, 'WHOLE_SCHEDULE');
  assert.equal(
    planningPending(
      [
        {
          kind: 'DATE_RANGE',
          from: '2027-06-01',
          to: '2027-06-10',
          scheduleGoal: true,
        },
      ],
      [],
    ).length,
    1,
  );
  const missingStart = planningPending(
    [{ kind: 'DATE_RANGE', scheduleGoal: true, durationDays: 10 }],
    [],
  );
  assert.match(missingStart[0], /起始日期/);
  assert.equal(
    await model.route('从2027年6月1日开始', {
      ...planning,
      planning: { ...planning.planning, pending: missingStart },
    }),
    'PLAN',
  );
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

test('structured whole-schedule follow-up retains round robin and enforces daily period capacity', () => {
  const sourceTurnIds = ['turn-2'];
  const period = {
    id: 'period',
    kind: 'DATE_RANGE',
    eventId: 'event',
    priority: 'MUST',
    confirmation: 'PENDING',
    sourceTurnIds: ['turn-1'],
    from: '2027-06-01',
    to: '2027-06-10',
    scheduleGoal: true,
  };
  const format = {
    id: 'format',
    kind: 'FORMAT',
    eventId: 'event',
    priority: 'MUST',
    confirmation: 'PENDING',
    sourceTurnIds,
    format: 'ROUND_ROBIN',
  };
  const windows = [
    ['MORNING', '09:00', '12:00', 1],
    ['AFTERNOON', '13:00', '17:00', 2],
    ['EVENING', '18:00', '21:00', 1],
  ].map(([daypart, startTime, endTime, maxMatchesPerDay]) => ({
    id: String(daypart),
    kind: 'DAYPART_CAPACITY',
    eventId: 'event',
    priority: 'MUST',
    confirmation: 'PENDING',
    sourceTurnIds,
    daypart,
    startTime,
    endTime,
    maxMatchesPerDay,
    capacityScope: 'EVENT',
  }));
  const proposal = {
    goal: 'UPDATE_REQUIREMENTS',
    changes: [
      { operation: 'ADD', kind: 'FORMAT', format: 'ROUND_ROBIN' },
      ...windows.map((window) => ({
        operation: 'ADD',
        kind: 'DAYPART_CAPACITY',
        daypart: window.daypart,
        maxMatchesPerDay: window.maxMatchesPerDay,
      })),
    ],
  };
  assert.equal(planningProposalSchema.safeParse(proposal).success, true);
  assert.equal(planningPending([period, format, ...windows], []).length, 0);
  const missingWindowDetails = planningPending(
    [
      period,
      format,
      ...windows.map(
        ({
          startTime: _startTime,
          endTime: _endTime,
          capacityScope: _capacityScope,
          ...rest
        }) => rest,
      ),
    ],
    [],
  );
  assert.match(missingWindowDetails[0], /从几点到几点/);
  assert.match(missingWindowDetails[1], /整个赛事合计/);
  assert.equal(
    missingWindowDetails.some((item) => item.includes('最多安排几场')),
    false,
  );
  const teams = Array.from({ length: 5 }, (_, index) => ({
    id: `team-${index}`,
    name: `球队${index}`,
    active: true,
  }));
  const config = {
    teamIds: teams.map((item) => item.id),
    venues: ['一号场'],
    startDate: '2027-06-01',
    endDate: '2027-06-10',
    dailyStart: '09:00',
    dailyEnd: '21:00',
    durationMinutes: 60,
    bufferMinutes: 0,
    minRestMinutes: 0,
  };
  const result = calculateCandidate(
    config,
    teams,
    [period, format, ...windows],
    [],
    [],
  );
  assert.equal(result.outcome, 'FOUND');
  assert.equal(result.matches.length, 10);
  assert.deepEqual(
    auditCandidate(
      config,
      teams,
      result.matches,
      [period, format, ...windows],
      [],
    ),
    [],
  );
  const byDaypart = new Map();
  for (const match of result.matches) {
    const local = new Date(
      Date.parse(match.startAt) + 8 * 3600000,
    ).toISOString();
    const hour = Number(local.slice(11, 13));
    const daypart = hour < 12 ? 'MORNING' : hour < 18 ? 'AFTERNOON' : 'EVENING';
    const key = `${local.slice(0, 10)}:${daypart}`;
    byDaypart.set(key, (byDaypart.get(key) ?? 0) + 1);
  }
  for (const [key, count] of byDaypart)
    assert.ok(
      count <= { MORNING: 1, AFTERNOON: 2, EVENING: 1 }[key.split(':')[1]],
    );
  const overbooked = result.matches.map((match, index) =>
    index < 2
      ? {
          ...match,
          startAt: `2027-06-01T0${index + 1}:00:00.000Z`,
          venue: '一号场',
        }
      : match,
  );
  assert.ok(
    auditCandidate(
      config,
      teams,
      overbooked,
      [period, format, ...windows],
      [],
    ).some((issue) => issue.code === 'DAYPART_CAPACITY'),
  );
  const twoVenues = {
    ...config,
    venues: ['一号场', '二号场'],
  };
  const splitVenue = overbooked.map((match, index) =>
    index === 1 ? { ...match, venue: '二号场' } : match,
  );
  const venueWindows = windows.map((item) => ({
    ...item,
    capacityScope: 'VENUE',
  }));
  assert.ok(
    auditCandidate(
      twoVenues,
      teams,
      splitVenue,
      [period, format, ...windows],
      [],
    ).some((issue) => issue.code === 'DAYPART_CAPACITY'),
  );
  assert.equal(
    auditCandidate(
      twoVenues,
      teams,
      splitVenue,
      [period, format, ...venueWindows],
      [],
    ).some((issue) => issue.code === 'DAYPART_CAPACITY'),
    false,
  );
  const inGap = result.matches.map((match, index) =>
    index === 0 ? { ...match, startAt: '2027-06-01T04:00:00.000Z' } : match,
  );
  assert.ok(
    auditCandidate(config, teams, inGap, [period, format, ...windows], []).some(
      (issue) => issue.code === 'DAYPART_CAPACITY',
    ),
  );
  const crossingMorningEnd = result.matches.map((match, index) =>
    index === 0 ? { ...match, startAt: '2027-06-01T03:30:00.000Z' } : match,
  );
  assert.ok(
    auditCandidate(
      config,
      teams,
      crossingMorningEnd,
      [period, format, windows[0]],
      [],
    ).some((issue) => issue.code === 'DAYPART_CAPACITY'),
  );
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

test('active Skill instructions reach proposal models without changing tool schemas', async () => {
  const model = createAgentModel({
    CAAU_QWEN_API_KEY: 'synthetic-test-only',
    CAAU_QWEN_BASE_URL: 'https://dashscope.example.test/compatible/v1',
  });
  const seen = [];
  model.routeModel = {
    invoke: async (messages) => {
      seen.push(messages);
      return { parsed: { kind: 'QUERY' }, raw: {} };
    },
  };
  model.queryModel = {
    invoke: async (messages) => {
      seen.push(messages);
      return { parsed: { tool: 'schedule.list' }, raw: {} };
    },
  };
  model.model = {
    invoke: async (messages) => {
      seen.push(messages);
      return { parsed: { targetHour: 10 }, raw: {} };
    },
  };
  const context = {
    history: [],
    skills: {
      INTENT_ROUTING: {
        id: 'intent',
        version: 2,
        instructions: '先识别查询目标',
      },
      TOOL_SELECTION: { id: 'tool', version: 3, instructions: '先选只读工具' },
    },
  };
  assert.equal(await model.route('查赛程', context), 'QUERY');
  assert.equal(
    (await model.planQuery('查赛程', context)).tool,
    'schedule.list',
  );
  assert.equal(
    (
      await model.parse(
        '上午十点',
        {},
        context.skills.TOOL_SELECTION.instructions,
      )
    ).targetHour,
    10,
  );
  assert.match(JSON.stringify(seen[0]), /意图理解 Skill v2.*先识别查询目标/);
  assert.match(JSON.stringify(seen[1]), /工具选择 Skill v3.*先选只读工具/);
  assert.match(JSON.stringify(seen[2]), /工具选择 Skill.*先选只读工具/);
  assert.equal(
    queryPlanSchema.safeParse({ tool: 'schedule.publish' }).success,
    false,
  );
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
