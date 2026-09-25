import { expect, test } from '@playwright/test';

// These checks exercise a restored formal Cookie session with read-only fixtures.
test.beforeEach(async ({ page }) => {
  const identity = {
    id: '00000000-0000-4000-8000-000000000001',
    displayName: '总部审核员',
    roles: ['REVIEWER'],
    canReviewHostingApplications: true,
    canManageAccounts: false,
    hostingApplicantOrganizations: [],
  };
  await page.route('**/api/v1/authentication/mode', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        localIdentityEnabled: false,
        serverTestIdentityEnabled: false,
        wechatMiniappEnabled: false,
      }),
    }),
  );
  await page.route('**/api/v1/authentication/session', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ...identity,
        mustChangePassword: false,
        expiresAt: '2099-01-01T00:00:00.000Z',
        csrfToken: 'synthetic-csrf',
      }),
    }),
  );
  await page.route('**/api/v1/workspace/identity', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(identity),
    }),
  );
  await page.route('**/api/v1/event-materials', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/v1/hosting-applications', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/v1/events', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
});

test.beforeEach(async ({ page }) => {
  const session = {
    id: 'synthetic-chat',
    summary: '',
    turns: [],
    createdAt: '2026-09-25T00:00:00Z',
    updatedAt: '2026-09-25T00:00:00Z',
  };
  await page.route('**/api/v1/agent/sessions', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        route.request().method() === 'POST' ? session : [session],
      ),
    }),
  );
  await page.route('**/api/v1/agent/sessions/synthetic-chat', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(session),
    }),
  );
  const memories: Array<{
    id: string;
    content: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
  }> = [];
  await page.route('**/api/v1/agent/memories**', async (route) => {
    const request = route.request();
    if (request.url().endsWith('/delete')) {
      const id = request.url().split('/').at(-2)!;
      const index = memories.findIndex((item) => item.id === id);
      if (index >= 0) memories.splice(index, 1);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ id, status: 'DELETED' }),
      });
    } else if (request.method() === 'POST') {
      const now = '2026-09-25T00:00:00Z';
      const created = {
        id: '00000000-0000-4000-8000-000000000010',
        content: request.postDataJSON().content,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
      memories.push(created);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
    } else {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(memories),
      });
    }
  });
});

test('assistant settings save and remove a confirmed personal memory', async ({
  page,
}) => {
  await page.goto('/hosting-applications');
  await page.getByRole('button', { name: '打开 CAAU 智能助手' }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('新增长期记忆').fill('回答请先给简短结论');
  await page.getByRole('button', { name: '保存记忆' }).click();
  await expect(
    page.getByRole('button', { name: '删除记忆：回答请先给简短结论' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: '删除记忆：回答请先给简短结论' })
    .click();
  await expect(page.getByText('还没有保存长期记忆。')).toBeVisible();
});

test('floating assistant expands, preserves drafts and keeps shortcuts manual', async ({
  page,
}, testInfo) => {
  let sent = 0;
  page.on('request', (request) => {
    if (request.url().includes('/messages')) sent++;
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/hosting-applications');
  await page.getByRole('button', { name: '打开 CAAU 智能助手' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    page.getByRole('heading', { name: '你好，有什么可以帮你？' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '发送消息' })).toBeDisabled();
  await page
    .getByRole('button', { name: '你能帮我做些什么？', exact: true })
    .click();
  await expect(page.getByLabel('对话消息')).toHaveValue('你能帮我做些什么？');
  await expect(page.getByLabel('对话消息')).toBeEnabled();
  await expect(page.getByRole('button', { name: '发送消息' })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(sent).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('assistant-desktop.png') });
  const compact = await dialog.boundingBox();
  expect(compact!.width).toBeLessThanOrEqual(460);
  await page.getByRole('button', { name: '放大窗口' }).click();
  await expect
    .poll(async () => (await dialog.boundingBox())!.width)
    .toBeGreaterThan(800);
  await page.getByRole('button', { name: '还原窗口' }).click();
  await page.getByRole('button', { name: '关闭智能助手' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: '打开 CAAU 智能助手' }).click();
  await expect(page.getByLabel('对话消息')).toHaveValue('你能帮我做些什么？');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByLabel('切换对话赛事')).toBeVisible();
});

test('mobile assistant fits the viewport with a reachable composer', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/hosting-applications');
  await page.getByRole('button', { name: '打开 CAAU 智能助手' }).click();
  await expect(
    page.getByRole('heading', { name: '你好，有什么可以帮你？' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '放大窗口' }),
  ).not.toBeVisible();
  const send = page.getByRole('button', { name: '发送消息' });
  await expect(send).toBeVisible();
  const box = await send.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(812);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('assistant-mobile.png') });
});
