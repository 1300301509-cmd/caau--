import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCandidate,
  auditCandidate,
} from '../dist/modules/ai/candidate.algorithm.js';

const ids = ['a', 'b', 'c', 'd'];
const teams = ids.map((id) => ({ id, name: id, active: true }));
const config = {
  teamIds: ids,
  venues: ['北场', '南场'],
  startDate: '2027-06-01',
  endDate: '2027-06-04',
  dailyStart: '09:00',
  dailyEnd: '16:00',
  durationMinutes: 40,
  bufferMinutes: 10,
  minRestMinutes: 60,
};
const window = (
  id,
  teamId,
  availability,
  dates,
  priority = 'MUST',
  startTime = '00:00',
  endTime = '24:00',
) => ({
  id,
  kind: 'TEAM_WINDOW',
  eventId: 'e',
  priority,
  confirmation: 'CONFIRMED',
  sourceTurnIds: ['source'],
  teamId,
  availability,
  dates,
  startTime,
  endTime,
});
const pair = (match) =>
  [match.homeEventTeamId, match.awayEventTeamId].sort().join(':');

test('four-team single round-robin is complete, hard Wednesday/blocked windows, multi-venue, rest and buffers are independently verified', () => {
  const rules = [
    window('only', 'd', 'ONLY', ['2027-06-02']),
    window('block', 'a', 'BLOCK', ['2027-06-01'], 'MUST', '00:00', '24:00'),
  ];
  const result = calculateCandidate(config, teams, rules, [], []);
  assert.equal(result.outcome, 'FOUND');
  assert.equal(result.matches.length, 6);
  assert.equal(new Set(result.matches.map(pair)).size, 6);
  assert.ok(
    result.matches.every((m) => m.startAt && config.venues.includes(m.venue)),
  );
  assert.ok(
    result.matches
      .filter((m) => pair(m).includes('d'))
      .every((m) => m.startAt.startsWith('2027-06-02')),
  );
  assert.deepEqual(
    auditCandidate(config, teams, result.matches, rules, []),
    [],
  );
  const overlap = result.matches.map((m) => ({ ...m }));
  overlap[1].startAt = overlap[0].startAt;
  overlap[1].venue = overlap[0].venue;
  assert.ok(
    auditCandidate(config, teams, overlap, rules, []).some((issue) =>
      ['VENUE_OVERLAP', 'VENUE_BUFFER'].includes(issue.code),
    ),
  );
  assert.ok(new Set(result.matches.map((match) => match.venue)).size >= 2);
  const resting = result.matches.map((match) => ({ ...match }));
  const shared = resting.find(
    (match, index) =>
      index > 0 &&
      [resting[0].homeEventTeamId, resting[0].awayEventTeamId].includes(
        match.homeEventTeamId,
      ),
  );
  shared.startAt = new Date(
    Date.parse(resting[0].startAt) + 50 * 60000,
  ).toISOString();
  shared.venue = resting[0].venue === '北场' ? '南场' : '北场';
  assert.ok(
    auditCandidate(config, teams, resting, rules, []).some(
      (issue) => issue.code === 'TEAM_REST',
    ),
  );
  const missing = result.matches.slice(1);
  assert.ok(
    auditCandidate(config, teams, missing, rules, []).some(
      (issue) => issue.code === 'FORMAT_COUNT',
    ),
  );
  const duplicate = result.matches.map((m) => ({ ...m }));
  duplicate[1].homeEventTeamId = duplicate[0].homeEventTeamId;
  duplicate[1].awayEventTeamId = duplicate[0].awayEventTeamId;
  assert.ok(
    auditCandidate(config, teams, duplicate, rules, []).some(
      (issue) => issue.code === 'FORMAT_PAIR',
    ),
  );
});

test('proven necessary conflict differs from search limit; MUST never relaxed for preferences', () => {
  const contradicted = calculateCandidate(
    config,
    teams,
    [
      window('only', 'd', 'ONLY', ['2027-06-02']),
      window('blocked', 'd', 'BLOCK', ['2027-06-02']),
    ],
    [],
    [],
  );
  assert.equal(contradicted.outcome, 'PROVEN_CONFLICT');
  const capacity = calculateCandidate(
    {
      ...config,
      startDate: '2027-06-02',
      endDate: '2027-06-02',
      dailyStart: '09:00',
      dailyEnd: '09:40',
      venues: ['北场'],
    },
    teams,
    [],
    [],
    [],
  );
  assert.equal(capacity.outcome, 'PROVEN_CONFLICT');
  const limited = calculateCandidate(
    {
      ...config,
      teamIds: ids,
      dailyStart: '00:00',
      dailyEnd: '23:59',
      startDate: '2027-06-01',
      endDate: '2027-07-01',
      venues: ['1', '2', '3', '4', '5'],
    },
    teams,
    [],
    [],
    [],
  );
  assert.equal(limited.outcome, 'SEARCH_LIMIT');
  const pref = calculateCandidate(
    config,
    teams,
    [
      window('block', 'd', 'BLOCK', ['2027-06-01']),
      window('wish', 'd', 'ONLY', ['2027-06-01'], 'PREFER'),
    ],
    [],
    [],
  );
  assert.equal(pref.outcome, 'FOUND');
  assert.equal(pref.preferences[0].status, 'UNMET');
  assert.deepEqual(
    auditCandidate(
      config,
      teams,
      pref.matches,
      [window('block', 'd', 'BLOCK', ['2027-06-01'])],
      [],
    ),
    [],
  );
});

test('fixed match remains unchanged; invalid hard/fixed collisions fail closed', () => {
  const baseline = calculateCandidate(config, teams, [], [], []).matches;
  const fixed = baseline[0];
  const preserved = calculateCandidate(config, teams, [], baseline, [fixed.id]);
  assert.equal(preserved.outcome, 'FOUND');
  assert.equal(
    preserved.matches.find((m) => m.id === fixed.id).startAt,
    fixed.startAt,
  );
  assert.ok(
    auditCandidate(config, teams, preserved.matches, [], [fixed]).length === 0,
  );
  const impossible = calculateCandidate(
    config,
    teams,
    [
      window('blocked', fixed.homeEventTeamId, 'BLOCK', [
        '2027-06-01',
        '2027-06-02',
        '2027-06-03',
        '2027-06-04',
      ]),
    ],
    baseline,
    [fixed.id],
  );
  assert.equal(impossible.outcome, 'PROVEN_CONFLICT');
});
