import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bj,
  scheduleDay,
  upcomingMatches,
  shift,
  monday,
  inWeek,
  emptyTeam,
  teamError,
  supplyPhotoExtension,
} from '../src/features/competition/model';
test('mobile week keeps Beijing dates across year and leap-day boundaries', () => {
  assert.equal(bj('2026-12-31T16:30:00Z'), '2027-01-01T00:30');
  assert.equal(monday('2027-01-01'), '2026-12-28');
  assert.equal(shift('2028-02-28', 1), '2028-02-29');
  assert.equal(inWeek('2027-01-03T15:59:59Z', '2026-12-28'), true);
  assert.equal(inWeek('2027-01-03T16:00:00Z', '2026-12-28'), false);
  assert.equal(inWeek('', '2026-12-28'), false);
});
test('team creation refuses incomplete required fields without requiring optional club data', () => {
  assert.ok(teamError(emptyTeam()));
  const team = {
    ...emptyTeam(),
    name: '合成球队',
    contactName: '测试负责人',
    contactPhone: '13800000000',
    province: '测试省',
    city: '测试市',
  };
  assert.equal(teamError(team), '');
  assert.ok(teamError({ ...team, city: ' ' }));
  assert.ok(teamError({ ...team, contactPhone: 'invalid' }));
});
test('photo preflight checks actual signature and byte limit, not filename extension', () => {
  assert.equal(
    supplyPhotoExtension(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer,
    ),
    'png',
  );
  assert.equal(
    supplyPhotoExtension(new Uint8Array([255, 216, 255, 224]).buffer),
    'jpg',
  );
  assert.throws(() => supplyPhotoExtension(new Uint8Array([137, 80]).buffer));
  assert.throws(() => supplyPhotoExtension(new ArrayBuffer(0)));
  assert.throws(() => supplyPhotoExtension(new ArrayBuffer(10485761)));
  assert.throws(() =>
    supplyPhotoExtension(new TextEncoder().encode('fake image').buffer),
  );
});

test('day filter keeps unscheduled matches and clears stale day when week changes', () => {
  const matches = [
    { id: 'mon', startAt: '2026-09-21T01:00:00Z' },
    { id: 'tue', startAt: '2026-09-21T16:00:00Z' },
    { id: 'later', startAt: '2026-09-28T01:00:00Z' },
    { id: 'pending', startAt: '' },
  ];
  assert.deepEqual(
    scheduleDay(matches, '2026-09-21', '2026-09-22').map((m) => m.id),
    ['tue', 'pending'],
  );
  assert.deepEqual(
    scheduleDay(matches, '2026-09-28', '2026-09-22').map((m) => m.id),
    ['later', 'pending'],
  );
  assert.deepEqual(
    scheduleDay(matches, '2026-09-21', '').map((m) => m.id),
    ['mon', 'tue', 'pending'],
  );
});
test('upcoming matches sort by absolute time and exclude past or unscheduled without mutating input', () => {
  const matches = [
    { startAt: '2026-09-22T10:00:00+08:00' },
    { startAt: '' },
    { startAt: '2026-09-22T01:00:00Z' },
    { startAt: '2026-09-20T00:00:00Z' },
  ];
  const original = JSON.stringify(matches);
  assert.deepEqual(
    upcomingMatches(matches, Date.parse('2026-09-22T01:00:00Z')).map(
      (m) => m.startAt,
    ),
    ['2026-09-22T01:00:00Z', '2026-09-22T10:00:00+08:00'],
  );
  assert.equal(JSON.stringify(matches), original);
});
