import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  generateSchedule,
  validateConfig,
  validateSchedule,
} from '../dist/modules/scheduling/scheduling.algorithm.js';

const divisionA = '20000000-0000-4000-8000-000000000001';
const divisionB = '20000000-0000-4000-8000-000000000002';
const teams = [1, 2, 3].map((index) => ({
  id: `00000000-0000-4000-8000-00000000010${index}`,
  name: `Synthetic team ${index}`,
  active: true,
  divisionId: divisionA,
  divisionName: 'U12 男子组',
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

test('two divisions generate only within-division pairings in shared slots', () => {
  const other = [1, 2].map((index) => ({
    id: `30000000-0000-4000-8000-00000000010${index}`,
    name: `Other division ${index}`,
    active: true,
    divisionId: divisionB,
    divisionName: 'U14 女子组',
  }));
  const roster = [...teams, ...other];
  const result = generateSchedule(
    'ROUND_ROBIN',
    { ...config, teamIds: roster.map((team) => team.id) },
    roster,
    randomUUID,
  );
  assert.equal(result.matches.length, 4);
  assert.equal(result.issues.length, 0);
  assert.equal(new Set(result.matches.map((match) => match.order)).size, 4);
  assert.equal(
    new Set(result.matches.map((match) => `${match.startAt}|${match.venue}`))
      .size,
    4,
  );
  for (const match of result.matches) {
    const home = roster.find((team) => team.id === match.homeEventTeamId);
    const away = roster.find((team) => team.id === match.awayEventTeamId);
    assert.equal(home.divisionId, away.divisionId);
    assert.equal(match.divisionId, home.divisionId);
    assert.equal(match.divisionLabel, home.divisionName);
  }
  const tampered = result.matches.map((match) => ({ ...match }));
  tampered[0].awayEventTeamId = other[0].id;
  assert.ok(
    validateSchedule(
      { ...config, teamIds: roster.map((team) => team.id) },
      tampered,
      roster,
    ).some((issue) => issue.code === 'DIVISION_MISMATCH'),
  );
});

test('unassigned team and legacy match are hard publish conflicts', () => {
  const unassigned = teams.map((team) => ({ ...team, divisionId: null }));
  assert.throws(
    () => generateSchedule('ROUND_ROBIN', config, unassigned, randomUUID),
    /active division/,
  );
  const generated = generateSchedule('ROUND_ROBIN', config, teams, randomUUID);
  assert.ok(
    validateSchedule(
      config,
      generated.matches.map((match) => ({ ...match, divisionId: null })),
      teams,
    ).some((issue) => issue.code === 'DIVISION_UNASSIGNED'),
  );
});

test('renamed division invalidates a draft while preserving its historical label', () => {
  const generated = generateSchedule('ROUND_ROBIN', config, teams, randomUUID);
  const renamedTeams = teams.map((team) => ({
    ...team,
    divisionName: 'U12 混合组',
  }));
  assert.ok(
    validateSchedule(config, generated.matches, renamedTeams).some(
      (issue) => issue.code === 'DIVISION_LABEL_STALE',
    ),
  );
  assert.ok(
    generated.matches.every((match) => match.divisionLabel === 'U12 男子组'),
  );
});

test('a legacy match cannot reference a team outside the current event schedule', () => {
  const generated = generateSchedule('ROUND_ROBIN', config, teams, randomUUID);
  const tampered = generated.matches.map((match) => ({ ...match }));
  tampered[0].homeEventTeamId = randomUUID();
  assert.ok(
    validateSchedule(config, tampered, teams).some(
      (issue) => issue.code === 'TEAM_REFERENCE_INVALID',
    ),
  );
});

test('elimination dependencies stay inside each division', () => {
  const roster = [divisionA, divisionB].flatMap((divisionId, group) =>
    [1, 2, 3, 4].map((index) => ({
      id: `40000000-0000-4000-8000-000000000${group}${index}0`,
      name: `Group ${group} team ${index}`,
      active: true,
      divisionId,
      divisionName: group ? 'U14 女子组' : 'U12 男子组',
    })),
  );
  const result = generateSchedule(
    'SINGLE_ELIMINATION',
    { ...config, teamIds: roster.map((team) => team.id) },
    roster,
    randomUUID,
  );
  assert.equal(result.matches.length, 6);
  assert.equal(result.issues.length, 0);
  const byId = new Map(result.matches.map((match) => [match.id, match]));
  assert.equal(new Set(result.matches.map((match) => match.order)).size, 6);
  for (const match of result.matches)
    for (const sourceId of [
      match.homeSourceMatchId,
      match.awaySourceMatchId,
    ].filter(Boolean))
      assert.equal(byId.get(sourceId).divisionId, match.divisionId);
});
