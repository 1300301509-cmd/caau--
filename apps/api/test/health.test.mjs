import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplication } from '../dist/application.js';
import { readConfig } from '../dist/config.js';

test('real HTTP health endpoint, CORS and unknown route', async (t) => {
  const app = await createApplication(readConfig({}));
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const response = await fetch(`${base}/api/v1/health`, {
    headers: { Origin: 'http://127.0.0.1:5175' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(
    response.headers.get('access-control-allow-origin'),
    'http://127.0.0.1:5175',
  );
  assert.deepEqual(await response.json(), {
    status: 'ok',
    service: 'caau-api',
  });
  const denied = await fetch(`${base}/api/v1/health`, {
    headers: { Origin: 'https://not-allowed.invalid' },
  });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  assert.equal((await fetch(`${base}/api/v1/unknown`)).status, 404);
});

test('invalid port and wildcard CORS configuration fail fast', () => {
  for (const PORT of ['0', '-1', '65536', 'abc', '1.2']) {
    assert.throws(() => readConfig({ PORT }));
  }
  assert.throws(() => readConfig({ CORS_ORIGINS: '*' }));
  assert.throws(() =>
    readConfig({ CORS_ORIGINS: 'https://example.invalid/path' }),
  );
});
