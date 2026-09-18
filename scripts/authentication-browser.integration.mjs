import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createApplication } from '../apps/api/dist/application.js';

export async function authenticationBrowserTest({
  config,
  loginName,
  temporaryPassword,
  nextPassword,
}) {
  const web = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const asset = /^\/assets\/[a-zA-Z0-9_.-]+\.(js|css|jpg)$/.test(pathname);
    try {
      const file = new URL(
        '../apps/admin/dist/' + (asset ? pathname.slice(1) : 'index.html'),
        import.meta.url,
      );
      const data = await readFile(file);
      response.writeHead(200, {
        'Content-Type': asset
          ? pathname.endsWith('.js')
            ? 'text/javascript'
            : pathname.endsWith('.css')
              ? 'text/css'
              : 'image/jpeg'
          : 'text/html',
      });
      response.end(data);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  const app = await createApplication({ ...config, localIdentity: false });
  let browser;
  try {
    await app.listen(3000, '127.0.0.1');
    await new Promise((resolve, reject) => {
      web.once('error', reject);
      web.listen(4173, '127.0.0.1', resolve);
    });
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    const localIdentityRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.url().includes('/local-test-identities'))
        localIdentityRequests.push(request.url());
    });
    await page.goto('http://127.0.0.1:4173/accounts');
    await expect(
      page.getByRole('heading', { name: '登录总部工作台' }),
    ).toBeVisible();
    await expect(page.getByLabel('选择测试身份')).toHaveCount(0);
    assert.deepEqual(localIdentityRequests, []);
    await page.getByLabel('登录账号').fill(loginName);
    await page.getByLabel('密码').fill('definitely-wrong-password');
    await page.getByTestId('formal-login-submit').click();
    await expect(page.getByText('账号或密码错误。')).toBeVisible();
    await page.getByLabel('密码').fill(temporaryPassword);
    await page.getByTestId('formal-login-submit').click();
    await expect(
      page.getByRole('heading', { name: '设置你的新密码' }),
    ).toBeVisible();
    await expect(page.getByText('赛事审核中心')).toHaveCount(0);
    await page.getByLabel('当前临时密码').fill(temporaryPassword);
    await page.getByLabel('新密码', { exact: true }).fill(nextPassword);
    await page.getByLabel('确认新密码').fill(nextPassword);
    await page.getByTestId('forced-password-submit').click();
    await expect(
      page.getByRole('heading', { level: 1, name: '账号与权限' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '创建账号' })).toBeVisible();
    await expect(
      page.getByText('Synthetic browser super admin', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { level: 1, name: '账号与权限' }),
    ).toBeVisible();
    await page.locator('.hq-brand-symbol').hover();
    await page.getByRole('link', { name: '赛事审核中心' }).click();
    await expect(page.getByLabel('搜索赛事或申请机构')).toBeVisible();
    await expect(page.getByLabel('选择测试身份')).toHaveCount(0);
    assert.deepEqual(localIdentityRequests, []);
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByLabel('搜索赛事或申请机构')).toBeVisible();
    assert.equal(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
      true,
    );
    await page.getByRole('button', { name: '退出' }).click();
    await expect(
      page.getByRole('heading', { name: '登录总部工作台' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: '登录总部工作台' }),
    ).toBeVisible();
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser?.close();
    await app.close();
    await new Promise((resolve) => web.close(resolve));
  }
}
