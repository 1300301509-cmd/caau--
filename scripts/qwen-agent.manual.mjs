import assert from 'node:assert/strict';
import { createAgentModel } from '../apps/api/dist/modules/ai/model-adapter.js';

function safeStatus(model) {
  const status = model.status();
  return {
    mode: status.mode,
    modelName: status.modelName,
    baseUrlHost: status.baseUrlHost,
    credentialsConfigured: status.credentialsConfigured,
  };
}

async function main() {
  const model = createAgentModel(process.env);
  if (model.mode !== 'QWEN') {
    console.error(
      'Qwen manual acceptance requires CAAU_QWEN_API_KEY in the process environment or .local/agent/qwen.env.',
    );
    process.exitCode = 2;
    return;
  }
  console.log('Qwen manual acceptance target:', safeStatus(model));

  async function expectIntent(label, message, known, expected) {
    const actual = await model.parse(message, known);
    assert.deepEqual(actual, expected, `${label} returned an unexpected patch`);
    console.log(`PASS ${label}:`, actual);
    return actual;
  }

  await expectIntent(
    'single sentence',
    '把周六第二场比赛改到周日十点',
    {},
    {
      sourceWeekday: 6,
      sourceOrdinal: 2,
      targetWeekday: 7,
      targetHour: 10,
      targetMinute: 0,
    },
  );
  await expectIntent(
    'alternate wording',
    '将星期六的第2场比赛调整到星期日上午10点',
    {},
    {
      sourceWeekday: 6,
      sourceOrdinal: 2,
      targetWeekday: 7,
      targetHour: 10,
      targetMinute: 0,
    },
  );

  let known = {};
  const first = await expectIntent(
    'multi-turn source and target day',
    '把周六第二场移到周日',
    known,
    { sourceWeekday: 6, sourceOrdinal: 2, targetWeekday: 7 },
  );
  known = { ...known, ...first };
  const second = await expectIntent(
    'multi-turn target clock',
    '上午十点',
    known,
    { targetHour: 10, targetMinute: 0 },
  );
  known = { ...known, ...second };
  await expectIntent('multi-turn relative time', '再晚半小时', known, {
    targetOffsetMinutes: 30,
  });

  await expectIntent('change source match', '换成周六第三场', known, {
    sourceWeekday: 6,
    sourceOrdinal: 3,
  });
  await expectIntent(
    'explicit calendar date',
    '改到2027-06-08上午十点',
    known,
    { targetDate: '2027-06-08', targetHour: 10, targetMinute: 0 },
  );
  console.log(
    'Qwen manual intent acceptance completed without database access.',
  );
}

main().catch(() => {
  console.error(
    'Qwen manual intent acceptance failed; provider details were suppressed.',
  );
  process.exitCode = 1;
});
