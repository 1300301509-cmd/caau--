import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAgentModel,
  intentSchema,
  qwenIntentSystemPrompt,
  RuleAgentModelAdapter,
} from '../dist/modules/ai/model-adapter.js';
import { mergeAgentIntent } from '../dist/modules/ai/ai.service.js';
import { calculateAdjustmentPreview } from '../dist/modules/scheduling/scheduling.algorithm.js';

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
