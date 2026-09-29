import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AgentStreamInterruptedError,
  ApiError,
  createApiClient,
  createAgentStreamDecoder,
} from '../dist/index.js';
import {
  createFetchTransport,
  streamAgentMessageFetch,
} from '../dist/fetch.js';
import { createTaroTransport, streamAgentMessageTaro } from '../dist/taro.js';

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

test('conversation request has enough time for routing and model reply on fetch and Taro', async () => {
  const client = createApiClient('http://localhost', async (options) => {
    assert.equal(options.method, 'POST');
    assert.equal(options.timeout, 95000);
    return {
      status: 200,
      data: {
        sessionId: '00000000-0000-4000-8000-000000000001',
        status: 'CHAT',
        message: '你好',
        candidates: [],
        task: null,
      },
    };
  });
  assert.equal(
    (
      await client.request('sendAgentMessage', {
        path: { sessionId: '00000000-0000-4000-8000-000000000001' },
        body: { message: '你好' },
      })
    ).status,
    'CHAT',
  );
});

test('stream decoder handles split UTF-8 and JSON boundaries, then requires a final persisted result', () => {
  const shown = [];
  const decoder = createAgentStreamDecoder((piece) => shown.push(piece));
  const final = {
    sessionId: '00000000-0000-4000-8000-000000000001',
    status: 'CHAT',
    message: '你好，赛程可以讨论。',
    candidates: [],
    task: null,
    planningRequest: null,
  };
  const bytes = new TextEncoder().encode(
    `${JSON.stringify({ type: 'phase', value: 'WORKING' })}\n${JSON.stringify({ type: 'delta', text: '你好，' })}\n${JSON.stringify({ type: 'delta', text: '赛程可以讨论。' })}\n${JSON.stringify({ type: 'result', reply: final })}\n`,
  );
  for (let offset = 0; offset < bytes.length; offset += 3)
    decoder.push(bytes.slice(offset, offset + 3));
  assert.deepEqual(shown, ['你好，', '赛程可以讨论。']);
  assert.deepEqual(decoder.finish(), final);
  const interrupted = createAgentStreamDecoder(() => {});
  interrupted.push(
    new TextEncoder().encode('{"type":"delta","text":"未保存"}\n'),
  );
  assert.throws(() => interrupted.finish(), /中断/);
  const failed = createAgentStreamDecoder(() => {});
  assert.throws(
    () =>
      failed.push(new TextEncoder().encode('{"type":"error","status":403}\n')),
    (error) => error instanceof ApiError && error.status === 403,
  );
});

test('fetch and Taro stream transports deliver deltas and the same final reply', async () => {
  const final = {
    sessionId: '00000000-0000-4000-8000-000000000001',
    status: 'CHAT',
    message: '你好',
    candidates: [],
    task: null,
    planningRequest: null,
  };
  const bytes = new TextEncoder().encode(
    `${JSON.stringify({ type: 'delta', text: '你' })}\n${JSON.stringify({ type: 'delta', text: '好' })}\n${JSON.stringify({ type: 'result', reply: final })}\n`,
  );
  const browserDeltas = [];
  const browser = await streamAgentMessageFetch({
    baseUrl: 'http://localhost',
    sessionId: final.sessionId,
    body: { message: '你好' },
    csrfToken: 'synthetic-csrf',
    onDelta: (part) => browserDeltas.push(part),
    request: async (url, options) => {
      assert.equal(
        url,
        `http://localhost/api/v1/agent/sessions/${final.sessionId}/messages/stream`,
      );
      assert.equal(options.headers['X-CSRF-Token'], 'synthetic-csrf');
      assert.equal(options.credentials, 'include');
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.slice(0, 11));
            controller.enqueue(bytes.slice(11));
            controller.close();
          },
        }),
        { status: 200 },
      );
    },
  });
  assert.deepEqual(browserDeltas, ['你', '好']);
  assert.deepEqual(browser, final);
  const mobileDeltas = [];
  const mobile = await streamAgentMessageTaro(
    {
      baseUrl: 'http://localhost',
      sessionId: final.sessionId,
      body: { message: '你好' },
      token: 'synthetic-token',
      onDelta: (part) => mobileDeltas.push(part),
    },
    (options) => {
      assert.equal(options.enableChunked, true);
      assert.equal(options.header.Authorization, 'Bearer synthetic-token');
      let onChunk;
      const task = new Promise((resolve) =>
        queueMicrotask(() => {
          onChunk({ data: bytes.slice(0, 9).buffer });
          onChunk({ data: bytes.slice(9).buffer });
          resolve({ statusCode: 200, data: bytes.buffer });
        }),
      );
      task.onChunkReceived = (callback) => {
        onChunk = callback;
      };
      task.abort = () => {};
      return task;
    },
  );
  assert.deepEqual(mobileDeltas, ['你', '好']);
  assert.deepEqual(mobile, final);
});

test('Taro stream can cancel its native request task without AbortController', async () => {
  const originalAbortController = globalThis.AbortController;
  globalThis.AbortController = undefined;
  let aborted = 0;
  try {
    const response = streamAgentMessageTaro(
      {
        baseUrl: 'http://localhost',
        sessionId: '00000000-0000-4000-8000-000000000001',
        body: { message: '你好' },
        token: 'synthetic-token',
        onDelta: () => {},
        onRequestTask: (task) => task.abort(),
      },
      () => {
        let rejectRequest;
        const task = new Promise((_, reject) => {
          rejectRequest = reject;
        });
        task.onChunkReceived = () => {};
        task.abort = () => {
          aborted++;
          rejectRequest(new Error('request:fail abort'));
        };
        return task;
      },
    );
    await assert.rejects(response, AgentStreamInterruptedError);
    assert.equal(aborted, 1);
  } finally {
    globalThis.AbortController = originalAbortController;
  }
});

test('Taro stream reports an error after provisional text without a saved result', async () => {
  const body = { message: '按照早上 1 场、下午 2 场、晚上 1 场编排赛程' };
  const deltas = [];
  const response = streamAgentMessageTaro(
    {
      baseUrl: 'http://localhost',
      sessionId: '00000000-0000-4000-8000-000000000001',
      body,
      token: 'synthetic-token',
      onDelta: (part) => deltas.push(part),
    },
    (options) => {
      assert.deepEqual(options.data, body);
      let rejectRequest;
      const task = new Promise((_, reject) => {
        rejectRequest = reject;
      });
      task.onChunkReceived = (callback) => {
        queueMicrotask(() =>
          callback({
            data: new TextEncoder().encode(
              '{"type":"delta","text":"正在整理"}\n{"type":"error","status":503}\n',
            ).buffer,
          }),
        );
      };
      task.abort = () => rejectRequest(new Error('request:fail abort'));
      return task;
    },
  );
  await assert.rejects(
    response,
    (error) => error instanceof ApiError && error.status === 503,
  );
  assert.deepEqual(deltas, ['正在整理']);
  assert.equal(body.message, '按照早上 1 场、下午 2 场、晚上 1 场编排赛程');
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
