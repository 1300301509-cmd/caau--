import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createApplication } from '../apps/api/dist/application.js';

export async function eventSituationBrowserTest({
  config,
  tokens,
  eventId,
  player,
  official,
}) {
  const web = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const asset = /^\/assets\/[a-zA-Z0-9_.-]+\.(js|css|jpg|png|svg)$/.test(
      pathname,
    );
    try {
      const file = new URL(
        '../apps/admin/dist/' + (asset ? pathname.slice(1) : 'index.html'),
        import.meta.url,
      );
      const data = await readFile(file);
      const type = pathname.endsWith('.js')
        ? 'text/javascript'
        : pathname.endsWith('.css')
          ? 'text/css'
          : pathname.endsWith('.svg')
            ? 'image/svg+xml'
            : pathname.endsWith('.png')
              ? 'image/png'
              : pathname.endsWith('.jpg')
                ? 'image/jpeg'
                : 'text/html';
      response.writeHead(200, { 'Content-Type': type });
      response.end(data);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  const app = await createApplication(config);
  let browser;
  let page;
  try {
    await app.listen(
      Number(process.env.CAAU_BROWSER_API_PORT ?? 3000),
      '127.0.0.1',
    );
    await new Promise((resolve, reject) => {
      web.once('error', reject);
      web.listen(4173, '127.0.0.1', resolve);
    });
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(
      `http://127.0.0.1:4173/competition?module=data&event=${eventId}`,
    );
    await page.evaluate(
      (token) => sessionStorage.setItem('caau.local-test-session', token),
      tokens.super,
    );
    await page.reload();
    await expect(page.getByRole('heading', { name: '赛事情况' })).toBeVisible({
      timeout: 15000,
    });
    const match = page.locator('.situation-day-matches button').first();
    await expect(match).toBeVisible();
    await match.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(
      page.getByRole('dialog').getByText(official.name),
    ).toBeVisible();
    await expect(page.getByRole('dialog').getByText(player.name)).toBeVisible();
    await mkdir('.local/caau-045', { recursive: true });
    await page.screenshot({
      path: '.local/caau-045/situation-desktop.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            globalThis.document.documentElement.scrollWidth <=
            globalThis.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: '.local/caau-045/situation-mobile.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(
      `http://127.0.0.1:4173/competition?module=staff&event=${eventId}`,
    );
    await expect(page.getByRole('button', { name: '新增人员' })).toBeEnabled({
      timeout: 15000,
    });
    await page.getByRole('button', { name: '新增人员' }).click();
    await page.getByLabel('姓名', { exact: true }).fill('合成浏览器裁判');
    await page.getByLabel('岗位', { exact: true }).fill('裁判');
    await page.getByLabel('岗位', { exact: true }).press('Enter');
    await page.getByLabel('联系电话', { exact: true }).fill('13800001122');
    await page.getByRole('button', { name: '保存人员' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const staffRow = page
      .getByRole('row')
      .filter({ hasText: '合成浏览器裁判' });
    await expect(staffRow).toBeVisible();
    await staffRow.getByRole('button', { name: /^编\s*辑$/ }).click();
    await page.getByLabel('职责说明').fill('合成浏览器职责');
    await page.getByRole('button', { name: '保存人员' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await staffRow.getByRole('button', { name: /^历\s*史$/ }).click();
    await expect(page.getByRole('dialog')).toContainText('合成浏览器职责');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Close|关闭/ })
      .click();
    await staffRow.getByRole('button', { name: /^停\s*用$/ }).click();
    await page
      .locator('.ant-modal-confirm')
      .getByRole('button', { name: /^确\s*认$/ })
      .click();
    await expect(staffRow).toHaveCount(0);
    await page.getByRole('combobox', { name: '人员状态' }).click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(staffRow).toContainText('已停用');
    await mkdir('.local/caau-050', { recursive: true });
    await page.screenshot({
      path: '.local/caau-050/staff-desktop.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            globalThis.document.documentElement.scrollWidth <=
            globalThis.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: '.local/caau-050/staff-mobile.png',
      fullPage: true,
    });
  } catch (error) {
    await mkdir('.local/caau-045', { recursive: true });
    await page?.screenshot({
      path: '.local/caau-045/situation-failure.png',
      fullPage: true,
    });
    throw error;
  } finally {
    await browser?.close();
    await new Promise((resolve) => web.close(() => resolve()));
    await app.close();
  }
}
