import { expect, test } from '@playwright/test';

const apiOrigin = `http://127.0.0.1:${process.env.CAAU_BROWSER_API_PORT ?? 3000}`;

test('Web shows database unavailability separately from healthy API process', async ({
  page,
}) => {
  await page.goto('/system/health');
  const response = page.waitForResponse(`${apiOrigin}/api/v1/ready`);
  await page.getByRole('button', { name: '检查数据库就绪' }).click();
  expect((await response).status()).toBe(503);
  await expect(page.getByText('接口返回 HTTP 503')).toBeVisible();
  await page.getByRole('button', { name: '检查后端连接' }).click();
  await expect(page.getByText('已连接 caau-api，服务状态正常')).toBeVisible();
});
