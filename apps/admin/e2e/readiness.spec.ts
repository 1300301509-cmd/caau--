import { expect, test } from '@playwright/test';

test('Web shows database unavailability separately from healthy API process', async ({
  page,
}) => {
  await page.goto('/');
  const response = page.waitForResponse('http://127.0.0.1:3000/api/v1/ready');
  await page.getByRole('button', { name: '检查数据库就绪' }).click();
  expect((await response).status()).toBe(503);
  await expect(page.getByText('接口返回 HTTP 503')).toBeVisible();
  await page.getByRole('button', { name: '检查后端连接' }).click();
  await expect(page.getByText('已连接 caau-api，服务状态正常')).toBeVisible();
});
