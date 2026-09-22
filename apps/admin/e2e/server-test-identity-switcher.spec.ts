import { expect, test } from '@playwright/test';

const identities = [
  {
    key: 'super-admin',
    displayName: '总部超级管理员',
    organizationName: 'CAAU 总部',
    role: 'HEADQUARTERS_SUPER_ADMIN',
  },
  {
    key: 'organizer-a',
    displayName: '承办方 A 经办人',
    organizationName: '承办机构 A',
    role: 'ORGANIZER',
  },
] as const;

test('test server requires formal super admin before issuing switch sessions', async ({
  page,
}) => {
  const issued: string[] = [];
  await page.route('**/api/v1/authentication/mode', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        localIdentityEnabled: false,
        serverTestIdentityEnabled: true,
        wechatMiniappEnabled: false,
      }),
    }),
  );
  await page.route('**/api/v1/authentication/session', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: '00000000-0000-4000-8000-000000000206',
        displayName: '正式超级管理员',
        roles: ['HEADQUARTERS_SUPER_ADMIN'],
        mustChangePassword: false,
        expiresAt: '2099-01-01T00:00:00.000Z',
        csrfToken: 'server-test-csrf',
      }),
    }),
  );
  await page.route('**/api/v1/server-test-identities', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(identities),
    }),
  );
  await page.route(
    '**/api/v1/server-test-identities/sessions',
    async (route) => {
      expect(route.request().headers()['x-csrf-token']).toBe(
        'server-test-csrf',
      );
      const body = route.request().postDataJSON() as { identity: string };
      issued.push(body.identity);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          identity: body.identity,
          token: `token-${body.identity}`,
          expiresAt: '2099-01-01T00:00:00.000Z',
        }),
      });
    },
  );
  await page.route('**/api/v1/workspace/identity', (route) => {
    const key = route
      .request()
      .headers()
      .authorization?.replace('Bearer token-', '');
    if (!key)
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          id: '00000000-0000-4000-8000-000000000206',
          displayName: '正式超级管理员',
          roles: ['HEADQUARTERS_SUPER_ADMIN'],
          canReviewHostingApplications: true,
          canManageAccounts: true,
          hostingApplicantOrganizations: [],
        }),
      });
    const selected = identities.find((identity) => identity.key === key)!;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: `00000000-0000-4000-8000-${key === 'super-admin' ? '000000000206' : '000000000203'}`,
        displayName: selected.displayName,
        roles: [selected.role],
        canReviewHostingApplications: selected.role !== 'ORGANIZER',
        canManageAccounts: selected.role === 'HEADQUARTERS_SUPER_ADMIN',
        hostingApplicantOrganizations: [],
      }),
    });
  });
  await page.route('**/api/v1/hosting-applications**', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/v1/events**', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/v1/authorization/logout', (route) =>
    route.fulfill({ contentType: 'application/json', body: '{}' }),
  );

  await page.goto('/hosting-applications');
  await expect.poll(() => issued).toEqual(['super-admin']);
  await page.locator('.hq-brand-symbol').hover();
  await expect(page.getByText('TEST · 测试身份')).toBeVisible();
  await expect(page.locator('.hq-account-copy')).toContainText(
    '总部超级管理员',
  );

  const selector = page.getByLabel('全局切换测试账号权限');
  await selector.click();
  await page.getByText('承办方 A 经办人', { exact: true }).click();
  await expect.poll(() => issued).toEqual(['super-admin', 'organizer-a']);
  await expect(page.locator('.hq-account-copy')).toContainText(
    '承办方 A 经办人',
  );
});
