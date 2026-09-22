import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createApplication } from '../apps/api/dist/application.js';
import { authenticationBrowserTest } from './authentication-browser.integration.mjs';

const origin = 'http://127.0.0.1:5175';
const secret = () => `A!${randomBytes(18).toString('base64url')}`;
const tokenHash = (value) => createHash('sha256').update(value).digest('hex');

export async function authenticationIntegration(t, context) {
  const { base, config, tokens, hq, sql } = context;
  const loginName = `auth.${randomBytes(6).toString('hex')}`;
  const temporaryPassword = secret();
  const nextPassword = secret();
  const resetPassword = secret();

  const call = async (path, options = {}, expected = 200) => {
    const response = await fetch(`${base}/api/v1/${path}`, options);
    assert.equal(
      response.status,
      expected,
      `${options.method ?? 'GET'} ${path}`,
    );
    const data = await response.json().catch(() => undefined);
    return { response, data };
  };
  const account = await call('authorization/accounts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.super}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      loginName,
      displayName: 'Synthetic password reviewer',
      temporaryPassword,
      memberships: [{ organizationId: hq, role: 'REVIEWER' }],
    }),
  });
  const accountId = account.data.id;
  const browserLoginName = `browser.${randomBytes(6).toString('hex')}`;
  const browserTemporaryPassword = secret();
  const browserNextPassword = secret();
  await call('authorization/accounts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.super}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      loginName: browserLoginName,
      displayName: 'Synthetic browser super admin',
      temporaryPassword: browserTemporaryPassword,
      memberships: [{ organizationId: hq, role: 'HEADQUARTERS_SUPER_ADMIN' }],
    }),
  });

  const login = async (password, expected = 200, name = loginName) =>
    call(
      'authentication/login',
      {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginName: name, password }),
      },
      expected,
    );
  const cookieValue = (response) => {
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    assert.match(cookie ?? '', /^caau_session=[A-Za-z0-9_-]{43}$/);
    return cookie;
  };

  await t.test(
    'password Cookie login, forced change, refresh, CSRF, logout and original grants',
    async () => {
      const unknown = await login(
        secret(),
        401,
        `missing.${randomBytes(4).toString('hex')}`,
      );
      assert.equal(unknown.data.message, 'Unable to sign in');
      const malformed = await login('short', 401, '!');
      assert.equal(malformed.data.message, unknown.data.message);
      const wrongOrigin = await call(
        'authentication/login',
        {
          method: 'POST',
          headers: {
            Origin: 'https://untrusted.invalid',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ loginName, password: temporaryPassword }),
        },
        403,
      );
      assert.equal(wrongOrigin.response.headers.get('set-cookie'), null);
      const wrong = await login(secret(), 401);
      assert.equal(wrong.data.message, unknown.data.message);
      const signedIn = await login(temporaryPassword);
      const setCookie = signedIn.response.headers.get('set-cookie') ?? '';
      assert.match(setCookie, /HttpOnly/i);
      assert.match(setCookie, /SameSite=Lax/i);
      assert.equal(/Secure/i.test(setCookie), false);
      let cookie = cookieValue(signedIn.response);
      assert.equal(signedIn.data.mustChangePassword, true);
      assert.equal('token' in signedIn.data, false);
      assert.ok(signedIn.data.csrfToken);
      await call(
        'workspace/identity',
        { headers: { Cookie: cookie, Origin: origin } },
        403,
      );
      await call(
        'authentication/change-password',
        {
          method: 'POST',
          headers: {
            Cookie: cookie,
            Origin: origin,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            currentPassword: temporaryPassword,
            newPassword: nextPassword,
          }),
        },
        403,
      );
      const changed = await call('authentication/change-password', {
        method: 'POST',
        headers: {
          Cookie: cookie,
          Origin: origin,
          'X-CSRF-Token': signedIn.data.csrfToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: temporaryPassword,
          newPassword: nextPassword,
        }),
      });
      const oldCookie = cookie;
      cookie = cookieValue(changed.response);
      assert.equal(changed.data.mustChangePassword, false);
      await call(
        'authentication/session',
        { headers: { Cookie: oldCookie, Origin: origin } },
        401,
      );
      const restored = await call('authentication/session', {
        headers: { Cookie: cookie, Origin: origin },
      });
      assert.equal(restored.data.id, accountId);
      assert.equal(restored.data.csrfToken, changed.data.csrfToken);
      const identity = await call('workspace/identity', {
        headers: { Cookie: cookie, Origin: origin },
      });
      assert.deepEqual(identity.data.roles, ['REVIEWER']);
      await call('authentication/logout', {
        method: 'POST',
        headers: {
          Cookie: cookie,
          Origin: origin,
          'X-CSRF-Token': restored.data.csrfToken,
        },
      });
      await call(
        'authentication/session',
        { headers: { Cookie: cookie, Origin: origin } },
        401,
      );
    },
  );

  await t.test(
    'formal Web login, forced change, refresh, account gate and logout',
    async () => {
      await authenticationBrowserTest({
        config,
        loginName: browserLoginName,
        temporaryPassword: browserTemporaryPassword,
        nextPassword: browserNextPassword,
      });
    },
  );

  await t.test(
    'reset, disable, expiry and persisted failure throttling revoke sessions',
    async () => {
      let signedIn = await login(nextPassword);
      let cookie = cookieValue(signedIn.response);
      await call(`authorization/accounts/${accountId}/reset-password`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokens.super}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ temporaryPassword: resetPassword }),
      });
      await call(
        'authentication/session',
        { headers: { Cookie: cookie, Origin: origin } },
        401,
      );
      await login(nextPassword, 401);
      signedIn = await login(resetPassword);
      cookie = cookieValue(signedIn.response);
      await call(`authorization/users/${accountId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tokens.super}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ active: false }),
      });
      await call(
        'authentication/session',
        { headers: { Cookie: cookie, Origin: origin } },
        401,
      );
      await login(resetPassword, 401);
      await call(`authorization/users/${accountId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tokens.super}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ active: true }),
      });
      signedIn = await login(resetPassword);
      cookie = cookieValue(signedIn.response);
      const raw = cookie.split('=')[1];
      await sql.query(
        'UPDATE "Session" SET "expiresAt"=now()-interval \'1 second\' WHERE "tokenHash"=$1',
        [tokenHash(raw)],
      );
      await call(
        'authentication/session',
        { headers: { Cookie: cookie, Origin: origin } },
        401,
      );

      const limitedLogin = `limited.${randomBytes(5).toString('hex')}`;
      const limitedPassword = secret();
      await call('authorization/accounts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokens.super}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          loginName: limitedLogin,
          displayName: 'Synthetic limited account',
          temporaryPassword: limitedPassword,
          memberships: [{ organizationId: hq, role: 'REVIEWER' }],
        }),
      });
      for (let attempt = 1; attempt <= 5; attempt++)
        await login(secret(), attempt === 5 ? 429 : 401, limitedLogin);
      await login(limitedPassword, 429, limitedLogin);
    },
  );

  await t.test(
    'one InternalUser binds Web password and WeChat sessions without duplicating business identity',
    async () => {
      const organizerLogin = `organizer.${randomBytes(5).toString('hex')}`;
      const organizerTemporaryPassword = secret();
      const organizerPassword = secret();
      const rotatedOrganizerPassword = secret();
      const organizer = await call('authorization/accounts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokens.super}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          loginName: organizerLogin,
          displayName: 'Synthetic cross-client organizer',
          temporaryPassword: organizerTemporaryPassword,
          memberships: [{ organizationId: hq, role: 'ORGANIZER' }],
        }),
      });
      const wechat = await createApplication({
        ...config,
        localIdentity: false,
        wechatMiniapp: {
          appId: 'wx12345678',
          appSecret: 'x'.repeat(32),
          exchange: async (code) => ({
            openId: `openid-${code}`,
            unionId: 'union-synthetic-user',
          }),
        },
      });
      try {
        await wechat.listen(0, '127.0.0.1');
        const wechatBase = await wechat.getUrl();
        const request = async (path, options = {}, expected = 200) => {
          const response = await fetch(`${wechatBase}/api/v1/${path}`, options);
          assert.equal(response.status, expected, path);
          return {
            response,
            data: await response.json().catch(() => undefined),
          };
        };
        const initial = await request('authentication/login', {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            loginName: organizerLogin,
            password: organizerTemporaryPassword,
          }),
        });
        let cookie = cookieValue(initial.response);
        const changed = await request('authentication/change-password', {
          method: 'POST',
          headers: {
            Cookie: cookie,
            Origin: origin,
            'X-CSRF-Token': initial.data.csrfToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            currentPassword: organizerTemporaryPassword,
            newPassword: organizerPassword,
          }),
        });
        cookie = cookieValue(changed.response);
        await request(
          'authentication/wechat/binding-intents',
          {
            method: 'POST',
            headers: { Cookie: cookie, Origin: origin },
          },
          403,
        );
        const intent = await request('authentication/wechat/binding-intents', {
          method: 'POST',
          headers: {
            Cookie: cookie,
            Origin: origin,
            'X-CSRF-Token': changed.data.csrfToken,
          },
        });
        assert.match(intent.data.bindingToken, /^[A-Za-z0-9_-]{43}$/);
        await request(
          'authentication/wechat/login',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: 'first-login' }),
          },
          401,
        );
        const bound = await request('authentication/wechat/bind', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: 'first-login',
            bindingToken: intent.data.bindingToken,
          }),
        });
        assert.match(bound.data.token, /^[A-Za-z0-9_-]{43}$/);
        const miniIdentity = await request('workspace/identity', {
          headers: { Authorization: `Bearer ${bound.data.token}` },
        });
        assert.equal(miniIdentity.data.id, organizer.data.id);
        assert.deepEqual(miniIdentity.data.roles, ['ORGANIZER']);
        const relogin = await request('authentication/wechat/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 'first-login' }),
        });
        assert.match(relogin.data.token, /^[A-Za-z0-9_-]{43}$/);
        await request(
          'authentication/wechat/bind',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: 'first-login',
              bindingToken: intent.data.bindingToken,
            }),
          },
          401,
        );
        const rotated = await request('authentication/change-password', {
          method: 'POST',
          headers: {
            Cookie: cookie,
            Origin: origin,
            'X-CSRF-Token': changed.data.csrfToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            currentPassword: organizerPassword,
            newPassword: rotatedOrganizerPassword,
          }),
        });
        assert.ok(rotated.response.headers.get('set-cookie'));
        await request(
          'workspace/identity',
          { headers: { Authorization: `Bearer ${bound.data.token}` } },
          401,
        );
        assert.deepEqual(
          (
            await sql.query(
              'SELECT "clientType",count(*)::int n FROM "Session" WHERE "userId"=$1 GROUP BY "clientType" ORDER BY "clientType"',
              [organizer.data.id],
            )
          ).rows,
          [
            { clientType: 'WEB_PASSWORD', n: 3 },
            { clientType: 'WECHAT_MINIAPP', n: 2 },
          ],
        );
      } finally {
        await wechat.close();
      }
    },
  );

  await t.test(
    'normal identity mode accepts password Cookie but exposes no local signer',
    async () => {
      const normal = await createApplication({
        ...config,
        localIdentity: false,
      });
      try {
        await normal.listen(0, '127.0.0.1');
        const normalBase = await normal.getUrl();
        const modeResponse = await fetch(
          `${normalBase}/api/v1/authentication/mode`,
        );
        assert.equal(modeResponse.status, 200);
        assert.deepEqual(await modeResponse.json(), {
          localIdentityEnabled: false,
          serverTestIdentityEnabled: false,
          wechatMiniappEnabled: false,
        });
        assert.equal(
          (await fetch(`${normalBase}/api/v1/local-test-identities`)).status,
          503,
        );
        assert.equal(
          (
            await fetch(`${normalBase}/api/v1/local-test-identities/sessions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ identity: 'reviewer-a' }),
            })
          ).status,
          503,
        );
        const response = await fetch(
          `${normalBase}/api/v1/authentication/login`,
          {
            method: 'POST',
            headers: { Origin: origin, 'Content-Type': 'application/json' },
            body: JSON.stringify({ loginName, password: resetPassword }),
          },
        );
        assert.equal(response.status, 200);
      } finally {
        await normal.close();
      }
    },
  );
}
