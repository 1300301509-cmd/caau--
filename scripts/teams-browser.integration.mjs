import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createApplication } from '../apps/api/dist/application.js';
export async function teamsBrowserTest({ config, tokens, eventId }) {
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
      response.writeHead(200, {
        'Content-Type': asset
          ? pathname.endsWith('.js')
            ? 'text/javascript'
            : pathname.endsWith('.css')
              ? 'text/css'
              : pathname.endsWith('.svg')
                ? 'image/svg+xml'
                : pathname.endsWith('.png')
                  ? 'image/png'
                  : 'image/jpeg'
          : 'text/html',
      });
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
    await app.listen(3000, '127.0.0.1');
    await new Promise((resolve, reject) => {
      web.once('error', reject);
      web.listen(4173, '127.0.0.1', resolve);
    });
    browser = await chromium.launch();

    page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await page.goto(`http://127.0.0.1:4173/competition?event=${eventId}`);
    await page.evaluate(
      (token) => sessionStorage.setItem('caau.local-test-session', token),
      tokens.super,
    );
    await page.reload();
    await expect(page.getByRole('button', { name: '录入球队' })).toBeEnabled({
      timeout: 15000,
    });
    await page.getByRole('button', { name: '录入球队' }).click();
    await page.getByLabel('球队名称', { exact: true }).fill('合成浏览器球队');
    await page.getByLabel('球队负责人', { exact: true }).fill('合成领队');
    await page.getByLabel('联系方式', { exact: true }).fill('13800001111');
    await page.getByLabel('所在省份', { exact: true }).fill('广东省');
    await page.getByLabel('所在城市', { exact: true }).fill('深圳市');
    await page.getByRole('button', { name: /^保\s*存$/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('row').filter({ hasText: '合成浏览器球队' }),
    ).toBeVisible();
    await page.getByRole('tab', { name: '球队档案', exact: true }).click();
    await page
      .getByRole('row')
      .filter({ hasText: '合成浏览器球队' })
      .getByRole('button', { name: '编辑资料' })
      .click();
    await page
      .getByLabel('球队名称', { exact: true })
      .fill('合成浏览器主档案修改');
    await page.getByRole('button', { name: /^保\s*存$/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('row').filter({ hasText: '合成浏览器主档案修改' }),
    ).toBeVisible();
    await page.getByRole('tab', { name: '本赛事球队', exact: true }).click();
    await expect(
      page.getByRole('row').filter({ hasText: '合成浏览器球队' }),
    ).toBeVisible();
    await expect(
      page.getByRole('row').filter({ hasText: '合成浏览器主档案修改' }),
    ).toHaveCount(0);
    await page
      .getByRole('row')
      .filter({ hasText: '合成浏览器球队' })
      .getByRole('button', { name: '编辑资料' })
      .click();
    await page
      .getByLabel('球队名称', { exact: true })
      .fill('合成浏览器赛事修改');
    await page.getByRole('button', { name: /^保\s*存$/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('row').filter({ hasText: '合成浏览器赛事修改' }),
    ).toBeVisible();
    await mkdir('.local/caau-041', { recursive: true });
    await page.screenshot({
      path: '.local/caau-041/teams-desktop.png',
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
      path: '.local/caau-041/teams-mobile.png',
      fullPage: true,
    });
  } catch (error) {
    await mkdir('.local/caau-041', { recursive: true });
    await page?.screenshot({
      path: '.local/caau-041/browser-failure.png',
      fullPage: true,
    });
    console.error(error);
    throw error;
  } finally {
    await browser?.close();
    await new Promise((resolve) => web.close(() => resolve()));
    await app.close();
  }
}
