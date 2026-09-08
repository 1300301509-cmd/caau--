import { expect, test } from '@playwright/test';

test('built Web page reaches the live API over browser CORS', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'CAAU 工程连接检查' }),
  ).toBeVisible();
  const response = page.waitForResponse('http://127.0.0.1:3000/api/v1/health');
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
  await page.goto('/');
  await page.getByRole('button', { name: '检查后端连接' }).click();
  await expect(page.getByText('健康接口返回 HTTP 503')).toBeVisible();
  await page.unroute('**/api/v1/health');
  await page.getByRole('button', { name: '检查后端连接' }).click();
  await expect(page.getByText('已连接 caau-api，服务状态正常')).toBeVisible();
});
