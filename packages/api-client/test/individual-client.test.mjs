import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, createApiClient } from '../dist/index.js';

test('generated individual snapshot query is encoded and uses bearer headers without token URL', async () => {
  const client = createApiClient('https://api.invalid', async (request) => {
    assert.equal(
      request.url,
      'https://api.invalid/api/v1/individual-materials/snapshot?selectedId=synthetic%2Fid&limit=20',
    );
    assert.equal(request.header.Authorization, 'Bearer synthetic');
    return {
      status: 200,
      data: {
        serverTime: '2026-09-16T00:00:00.000Z',
        total: 0,
        items: [],
        selected: null,
      },
    };
  });
  assert.equal(
    (
      await client.request('getIndividualSnapshot', {
        token: 'synthetic',
        query: { selectedId: 'synthetic/id', limit: 20, offset: undefined },
      })
    ).total,
    0,
  );
});
test('only contract-valid 409 details are exposed for explicit conflict reconciliation', async () => {
  const current = {
    id: 'synthetic',
    taskId: 'synthetic-task',
    state: 'PENDING_REVIEW',
    revision: 2,
    draftRevision: 0,
    generation: 1,
    contextRevision: 1,
    closed: false,
    deadline: '2099-01-01T00:00:00Z',
    currentSubmissionId: null,
    draft: null,
    submission: null,
    lastAction: null,
  };
  const conflict = {
    code: 'INDIVIDUAL_CONFLICT',
    message: 'Material changed',
    current,
  };
  let data = conflict;
  const client = createApiClient('https://api.invalid', async () => ({
    status: 409,
    data,
  }));
  await assert.rejects(
    client.request('approveIndividualMaterial', {
      path: { id: 'synthetic' },
      body: {},
    }),
    (e) => e instanceof ApiError && e.detail === conflict,
  );
  data = { code: 'bad', current: { state: 'UNKNOWN' } };
  await assert.rejects(
    client.request('approveIndividualMaterial', {
      path: { id: 'synthetic' },
      body: {},
    }),
    (e) => e instanceof ApiError && e.detail === undefined,
  );
});
