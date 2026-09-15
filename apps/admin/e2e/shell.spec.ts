import { expect, test } from '@playwright/test';

test('single-module review shell survives direct access and refresh', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: '资料审核' }),
  ).toBeVisible();

  await page.goto('/materials');
  await expect(
    page.getByRole('heading', { level: 1, name: '资料审核' }),
  ).toBeVisible();
  const navigation = page.getByRole('navigation', { name: '主要导航' });
  await expect(
    navigation.getByRole('link', { name: '资料审核' }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(navigation.getByRole('link')).toHaveCount(1);
  await expect(page.getByText('导入本地测试身份')).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('heading', { level: 1, name: '资料审核' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '折叠导航' }).click();
  await expect(page.getByRole('button', { name: '展开导航' })).toBeVisible();
});

test('compact review shell opens navigation without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/materials');
  await page.getByRole('button', { name: '打开导航' }).click();
  await expect(
    page
      .getByRole('navigation', { name: '主要导航' })
      .getByRole('link', { name: '资料审核' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '关闭导航' }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
