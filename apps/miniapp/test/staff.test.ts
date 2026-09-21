import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addAssignment,
  blankProfile,
  profileError,
  type Staff,
  type Assignment,
} from '../src/features/staff/model';

const person: Staff = {
  id: 'person-a',
  eventId: 'event-a',
  revision: 3,
  active: true,
  updatedAt: '2026-09-21',
  profile: {
    ...blankProfile(),
    name: '验收人员',
    roles: ['裁判'],
    organization: '测试单位',
  },
};
test('adding a directory person preserves legacy and historical snapshots without mutating them', () => {
  const legacy: Assignment = {
    id: 'legacy',
    name: '历史姓名',
    role: '记录台',
    organization: '旧单位',
    contactPhone: '',
    notes: '原备注',
  };
  const historical: Assignment = {
    ...legacy,
    id: 'historical',
    sourceStaffId: 'old-person',
    sourceStaffRevision: 1,
  };
  const original = [legacy, historical];
  const next = addAssignment(original, person, 'new-assignment');
  assert.deepEqual(next.slice(0, 2), original);
  assert.equal(original.length, 2);
  assert.ok(next[2]);
  assert.equal(next[2].sourceStaffRevision, 3);
  assert.equal(next[2].name, '验收人员');
  const modified = {
    ...person,
    profile: { ...person.profile, name: '后改姓名' },
  };
  assert.notEqual(next[2].name, modified.profile.name);
});
test('disabled, duplicate and over-capacity assignments are rejected before sending', () => {
  assert.throws(() => addAssignment([], { ...person, active: false }, 'new'));
  const rows = addAssignment([], person, 'first');
  const first = rows[0];
  assert.ok(first);
  assert.throws(() => addAssignment(rows, person, 'second'));
  assert.throws(() =>
    addAssignment(
      Array.from({ length: 30 }, (_, n) => ({
        ...first,
        id: String(n),
        sourceStaffId: `other-${n}`,
      })),
      person,
      'new',
    ),
  );
});
test('required identity, role and optional telephone validation', () => {
  assert.ok(profileError(blankProfile()));
  assert.ok(profileError({ ...person.profile, roles: [] }));
  assert.ok(profileError({ ...person.profile, contactPhone: 'not-a-phone' }));
  assert.equal(profileError(person.profile), '');
  assert.equal(
    profileError({ ...person.profile, contactPhone: '+86 13800000000' }),
    '',
  );
});
