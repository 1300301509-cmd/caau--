import test from 'node:test';
import assert from 'node:assert/strict';
import {
  billingPeriods,
  estimateMicros,
  UsageService,
} from '../dist/modules/governance/usage.service.js';
import {
  redact,
  failureResult,
} from '../dist/modules/governance/request-context.js';
test('governance: Beijing day and month boundaries, integer currency and credential redaction', () => {
  assert.deepEqual(billingPeriods(new Date('2026-09-30T15:59:59Z')), [
    '2026-09-30',
    '2026-09',
  ]);
  assert.deepEqual(billingPeriods(new Date('2026-09-30T16:00:00Z')), [
    '2026-10-01',
    '2026-10',
  ]);
  assert.equal(
    estimateMicros(1000, 3000, 200, {
      inputMicrosPerMillion: 1000000n,
      outputMicrosPerMillion: 2000000n,
      cachedMicrosPerMillion: 500000n,
    }),
    6900n,
  );
  assert.equal(
    estimateMicros(1, 0, null, {
      inputMicrosPerMillion: 1n,
      outputMicrosPerMillion: 1n,
      cachedMicrosPerMillion: null,
    }),
    1n,
  );
  assert.doesNotMatch(
    redact('Bearer abcdef api_key=private sk-abc.def password:foo'),
    /abcdef|private|abc.def|foo/,
  );
  assert.deepEqual([403, 409, 400, 503].map(failureResult), [
    'DENIED',
    'CONFLICT',
    'INVALID',
    'FAILED',
  ]);
});

test('governance: usage transaction retries nested serialization conflicts without retrying other errors', async () => {
  const service = new UsageService({});
  const conflicts = [
    { code: 'P2034' },
    { meta: { driverAdapterError: { cause: { originalCode: '40001' } } } },
    { cause: { originalCode: '40P01', kind: 'TransactionWriteConflict' } },
  ];
  let attempts = 0;
  service.db = {
    client: {
      $transaction: async (work, options) => {
        assert.equal(options.isolationLevel, 'Serializable');
        attempts += 1;
        if (conflicts.length) throw conflicts.shift();
        return work({});
      },
    },
  };
  assert.equal(await service.transaction(async () => 'settled'), 'settled');
  assert.equal(attempts, 4);

  const unrelated = new Error('other database failure');
  service.db.client.$transaction = async () => {
    attempts += 1;
    throw unrelated;
  };
  await assert.rejects(
    service.transaction(async () => 'unused'),
    (error) => error === unrelated,
  );
  assert.equal(attempts, 5);

  const exhausted = { cause: { originalCode: '40001' } };
  service.db.client.$transaction = async () => {
    attempts += 1;
    throw exhausted;
  };
  await assert.rejects(
    service.transaction(async () => 'unused'),
    (error) => error === exhausted,
  );
  assert.equal(attempts, 11);
});
