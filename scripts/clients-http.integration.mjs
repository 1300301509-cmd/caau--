import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplication } from '../apps/api/dist/application.js';
import { readConfig } from '../apps/api/dist/config.js';
import {
  getHealth as webHealth,
  getReadiness as webReadiness,
} from '../apps/admin/src/features/health/api.ts';
import {
  getHealth as miniHealth,
  getReadiness as miniReadiness,
} from '../apps/miniapp/src/features/health/api.ts';

// Repository-level integration harness, not an application dependency.
// The miniapp transport is substituted with Node fetch: this verifies its
// request logic against real HTTP, NOT wx.request or a WeChat device runtime.
test('both clients consume the live generated health/readiness contract without a database', async (t) => {
  const app = await createApplication(readConfig({}));
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  const web = await webHealth(origin);
  const request = async ({ url, method, timeout }) => {
    const response = await fetch(url, {
      method,
      signal: AbortSignal.timeout(timeout),
    });
    return { statusCode: response.status, data: await response.json() };
  };
  const mini = await miniHealth(origin, request);
  await assert.rejects(webReadiness(origin), {
    status: 503,
    code: 'DATABASE_UNAVAILABLE',
  });
  await assert.rejects(miniReadiness(origin, request), {
    status: 503,
    code: 'DATABASE_UNAVAILABLE',
  });
  assert.deepEqual(web, { status: 'ok', service: 'caau-api' });
  assert.deepEqual(mini, web);
});
