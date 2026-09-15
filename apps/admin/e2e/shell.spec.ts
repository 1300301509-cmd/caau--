import { expect, test } from '@playwright/test';

test('single-module horizontal review shell survives direct access and refresh', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: '资料审核' }),
  ).toBeVisible();

  await page.goto('/materials');
  const navigation = page.getByRole('navigation', { name: '主要导航' });
  await expect(
    navigation.getByRole('link', { name: '资料审核' }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(navigation.getByRole('link')).toHaveCount(1);
  await expect(page.getByText('本地测试环境')).toBeVisible();
  await expect(page.getByText('导入本地测试身份')).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('heading', { level: 1, name: '资料审核' }),
  ).toBeVisible();
  await expect(
    navigation.getByRole('link', { name: '资料审核' }),
  ).toHaveAttribute('aria-current', 'page');
});

test('compact horizontal shell keeps navigation visible without overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/materials');
  await expect(
    page
      .getByRole('navigation', { name: '主要导航' })
      .getByRole('link', { name: '资料审核' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
