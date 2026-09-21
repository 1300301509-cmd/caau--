import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beijingDateTime,
  inWeek,
  mondayOf,
  shiftDate,
} from '../src/features/competition/schedule-week';

test('weekly schedule uses Monday boundaries across years and leap days', () => {
  assert.equal(mondayOf('2027-01-03'), '2026-12-28');
  assert.equal(shiftDate('2026-12-28', 7), '2027-01-04');
  assert.equal(shiftDate('2028-02-28', 2), '2028-03-01');
});
test('schedule belongs to Beijing week independently of browser timezone', () => {
  assert.equal(beijingDateTime('2026-09-20T16:00:00Z'), '2026-09-21T00:00');
  assert.equal(inWeek('2026-09-20T16:00:00Z', '2026-09-21'), true);
  assert.equal(inWeek('2026-09-27T16:00:00Z', '2026-09-21'), false);
  assert.equal(inWeek('2026-09-20T15:59:59Z', '2026-09-21'), false);
  assert.equal(inWeek('', '2026-09-21'), false);
});
