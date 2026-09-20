import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createApplication } from '../apps/api/dist/application.js';

export async function schedulingBrowserTest({ config, tokens, eventId }) {
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
    await app.listen(3000, '127.0.0.1');
    await new Promise((resolve, reject) => {
      web.once('error', reject);
      web.listen(4173, '127.0.0.1', resolve);
    });
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(
      `http://127.0.0.1:4173/competition?module=schedule&event=${eventId}`,
    );
    await page.evaluate(
      (token) => sessionStorage.setItem('caau.local-test-session', token),
      tokens.super,
    );
    await page.reload();
    const generate = page.getByRole('button', {
      name: /按当前条件重新生成|生成候选赛程/,
    });
    await expect(generate).toBeEnabled({ timeout: 15000 });
    await generate.click();
    await expect(page.getByRole('row')).toHaveCount(7);
    await expect(page.getByText('当前有')).toHaveCount(0);
    await page.getByRole('button', { name: '发布赛程' }).click();
    await page
      .locator('.ant-modal-confirm')
      .getByRole('button', { name: '确认发布' })
      .click();
    await expect(page.getByText(/已发布 · V/)).toBeVisible();
    await expect(page.locator('.ant-modal-confirm')).toHaveCount(0);
    await mkdir('.local/caau-042', { recursive: true });
    await page.screenshot({
      path: '.local/caau-042/schedule-desktop.png',
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
      path: '.local/caau-042/schedule-mobile.png',
      fullPage: true,
    });
  } catch (error) {
    await mkdir('.local/caau-042', { recursive: true });
    await page?.screenshot({
      path: '.local/caau-042/schedule-failure.png',
      fullPage: true,
    });
    throw error;
  } finally {
    await browser?.close();
    await new Promise((resolve) => web.close(() => resolve()));
    await app.close();
  }
}
