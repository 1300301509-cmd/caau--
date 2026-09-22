import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createApplication } from '../apps/api/dist/application.js';

export async function eventSuppliesBrowserTest({
  config,
  tokens,
  eventId,
  itemName,
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
      `http://127.0.0.1:4173/competition?module=supplies&event=${eventId}`,
    );
    await page.evaluate(
      (token) => sessionStorage.setItem('caau.local-test-session', token),
      tokens.super,
    );
    await page.reload();
    await expect(page.getByText('总部只读追踪')).toBeVisible({
      timeout: 15000,
    });
    const row = page.getByRole('row').filter({ hasText: itemName });
    await expect(row).toContainText('准备中');
    await expect(row).toContainText('1 张');
    await row.getByRole('button', { name: '查看详情' }).click();
    await expect(page.getByRole('heading', { name: itemName })).toBeVisible();
    await expect(
      page.getByRole('img', { name: new RegExp(itemName) }),
    ).toBeVisible();
    await expect(page.getByText('承办方补充照片')).toBeVisible();
    await mkdir('.local/caau-044', { recursive: true });
    await page.screenshot({
      path: '.local/caau-044/supplies-desktop.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Close' }).click();
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
      path: '.local/caau-044/supplies-mobile.png',
      fullPage: true,
    });
  } catch (error) {
    await mkdir('.local/caau-044', { recursive: true });
    await page?.screenshot({
      path: '.local/caau-044/browser-failure.png',
      fullPage: true,
    });
    throw error;
  } finally {
    await browser?.close();
    await new Promise((resolve) => web.close(() => resolve()));
    await app.close();
  }
}
