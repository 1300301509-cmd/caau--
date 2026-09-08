import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplication } from '../apps/api/dist/application.js';
import { getHealth as webHealth } from '../apps/admin/src/features/health/api.ts';
import { getHealth as miniHealth } from '../apps/miniapp/src/features/health/api.ts';

// Repository-level integration harness, not an application dependency.
// The miniapp transport is substituted with Node fetch: this verifies its
// request logic against real HTTP, NOT wx.request or a WeChat device runtime.
test('both clients use the same running backend health contract', async (t) => {
  const app = await createApplication();
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  const web = await webHealth(origin);
  const mini = await miniHealth(origin, async ({ url, method, timeout }) => {
    const response = await fetch(url, {
      method,
      signal: AbortSignal.timeout(timeout),
    });
    return { statusCode: response.status, data: await response.json() };
  });
  assert.deepEqual(web, { status: 'ok', service: 'caau-api' });
  assert.deepEqual(mini, web);
});
