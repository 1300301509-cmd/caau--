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
    // The relogin below uses the local signer's fixed super account. Use that
    // same account initially; two different super accounts must not share chats.
    const browserLogin = await fetch(
      `${await app.getUrl()}/api/v1/local-test-identities/sessions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: 'super-admin' }),
      },
    );
    expect(browserLogin.status).toBe(200);
    const browserSession = await browserLogin.json();
    await page
      .getByLabel('全局切换测试账号权限')
      .waitFor({ state: 'attached' });
    await page.evaluate(
      (token) => sessionStorage.setItem('caau.local-test-session', token),
      browserSession.token,
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
    // The local Web identity may differ from the synthetic API token used by
    // other tests. Bind this fixture to the browser's actual authenticated user.
    // Never log the token.
    const activeToken = await page.evaluate(() =>
      sessionStorage.getItem('caau.local-test-session'),
    );
    expect(activeToken).toBeTruthy();
    const freshResponse = await fetch(
      `${await app.getUrl()}/api/v1/agent/sessions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${activeToken}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
    );
    expect(freshResponse.ok).toBeTruthy();
    const freshSession = await freshResponse.json();
    const identityResponse = await fetch(
      `${await app.getUrl()}/api/v1/authorization/me`,
      {
        headers: { Authorization: `Bearer ${activeToken}` },
      },
    );
    expect(identityResponse.ok).toBeTruthy();
    const identity = await identityResponse.json();
    await page.evaluate(
      ({ actorId, sessionId }) => {
        sessionStorage.setItem(`caau.agent.active.${actorId}`, sessionId);
      },
      { actorId: identity.id, sessionId: freshSession.id },
    );
    await page.goto('http://127.0.0.1:4173/workspace');
    await page.getByRole('button', { name: '打开 CAAU 智能助手' }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.locator('.schedule-agent-context')).toContainText(
      '浏览页面：无赛事上下文',
    );
    await expect(page.locator('.schedule-agent-context')).toContainText(
      '任务对象：尚未选择赛事',
    );
    await page.getByRole('button', { name: '收起设置' }).click();
    await mkdir('.local/evidence/caau-065', { recursive: true });
    await page.locator('.agent-drawer').screenshot({
      path: '.local/evidence/caau-065/chat-desktop.png',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.agent-drawer').screenshot({
      path: '.local/evidence/caau-065/chat-mobile-web.png',
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: /赛程查询/ }).click();
    await expect(page.getByLabel('对话消息')).toHaveValue(
      '帮我查看当前赛事的赛程',
    );
    await page.getByLabel('对话消息').fill('未发送的输入应在最小化后保留');
    await page.getByRole('button', { name: '关闭智能助手' }).click();
    await page.getByRole('button', { name: '打开 CAAU 智能助手' }).click();
    await expect(page.getByLabel('对话消息')).toHaveValue(
      '未发送的输入应在最小化后保留',
    );
    const tasksBeforeChat = (
      await sql.query('SELECT count(*)::int n FROM "AgentTask"')
    ).rows[0].n;
    await page.getByLabel('对话消息').fill('你好');
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect(page.locator('.schedule-agent-history')).toContainText('你好');
    await page.getByLabel('对话消息').fill('七支球队适合什么赛制？');
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect(page.locator('.schedule-agent-history')).toContainText('21场');
    expect(
      await page
        .locator('.schedule-agent-history .agent-message')
        .evaluateAll((items) =>
          items.map((item) =>
            item.classList.contains('agent-message-user')
              ? 'USER'
              : 'ASSISTANT',
          ),
        ),
    ).toEqual(['USER', 'ASSISTANT', 'USER', 'ASSISTANT']);
    expect(
      agentResponses.slice(0, 2).map((item) => JSON.parse(item.body).sessionId),
      `new conversation should restore ${freshSession.id}`,
    ).toEqual([freshSession.id, freshSession.id]);
    expect(
      (await sql.query('SELECT count(*)::int n FROM "AgentTask"')).rows[0].n,
    ).toBe(tasksBeforeChat);
    const turnsBeforeOverflow = (
      await sql.query(
        'SELECT count(*)::int n FROM "AgentTurn" WHERE "sessionId"=$1',
        [freshSession.id],
      )
    ).rows[0].n;
    await page
      .getByLabel('对话消息')
      .fill('__CAAU_SYNTHETIC_CHAT_LENGTH_4001__');
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect(page.locator('.schedule-agent .ant-alert')).toContainText(
      '回答超过单次 4000 字上限',
    );
    await expect(page.getByLabel('对话消息')).toHaveValue(
      '__CAAU_SYNTHETIC_CHAT_LENGTH_4001__',
    );
    expect(
      (
        await sql.query(
          'SELECT count(*)::int n FROM "AgentTurn" WHERE "sessionId"=$1',
          [freshSession.id],
        )
      ).rows[0].n,
    ).toBe(turnsBeforeOverflow);
    await page.goto(
      `http://127.0.0.1:4173/competition?module=schedule&event=${eventId}`,
    );
    await expect(page.locator('.schedule-week')).toBeVisible();
    await page.getByRole('button', { name: '打开 CAAU 智能助手' }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.locator('.schedule-agent-context')).toContainText(
      '任务对象：',
    );
    await expect(page.locator('.schedule-agent-model-status')).toContainText(
      'SIMULATED',
    );
    const versionsBeforeQuery = (
      await sql.query(
        'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
        [eventId],
      )
    ).rows[0].n;
    await page.getByLabel('对话消息').fill('查这个赛事的赛程');
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect(page.locator('.schedule-agent-query-answer')).toContainText(
      /赛程：草稿 V\d+/,
    );
    await expect(page.locator('.schedule-agent-query-answer')).toContainText(
      '场地：',
    );
    await expect(page.locator('.schedule-agent-preview')).toHaveCount(0);
    expect(
      (
        await sql.query(
          'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
          [eventId],
        )
      ).rows[0].n,
    ).toBe(versionsBeforeQuery);
    const versionsBeforeUnsupported = (
      await sql.query(
        'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
        [eventId],
      )
    ).rows[0].n;
    await page.getByLabel('对话消息').fill('请批量重排整套赛程并发布赛程');
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect(page.locator('.schedule-agent-history')).toContainText(
      '不能代为执行',
    );
    await expect(page.locator('.schedule-agent-preview')).toHaveCount(0);
    expect(
      (
        await sql.query(
          'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
          [eventId],
        )
      ).rows[0].n,
    ).toBe(versionsBeforeUnsupported);
    await page.reload();
    await page.getByRole('button', { name: '打开 CAAU 智能助手' }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.locator('.schedule-agent-history')).toContainText(
      '请批量重排整套赛程并发布赛程',
    );
    await page.getByRole('button', { name: '测试模型连接' }).click();
    await expect(page.locator('.schedule-agent-model-status')).toContainText(
      '模拟模式不连接外部模型',
    );
    await expect(page.locator('.schedule-agent-context')).toContainText(
      '合成赛程赛事',
    );
    await page.getByLabel('对话消息').fill('把周二第二场比赛改到周三十点');
    await page.getByRole('button', { name: '发送消息' }).click();
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
    await page.getByRole('button', { name: '新对话' }).click();
    await expect(page.locator('.schedule-agent-preview')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: '确认保存草稿' }),
    ).toHaveCount(0);
    await page.reload();
    await page.getByRole('button', { name: '打开 CAAU 智能助手' }).click();
    await expect(page.locator('.schedule-agent-preview')).toHaveCount(0);
    await page.getByLabel('对话消息').fill('把周二第二场比赛改到周三十点');
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect(page.locator('.schedule-agent-preview')).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: '确认保存草稿' }).click();
    await expect(page.locator('.agent-execution > summary')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator('.schedule-agent-result-details')).toContainText(
      '首次执行回执',
    );
    await page.locator('.agent-drawer').screenshot({
      path: '.local/evidence/caau-065/receipt-summary.png',
    });
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
    await page.getByRole('button', { name: '打开 CAAU 智能助手' }).click();
    await expect(page.locator('.schedule-agent-result-details')).toContainText(
      originalReceipt.commandId,
    );
    await expect(page.locator('.agent-execution > summary')).toContainText(
      `草稿 V${originalReceipt.result.revision} 已保存`,
    );
    await expect(page.locator('.schedule-agent-result-details')).toContainText(
      '持久执行回执（恢复）',
    );
    await page.evaluate(() =>
      sessionStorage.removeItem('caau.local-test-session'),
    );
    await page.reload();
    await page.getByRole('button', { name: '打开 CAAU 智能助手' }).click();
    await expect(page.locator('.schedule-agent-result-details')).toContainText(
      originalReceipt.commandId,
      { timeout: 15000 },
    );
    await page.getByRole('button', { name: '关闭智能助手' }).click();
    if ((await settings.getAttribute('open')) === null) {
      await settings.locator('> summary').click();
    }
    await generate.click();
    await expect(page.getByText('当前有')).toHaveCount(0);
    await expect(page.locator('.agent-execution > summary')).toContainText(
      '已保存',
    );
    await expect(page.locator('.schedule-agent-result-details')).toContainText(
      '赛程当前状态',
    );
    await page.getByRole('button', { name: '打开 CAAU 智能助手' }).click();
    await page.getByLabel('对话消息').fill('把周二第二场比赛改到周三十点');
    await page.getByRole('button', { name: '发送消息' }).click();
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
    await page.getByRole('button', { name: '打开 CAAU 智能助手' }).click();
    await expect(page.locator('.schedule-agent-result-details')).toContainText(
      committedTicket.commandId,
    );
    await expect(page.locator('.agent-execution > summary')).toContainText(
      `草稿 V${committedTicket.revision} 已保存`,
    );
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
    const anotherAccount = await browser.newPage();
    try {
      await anotherAccount.goto('http://127.0.0.1:4173/workspace');
      await anotherAccount.evaluate(
        (token) => sessionStorage.setItem('caau.local-test-session', token),
        tokens.manager,
      );
      await anotherAccount.reload();
      await anotherAccount
        .getByRole('button', { name: '打开 CAAU 智能助手' })
        .click();
      await expect(anotherAccount.getByLabel('对话消息')).toBeEnabled();
      await expect(
        anotherAccount.locator('.schedule-agent-history'),
      ).not.toContainText(committedTicket.commandId);
      await anotherAccount.getByRole('button', { name: '新对话' }).click();
      const baselinePlans = (
        await sql.query(
          'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
          [eventId],
        )
      ).rows[0].n;
      await anotherAccount
        .getByLabel('对话消息')
        .fill(
          '请收集排程需求，合成赛程赛事，赛事日期范围 2027-06-01 到 2027-06-07',
        );
      await anotherAccount.getByRole('button', { name: '发送消息' }).click();
      await expect(anotherAccount.locator('.agent-planning')).toContainText(
        '赛事日期 2027-06-01 至 2027-06-07',
      );
      await anotherAccount
        .getByRole('button', { name: '仅确认需求（不生成赛程）' })
        .click();
      await expect(anotherAccount.locator('.agent-planning')).toContainText(
        '已确认需求',
      );
      const planningSection = anotherAccount.locator(
        '.agent-workspace-section:has(.agent-planning)',
      );
      if ((await planningSection.getAttribute('open')) === null)
        await planningSection.locator('> summary').click();
      const whole = anotherAccount.getByRole('region', {
        name: '整套候选赛程预览',
      });
      await expect(whole).toContainText('仅生成候选预览，不保存赛程');
      await whole.getByLabel('起始日期 YYYY-MM-DD').fill('2027-06-01');
      await whole.getByLabel('结束日期 YYYY-MM-DD').fill('2027-06-07');
      await whole.getByRole('checkbox').check();
      await whole
        .getByRole('button', { name: '仅生成候选预览，不保存赛程' })
        .click();
      await expect(whole).toContainText('候选预览，尚未保存');
      await expect(whole).toContainText('共 6 场');
      await expect(whole.locator('tbody tr')).toHaveCount(6);
      await whole.getByRole('button', { name: '准备保存整套 DRAFT' }).click();
      await expect(
        whole.getByRole('region', { name: '候选草稿确认' }),
      ).toContainText('PENDING');
      expect(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
            [eventId],
          )
        ).rows[0].n,
      ).toBe(baselinePlans);
      await whole.getByRole('button', { name: /取\s*消/ }).click();
      await expect(
        whole.getByRole('region', { name: '候选草稿确认' }),
      ).toContainText('CANCELLED');
      await anotherAccount.reload();
      await anotherAccount
        .getByRole('button', { name: '打开 CAAU 智能助手' })
        .click();
      const restoredPlanning = anotherAccount.locator(
        '.agent-workspace-section:has(.agent-planning)',
      );
      if ((await restoredPlanning.getAttribute('open')) === null)
        await restoredPlanning.locator('> summary').click();
      await expect(
        anotherAccount.getByRole('region', { name: '整套候选赛程预览' }),
      ).toContainText('共 6 场');
      await anotherAccount.getByLabel('对话消息').fill('合成赛程球队4只能周三');
      await anotherAccount.getByRole('button', { name: '发送消息' }).click();
      await expect(anotherAccount.locator('.agent-planning')).toContainText(
        '待人工确认',
      ); // Changed requirements revoke the previous confirmation.
      await expect(anotherAccount.locator('.agent-planning')).not.toContainText(
        '已确认需求',
      );
      expect(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
            [eventId],
          )
        ).rows[0].n,
      ).toBe(baselinePlans);
    } finally {
      await anotherAccount.close();
    }
    await page.getByRole('button', { name: '关闭智能助手' }).click();
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
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('http://127.0.0.1:4173/governance');
    await expect(
      page.getByRole('heading', { name: '平台治理与监控', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('账号总数', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: '操作审计', exact: true }).click();
    await expect(
      page.locator('.governance-page .ant-table-row').first(),
    ).toBeVisible();
    await page
      .locator('.governance-page .ant-table-row')
      .first()
      .getByRole('button', { name: /详\s*情/ })
      .click();
    await expect(page.getByText('记录ID', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await mkdir('.local/evidence/governance', { recursive: true });
    await page.screenshot({
      path: '.local/evidence/governance/audit-desktop.png',
      fullPage: true,
    });
    await page
      .getByRole('tab', { name: '平台总览', exact: true })
      .evaluate((tab) => tab.click());
    await page.setViewportSize({ width: 390, height: 844 });
    const overviewCardHeights = await page
      .locator('.governance-metric')
      .evaluateAll((cards) =>
        cards.map((card) => card.getBoundingClientRect().height),
      );
    expect(overviewCardHeights.length).toBeGreaterThan(0);
    expect(Math.max(...overviewCardHeights)).toBeLessThanOrEqual(176);
    expect(Math.min(...overviewCardHeights)).toBeGreaterThanOrEqual(176);
    const operationCard = page
      .locator('.governance-metric')
      .filter({ hasText: '操作分布' });
    await operationCard
      .getByRole('button', { name: '查看操作分布完整内容' })
      .click();
    const metricDialog = page.getByRole('dialog');
    await expect(metricDialog).toContainText('操作分布');
    await expect(
      metricDialog.locator('.governance-metric-detail'),
    ).not.toBeEmpty();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
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
      path: '.local/evidence/governance/overview-mobile.png',
      fullPage: true,
    });
    // A transient identity lookup must not mint a different administrator session.
    const preservedSession = await page.evaluate(() =>
      sessionStorage.getItem('caau.local-test-session'),
    );
    let unexpectedSessionIssues = 0;
    page.on('request', (request) => {
      if (
        request.url().endsWith('/local-test-identities/sessions') &&
        request.method() === 'POST'
      )
        unexpectedSessionIssues += 1;
    });
    await page.route('**/api/v1/workspace/identity', (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Synthetic concurrent conflict' }),
      }),
    );
    await page.reload();
    await expect(
      page.getByText('暂时无法连接总部服务', { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem('caau.local-test-session'),
      ),
    ).toBe(preservedSession);
    expect(unexpectedSessionIssues).toBe(0);
    await page.unroute('**/api/v1/workspace/identity');
    await page.getByRole('button', { name: '重新连接', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: '平台治理与监控', exact: true }),
    ).toBeVisible();
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
