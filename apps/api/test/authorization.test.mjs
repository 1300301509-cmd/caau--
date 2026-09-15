import assert from 'node:assert/strict';
import test from 'node:test';
import { readConfig } from '../dist/config.js';
import { createApplication } from '../dist/application.js';
import { AuthorizationGuard } from '../dist/modules/authorization/authorization.guard.js';

test('local identity is opt-in, disallowed in production or on external host', () => {
  assert.equal(readConfig({}).localIdentity, false);
  assert.throws(() =>
    readConfig({ CAAU_IDENTITY_MODE: 'local', NODE_ENV: 'production' }),
  );
  assert.throws(() =>
    readConfig({ CAAU_IDENTITY_MODE: 'local', HOST: '0.0.0.0' }),
  );
  assert.throws(() => readConfig({ CAAU_IDENTITY_MODE: 'wechat' }));
});
test('global guard rejects handlers with no explicit policy', async () => {
  const guard = new AuthorizationGuard(
    { get: () => undefined },
    { authenticate: () => assert.fail('No policy must not authenticate') },
  );
  await assert.rejects(
    guard.canActivate({ getHandler: () => () => {} }),
    (e) => e.getStatus() === 403,
  );
});
test('disabled identity does not accept forged headers; public health remains available', async (t) => {
  const app = await createApplication(readConfig({}));
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  assert.equal(
    (
      await fetch(base + '/api/v1/authorization/me', {
        headers: { 'X-User-Id': 'system', 'X-Role': 'SYSTEM_ADMIN' },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(base + '/api/v1/authorization/me', {
        headers: { Authorization: 'Bearer ' + 'a'.repeat(43) },
      })
    ).status,
    503,
  );
  assert.equal(
    (await fetch(base + '/api/v1/local-test-identities')).status,
    503,
  );
  assert.equal((await fetch(base + '/api/v1/health')).status, 200);
});
