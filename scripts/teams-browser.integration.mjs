import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createApplication } from '../apps/api/dist/application.js';
export async function teamsBrowserTest({ config, tokens, eventId }) {
  const apiOrigin = `http://127.0.0.1:${process.env.CAAU_BROWSER_API_PORT ?? 3000}`;
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
    await app.listen(
      Number(process.env.CAAU_BROWSER_API_PORT ?? 3000),
      '127.0.0.1',
    );
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
    const activeTeams = (
      await fetch(`${apiOrigin}/api/v1/events/${eventId}/teams`, {
        headers: { Authorization: `Bearer ${tokens.super}` },
      }).then((response) => response.json())
    ).filter((team) => team.active);
    assert.ok(activeTeams.length >= 2);
    const day = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const scheduleResponse = await fetch(
      `${apiOrigin}/api/v1/events/${eventId}/schedule/generate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokens.super}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          format: 'ROUND_ROBIN',
          config: {
            teamIds: activeTeams.map((team) => team.id),
            venues: ['合成测试场地'],
            startDate: day,
            endDate: day,
            dailyStart: '09:00',
            dailyEnd: '20:00',
            durationMinutes: 40,
            bufferMinutes: 10,
            minRestMinutes: 30,
          },
        }),
      },
    );
    assert.equal(scheduleResponse.status, 200);
    const generatedSchedule = await scheduleResponse.json();
    assert.equal(generatedSchedule.issues.length, 0);
    const publishResponse = await fetch(
      `${apiOrigin}/api/v1/events/${eventId}/schedule/publish`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokens.super}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedRevision: generatedSchedule.revision,
        }),
      },
    );
    assert.equal(publishResponse.status, 200);
    const scheduleBefore = await publishResponse.json();
    assert.equal(scheduleBefore.status, 'PUBLISHED');
    const eventRow = page
      .getByRole('row')
      .filter({ hasText: '合成浏览器赛事修改' });
    await expect(eventRow).toBeVisible();
    await eventRow.getByRole('button', { name: '移出本赛事' }).click();
    const removal = page.getByRole('dialog', { name: '移出本赛事' });
    await expect(removal).toContainText('合成浏览器赛事修改');
    await expect(removal).toContainText('合成球队赛事二');
    await expect(removal).toContainText('只移出当前赛事，不删除球队档案和历史');
    await expect(removal).toContainText('该球队已进入已发布赛程');
    await expect(removal).toContainText('现有赛程和已发布历史不会被删除或改写');
    await removal.getByRole('button', { name: /^取\s*消$/ }).click();
    await expect(eventRow).toBeVisible();
    await eventRow.getByRole('button', { name: '移出本赛事' }).click();
    await removal.getByRole('button', { name: /^确\s*认\s*移\s*出$/ }).click();
    await expect(removal).toHaveCount(0);
    await expect(eventRow).toHaveCount(0);
    await expect(
      page.getByText('已将“合成浏览器赛事修改”移出本赛事'),
    ).toBeVisible();
    const participationFilter = page.getByRole('combobox', {
      name: '参赛状态',
    });
    await participationFilter.click();
    await participationFilter.press('ArrowDown');
    await participationFilter.press('Enter');
    await expect(
      page.getByRole('row').filter({ hasText: '合成浏览器赛事修改' }),
    ).toContainText('已退出');
    const scheduleAfter = await fetch(
      `${apiOrigin}/api/v1/events/${eventId}/schedule`,
      { headers: { Authorization: `Bearer ${tokens.super}` } },
    ).then((response) => response.json());
    assert.equal(scheduleAfter.revision, scheduleBefore.revision);
    assert.deepEqual(scheduleAfter.matches, scheduleBefore.matches);
    assert.ok(
      scheduleAfter.issues.some((issue) => issue.code === 'TEAM_UNAVAILABLE'),
    );
    await mkdir('.local/caau-041', { recursive: true });
    await expect(eventRow).toBeVisible();
    await expect(eventRow).toContainText('已退出');
    await expect(
      eventRow.getByRole('button', { name: '移出本赛事' }),
    ).toHaveCount(0);
    await page.getByRole('tab', { name: '球队档案', exact: true }).click();
    const masterRow = page
      .getByRole('row')
      .filter({ hasText: '合成浏览器主档案修改' });
    await expect(masterRow).toBeVisible();
    await expect(masterRow).toContainText('正常');
    await page.getByRole('tab', { name: '本赛事球队', exact: true }).click();
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
