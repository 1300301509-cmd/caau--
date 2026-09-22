import { expect, test } from '@playwright/test';

const apiOrigin = `http://127.0.0.1:${process.env.CAAU_BROWSER_API_PORT ?? 3000}`;

test('built Web page reaches the live API over browser CORS', async ({
  page,
}) => {
  await page.goto('/system/health');
  await expect(
    page.getByRole('heading', { name: 'CAAU 工程连接检查' }),
  ).toBeVisible();
  const response = page.waitForResponse(`${apiOrigin}/api/v1/health`);
  await page.getByRole('button', { name: '检查后端连接' }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByText('已连接 caau-api，服务状态正常')).toBeVisible();
});

test('failed request is visible and the same button can retry', async ({
  page,
}) => {
  await page.route('**/api/v1/health', (route) =>
    route.fulfill({ status: 503, body: '{}' }),
  );
  await page.goto('/system/health');
  await page.getByRole('button', { name: '检查后端连接' }).click();
  await expect(page.getByText('接口返回 HTTP 503')).toBeVisible();
  await page.unroute('**/api/v1/health');
  await page.getByRole('button', { name: '检查后端连接' }).click();
  await expect(page.getByText('已连接 caau-api，服务状态正常')).toBeVisible();
});
