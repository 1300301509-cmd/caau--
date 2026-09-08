import assert from 'node:assert/strict';
import test from 'node:test';
import { getHealth } from '../src/features/health/api';

test('Web requests the agreed endpoint with a timeout and validates the body', async () => {
  const request: typeof fetch = async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:3000/api/v1/health');
    assert.ok(options?.signal);
    return Response.json({ status: 'ok', service: 'caau-api' });
  };
  assert.deepEqual(await getHealth('http://127.0.0.1:3000/', request), {
    status: 'ok',
    service: 'caau-api',
  });
});

test('Web rejects HTTP errors, malformed bodies and network failure', async () => {
  await assert.rejects(
    getHealth(
      'http://localhost',
      async () => new Response('', { status: 503 }),
    ),
    /HTTP 503/,
  );
  await assert.rejects(
    getHealth('http://localhost', async () => Response.json({ status: 'ok' })),
    /格式/,
  );
  await assert.rejects(
    getHealth('http://localhost', async () => {
      throw new Error('network down');
    }),
    /network down/,
  );
});
