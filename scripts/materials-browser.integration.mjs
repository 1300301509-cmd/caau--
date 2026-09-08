import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createApplication } from '../apps/api/dist/application.js';

export async function materialBrowserTest({ config, tokens, sql }) {
  // Serve the actual production bundle. No route mocks, response fixtures or token traces.
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
  let app = await createApplication(config);
  let browser;
  let webListening = false;
  try {
    await app.listen(3000, '127.0.0.1');
    await new Promise((resolve, reject) => {
      web.once('error', reject);
      web.listen(4173, '127.0.0.1', resolve);
    });
    webListening = true;
    browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'reduce',
    });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.name));
    await page.goto('http://127.0.0.1:4173/workspace');
    const login = async (key) => {
      await page.getByLabel('本地会话 JSON 文件').setInputFiles({
        name: 'synthetic-session.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ token: tokens[key] })),
      });
      await expect(
        page.getByText('本地身份已载入', { exact: true }),
      ).toBeVisible();
    };
    await login('manager');
    await page.getByRole('button', { name: '创建赛事', exact: true }).click();
    assert.ok((await page.locator('input:invalid').count()) > 0);
    await page
      .getByLabel('赛事名称', { exact: true })
      .fill('Browser created event');
    await page
      .getByLabel('赛事说明', { exact: true })
      .fill('Created without editing database');
    await page.getByRole('button', { name: '创建赛事', exact: true }).click();
    await expect(
      page.getByText('赛事已创建，可以指派材料任务', { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel('任务名称', { exact: true })
      .fill('Browser material package');
    await page
      .getByLabel('承办机构', { exact: true })
      .selectOption({ label: 'Synthetic organizer A' });
    await page
      .getByLabel('经办人', { exact: true })
      .selectOption({ label: 'Synthetic a' });
    await page
      .getByLabel('审核员', { exact: true })
      .selectOption({ label: 'Synthetic reviewer' });
    await page
      .getByRole('button', { name: '创建任务草案', exact: true })
      .click();
    await expect(
      page.getByText('任务草案已创建，请配置材料要求后发布', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '发布任务', exact: true }),
    ).toBeDisabled();
    await page
      .getByLabel('任务截止时间', { exact: true })
      .fill('2030-06-01T16:00');
    for (let i = 1; i <= 5; i++) {
      const group = page.getByRole('group', { name: `材料 ${i}`, exact: true });
      await group
        .getByLabel('模板版本', { exact: true })
        .fill('synthetic-browser-v1');
      await group
        .getByLabel('支持格式（小写扩展名，逗号分隔）', { exact: true })
        .fill('pdf,png');
      await group
        .getByLabel('文件大小上限（字节）', { exact: true })
        .fill('2097152');
      await group
        .getByLabel('材料截止时间', { exact: true })
        .fill('2030-06-01T16:00');
      await group
        .getByLabel('填写说明', { exact: true })
        .fill('Synthetic browser instruction');
      await group
        .getByLabel('示例或合格标准', { exact: true })
        .fill('Synthetic browser criterion');
    }
    await page
      .getByRole('button', { name: '保存材料要求', exact: true })
      .click();
    await expect(
      page.getByText('材料要求已保存，核对后可发布', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '发布任务', exact: true }).click();
    await page.getByRole('button', { name: '确认发布', exact: true }).click();
    await expect(
      page.getByText('任务已发布，要求 V1 已固定', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('已发布要求受保护', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '保存材料要求', exact: true }),
    ).toHaveCount(0);
    const row = (
      await sql.query('SELECT id, state FROM "MaterialTask" WHERE title=$1', [
        'Browser material package',
      ])
    ).rows[0];
    assert.equal(row.state, 'PUBLISHED');
    await app.close();
    app = await createApplication(config);
    await app.listen(3000, '127.0.0.1');
    await page.getByRole('button', { name: '刷新数据', exact: true }).click();
    await expect(
      page.getByText('已刷新当前权限与数据', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await login('a');
    await page
      .getByLabel('当前赛事', { exact: true })
      .selectOption({ label: 'Browser created event' });
    await page
      .getByRole('button', {
        name: '查看 Browser material package',
        exact: true,
      })
      .click();
    await expect(
      page.getByText('已发布要求受保护', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('说明：Synthetic browser instruction', { exact: true }),
    ).toHaveCount(5);
    await expect(
      page.getByRole('button', { name: '创建赛事', exact: true }),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 375, height: 812 });
    assert.ok(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
    );
    await mkdir('.local/evidence/caau-005', { recursive: true });
    await page.screenshot({
      path: '.local/evidence/caau-005/workspace-mobile.png',
      fullPage: true,
    });
    await page.reload();
    await login('b');
    assert.equal(
      await page
        .getByLabel('当前赛事', { exact: true })
        .getByRole('option', { name: 'Browser created event', exact: true })
        .count(),
      0,
    );
    await page.reload();
    await login('sys');
    await expect(
      page.getByRole('button', { name: '登记用户', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '创建赛事', exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel('用户姓名', { exact: true })
      .fill('Synthetic browser user');
    await page.getByRole('button', { name: '登记用户', exact: true }).click();
    await expect(
      page.getByText('内部用户已创建', { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel('组织名称', { exact: true })
      .fill('Synthetic browser organization');
    await page.getByRole('button', { name: '登记组织', exact: true }).click();
    await expect(page.getByText('组织已创建', { exact: true })).toBeVisible();
    const createdUser = (
      await sql.query('SELECT id FROM "InternalUser" WHERE "displayName"=$1', [
        'Synthetic browser user',
      ])
    ).rows[0].id;
    await page
      .getByLabel('成员用户', { exact: true })
      .selectOption(createdUser);
    await page
      .getByLabel('所属组织', { exact: true })
      .selectOption({ label: 'Synthetic browser organization' });
    await page
      .getByLabel('成员角色', { exact: true })
      .selectOption({ label: '承办方经办人' });
    await page
      .getByRole('button', { name: '登记成员角色', exact: true })
      .click();
    await expect(
      page.getByText('成员角色已登记', { exact: true }),
    ).toBeVisible();
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser?.close();
    await app.close();
    if (webListening)
      await new Promise((resolve, reject) =>
        web.close((e) => (e ? reject(e) : resolve())),
      );
  }
}
