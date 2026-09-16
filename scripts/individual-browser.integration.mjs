import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createApplication } from '../apps/api/dist/application.js';

export async function individualBrowserTest({
  config,
  tokens: original,
  sql,
  users,
  members,
  orgA,
  orgB,
}) {
  const evidence = new URL('../.local/evidence/caau-012-web/', import.meta.url);
  await mkdir(evidence, { recursive: true });
  const tokens = { ...original };
  async function issue(key) {
    const token = randomBytes(32).toString('base64url');
    await sql.query(
      'INSERT INTO "Session" (id,"tokenHash","userId","expiresAt") VALUES ($1,$2,$3,now()+interval \'1 hour\')',
      [
        randomUUID(),
        createHash('sha256').update(token).digest('hex'),
        users[key],
      ],
    );
    tokens[key] = token;
  }
  for (const key of ['a', 'b', 'reviewer', 'reviewer2']) await issue(key);
  const web = createServer(async (req, res) => {
    const p = new URL(req.url, 'http://127.0.0.1').pathname;
    const asset = /^\/assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(p);
    try {
      const data = await readFile(
        new URL(
          '../apps/admin/dist/' + (asset ? p.slice(1) : 'index.html'),
          import.meta.url,
        ),
      );
      res.writeHead(200, {
        'Content-Type': asset
          ? p.endsWith('.js')
            ? 'text/javascript'
            : 'text/css'
          : 'text/html',
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  const app = await createApplication(config);
  let browser,
    webListening = false;
  const samples = [],
    pageErrors = [];
  const base = 'http://127.0.0.1:3000/api/v1';
  async function api(key, method, path, body, expected = 200) {
    const r = await fetch(`${base}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${tokens[key]}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await r.json();
    assert.equal(
      r.status,
      expected,
      `${method} ${path}: ${JSON.stringify(data)}`,
    );
    return data;
  }
  async function login(page, key) {
    await expect(page.getByLabel('选择测试身份')).toBeVisible({
      timeout: 15000,
    });
    await page.evaluate(
      ([storageKey, token]) => sessionStorage.setItem(storageKey, token),
      ['caau.local-test-session', tokens[key]],
    );
    const snapshot = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/individual-materials/snapshot') &&
        response.status() === 200,
    );
    await page.reload();
    await snapshot;
    await expect(page.getByTestId('sync-status')).toHaveCount(0);
  }
  async function newPage(key, url = '/materials') {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce',
      acceptDownloads: true,
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('dialog', (d) => d.accept());
    await page.goto(`http://127.0.0.1:4173${url}`);
    await login(page, key);
    await expect(
      page.getByRole('heading', { name: '承办方列表', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Logo 待提供').first()).toBeVisible();
    return page;
  }
  async function createTask(eventId, handler, title) {
    const task = await api('manager', 'POST', 'individual-material-tasks', {
      eventId,
      organizationId: handler === 'b' ? orgB : orgA,
      handlerMemberId: members[handler],
      title,
    });
    await api('manager', 'PATCH', `material-tasks/${task.id}/requirements`, {
      expectedRevision: 1,
      requirements: {
        deadline: new Date(Date.now() + 86400000).toISOString(),
        materials: [],
      },
    });
    await api('manager', 'POST', `material-tasks/${task.id}/publish`, {
      expectedRevision: 2,
    });
    return task.id;
  }
  async function createOnPage(page, title, text = '合成材料 V1 正文') {
    await page
      .getByRole('button', { name: '自由新增材料', exact: true })
      .click();
    await page.getByLabel('材料名称', { exact: true }).fill(title);
    await page.getByLabel('材料类别', { exact: true }).fill('自由办赛资料');
    await page.getByLabel('材料说明', { exact: true }).fill(text);
    await page
      .getByRole('button', { name: '建立材料草稿', exact: true })
      .click();
    await page.getByRole('button', { name: '确认操作', exact: true }).click();
    await expect(page.getByTestId('material-state')).toHaveText('待提交', {
      timeout: 15000,
    });
    await expect(
      page.getByRole('button', { name: '单份提交', exact: true }),
    ).toBeEnabled({ timeout: 15000 });
    return (
      await api(
        'a',
        'GET',
        `individual-materials/snapshot?taskId=${taskId}&state=DRAFT&limit=50`,
      )
    ).items.find((m) => m.draft.title === title).id;
  }
  const pick = async (page, title) => {
    await page
      .getByRole('button', { name: `查看材料 ${title}`, exact: true })
      .click();
    await expect(page.getByTestId('material-state')).toBeVisible({
      timeout: 15000,
    });
  };
  async function act(page, button, route, observers = []) {
    await page.getByRole('button', { name: button, exact: true }).click();
    const response = page
      .waitForResponse(
        (r) => r.url().endsWith(route) && r.request().method() === 'POST',
      )
      .then(async (r) => {
        await r.finished();
        return { r, start: performance.now() };
      });
    await page.getByRole('button', { name: '确认操作', exact: true }).click();
    const { r, start } = await response;
    assert.equal(r.status(), 200);
    await Promise.all(
      observers.map(async ({ page: other, state, materialId }) => {
        await other.waitForFunction(
          ({ state, materialId }) => {
            const element = globalThis.document.querySelector(
              materialId
                ? `[data-material-id="${materialId}"]`
                : '[data-testid="material-state"]',
            );
            return materialId
              ? element?.textContent?.includes(state)
              : element?.textContent === state;
          },
          { state, materialId },
          { timeout: 12000, polling: 'raf' },
        );
        samples.push({
          action: button,
          observer:
            other === org
              ? 'organizer'
              : other === a
                ? 'reviewer-a'
                : 'reviewer-b',
          ms: Math.round(performance.now() - start),
        });
      }),
    );
    await expect(page.getByTestId('sync-status')).toHaveCount(0);
    await expect(page.getByTestId('sync-problem')).toHaveCount(0);
  }
  let taskId, org, a, b;
  try {
    await app.listen(3000, '127.0.0.1');
    await new Promise((resolve, reject) => {
      web.once('error', reject);
      web.listen(4173, '127.0.0.1', resolve);
    });
    webListening = true;
    const eventId = (
      await api('manager', 'POST', 'events', {
        name: 'CAAU012 新版浏览器赛事',
        description: '独立多会话真实验证',
      })
    ).id;
    const otherEvent = (
      await api('manager', 'POST', 'events', {
        name: 'CAAU012 隔离赛事',
        description: '不同承办机构',
      })
    ).id;
    let grantB;
    for (const key of ['reviewer', 'reviewer2']) {
      const grant = await api('sys', 'POST', 'authorization/event-grants', {
        eventId,
        memberId: members[key],
      });
      if (key === 'reviewer2') grantB = grant.id;
    }
    taskId = await createTask(eventId, 'a', 'CAAU012 单份材料浏览器任务');
    await createTask(otherEvent, 'b', 'CAAU012 其他机构任务');
    browser = await chromium.launch();

    // The new event page uses the current API and keeps backend role enforcement.
    const eventContext = await browser.newContext({
      viewport: { width: 1100, height: 800 },
      reducedMotion: 'reduce',
    });
    const eventPage = await eventContext.newPage();
    pageErrors.length = 0;
    await eventPage.goto('http://127.0.0.1:4173/events');
    await expect(eventPage.getByLabel('测试身份')).toBeVisible({
      timeout: 15000,
    });
    await eventPage.evaluate(
      ([storageKey, session]) => sessionStorage.setItem(storageKey, session),
      ['caau.local-test-session', tokens.manager],
    );
    await eventPage.reload();
    await expect(
      eventPage.getByRole('heading', { level: 1, name: '赛事管理' }),
    ).toBeVisible();
    await eventPage.getByRole('button', { name: '创建赛事' }).click();
    await eventPage.getByLabel('赛事名称').fill('CAAU018 页面创建赛事');
    await eventPage
      .getByLabel('赛事说明')
      .fill('隔离数据库中的赛事管理页面验收');
    const createResponse = eventPage.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/events') &&
        response.request().method() === 'POST',
    );
    await eventPage.getByRole('button', { name: '确认创建' }).click();
    assert.equal((await createResponse).status(), 200);
    await expect(
      eventPage.getByRole('heading', { name: 'CAAU018 页面创建赛事' }),
    ).toBeVisible({ timeout: 15000 });
    await expect(eventPage.getByText('承办方指派暂缓')).toBeVisible();
    await expect(eventPage.getByText('已指定承办方')).toHaveCount(0);
    assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
    await api(
      'reviewer',
      'POST',
      'events',
      { name: '审核员不得创建', description: '权限反例' },
      403,
    );
    await api(
      'a',
      'POST',
      'events',
      { name: '承办方不得创建', description: '权限反例' },
      403,
    );
    await eventContext.close();

    // Fixed local identities use real backend sessions while remaining isolated per tab.
    const identityContext = await browser.newContext({
      viewport: { width: 1100, height: 800 },
      reducedMotion: 'reduce',
    });
    const managerTab = await identityContext.newPage();
    const organizerTab = await identityContext.newPage();
    for (const page of [managerTab, organizerTab])
      await page.goto('http://127.0.0.1:4173/materials');
    await managerTab.getByLabel('选择测试身份').selectOption('reviewer-a');
    await managerTab.getByTestId('local-identity-enter').click();
    await organizerTab.getByLabel('选择测试身份').selectOption('organizer-b');
    await organizerTab.getByTestId('local-identity-enter').click();
    await expect(
      managerTab.getByText('总部审核员甲 · 总部审核员', { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      organizerTab.getByText('承办方 B 经办人 · 承办方', { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await managerTab.reload();
    await expect(
      managerTab.getByText('总部审核员甲 · 总部审核员', { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await managerTab.getByLabel('选择测试身份').selectOption('event-manager');
    await managerTab.getByTestId('local-identity-enter').click();
    await expect(
      managerTab.getByText('总部赛事管理员 · 总部管理', { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      organizerTab.getByText('承办方 B 经办人 · 承办方', { exact: true }),
    ).toBeVisible();
    const expiringToken = await organizerTab.evaluate(() =>
      sessionStorage.getItem('caau.local-test-session'),
    );
    assert.ok(expiringToken);
    await sql.query(
      'UPDATE "Session" SET "expiresAt"=now()-interval \'1 second\' WHERE "tokenHash"=$1',
      [createHash('sha256').update(expiringToken).digest('hex')],
    );
    await expect(organizerTab.getByTestId('session-problem')).toContainText(
      '会话已失效',
      { timeout: 15000 },
    );
    assert.equal(
      await organizerTab.evaluate(() =>
        sessionStorage.getItem('caau.local-test-session'),
      ),
      null,
    );
    await organizerTab.getByTestId('local-identity-enter').click();
    await expect(
      organizerTab.getByText('承办方 B 经办人 · 承办方', { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await identityContext.close();
    assert.equal(
      (
        await sql.query(
          `SELECT count(*)::int n FROM "InternalUser" WHERE id::text LIKE '00000000-0000-4000-8000-00000000020_'`,
        )
      ).rows[0].n,
      5,
    );
    assert.equal(
      (
        await sql.query(
          `SELECT count(*)::int n FROM "Organization" WHERE id::text LIKE '00000000-0000-4000-8000-00000000010_'`,
        )
      ).rows[0].n,
      3,
    );
    assert.equal(
      (
        await sql.query(
          `SELECT count(*)::int n FROM "OrganizationMember" WHERE "userId"::text LIKE '00000000-0000-4000-8000-00000000020_'`,
        )
      ).rows[0].n,
      5,
    );
    assert.equal(
      (
        await sql.query(
          `SELECT count(*)::int n FROM "Event" WHERE "createdBy"::text LIKE '00000000-0000-4000-8000-00000000020_'`,
        )
      ).rows[0].n,
      0,
    );

    org = await newPage('a');
    a = await newPage('reviewer');
    b = await newPage('reviewer2');
    for (const p of [org, a, b])
      await p.getByLabel('办理任务', { exact: true }).selectOption(taskId);
    await expect(org.getByTestId('sync-status')).toHaveCount(0);
    const first = await createOnPage(org, '独立材料甲');
    const bytes = Buffer.from('CAAU012 synthetic private attachment');
    await org.getByLabel('上传私有附件').setInputFiles({
      name: '办赛附件.txt',
      mimeType: 'text/plain',
      buffer: bytes,
    });
    await expect(org.getByText(/附件 办赛附件.txt 已确认/)).toBeVisible();
    await org.getByRole('button', { name: '保存草稿', exact: true }).click();
    await expect(org.getByText('草稿已保存。', { exact: true })).toBeVisible();
    const second = await createOnPage(
      org,
      '独立材料乙',
      '此份仍待提交，不阻碍甲',
    );
    await pick(org, '独立材料甲');
    await act(org, '单份提交', `/${first}/submit`, [
      { page: a, state: '待审核', materialId: first },
      { page: b, state: '待审核', materialId: first },
    ]);
    assert.equal(
      (
        await api(
          'a',
          'GET',
          `individual-materials/snapshot?selectedId=${second}`,
        )
      ).selected.state,
      'DRAFT',
    );
    await pick(a, '独立材料甲');
    await pick(b, '独立材料甲');
    await act(a, '开始审核', `/${first}/start-review`, [
      { page: org, state: '审核中' },
      { page: b, state: '审核中' },
    ]);
    await b.getByLabel('退回原因', { exact: true }).fill('赛程说明需补充');
    await b.getByLabel('修改要求', { exact: true }).fill('请补齐场地及时间');
    await act(b, '退回修改', `/${first}/return`, [
      { page: org, state: '退回修改' },
      { page: a, state: '退回修改' },
    ]);
    await expect(
      org.getByText('退回原因：赛程说明需补充', { exact: true }),
    ).toBeVisible();
    await org
      .getByLabel('材料说明', { exact: true })
      .fill('合成材料 V2 已补齐场地及时间');
    await org.getByRole('button', { name: '保存草稿', exact: true }).click();
    await expect(org.getByText('草稿已保存。', { exact: true })).toBeVisible();
    await act(org, '单份提交', `/${first}/submit`, [
      { page: a, state: '待审核' },
      { page: b, state: '待审核' },
    ]);
    await expect(a.getByTestId('material-version')).toHaveText('V2');
    await act(a, '开始审核', `/${first}/start-review`, [
      { page: org, state: '审核中' },
      { page: b, state: '审核中' },
    ]);
    await b.screenshot({
      path: fileURLToPath(new URL('reviewer-continuation.png', evidence)),
      fullPage: true,
    });
    await act(b, '审核通过', `/${first}/approve`, [
      { page: org, state: '审核通过' },
      { page: a, state: '审核通过' },
    ]);
    await expect(
      org
        .locator('.individual-timeline li')
        .filter({ hasText: '开始审核' })
        .first(),
    ).toContainText('Synthetic reviewer');
    await expect(
      org
        .locator('.individual-timeline li')
        .filter({ hasText: '审核通过 ·' })
        .first(),
    ).toContainText('Synthetic reviewer2');
    const oldVersion = org.locator('details').filter({
      has: org.getByText('不可变提交 V1 · 独立材料甲', { exact: true }),
    });
    await oldVersion.locator('summary').click();
    await expect(
      oldVersion.getByText('合成材料 V1 正文', { exact: true }),
    ).toBeVisible();
    await oldVersion.locator('summary').click();
    await org.screenshot({
      path: fileURLToPath(new URL('approved-v2.png', evidence)),
      fullPage: true,
    });
    const download = org.waitForEvent('download');
    await org
      .getByRole('button', { name: '下载当前版本附件 1', exact: true })
      .click();
    const downloaded = await download;
    assert.equal(downloaded.suggestedFilename(), '办赛附件.txt');
    assert.deepEqual(await readFile(await downloaded.path()), bytes);

    // Both dialogs capture the same revision before either independent browser confirms.
    const race = await createOnPage(org, '并发审核材料');
    await act(org, '单份提交', `/${race}/submit`, [
      { page: a, state: '待审核', materialId: race },
      { page: b, state: '待审核', materialId: race },
    ]);
    await pick(a, '并发审核材料');
    await pick(b, '并发审核材料');
    await act(a, '开始审核', `/${race}/start-review`, [
      { page: b, state: '审核中' },
    ]);
    for (const p of [a, b]) {
      await p.getByLabel('退回原因', { exact: true }).fill('并发意见保持');
      await p.getByLabel('修改要求', { exact: true }).fill('并发修改说明保持');
    }
    await a.getByRole('button', { name: '审核通过', exact: true }).click();
    await b.getByRole('button', { name: '退回修改', exact: true }).click();
    const ar = a.waitForResponse(
        (r) =>
          r.url().endsWith(`/${race}/approve`) &&
          r.request().method() === 'POST',
      ),
      br = b.waitForResponse(
        (r) =>
          r.url().endsWith(`/${race}/return`) &&
          r.request().method() === 'POST',
      );
    await Promise.all([
      a.getByRole('button', { name: '确认操作', exact: true }).click(),
      b.getByRole('button', { name: '确认操作', exact: true }).click(),
    ]);
    const responses = await Promise.all([ar, br]);
    assert.deepEqual(responses.map((r) => r.status()).sort(), [200, 409]);
    const loser = responses[0].status() === 409 ? a : b;
    await expect(
      loser.getByText(/操作冲突：服务器已有新版本或审核结果/),
    ).toBeVisible();
    await expect(loser.getByLabel('退回原因', { exact: true })).toHaveValue(
      '并发意见保持',
    );
    await loser.screenshot({
      path: fileURLToPath(new URL('review-conflict.png', evidence)),
      fullPage: true,
    });
    assert.equal(
      (
        await sql.query(
          'SELECT count(*)::int n FROM "IndividualAction" WHERE "materialId"=$1 AND action IN (\'APPROVE\',\'RETURN\')',
          [race],
        )
      ).rows[0].n,
      1,
    );

    const draft = await createOnPage(org, '输入保护材料', '服务器初稿');
    const mirror = await newPage('a');
    await mirror.getByLabel('办理任务', { exact: true }).selectOption(taskId);
    await pick(mirror, '输入保护材料');
    await org
      .getByLabel('材料说明', { exact: true })
      .fill('本地未保存输入，必须保留');
    await mirror
      .getByLabel('材料说明', { exact: true })
      .fill('另一独立窗口已保存');
    await mirror.getByRole('button', { name: '保存草稿', exact: true }).click();
    await expect(
      org.getByText('草稿或经办权限版本已变化，本地输入保留。', {
        exact: true,
      }),
    ).toBeVisible({ timeout: 12000 });
    await expect(org.getByLabel('材料说明', { exact: true })).toHaveValue(
      '本地未保存输入，必须保留',
    );
    await expect(
      org.getByRole('button', { name: '保存草稿', exact: true }),
    ).toBeDisabled();
    await org.screenshot({
      path: fileURLToPath(new URL('input-preserved.png', evidence)),
      fullPage: true,
    });
    await org
      .getByRole('button', { name: '核对后保留输入', exact: true })
      .click();
    await org.getByRole('button', { name: '保存草稿', exact: true }).click();
    await expect(org.getByText('草稿已保存。', { exact: true })).toBeVisible();
    for (let i = 0; i < 6; i++)
      await api('a', 'POST', 'individual-materials', {
        id: randomUUID(),
        taskId,
        key: randomUUID(),
        content: {
          title: `分页合成材料${i}`,
          category: '',
          text: '分页fixture',
          fileIds: [],
        },
      });
    await expect(
      org.getByRole('button', { name: '材料下一页', exact: true }),
    ).toBeEnabled({ timeout: 12000 });
    await org
      .getByLabel('材料说明', { exact: true })
      .fill('翻页与自动更新均不得丢失');
    await org.getByRole('button', { name: '材料下一页', exact: true }).click();
    await expect(org.getByText(/份材料 · 第 2 页/)).toBeVisible();
    await org.waitForTimeout(2400);
    await expect(org.getByText(/份材料 · 第 2 页/)).toBeVisible();
    await expect(org.getByLabel('材料说明', { exact: true })).toHaveValue(
      '翻页与自动更新均不得丢失',
    );
    await org.context().setOffline(true);
    await expect(org.getByTestId('sync-problem')).toContainText(
      '暂时无法更新',
      { timeout: 12000 },
    );
    await expect(
      org.getByRole('button', { name: '保存草稿', exact: true }),
    ).toBeDisabled();
    await expect(org.getByLabel('材料说明', { exact: true })).toHaveValue(
      '翻页与自动更新均不得丢失',
    );
    await mirror
      .getByLabel('材料说明', { exact: true })
      .fill('离线期间另一窗口更新');
    await mirror.getByRole('button', { name: '保存草稿', exact: true }).click();
    await expect(
      mirror.getByText('草稿已保存。', { exact: true }),
    ).toBeVisible();
    const reconnectStart = performance.now();
    await org.context().setOffline(false);
    await expect(org.getByTestId('sync-problem')).toHaveCount(0, {
      timeout: 15000,
    });
    await expect(
      org.getByText('草稿或经办权限版本已变化，本地输入保留。', {
        exact: true,
      }),
    ).toBeVisible();
    const reconnectMs = Math.round(performance.now() - reconnectStart);
    await expect(org.getByLabel('材料说明', { exact: true })).toHaveValue(
      '翻页与自动更新均不得丢失',
    );
    await expect(org.getByText(/份材料 · 第 2 页/)).toBeVisible();

    // Real committed submit response is discarded; explicit replay must reuse its key.
    const unknown = await createOnPage(mirror, '结果丢失重试材料');
    let originalPayload,
      writeCount = 0;
    await mirror.route(
      `**/individual-materials/${unknown}/submit`,
      async (route) => {
        const payload = route.request().postDataJSON();
        writeCount++;
        if (writeCount === 1) {
          originalPayload = payload;
          const response = await route.fetch();
          assert.equal(response.status(), 200);
          await route.abort('failed');
        } else {
          assert.deepEqual(payload, originalPayload);
          await route.continue();
        }
      },
    );
    await mirror.getByRole('button', { name: '单份提交', exact: true }).click();
    await mirror.getByRole('button', { name: '确认操作', exact: true }).click();
    await expect(
      mirror.getByRole('button', { name: '沿用原命令重试', exact: true }),
    ).toBeEnabled({ timeout: 15000 });
    await mirror
      .getByRole('button', { name: '沿用原命令重试', exact: true })
      .click();
    await expect(
      mirror.getByRole('button', { name: '沿用原命令重试', exact: true }),
    ).toHaveCount(0, { timeout: 15000 });
    assert.equal(writeCount, 2);
    assert.equal(
      (
        await sql.query(
          'SELECT count(*)::int n FROM "IndividualSubmission" WHERE "materialId"=$1',
          [unknown],
        )
      ).rows[0].n,
      1,
    );
    await mirror.unroute(`**/individual-materials/${unknown}/submit`);

    // Independently invalidate a live session; polling must clear unsaved content.
    await api('a', 'POST', 'authorization/logout');
    await expect(org.getByTestId('session-problem')).toContainText(
      '会话已失效',
      { timeout: 15000 },
    );
    await expect(org.getByLabel('材料说明', { exact: true })).toHaveCount(0);
    await expect(org.locator('body')).not.toContainText(
      '翻页与自动更新均不得丢失',
    );
    await issue('a');
    await login(org, 'a');
    await expect(org.getByLabel('材料说明', { exact: true })).toHaveCount(0);

    // A previously authorized real response arrives AFTER explicit local logout.
    await issue('a');
    const late = await newPage('a', `/materials?material=${draft}`);
    await expect(late.getByTestId('material-state')).toHaveText('待提交');
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    let capturedResolve;
    const captured = new Promise((resolve) => {
      capturedResolve = resolve;
    });
    let intercepted = false;
    await late.route(
      '**/api/v1/individual-materials/snapshot*',
      async (route) => {
        if (intercepted) {
          await route.continue();
          return;
        }
        intercepted = true;
        const response = await route.fetch();
        capturedResolve();
        await held;
        await route.fulfill({ response });
      },
    );
    await captured;
    await late
      .getByRole('button', { name: '退出并清除内容', exact: true })
      .click();
    await expect(late.getByLabel('材料说明', { exact: true })).toHaveCount(0);
    release();
    await late.waitForTimeout(2300);
    await expect(late.getByTestId('sync-status')).toHaveCount(0);
    await expect(late.getByTestId('material-state')).toHaveCount(0);
    await late.unroute('**/api/v1/individual-materials/snapshot*');
    await issue('a');
    await api('sys', 'PATCH', `event-grants/${grantB}/active`, {
      active: false,
    });
    await expect(
      b.getByText('访问权限已变化，受保护内容和未保存输入已清除。', {
        exact: true,
      }),
    ).toBeVisible({ timeout: 15000 });
    await expect(b.getByTestId('material-state')).toHaveCount(0);
    await expect(b.getByLabel('退回原因', { exact: true })).toHaveCount(0);
    await expect(b.locator('body')).not.toContainText('并发审核材料');
    await b.screenshot({
      path: fileURLToPath(new URL('revoked-cleared.png', evidence)),
      fullPage: true,
    });
    const outsider = await newPage('b', `/materials?material=${first}`);
    await expect(outsider.locator('body')).not.toContainText(
      '合成材料 V2 已补齐场地及时间',
    );
    await expect(outsider.getByTestId('material-state')).toHaveCount(0);
    const fileId = (
      await api('a', 'GET', `individual-materials/snapshot?selectedId=${first}`)
    ).selected.submission.content.fileIds[0];
    await api('b', 'GET', `individual-uploads/${fileId}/info`, undefined, 403);

    // Real old-package history and private download, rendered with no write controls.
    let legacy = await api('manager', 'POST', 'material-tasks', {
      eventId,
      organizationId: orgA,
      handlerMemberId: members.a,
      reviewerMemberId: members.reviewer,
      title: '浏览器旧整包只读样本',
    });
    const materialId = randomUUID(),
      deadline = new Date(Date.now() + 86400000).toISOString();
    legacy = await api(
      'manager',
      'PATCH',
      `material-tasks/${legacy.id}/requirements`,
      {
        expectedRevision: 1,
        requirements: {
          deadline,
          materials: [
            {
              id: materialId,
              title: '旧材料',
              required: true,
              instructions: '合成旧要求',
              templateVersion: 'old1',
              formats: ['txt'],
              maxBytes: 1024,
              deadline,
              acceptanceStandard: '旧标准',
            },
          ],
        },
      },
    );
    await api('manager', 'POST', `material-tasks/${legacy.id}/publish`, {
      expectedRevision: legacy.revision,
    });
    const oldFile = await api(
      'a',
      'POST',
      `material-tasks/${legacy.id}/uploads`,
      {
        materialId,
        extension: 'txt',
        originalName: '旧附件.txt',
        expectedBytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
    );
    const upload = await fetch(`${base}/uploads/${oldFile.id}/content`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.a}`,
        'Content-Type': 'application/octet-stream',
      },
      body: bytes,
    });
    assert.equal(upload.status, 200);
    await api('a', 'POST', `uploads/${oldFile.id}/confirm`);
    const oldDraft = await api(
      'a',
      'PATCH',
      `material-tasks/${legacy.id}/draft`,
      {
        expectedRevision: 1,
        entries: [
          { materialId, text: '原整包审核语义保持', fileIds: [oldFile.id] },
        ],
      },
    );
    const oldSub = await api(
      'a',
      'POST',
      `material-tasks/${legacy.id}/submissions`,
      {
        expectedDraftRevision: oldDraft.revision,
        idempotencyKey: randomUUID(),
      },
    );
    await api('reviewer', 'POST', `material-tasks/${legacy.id}/reviews`, {
      submissionId: oldSub.id,
      decision: 'PASS',
      issues: [],
    });
    await expect(
      org.getByLabel('旧历史任务').locator(`option[value="${legacy.id}"]`),
    ).toHaveCount(1, { timeout: 12000 });
    await org.getByLabel('旧历史任务').selectOption(legacy.id);
    await expect(
      org.getByText('旧整包 V1 · 整包已通过', { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      org.getByRole('button', { name: '单份提交', exact: true }),
    ).toHaveCount(0);
    const oldDownload = org.waitForEvent('download');
    await org
      .getByRole('button', { name: '下载旧 V1 附件 1', exact: true })
      .click();
    const oldData = await oldDownload;
    assert.equal(oldData.suggestedFilename(), '旧附件.txt');
    assert.deepEqual(await readFile(await oldData.path()), bytes);
    await org.screenshot({
      path: fileURLToPath(new URL('legacy-readonly.png', evidence)),
      fullPage: true,
    });
    await org.setViewportSize({ width: 375, height: 900 });
    assert.equal(
      await org.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
      true,
    );
    assert.deepEqual(pageErrors, []);
    const values = samples.map((s) => s.ms).sort((x, y) => x - y),
      quantile = (p) => values[Math.ceil(values.length * p) - 1];
    const result = {
      suite: 'CAAU-012 C real multi-context Chromium / PostgreSQL',
      samples,
      measurement:
        'Successful write HTTP response finished to other independent browser DOM, observed on animation frames (~17ms plus CDP overhead); not exact database commit latency',
      count: samples.length,
      p50: quantile(0.5),
      p95: quantile(0.95),
      max: values.at(-1),
      reconnectMs,
      browser: browser.version(),
      newBrowserAcceptance: true,
      oldRegressionSeparate: true,
    };
    await writeFile(
      new URL('multi-session-results.json', evidence),
      JSON.stringify(result, null, 2) + '\n',
    );
    console.log(
      `CAAU012 browser: ${result.count} latency samples p50=${result.p50}ms p95=${result.p95}ms max=${result.max}ms; reconnect=${reconnectMs}ms`,
    );
    assert.ok(result.p95 <= 5000, 'Local foreground p95 target is 5 seconds');
    assert.ok(draft);
  } catch (error) {
    if (browser)
      for (const [i, context] of browser.contexts().entries()) {
        const page = context.pages()[0];
        if (page)
          await page
            .screenshot({
              path: fileURLToPath(new URL(`failure-${i}.png`, evidence)),
              fullPage: true,
            })
            .catch(() => {});
      }
    throw error;
  } finally {
    await browser?.close();
    if (webListening) await new Promise((resolve) => web.close(resolve));
    await app.close();
  }
}
