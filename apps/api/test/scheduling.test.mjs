import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  generateSchedule,
  validateConfig,
} from '../dist/modules/scheduling/scheduling.algorithm.js';

const teams = [1, 2, 3].map((index) => ({
  id: `00000000-0000-4000-8000-00000000010${index}`,
  name: `Synthetic team ${index}`,
  active: true,
}));
const config = validateConfig({
  teamIds: teams.map((team) => team.id),
  venues: ['Court A'],
  startDate: '2027-06-01',
  endDate: '2027-06-02',
  dailyStart: '09:00',
  dailyEnd: '18:00',
  durationMinutes: 40,
  bufferMinutes: 10,
  minRestMinutes: 60,
});

test('odd round robin gives every pair one match and valid Beijing slots', () => {
  let sequence = 0;
  const result = generateSchedule(
    'ROUND_ROBIN',
    config,
    teams,
    () => `10000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
  );
  assert.equal(result.matches.length, 3);
  assert.equal(result.issues.length, 0);
  assert.deepEqual(
    new Set(
      result.matches.map((match) =>
        [match.homeEventTeamId, match.awayEventTeamId].sort().join('|'),
      ),
    ).size,
    3,
  );
  assert.ok(result.matches.every((match) => match.startAt && match.venue));
});

test('single elimination rejects a non power-of-two team count', () => {
  assert.throws(
    () => generateSchedule('SINGLE_ELIMINATION', config, teams, randomUUID),
    /2\/4\/8\/16\/32/,
  );
});
