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
        serverTestIdentityEnabled: false,
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
  await expect(page.locator('.hq-account-copy')).toContainText(
    '总部超级管理员',
  );
  expect(issued).toEqual(['super-admin']);

  await page.locator('.hq-brand-symbol').hover();
  const selector = page.getByLabel('全局切换测试账号权限');
  await expect(selector).toBeVisible();
  await expect(
    selector.locator('xpath=..').getByText(/总部超级管理员/),
  ).toBeVisible();
  const switcher = page.locator('.hq-local-switcher');
  const [switcherBox, selectBox] = await Promise.all([
    switcher.boundingBox(),
    selector.locator('xpath=../..').boundingBox(),
  ]);
  expect(switcherBox).not.toBeNull();
  expect(selectBox).not.toBeNull();
  expect(selectBox!.x).toBeGreaterThanOrEqual(switcherBox!.x);
  expect(selectBox!.x + selectBox!.width).toBeLessThanOrEqual(
    switcherBox!.x + switcherBox!.width,
  );
  await selector.click();
  const reviewerOption = page.getByText('总部审核员甲', { exact: true });
  await expect(reviewerOption).toBeVisible();
  const popupBox = await reviewerOption.locator('xpath=../../..').boundingBox();
  expect(popupBox).not.toBeNull();
  expect(popupBox!.width).toBeLessThanOrEqual(switcherBox!.width);
  await reviewerOption.click();

  await expect.poll(() => issued).toEqual(['super-admin', 'reviewer-a']);
  await expect(page.locator('.hq-account-copy')).toContainText('总部审核员甲');
  await page.locator('.hq-brand-symbol').hover();
  await expect(
    page
      .getByLabel('全局切换测试账号权限')
      .locator('xpath=..')
      .getByText(/总部审核员甲/),
  ).toBeVisible();
});
