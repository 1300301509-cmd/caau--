import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createApplication } from '../apps/api/dist/application.js';

export async function schedulingBrowserTest({ config, tokens, eventId, sql }) {
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
    const agentResponses = [];
    page.on('response', async (response) => {
      if (
        response.url().includes('/agent/sessions/') &&
        response.url().endsWith('/messages')
      )
        agentResponses.push({
          status: response.status(),
          body: await response.text(),
        });
    });
    await page.goto(
      `http://127.0.0.1:4173/competition?module=schedule&event=${eventId}`,
    );
    await page.evaluate(
      (token) => sessionStorage.setItem('caau.local-test-session', token),
      tokens.super,
    );
    await page.reload();
    await expect(page.locator('.schedule-week')).toBeVisible({
      timeout: 15000,
    });
    const settings = page.locator('.schedule-settings');
    if ((await settings.getAttribute('open')) === null) {
      await settings.locator('> summary').click();
    }
    const generate = page.getByRole('button', {
      name: /按当前条件重新生成|生成候选赛程/,
    });
    await expect(generate).toBeEnabled({ timeout: 15000 });
    await page.getByLabel('每日结束', { exact: true }).fill('09:10');
    await generate.click();
    await expect(
      page.locator('.schedule-pending .schedule-match-card'),
    ).toHaveCount(6);
    await expect(page.getByRole('button', { name: '发布赛程' })).toBeDisabled();
    if ((await settings.getAttribute('open')) === null) {
      await settings.locator('> summary').click();
    }
    await page.getByLabel('每日结束', { exact: true }).fill('18:00');
    await generate.click();
    await expect(
      page.locator('.schedule-week-table .schedule-match-card'),
    ).toHaveCount(6);
    const range = await page.getByTestId('schedule-week-range').innerText();
    await expect(page.locator('.schedule-week-table thead th')).toHaveCount(8);
    await page.getByRole('button', { name: '下一周', exact: true }).click();
    await expect(
      page.locator('.schedule-week-table .schedule-match-card'),
    ).toHaveCount(0);
    await expect(
      page.getByText('本周暂无比赛', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: '上一周', exact: true }).click();
    await expect(page.getByTestId('schedule-week-range')).toHaveText(range);
    await expect(
      page.locator('.schedule-week-table .schedule-match-card'),
    ).toHaveCount(6);
    await expect(page.locator('.schedule-agent-model-status')).toContainText(
      'SIMULATED',
    );
    await page.getByRole('button', { name: '测试模型连接' }).click();
    await expect(page.locator('.schedule-agent-model-status')).toContainText(
      '模拟模式不连接外部模型',
    );
    await page.getByLabel('调整要求').fill('把周二第二场比赛改到周三十点');
    await page.getByRole('button', { name: '生成调整预览' }).click();
    try {
      await expect(page.locator('.schedule-agent-preview')).toBeVisible({
        timeout: 15000,
      });
    } catch (error) {
      const audits = (
        await sql.query(
          'SELECT action, outcome FROM "AuditRecord" WHERE action LIKE \'agent.%\' ORDER BY "occurredAt" DESC LIMIT 8',
        )
      ).rows;
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\nAgent responses: ${JSON.stringify(agentResponses)}\nAgent audits: ${JSON.stringify(audits)}`,
        { cause: error },
      );
    }
    await expect(page.locator('.schedule-agent-preview')).toContainText(
      '修改前',
    );
    await expect(page.locator('.schedule-agent-preview')).toContainText(
      '修改后',
    );
    await expect(page.locator('.schedule-agent-preview')).toContainText(
      '此操作尚未保存',
    );
    await expect(page.locator('.schedule-agent-confirmation')).toContainText(
      'schedule.draft.adjust@v1',
    );
    await expect(page.locator('.schedule-agent-confirmation')).toContainText(
      '执行人',
    );
    await page.getByRole('button', { name: /取\s*消/ }).click();
    await expect(page.locator('.schedule-agent-preview')).toHaveCount(0);
    await page.getByLabel('调整要求').fill('把周二第二场比赛改到周三十点');
    await page.getByRole('button', { name: '生成调整预览' }).click();
    await expect(page.locator('.schedule-agent-preview')).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: '确认保存草稿' }).click();
    await expect(page.getByText(/该命令当时执行 · 草稿 V/)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator('.schedule-agent-result-details')).toContainText(
      '首次执行回执',
    );
    await expect(page.locator('.schedule-agent-result-details')).toContainText(
      '命令：',
    );
    const originalReceipt = (
      await sql.query(
        'SELECT "commandId", result FROM "AgentCommandReceipt" WHERE "eventId"=$1 ORDER BY "createdAt" DESC LIMIT 1',
        [eventId],
      )
    ).rows[0];
    const apiOrigin = `http://127.0.0.1:${process.env.CAAU_BROWSER_API_PORT ?? 3000}`;
    const webToken = await page.evaluate(() =>
      sessionStorage.getItem('caau.local-test-session'),
    );
    const listing = await fetch(`${apiOrigin}/api/v1/agent/sessions`, {
      headers: { Authorization: `Bearer ${webToken}` },
    });
    expect(listing.status).toBe(200);
    const listed = await listing.json();
    expect(
      listed.some(
        (item) =>
          item.lastExecution?.result.commandId === originalReceipt.commandId,
      ),
    ).toBe(true);
    await page.reload();
    await expect(page.locator('.schedule-agent-result-details')).toContainText(
      originalReceipt.commandId,
    );
    await expect(
      page.locator('.schedule-agent > .ant-alert').last(),
    ).toContainText(`草稿 V${originalReceipt.result.revision}`);
    await expect(page.locator('.schedule-agent-result-details')).toContainText(
      '持久执行回执（恢复）',
    );
    await page.evaluate(() =>
      sessionStorage.removeItem('caau.local-test-session'),
    );
    await page.reload();
    await expect(page.locator('.schedule-agent-result-details')).toContainText(
      originalReceipt.commandId,
      { timeout: 15000 },
    );
    if ((await settings.getAttribute('open')) === null) {
      await settings.locator('> summary').click();
    }
    await generate.click();
    await expect(page.getByText('当前有')).toHaveCount(0);
    await expect(
      page.locator('.schedule-agent > .ant-alert').last(),
    ).toContainText('该命令当时执行');
    await expect(page.locator('.schedule-agent-result-details')).toContainText(
      '赛程当前状态',
    );
    await page.getByLabel('调整要求').fill('把周二第二场比赛改到周三十点');
    await page.getByRole('button', { name: '生成调整预览' }).click();
    await expect(page.locator('.schedule-agent-preview')).toBeVisible();
    const versionsBeforeLostResponse = (
      await sql.query(
        'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
        [eventId],
      )
    ).rows[0].n;
    const browserToken = await page.evaluate(() =>
      sessionStorage.getItem('caau.local-test-session'),
    );
    const sessionsBeforeLoss = await fetch(
      `${apiOrigin}/api/v1/agent/sessions`,
      {
        headers: { Authorization: `Bearer ${browserToken}` },
      },
    ).then((response) => response.json());
    const activeTicket = sessionsBeforeLoss.find(
      (item) =>
        item.currentEventId === eventId &&
        item.task?.confirmation?.state === 'PENDING',
    )?.task?.confirmation;
    expect(activeTicket).toBeTruthy();
    const committed = await fetch(
      `${apiOrigin}/api/v1/agent/confirmation-tickets/${activeTicket.id}/confirm`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${browserToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventId,
          matchId: activeTicket.matchId,
          parameterHash: activeTicket.parameterHash,
        }),
      },
    );
    expect(committed.status).toBe(200);
    const committedTicket = await committed.json();
    await page.route('**/agent/confirmation-tickets/*/confirm', (route) =>
      route.fulfill({ status: 503, body: '{}' }),
    ); // The write committed, but the browser only observes a failed response.
    await page.getByRole('button', { name: '确认保存草稿' }).click();
    await expect(page.locator('.schedule-agent-result-details')).toContainText(
      '命令：',
    );
    await page.unroute('**/agent/confirmation-tickets/*/confirm');
    await page.reload();
    await expect(page.locator('.schedule-agent-result-details')).toContainText(
      committedTicket.commandId,
    );
    await expect(
      page.locator('.schedule-agent > .ant-alert').last(),
    ).toContainText(`草稿 V${committedTicket.revision}`);
    const ticketId = committedTicket.ticketId;
    const retry = await fetch(
      `http://127.0.0.1:${process.env.CAAU_BROWSER_API_PORT ?? 3000}/api/v1/agent/confirmation-tickets/${ticketId}/confirm`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${browserToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventId,
          matchId: committedTicket.matchId,
          parameterHash: activeTicket.parameterHash,
        }),
      },
    );
    expect(retry.status).toBe(200);
    expect((await retry.json()).replayed).toBe(true);
    expect(
      (
        await sql.query(
          'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
          [eventId],
        )
      ).rows[0].n,
    ).toBe(versionsBeforeLostResponse + 1);
    expect(
      (
        await sql.query(
          'SELECT count(*)::int n FROM "AgentCommandReceipt" WHERE "ticketId"=$1',
          [ticketId],
        )
      ).rows[0].n,
    ).toBe(1);
    await page
      .locator('.schedule-week-table .schedule-match-card')
      .first()
      .click();
    await expect(page.getByRole('dialog')).toContainText('调整比赛时间与场地');
    await page.getByRole('button', { name: '保存调整' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('当前有')).toHaveCount(0);
    await page.getByRole('button', { name: '发布赛程' }).click();
    await page
      .locator('.ant-modal-confirm')
      .getByRole('button', { name: '确认发布' })
      .click();
    await expect(page.getByText(/已发布 · V/)).toBeVisible();
    await expect(page.locator('.ant-modal-confirm')).toHaveCount(0);
    if ((await settings.getAttribute('open')) !== null) {
      await settings.locator('> summary').click();
    }
    await mkdir('.local/caau-042', { recursive: true });
    await page.screenshot({
      path: '.local/caau-042/schedule-desktop.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileSchedule = await page
      .locator('.schedule-week-scroll')
      .evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        cardWidth:
          element.querySelector('.schedule-match-card')?.getBoundingClientRect()
            .width ?? 0,
      }));
    expect(mobileSchedule.scrollWidth).toBeGreaterThan(
      mobileSchedule.clientWidth,
    );
    expect(mobileSchedule.cardWidth).toBeGreaterThanOrEqual(100);
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
