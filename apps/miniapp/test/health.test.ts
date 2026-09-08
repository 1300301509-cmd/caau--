import assert from 'node:assert/strict';
import test from 'node:test';
import { getHealth, type HealthRequest } from '../src/features/health/api';

test('miniapp uses the same endpoint and a bounded GET request', async () => {
  const request: HealthRequest = async (options) => {
    assert.deepEqual(options, {
      url: 'http://127.0.0.1:3000/api/v1/health',
      method: 'GET',
      timeout: 5000,
    });
    return { statusCode: 200, data: { status: 'ok', service: 'caau-api' } };
  };
  assert.deepEqual(await getHealth('http://127.0.0.1:3000/', request), {
    status: 'ok',
    service: 'caau-api',
  });
});

test('miniapp rejects HTTP errors, malformed bodies and platform failures', async () => {
  await assert.rejects(
    getHealth('http://localhost', async () => ({ statusCode: 503, data: {} })),
    /HTTP 503/,
  );
  await assert.rejects(
    getHealth('http://localhost', async () => ({
      statusCode: 200,
      data: { status: 'ok' },
    })),
    /格式/,
  );
  await assert.rejects(
    getHealth('http://localhost', async () => {
      throw new Error('request timeout');
    }),
    /timeout/,
  );
});
