import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createApplication } from '../dist/application.js';
import { readConfig } from '../dist/config.js';

const unavailable = {
  status: 'not_ready',
  service: 'caau-api',
  code: 'DATABASE_UNAVAILABLE',
};

test('without a database configuration readiness is 503 but liveness remains 200', async (t) => {
  const app = await createApplication(readConfig({}));
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const ready = await fetch(`${base}/api/v1/ready`);
  assert.equal(ready.status, 503);
  assert.equal(ready.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await ready.json(), unavailable);
  assert.equal((await fetch(`${base}/api/v1/health`)).status, 200);
  const served = await fetch(`${base}/api/openapi.json`).then((response) =>
    response.json(),
  );
  const generated = JSON.parse(
    await readFile(
      new URL('../../../packages/api-client/openapi.json', import.meta.url),
      'utf8',
    ),
  );
  assert.deepEqual(served, generated);
});

test('probe double validates HTTP state changes and redaction, not a real DB recovery', async (t) => {
  let working = true;
  let closed = false;
  const app = await createApplication(readConfig({}), {
    check: async () => {
      if (!working) throw new Error('synthetic-private-connection-detail');
      return true;
    },
    close: async () => {
      closed = true;
    },
  });
  t.after(async () => {
    await app.close();
    assert.equal(closed, true);
  });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  assert.equal((await fetch(`${base}/api/v1/ready`)).status, 200);
  working = false;
  const failure = await fetch(`${base}/api/v1/ready`);
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), unavailable);
  assert.equal((await fetch(`${base}/api/v1/health`)).status, 200);
  working = true;
  const recovered = await fetch(`${base}/api/v1/ready`);
  assert.equal(recovered.status, 200);
  assert.deepEqual(await recovered.json(), {
    status: 'ready',
    service: 'caau-api',
  });
});

test('a stuck probe cannot block the readiness response indefinitely', async (t) => {
  const app = await createApplication(readConfig({}), {
    check: () => new Promise(() => {}),
    close: async () => {},
  });
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const start = performance.now();
  const response = await fetch(`${await app.getUrl()}/api/v1/ready`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), unavailable);
  assert.ok(performance.now() - start < 2300);
});
