import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, createApiClient } from '../dist/index.js';
import { createFetchTransport } from '../dist/fetch.js';
import { createTaroTransport } from '../dist/taro.js';

const ready = { status: 'ready', service: 'caau-api' };
const notReady = {
  status: 'not_ready',
  service: 'caau-api',
  code: 'DATABASE_UNAVAILABLE',
};

test('generated readiness route and success response are consumed by the portable client', async () => {
  const client = createApiClient('http://127.0.0.1:3000/', async (options) => {
    assert.deepEqual(options, {
      url: 'http://127.0.0.1:3000/api/v1/ready',
      method: 'GET',
      timeout: 5000,
    });
    return { status: 200, data: ready };
  });
  assert.deepEqual(await client.getReadiness(), ready);
});

test('known 503 has a typed stable code; unknown errors never echo server bodies', async () => {
  const client = createApiClient('http://localhost', async () => ({
    status: 503,
    data: notReady,
  }));
  await assert.rejects(
    client.getReadiness(),
    (error) =>
      error instanceof ApiError &&
      error.status === 503 &&
      error.code === 'DATABASE_UNAVAILABLE',
  );
  const invalid = createApiClient('http://localhost', async () => ({
    status: 500,
    data: { message: 'synthetic-private-detail' },
  }));
  await assert.rejects(invalid.getHealth(), { message: '接口返回 HTTP 500' });
});

test('success shape validation comes from generated enum metadata', async () => {
  const client = createApiClient('http://localhost', async () => ({
    status: 200,
    data: { status: 'ok', service: 'wrong-service' },
  }));
  await assert.rejects(client.getHealth(), /生成契约/);
});

test('fetch adapter preserves status on non-JSON responses and aborts a stuck request', async () => {
  const transport = createFetchTransport(
    async () => new Response('not json', { status: 502 }),
  );
  assert.deepEqual(
    await transport({ url: 'http://localhost', method: 'GET', timeout: 30 }),
    { status: 502, data: undefined },
  );
  const stuck = createFetchTransport(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          'abort',
          () => reject(new Error('aborted')),
          { once: true },
        );
      }),
  );
  await assert.rejects(
    stuck({ url: 'http://localhost', method: 'GET', timeout: 20 }),
    /aborted/,
  );
});

test('fetch adapter includes Web cookies and CSRF but omits cookies for Bearer calls', async () => {
  const calls = [];
  let unauthorized = 0;
  const transport = createFetchTransport(
    async (_url, options) => {
      calls.push(options);
      return options.method === 'DELETE'
        ? Response.json({}, { status: 401 })
        : Response.json({ id: '00000000-0000-4000-8000-000000000001' });
    },
    {
      csrfToken: () => 'synthetic-csrf',
      onUnauthorized: () => unauthorized++,
    },
  );
  await transport({
    url: 'http://localhost/logout',
    method: 'POST',
    timeout: 100,
  });
  await transport({
    url: 'http://localhost/action',
    method: 'POST',
    timeout: 100,
    header: { Authorization: 'Bearer synthetic' },
  });
  assert.equal(calls[0].credentials, 'include');
  assert.equal(calls[0].headers['X-CSRF-Token'], 'synthetic-csrf');
  assert.equal(calls[1].credentials, 'omit');
  assert.equal('X-CSRF-Token' in calls[1].headers, false);
  await transport({
    url: 'http://localhost/session',
    method: 'DELETE',
    timeout: 100,
  });
  assert.equal(unauthorized, 1);
});

test('Taro adapter uses only the supplied request capability', async () => {
  const transport = createTaroTransport(async (options) => {
    assert.equal(options.timeout, 5000);
    return { statusCode: 503, data: notReady };
  });
  assert.deepEqual(
    await transport({ url: 'http://localhost', method: 'GET', timeout: 5000 }),
    { status: 503, data: notReady },
  );
});

test('generated authorization paths, methods, bodies and headers reach fetch and Taro', async () => {
  for (const mode of ['fetch', 'taro']) {
    const inspect = (url, method, header, body) => {
      assert.equal(
        url,
        'http://localhost/api/v1/authorization/task-scopes/synthetic%2Fid/reviewer',
      );
      assert.equal(method, 'PATCH');
      assert.equal(header.Authorization, 'Bearer synthetic-test-token');
      assert.deepEqual(body, { reviewerGrantId: null });
    };
    const transport =
      mode === 'fetch'
        ? createFetchTransport(async (url, options) => {
            inspect(
              url,
              options.method,
              options.headers,
              JSON.parse(options.body),
            );
            assert.equal(options.credentials, 'omit');
            return Response.json({ id: 'synthetic-id' });
          })
        : createTaroTransport(async (options) => {
            inspect(options.url, options.method, options.header, options.data);
            return { statusCode: 200, data: { id: 'synthetic-id' } };
          });
    const client = createApiClient('http://localhost', transport);
    assert.deepEqual(
      await client.request('assignTaskReviewer', {
        token: 'synthetic-test-token',
        path: { id: 'synthetic/id' },
        body: { reviewerGrantId: null },
      }),
      { id: 'synthetic-id' },
    );
  }
});

test('authorization responses validate required fields and array item shapes', async () => {
  const client = createApiClient('http://localhost', async () => ({
    status: 200,
    data: [{}],
  }));
  await assert.rejects(client.request('getSecurityAudit'), /生成契约/);
  await assert.rejects(client.request('getIdentity'), /生成契约/);
});

test('photo removal accepts REMOVED including retry and allows the following list refresh', async () => {
  const photo = {
    id: '00000000-0000-4000-8000-000000000001',
    originalName: 'test.png',
    extension: 'png',
    expectedBytes: 99,
    state: 'REMOVED',
    confirmedAt: '2026-09-21T00:00:00.000Z',
  };
  const calls = [];
  const client = createApiClient('http://localhost', async (request) => {
    calls.push(request.method);
    return { status: 200, data: request.method === 'POST' ? photo : [] };
  });
  const input = { path: { id: photo.id }, body: { expectedRevision: 2 } };
  assert.equal(
    (await client.request('removeEventSupplyPhoto', input)).state,
    'REMOVED',
  );
  assert.deepEqual(
    await client.request('listEventSupplies', {
      path: { eventId: '00000000-0000-4000-8000-000000000002' },
    }),
    [],
  );
  assert.equal(
    (await client.request('removeEventSupplyPhoto', input)).state,
    'REMOVED',
  );
  assert.deepEqual(calls, ['POST', 'GET', 'POST']);
  const invalid = createApiClient('http://localhost', async () => ({
    status: 200,
    data: { ...photo, state: 'UNKNOWN' },
  }));
  await assert.rejects(
    invalid.request('removeEventSupplyPhoto', input),
    /生成契约/,
  );
});
