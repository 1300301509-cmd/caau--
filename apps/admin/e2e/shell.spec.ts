import { expect, test } from '@playwright/test';

// These checks exercise a restored formal Cookie session with read-only fixtures.
test.beforeEach(async ({ page }) => {
  const identity = {
    id: '00000000-0000-4000-8000-000000000001',
    displayName: '总部审核员',
    roles: ['REVIEWER'],
    canReviewHostingApplications: true,
    canManageAccounts: false,
    hostingApplicantOrganizations: [],
  };
  await page.route('**/api/v1/authentication/mode', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        localIdentityEnabled: false,
        serverTestIdentityEnabled: false,
        wechatMiniappEnabled: false,
      }),
    }),
  );
  await page.route('**/api/v1/authentication/session', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ...identity,
        mustChangePassword: false,
        expiresAt: '2099-01-01T00:00:00.000Z',
        csrfToken: 'synthetic-csrf',
      }),
    }),
  );
  await page.route('**/api/v1/workspace/identity', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(identity),
    }),
  );
  await page.route('**/api/v1/event-materials', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/v1/hosting-applications', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/v1/events', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
});

test('review center is the default route with one primary module and two review entries', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: '赛事审核中心' }),
  ).toBeVisible();
  const navigation = page.getByRole('navigation', { name: '主要导航' });
  await expect(navigation.getByRole('link')).toHaveCount(2);
  await expect(
    navigation.getByRole('link', { name: '赛事审核中心' }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    navigation.getByRole('link', { name: '比赛管理中心' }),
  ).toBeVisible();
  const types = page.getByRole('navigation', { name: '审核类型' });
  await expect(
    types.getByRole('link', { name: '承办申请审核' }),
  ).toHaveAttribute('aria-current', 'page');
  await page.locator('.hq-brand-symbol').hover();
  await expect(page.getByText('正式账号', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '账号安全' })).toBeVisible();
  await expect(page.locator('.review-table-row')).toHaveCount(0);
  await expect(page.locator('.metric-value').first()).toContainText('0项');
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 1, name: '赛事审核中心' }),
  ).toBeVisible();
});

test('material review remains accessible within the review center', async ({
  page,
}) => {
  await page.goto('/materials');
  await expect(
    page
      .getByRole('navigation', { name: '审核类型' })
      .getByRole('link', { name: '办赛材料审核' }),
  ).toHaveAttribute('aria-current', 'page');
  await page.locator('.hq-brand-symbol').hover();
  await expect(page.getByText('正式账号', { exact: true })).toBeVisible();
  await expect(page.getByLabel('选择测试身份')).toHaveCount(0);
  await expect(page.getByLabel('全局切换测试账号权限')).toHaveCount(0);
});

test('event result deep links retain their detail page without another primary module', async ({
  page,
}) => {
  await page.goto('/events');
  await expect(
    page.getByRole('heading', { level: 1, name: '赛事详情' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: '返回赛事审核中心' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '创建赛事' })).toHaveCount(0);
});

for (const width of [375, 768, 1440]) {
  test(`review center remains usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/hosting-applications');
    await expect(
      page
        .getByRole('navigation', { name: '主要导航' })
        .getByRole('link', { name: '赛事审核中心' }),
    ).toBeVisible();
    await expect(page.getByLabel('搜索赛事或申请机构')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
