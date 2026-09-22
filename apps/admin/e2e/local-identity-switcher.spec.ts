import { expect, test } from '@playwright/test';

const identities = [
  {
    key: 'super-admin',
    displayName: '总部超级管理员',
    organizationName: 'CAAU 总部',
    role: 'HEADQUARTERS_SUPER_ADMIN',
  },
  {
    key: 'reviewer-a',
    displayName: '总部审核员甲',
    organizationName: 'CAAU 总部',
    role: 'REVIEWER',
  },
  {
    key: 'organizer-a',
    displayName: '承办方 A 经办人',
    organizationName: '承办机构 A',
    role: 'ORGANIZER',
  },
] as const;

test('local mode defaults to super admin and switches identity from the sidebar', async ({
  page,
}) => {
  const issued: string[] = [];
  await page.route('**/api/v1/authentication/mode', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        localIdentityEnabled: true,
        wechatMiniappEnabled: false,
      }),
    }),
  );
  await page.route('**/api/v1/local-test-identities', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(identities),
    }),
  );
  await page.route(
    '**/api/v1/local-test-identities/sessions',
    async (route) => {
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
    const key =
      route.request().headers().authorization?.replace('Bearer token-', '') ??
      'super-admin';
    const selected =
      identities.find((entry) => entry.key === key) ?? identities[0];
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: `00000000-0000-4000-8000-${selected.key === 'super-admin' ? '000000000206' : '000000000201'}`,
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
  await page.route('**/api/v1/authentication/logout', (route) =>
    route.fulfill({ contentType: 'application/json', body: '{}' }),
  );

  await page.goto('/hosting-applications');
  await expect(
    page.getByText('总部超级管理员', { exact: true }),
  ).toBeAttached();
  expect(issued).toEqual(['super-admin']);

  await page.locator('.hq-brand-symbol').hover();
  const selector = page.getByLabel('全局切换本地账号权限');
  await expect(selector).toBeVisible();
  await expect(
    selector.locator('xpath=..').getByText(/总部超级管理员/),
  ).toBeVisible();
  await selector.click();
  await page.getByText('总部审核员甲 · 总部审核员', { exact: true }).click();

  await expect.poll(() => issued).toEqual(['super-admin', 'reviewer-a']);
  await expect(page.getByText('总部审核员甲', { exact: true })).toBeAttached();
  await page.locator('.hq-brand-symbol').hover();
  await expect(
    page
      .getByLabel('全局切换本地账号权限')
      .locator('xpath=..')
      .getByText(/总部审核员甲/),
  ).toBeVisible();
});
