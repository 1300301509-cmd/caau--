import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { createApiClient } from '../packages/api-client/dist/index.js';
import { createFetchTransport } from '../packages/api-client/dist/fetch.js';
// Uses only the db:test-owned disposable database. SQL below bootstraps local
// test sessions, exactly like authorization.integration; all business writes use APIs/UI.
export async function webPolishBrowserFlows({ browser, tokens, sql }) {
  const sdk = createApiClient('http://127.0.0.1:3000', createFetchTransport()),
    out = '.local/evidence/caau-005-polish';
  await mkdir(out, { recursive: true });
  const people = Object.fromEntries(
    await Promise.all(
      ['manager', 'a', 'a2', 'b', 'reviewer'].map(async (k) => [
        k,
        await sdk.request('getWorkspaceIdentity', { token: tokens[k] }),
      ]),
    ),
  );
  async function session(key) {
    const token = randomBytes(32).toString('base64url');
    await sql.query(
      'INSERT INTO "Session" (id,"tokenHash","userId","expiresAt") VALUES ($1,$2,$3,$4)',
      [
        randomUUID(),
        createHash('sha256').update(token).digest('hex'),
        people[key].id,
        new Date(Date.now() + 3600000),
      ],
    );
    return token;
  }
  const h1 = await session('manager'),
    h2 = await session('manager'),
    a1 = await session('a'),
    a2 = await session('a'),
    a3 = await session('a'),
    a4 = await session('a');
  const call = (op, input = {}) =>
    sdk.request(op, { token: tokens.manager, ...input });
  const directory = await call('getWorkspaceDirectory'),
    member = (key) =>
      directory.members.find((m) => m.userId === people[key].id);
  const event = await call('createEvent', {
    body: {
      name: `Web polish ${randomUUID().slice(0, 8)}`,
      description: 'Synthetic isolated browser acceptance',
    },
  });
  async function task(title) {
    return call('createMaterialTask', {
      body: {
        eventId: event.id,
        title,
        organizationId: member('a').organizationId,
        handlerMemberId: member('a').id,
        reviewerMemberId: member('reviewer').id,
      },
    });
  }
  const original = await task('体验修复 · 五项材料闭环');
  const pages = [];
  const errors = [];
  async function page() {
    const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    pages.push(p);
    p.on('dialog', (d) => d.accept());
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto('http://127.0.0.1:4173/workspace');
    return p;
  }
  async function login(p, token) {
    await p.getByLabel('本地会话 JSON 文件').setInputFiles({
      name: 'synthetic-session.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ token })),
    });
    await expect(p.getByText('本地身份已载入', { exact: true })).toBeVisible();
  }
  async function open(p, t, action = '查看') {
    await p.getByLabel('当前赛事', { exact: true }).selectOption(event.id);
    await p
      .getByRole('button', { name: `${action} ${t.title}`, exact: true })
      .first()
      .click();
  }
  const panel = (p) =>
    p.getByRole('region', { name: '承办材料办理', exact: true });
  const save = async (p) => {
    await panel(p)
      .getByRole('button', { name: '保存草稿', exact: true })
      .click();
    await expect(
      panel(p).getByText('草稿已保存', { exact: true }),
    ).toBeVisible();
  };
  const reload = async (p) => {
    await panel(p)
      .getByRole('button', { name: '核对最新状态（保留输入）', exact: true })
      .click();
    await expect(
      panel(p).getByRole('button', {
        name: '核对最新状态（保留输入）',
        exact: true,
      }),
    ).toBeEnabled();
  };
  const draft = (t = original) =>
    call('getMaterialDraft', { token: tokens.a, path: { id: t.id } });
  const history = () =>
    call('listSubmissionVersions', {
      token: tokens.reviewer,
      path: { id: original.id },
    });
  try {
    const manager = await page();
    await login(manager, h1);
    await open(manager, original);
    await manager
      .getByLabel('通用模板版本', { exact: true })
      .fill('explicit-test-v1');
    await manager.getByLabel('通用格式', { exact: true }).fill('txt');
    await manager
      .getByLabel('通用大小上限（字节）', { exact: true })
      .fill('1048576');
    await manager
      .getByLabel('通用截止时间', { exact: true })
      .fill('2099-01-01T10:00');
    await manager
      .getByRole('button', { name: '核对并批量应用', exact: true })
      .click();
    await expect(
      manager
        .getByRole('group', { name: '材料 1', exact: true })
        .getByLabel('模板版本', { exact: true }),
    ).toHaveValue('');
    await manager
      .getByRole('button', { name: '确认应用到草案', exact: true })
      .click();
    for (let i = 1; i <= 5; i++) {
      const g = manager.getByRole('group', { name: `材料 ${i}`, exact: true });
      await expect(g.getByLabel('模板版本', { exact: true })).toHaveValue(
        'explicit-test-v1',
      );
      await g.getByLabel('填写说明', { exact: true }).fill(`合成说明 ${i}`);
      await g
        .getByLabel('示例或合格标准', { exact: true })
        .fill(`合成标准 ${i}`);
    }
    await call('logout', { token: h1 });
    await manager
      .getByRole('button', { name: '保存材料要求', exact: true })
      .click();
    await expect(
      manager.getByText('会话已失效，请重新导入本地会话。', { exact: true }),
    ).toBeVisible();
    await login(manager, h2);
    await expect(
      manager
        .getByRole('group', { name: '材料 1', exact: true })
        .getByLabel('填写说明', { exact: true }),
    ).toHaveValue('合成说明 1');
    assert.equal(
      (await call('getMaterialTask', { path: { id: original.id } }))
        .requirements,
      null,
    );
    await manager
      .getByRole('button', {
        name: '已核对，保留输入采用最新修订',
        exact: true,
      })
      .click();
    await manager
      .getByRole('button', { name: '保存材料要求', exact: true })
      .click();
    await expect(
      manager.getByText('材料要求已保存，核对后可发布', { exact: true }),
    ).toBeVisible();
    await manager.screenshot({
      path: `${out}/01-batch-confirmed.png`,
      fullPage: true,
    });
    await manager
      .getByRole('button', { name: '发布任务', exact: true })
      .click();
    await manager
      .getByRole('button', { name: '确认发布', exact: true })
      .click();
    await expect(
      manager.getByText('任务已发布，要求 V1 已固定', { exact: true }),
    ).toBeVisible();
    const published = await call('getMaterialTask', {
        path: { id: original.id },
      }),
      requirements = published.requirements;
    const a = await page();
    await login(a, a1);
    await open(a, original, '办理');
    const first = requirements.materials[0].title;
    const input = (p, title = first) =>
      panel(p).getByLabel(`材料填写 · ${title}`, { exact: true });
    async function upload(p, title, name, bytes) {
      const confirmed = p.waitForResponse(
        (r) =>
          r.url().endsWith('/confirm') &&
          r.request().method() === 'POST' &&
          r.status() === 200,
      );
      await panel(p)
        .getByLabel(`上传附件 · ${title}`, { exact: true })
        .setInputFiles({ name, mimeType: 'text/plain', buffer: bytes });
      await confirmed;
      await expect(
        panel(p)
          .getByRole('group', { name: `${title} · 必交`, exact: true })
          .getByRole('button', { name: '移除附件 1', exact: true }),
      ).toBeEnabled();
    }
    assert.ok(
      await panel(a).evaluate(
        (el) =>
          el.compareDocumentPosition(
            globalThis.document.getElementById('task-detail'),
          ) & globalThis.Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    );
    await input(a).fill('跨身份不应显示的未保存输入');
    await upload(
      a,
      first,
      '仅 A 可见.txt',
      Buffer.from('synthetic unbound file'),
    );
    await login(a, tokens.b);
    assert.equal(await panel(a).count(), 0);
    assert.equal(await a.locator('textarea').count(), 0);
    assert.equal(
      await a
        .getByLabel('当前赛事', { exact: true })
        .getByRole('option', { name: event.name, exact: true })
        .count(),
      0,
    );
    await login(a, a1);
    await open(a, original, '办理');
    await expect(input(a)).toHaveValue('');
    for (let i = 0; i < 5; i++) {
      const title = requirements.materials[i].title;
      await input(a, title).fill(`V1 合成内容 ${i + 1}`);
      await upload(
        a,
        title,
        i ? '材料-' + (i + 1) + '.txt' : '办赛基础信息-V1.txt',
        Buffer.from(`synthetic material ${i + 1}`),
      );
    }
    await call('logout', { token: a1 });
    await panel(a)
      .getByRole('button', { name: '保存草稿', exact: true })
      .click();
    await expect(
      panel(a).getByRole('button', {
        name: '重新认证（保留输入）',
        exact: true,
      }),
    ).toBeVisible();
    await login(a, a2);
    await expect(
      panel(a).getByText(
        '身份已恢复，已重新核对权限与版本；输入保留，不会自动提交。',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(input(a)).toHaveValue('V1 合成内容 1');
    assert.equal((await draft()).entries.length, 0);
    await save(a);
    async function submit(p) {
      await panel(p)
        .getByRole('button', { name: '正式提交', exact: true })
        .click();
      await p.getByRole('button', { name: '确认提交', exact: true }).click();
      await expect(panel(p).getByText(/提交成功 · V\d/)).toBeVisible();
    }
    await submit(a);
    const v1 = (await history())[0];
    assert.equal(v1.actorId, people.a.id);
    assert.equal(v1.actorName, people.a.displayName);
    const reviewer = await page();
    await login(reviewer, tokens.reviewer);
    await open(reviewer, original, '审核');
    await reviewer
      .getByRole('button', { name: '整包退回', exact: true })
      .click();
    const dialog = reviewer.getByRole('dialog');
    await dialog.getByRole('checkbox', { name: first, exact: true }).check();
    await dialog
      .getByLabel(`退回原因 · ${first}`, { exact: true })
      .fill('合成地址不完整');
    await dialog
      .getByLabel(`修改要求 · ${first}`, { exact: true })
      .fill('补充合成详细地址');
    await dialog.getByRole('button', { name: '确认执行', exact: true }).click();
    await expect(
      reviewer.getByText('操作已完成，历史已保留', { exact: true }),
    ).toBeVisible();
    await reload(a);
    await expect(input(a)).toBeEnabled();
    await input(a).fill('V2 合成内容：补齐虚构详细地址');
    await panel(a)
      .getByRole('group', { name: `${first} · 必交`, exact: true })
      .getByRole('button', { name: '移除附件 1', exact: true })
      .click();
    const v2bytes = Buffer.from('synthetic corrected V2 bytes');
    await upload(a, first, '办赛基础信息-V2.txt', v2bytes);
    const sibling = await page();
    await login(sibling, a2);
    await open(sibling, original, '办理');
    await input(sibling, requirements.materials[1].title).fill(
      '另一窗口的合成修改',
    );
    await save(sibling);
    await sibling.close();
    await call('logout', { token: a2 });
    await panel(a)
      .getByRole('button', { name: '保存草稿', exact: true })
      .click();
    await expect(
      panel(a).getByRole('button', {
        name: '重新认证（保留输入）',
        exact: true,
      }),
    ).toBeVisible();
    await login(a, a3);
    await expect(
      panel(a).getByText(
        '身份已恢复；输入已保留，服务器草稿有变化，请先核对。',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(input(a)).toHaveValue('V2 合成内容：补齐虚构详细地址');
    assert.equal((await history()).length, 1);
    await expect(
      panel(a).locator('pre').filter({ hasText: '另一窗口的合成修改' }),
    ).toBeVisible();
    await a.screenshot({
      path: `${out}/02-session-conflict.png`,
      fullPage: true,
    });
    await panel(a)
      .getByRole('button', {
        name: '已核对，保留我的输入以最新修订继续保存',
        exact: true,
      })
      .click();
    await save(a);
    await submit(a);
    await reviewer
      .getByRole('button', { name: '刷新办理进度', exact: true })
      .click();
    await expect(
      reviewer.getByRole('button', { name: '整包通过', exact: true }),
    ).toBeVisible();
    await reviewer
      .getByRole('button', { name: '整包通过', exact: true })
      .click();
    await reviewer
      .getByRole('button', { name: '确认执行', exact: true })
      .click();
    await expect(
      reviewer.getByText('操作已完成，历史已保留', { exact: true }),
    ).toBeVisible();
    await reload(a);
    await expect(
      panel(a).getByRole('button', { name: '保存草稿', exact: true }),
    ).toBeDisabled();
    const versions = await history();
    assert.equal(versions.length, 2);
    assert.equal(versions[0].review.decision, 'RETURN');
    assert.equal(versions[1].review.decision, 'PASS');
    for (const key of [
      'id',
      'actorId',
      'submittedAt',
      'entries',
      'deadlines',
      'requirementVersionId',
    ])
      assert.deepEqual(versions[0][key], v1[key]);
    assert.equal(versions[1].review.actorName, people.reviewer.displayName);
    assert.deepEqual(
      versions[1].entries.filter(
        (e) => e.materialId !== requirements.materials[0].id,
      ),
      versions[0].entries.filter(
        (e) => e.materialId !== requirements.materials[0].id,
      ),
    );
    const h = reviewer.getByRole('region', {
      name: '提交版本与审核历史',
      exact: true,
    });
    await expect(
      h.getByText(people.a.displayName, { exact: true }).first(),
    ).toBeVisible();
    await expect(
      h.getByText(`身份 ID：${people.a.id}`, { exact: true }).first(),
    ).toBeVisible();
    const download = reviewer.waitForEvent('download');
    const v2Download = h
      .locator('.requirement-read')
      .filter({
        has: reviewer.getByRole('heading', { name: first, exact: true }),
      })
      .getByRole('button', { name: '下载 V2 附件 1', exact: true });
    await v2Download.click();
    const file = await download;
    assert.equal(file.suggestedFilename(), '办赛基础信息-V2.txt');
    assert.deepEqual(await readFile(await file.path()), v2bytes);
    await reviewer.screenshot({
      path: `${out}/03-readable-approved-history.png`,
      fullPage: true,
    });
    await a.setViewportSize({ width: 390, height: 844 });
    await a.screenshot({
      path: `${out}/04-organizer-readonly-mobile.png`,
      fullPage: true,
    });
    assert.ok(
      await a.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
    );
    let releaseDownload, reachedDownload;
    const released = new Promise((r) => {
        releaseDownload = r;
      }),
      reached = new Promise((r) => {
        reachedDownload = r;
      });
    let lateDownloads = 0;
    reviewer.on('download', () => lateDownloads++);
    await reviewer.route('**/uploads/*/content', async (route) => {
      const response = await route.fetch();
      reachedDownload();
      await released;
      await route.fulfill({ response });
    });
    const delivered = reviewer.waitForResponse((r) =>
      r.url().endsWith('/content'),
    );
    await v2Download.click();
    await reached;
    await login(reviewer, tokens.b);
    releaseDownload();
    await (await delivered).finished();
    await reviewer.evaluate(
      () =>
        new Promise((resolve) =>
          globalThis.requestAnimationFrame(() =>
            globalThis.requestAnimationFrame(resolve),
          ),
        ),
    );
    assert.equal(lateDownloads, 0);
    assert.equal(
      await reviewer
        .getByRole('region', { name: '提交版本与审核历史', exact: true })
        .count(),
      0,
    );
    await reviewer.unroute('**/uploads/*/content');
    const reused = await task('体验修复 · 复用与撤权');
    await manager
      .getByRole('button', { name: '刷新数据', exact: true })
      .click();
    await open(manager, reused);
    await manager
      .getByLabel('复用已发布配置', { exact: true })
      .selectOption(original.id);
    await manager
      .getByRole('button', { name: '预览并确认复用', exact: true })
      .click();
    assert.equal(
      (await call('getMaterialTask', { path: { id: reused.id } })).requirements,
      null,
    );
    await manager
      .getByRole('button', { name: '确认应用到草案', exact: true })
      .click();
    await expect(
      manager.getByRole('button', { name: '发布任务', exact: true }),
    ).toBeDisabled();
    await manager
      .getByRole('button', { name: '保存材料要求', exact: true })
      .click();
    await expect(
      manager.getByText('材料要求已保存，核对后可发布', { exact: true }),
    ).toBeVisible();
    const copied = (await call('getMaterialTask', { path: { id: reused.id } }))
      .requirements;
    assert.deepEqual(
      copied.materials.map(({ id: _id, ...m }) => m),
      requirements.materials.map(({ id: _id, ...m }) => m),
    );
    assert.ok(
      copied.materials.every(
        (m) => !requirements.materials.some((old) => old.id === m.id),
      ),
    );
    assert.deepEqual(
      await call('getMaterialTask', { path: { id: original.id } }),
      published,
    );
    await manager
      .getByRole('button', { name: '发布任务', exact: true })
      .click();
    await manager
      .getByRole('button', { name: '确认发布', exact: true })
      .click();
    await expect(
      manager.getByText('任务已发布，要求 V1 已固定', { exact: true }),
    ).toBeVisible();
    await a.setViewportSize({ width: 1280, height: 900 });
    await a.getByRole('button', { name: '刷新数据', exact: true }).click();
    await open(a, reused, '办理');
    await input(a).fill('撤权后仅保留本地输入，不允许写入');
    const execution = await call('getTaskExecution', {
      path: { id: reused.id },
    });
    await call('handoverTaskHandler', {
      path: { id: reused.id },
      body: {
        handlerMemberId: member('a2').id,
        expectedRevision: execution.revision,
      },
    });
    await login(a, a4);
    await expect(
      panel(a).getByRole('button', { name: '保存草稿', exact: true }),
    ).toBeDisabled();
    await expect(input(a)).toHaveValue('撤权后仅保留本地输入，不允许写入');
    assert.equal(
      (
        await call('getMaterialDraft', {
          token: tokens.a2,
          path: { id: reused.id },
        })
      ).entries.length,
      0,
    );
    assert.deepEqual(errors, []);
    await writeFile(
      `${out}/browser-result.json`,
      JSON.stringify(
        {
          status: 'passed',
          batchAndReuseConfirmed: true,
          sourceSnapshotUnchanged: true,
          sessionRecovery: [
            'HQ unsaved configuration',
            'organizer five pending attachments',
            'new revision explicit confirmation',
            'different identity clears input',
            'handover revokes write access',
          ],
          versions: 2,
          v1: 'RETURN',
          v2: 'PASS',
          readableNamesAndStableIds: true,
          downloadName: file.suggestedFilename(),
          downloadBytesVerified: true,
          scope:
            'isolated PostgreSQL and real Chromium Web; no WeChat acceptance',
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (pages[0] && !pages[0].isClosed())
      await writeFile(
        `${out}/failure-dom.json`,
        JSON.stringify(
          {
            groups: await pages[0]
              .getByRole('group', { includeHidden: true })
              .allTextContents(),
            fieldsets: await pages[0].locator('fieldset').evaluateAll((els) =>
              els.map((el) => ({
                legend: el.querySelector('legend')?.textContent,
                hidden: el.closest('[aria-hidden="true"],[inert]')?.tagName,
              })),
            ),
            snapshot: await pages[0].locator('body').ariaSnapshot(),
          },
          null,
          2,
        ),
      );
    for (let i = 0; i < pages.length; i++)
      if (!pages[i].isClosed())
        await pages[i]
          .screenshot({ path: `${out}/failure-${i}.png`, fullPage: true })
          .catch(() => {});
    throw error;
  } finally {
    for (const p of pages) if (!p.isClosed()) await p.close();
  }
}
