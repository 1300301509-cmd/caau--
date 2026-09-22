import assert from 'node:assert/strict';
import test from 'node:test';
import { RuleAgentModelAdapter } from '../dist/modules/ai/model-adapter.js';
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
