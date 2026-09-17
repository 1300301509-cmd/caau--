import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createApplication } from '../apps/api/dist/application.js';

const sessionKey = 'caau.local-test-session';
async function enter(page, token, url) {
  await page.goto(url);
  await page.evaluate(
    ([key, value]) => sessionStorage.setItem(key, value),
    [sessionKey, token],
  );
  await page.reload();
  await expect(page.locator('.hosting-detail-dialog')).toBeVisible({
    timeout: 15000,
  });
}
async function confirm(page, testId) {
  await page.getByTestId(testId).click();
  await page.locator('.ant-modal-confirm .ant-btn-primary').click();
}
export async function hostingBrowserTest({
  config,
  tokens,
  approvedId,
  licenseName,
  continuationId,
  concurrentId,
}) {
  const web = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const asset = /^\/assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(pathname);
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
            : 'text/css'
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
  try {
    await app.listen(3000, '127.0.0.1');
    await new Promise((resolve, reject) => {
      web.once('error', reject);
      web.listen(4173, '127.0.0.1', resolve);
    });
    browser = await chromium.launch();

    const approved = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      acceptDownloads: true,
      reducedMotion: 'reduce',
    });
    const approvedPage = await approved.newPage();
    await enter(
      approvedPage,
      tokens.reviewer,
      `http://127.0.0.1:4173/hosting-applications?application=${approvedId}`,
    );
    await expect(approvedPage.getByText('正式赛事已创建')).toBeVisible();
    await expect(approvedPage.getByText('V1 → V2')).toBeVisible();
    await expect(approvedPage.getByText('本申请 · V2')).toBeVisible();
    const licenseRow = approvedPage.locator('.hosting-file').first();
    await expect(licenseRow).toContainText(licenseName);
    await licenseRow.getByTestId(/^hosting-download-/).click();
    await expect(
      approvedPage.getByText(`附件已下载：${licenseName}`),
    ).toBeVisible();
    await expect(
      approvedPage.getByText('附件下载失败，请确认当前权限后重试。'),
    ).toHaveCount(0);
    await approvedPage.setViewportSize({ width: 375, height: 812 });
    await expect
      .poll(() =>
        approvedPage.evaluate(
          () =>
            globalThis.document.documentElement.scrollWidth <=
            globalThis.innerWidth,
        ),
      )
      .toBe(true);
    await approved.close();

    const first = await browser.newContext({
      viewport: { width: 1100, height: 820 },
      reducedMotion: 'reduce',
    });
    const second = await browser.newContext({
      viewport: { width: 1100, height: 820 },
      reducedMotion: 'reduce',
    });
    const firstPage = await first.newPage();
    const secondPage = await second.newPage();
    await enter(
      firstPage,
      tokens.reviewer,
      `http://127.0.0.1:4173/hosting-applications?application=${continuationId}`,
    );
    await confirm(firstPage, 'hosting-start-review');
    await expect(
      firstPage.getByText('已开始审核，其他有权审核员仍可接续。'),
    ).toBeVisible();
    await enter(
      secondPage,
      tokens.reviewer2,
      `http://127.0.0.1:4173/hosting-applications?application=${continuationId}`,
    );
    await secondPage.getByTestId('hosting-reject').click();
    await secondPage
      .getByLabel('驳回原因')
      .fill('真实浏览器验收：乙接续甲的审核并驳回。');
    await secondPage.getByRole('button', { name: /确认驳回/ }).click();
    await expect(
      secondPage.getByText('申请已驳回，未创建赛事。'),
    ).toBeVisible();
    await expect(
      secondPage.getByText('申请已驳回', { exact: true }),
    ).toBeVisible();
    await first.close();
    await second.close();

    const conflictA = await browser.newContext({
      viewport: { width: 1100, height: 820 },
      reducedMotion: 'reduce',
    });
    const conflictB = await browser.newContext({
      viewport: { width: 1100, height: 820 },
      reducedMotion: 'reduce',
    });
    const pageA = await conflictA.newPage();
    const pageB = await conflictB.newPage();
    await Promise.all([
      enter(
        pageA,
        tokens.reviewer,
        `http://127.0.0.1:4173/hosting-applications?application=${concurrentId}`,
      ),
      enter(
        pageB,
        tokens.reviewer2,
        `http://127.0.0.1:4173/hosting-applications?application=${concurrentId}`,
      ),
    ]);
    await Promise.all([
      confirm(pageA, 'hosting-approve'),
      confirm(pageB, 'hosting-approve'),
    ]);
    await expect(
      pageA.getByText(/申请已通过|申请已由其他审核员更新/),
    ).toBeVisible();
    await expect(
      pageB.getByText(/申请已通过|申请已由其他审核员更新/),
    ).toBeVisible();
    const outcomes = await Promise.all(
      [pageA, pageB].map(async (page) => ({
        approved: await page
          .getByText('申请已通过，唯一筹备赛事已创建。')
          .count(),
        conflict: await page
          .getByText('申请已由其他审核员更新，已加载最新结果。')
          .count(),
      })),
    );
    assert.deepEqual(outcomes.map((item) => item.approved).sort(), [0, 1]);
    assert.deepEqual(outcomes.map((item) => item.conflict).sort(), [0, 1]);
    await conflictA.close();
    await conflictB.close();

    const denied = await browser.newContext({
      viewport: { width: 1100, height: 820 },
      reducedMotion: 'reduce',
    });
    const deniedPage = await denied.newPage();
    await deniedPage.goto('http://127.0.0.1:4173/hosting-applications');
    await deniedPage.evaluate(
      ([key, value]) => sessionStorage.setItem(key, value),
      [sessionKey, tokens.b],
    );
    await deniedPage.reload();
    await expect(
      deniedPage.getByText('当前身份没有承办申请审核权限，或权限已被撤销。'),
    ).toBeVisible({ timeout: 15000 });
    await expect(deniedPage.locator('.review-table-row')).toHaveCount(0);
    await denied.close();
  } finally {
    await browser?.close();
    await new Promise((resolve) => web.close(() => resolve()));
    await app.close();
  }
}
