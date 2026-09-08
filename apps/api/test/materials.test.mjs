import assert from 'node:assert/strict';
import test from 'node:test';
import {
  requirements,
  revision,
} from '../dist/modules/materials/requirements.js';
const fixture = () => ({
  deadline: '2030-06-01T16:00:00+08:00',
  materials: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Synthetic material',
      required: true,
      instructions: 'Synthetic instructions',
      templateVersion: 'synthetic-v1',
      formats: ['pdf'],
      maxBytes: 1000,
      deadline: '2030-06-01T16:00:00+08:00',
      acceptanceStandard: 'Synthetic standard',
    },
  ],
});
test('requirements require valid timezone instants but do not invent a late-submission rule', () => {
  assert.equal(requirements(fixture()).deadline, '2030-06-01T08:00:00.000Z');
  for (const deadline of [
    '2030-02-30T08:00:00Z',
    '2030-06-01T24:00:00Z',
    '2030-06-01T08:00',
    'not-a-date',
  ])
    assert.throws(
      () => requirements({ ...fixture(), deadline }),
      (e) => e.getStatus() === 400,
    );
  assert.equal(
    requirements({ ...fixture(), deadline: '2000-01-01T00:00:00Z' }).deadline,
    '2000-01-01T00:00:00.000Z',
  );
});
test('requirements reject extra fields, duplicates, weak types, oversized limits and empty mandatory metadata', () => {
  for (const change of [
    { required: 'true' },
    { formats: [] },
    { formats: ['pdf', 'pdf'] },
    { formats: ['../exe'] },
    { maxBytes: 0 },
    { maxBytes: 1.2 },
    { maxBytes: 2147483648 },
    { templateVersion: '' },
    { acceptanceStandard: '' },
    { unknown: 'secret' },
  ]) {
    const b = fixture();
    Object.assign(b.materials[0], change);
    assert.throws(() => requirements(b));
  }
  const b = fixture();
  b.materials.push({ ...b.materials[0] });
  assert.throws(() => requirements(b));
  assert.throws(() => requirements({ ...fixture(), materials: [] }));
  for (const value of [0, -1, 1.2, '1']) assert.throws(() => revision(value));
  assert.equal(revision(1), 1);
});
