import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { expect } from '@playwright/test';
export async function workflowBrowserFlows({ browser, tokens, sql }) {
  const manager = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'reduce',
    }),
    reviewer = await browser.newPage(),
    organizer = await browser.newPage({
      viewport: { width: 375, height: 812 },
      reducedMotion: 'reduce',
    });
  organizer.on('dialog', (d) => d.accept());
  const errors = [];
  for (const p of [manager, reviewer, organizer])
    p.on('pageerror', (e) => errors.push(e.message));
  const login = async (p, key) => {
    await p.goto('http://127.0.0.1:4173/workspace');
    await p.getByLabel('本地会话 JSON 文件').setInputFiles({
      name: 'synthetic-session.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ token: tokens[key] })),
    });
    await expect(p.getByText('本地身份已载入', { exact: true })).toBeVisible();
  };
  async function api(key, method, path, body) {
    const r = await fetch(
      `http://127.0.0.1:${process.env.CAAU_BROWSER_API_PORT ?? 3000}/api/v1/${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${tokens[key]}`,
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    assert.equal(r.status, 200);
    return r.json();
  }
  async function createTask(title, deadline = '2035-06-01T16:00') {
    await manager.getByLabel('任务名称', { exact: true }).fill(title);
    await manager
      .getByLabel('承办机构', { exact: true })
      .selectOption({ label: 'Synthetic organizer A' });
    await manager
      .getByLabel('经办人', { exact: true })
      .selectOption({ label: 'Synthetic a' });
    await manager
      .getByLabel('审核员', { exact: true })
      .selectOption({ label: 'Synthetic reviewer' });
    await manager
      .getByRole('button', { name: '创建任务草案', exact: true })
      .click();
    await expect(
      manager.getByText('任务草案已创建，请配置材料要求后发布', {
        exact: true,
      }),
    ).toBeVisible();
    for (let i = 5; i >= 2; i--)
      await manager
        .getByRole('button', { name: `移除材料 ${i}`, exact: true })
        .click();
    await manager.getByLabel('任务截止时间', { exact: true }).fill(deadline);
    const group = manager.getByRole('group', { name: '材料 1', exact: true });
    await group.getByLabel('模板版本', { exact: true }).fill('synthetic-v1');
    await group
      .getByLabel('支持格式（小写扩展名，逗号分隔）', { exact: true })
      .fill('docx');
    await group
      .getByLabel('文件大小上限（字节）', { exact: true })
      .fill('10485761');
    await group.getByLabel('材料截止时间', { exact: true }).fill(deadline);
    await group
      .getByLabel('填写说明', { exact: true })
      .fill('请填写时间、场馆、组别与负责人');
    await group
      .getByLabel('示例或合格标准', { exact: true })
      .fill('合成验收标准');
    await manager
      .getByRole('button', { name: '保存材料要求', exact: true })
      .click();
    assert.ok((await group.locator('input:invalid').count()) > 0);
    await group
      .getByLabel('支持格式（小写扩展名，逗号分隔）', { exact: true })
      .fill('txt,pdf');
    await group
      .getByLabel('文件大小上限（字节）', { exact: true })
      .fill('1048576');
    await manager
      .getByRole('button', { name: '保存材料要求', exact: true })
      .click();
    await expect(
      manager.getByText('材料要求已保存，核对后可发布', { exact: true }),
    ).toBeVisible();
    const confirmed = manager.waitForResponse(
      (r) =>
        r.url().includes('/templates/') &&
        r.url().endsWith('/confirm') &&
        r.status() === 200,
    );
    await manager
      .getByLabel('上传模板 · 办赛基础信息确认表', { exact: true })
      .setInputFiles({
        name: '总部办赛模板.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('synthetic template browser bytes'),
      });
    await confirmed;
    await expect(
      manager.getByText('总部办赛模板.txt', { exact: true }),
    ).toBeVisible();
    await manager
      .getByRole('button', { name: '发布任务', exact: true })
      .click();
    await manager
      .getByRole('button', { name: '确认发布', exact: true })
      .click();
    await expect(
      manager.getByText('任务已发布，要求 V1 已固定', { exact: true }),
    ).toBeVisible();
    return (
      await sql.query('SELECT id FROM "MaterialTask" WHERE title=$1', [title])
    ).rows[0].id;
  }
  async function open(p, title) {
    await p.getByRole('button', { name: '刷新数据', exact: true }).click();
    await expect(
      p.getByText('已刷新当前权限与数据', { exact: true }),
    ).toBeVisible();
    await p
      .getByLabel('当前赛事', { exact: true })
      .selectOption({ label: 'UI workflow event' });
    await p.getByRole('button', { name: `查看 ${title}`, exact: true }).click();
  }
  const input = () =>
    organizer.getByLabel('材料填写 · 办赛基础信息确认表', { exact: true });
  async function save() {
    await organizer
      .getByRole('button', { name: '保存草稿', exact: true })
      .click();
    await expect(
      organizer.getByText('草稿已保存', { exact: true }),
    ).toBeVisible();
  }
  async function submit(button = '正式提交') {
    await organizer.getByRole('button', { name: button, exact: true }).click();
    await organizer
      .getByRole('button', { name: '确认提交', exact: true })
      .click();
  }
  async function pass(title) {
    await open(reviewer, title);
    await reviewer
      .getByRole('button', { name: '整包通过', exact: true })
      .click();
    await reviewer
      .getByRole('button', { name: '确认执行', exact: true })
      .click();
    await expect(
      reviewer.getByText('操作已完成，历史已保留', { exact: true }),
    ).toBeVisible();
    await expect(
      reviewer
        .getByRole('region', { name: '总部材料执行', exact: true })
        .getByText(/当前状态：已通过/),
    ).toBeVisible();
  }
  try {
    await mkdir('.local/evidence/caau-005-phase3', { recursive: true });
    await login(manager, 'manager');
    await manager
      .getByLabel('赛事名称', { exact: true })
      .fill('UI workflow event');
    await manager
      .getByLabel('赛事说明', { exact: true })
      .fill('Synthetic browser workflow');
    await manager
      .getByRole('button', { name: '创建赛事', exact: true })
      .click();
    await expect(
      manager.getByText('赛事已创建，可以指派材料任务', { exact: true }),
    ).toBeVisible();
    const one = await createTask('UI direct approval');
    await login(organizer, 'a');
    await open(organizer, 'UI direct approval');
    await expect(organizer.getByText(/模板：总部办赛模板\.txt/)).toBeVisible();
    const templateDownload = organizer.waitForEvent('download');
    await organizer
      .getByRole('button', { name: '下载模板', exact: true })
      .click();
    assert.equal(
      (await templateDownload).suggestedFilename(),
      '总部办赛模板.txt',
    );
    await submit();
    await expect(
      organizer.getByText('必交材料：请填写内容或上传并确认附件。', {
        exact: true,
      }),
    ).toBeVisible();
    await input().fill('2035年 · 合成场馆 · 公开组 · 合成负责人');
    await organizer
      .getByLabel('上传附件 · 办赛基础信息确认表', { exact: true })
      .setInputFiles({
        name: 'material.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('synthetic valid private file'),
      });
    await expect(
      organizer.getByText('附件已确认，尚需保存草稿。', { exact: true }),
    ).toBeVisible();
    await save();
    await submit();
    await expect(
      organizer.getByText('提交成功 · V1', { exact: true }),
    ).toBeVisible();
    await login(reviewer, 'reviewer');
    await pass('UI direct approval');
    const download = reviewer.waitForEvent('download');
    await reviewer
      .getByRole('button', { name: '下载 V1 附件 1', exact: true })
      .click();
    await download;
    await reviewer.screenshot({
      path: '.local/evidence/caau-005-phase3/review-approved.png',
      fullPage: true,
    });
    assert.equal(
      (await api('a', 'GET', `material-tasks/${one}/submissions`)).length,
      1,
    );
    const two = await createTask('UI returned revision');
    await open(organizer, 'UI returned revision');
    await input().fill('我的输入必须保留');
    const current = await api('a', 'GET', `material-tasks/${two}/draft`),
      task = await api('a', 'GET', `material-tasks/${two}`);
    await api('a', 'PATCH', `material-tasks/${two}/draft`, {
      expectedRevision: current.revision,
      entries: [
        {
          materialId: task.requirements.materials[0].id,
          text: '另一个窗口已保存的内容',
          fileIds: [],
        },
      ],
    });
    await organizer
      .getByRole('button', { name: '保存草稿', exact: true })
      .click();
    await expect(
      organizer.getByText('草稿冲突：当前输入已保留，请核对最新版本。', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(input()).toHaveValue('我的输入必须保留');
    await organizer.screenshot({
      path: '.local/evidence/caau-005-phase3/draft-conflict-mobile.png',
      fullPage: true,
    });
    await organizer
      .getByRole('button', {
        name: '已核对，保留我的输入以最新修订继续保存',
        exact: true,
      })
      .click();
    await save();
    await organizer
      .getByLabel('上传附件 · 办赛基础信息确认表', { exact: true })
      .setInputFiles({
        name: 'broken.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('not a pdf'),
      });
    await expect(organizer.getByText(/上传失败：未加入草稿/)).toBeVisible();
    await expect(
      organizer.getByRole('button', { name: '正式提交', exact: true }),
    ).toBeDisabled();
    await organizer
      .getByRole('button', { name: '移除失败项', exact: true })
      .click();
    let dropped = false;
    await organizer.route(
      `**/api/v1/material-tasks/${two}/submissions`,
      async (route) => {
        if (route.request().method() === 'POST' && !dropped) {
          dropped = true;
          await route.fetch();
          await route.abort();
        } else await route.continue();
      },
    );
    await submit();
    await expect(
      organizer.getByRole('button', { name: '核实/重试提交', exact: true }),
    ).toBeVisible();
    await submit('核实/重试提交');
    await expect(
      organizer.getByText('提交成功 · V1', { exact: true }),
    ).toBeVisible();
    await organizer.unrouteAll();
    await open(reviewer, 'UI returned revision');
    await reviewer
      .getByRole('button', { name: '整包退回', exact: true })
      .click();
    const dialog = reviewer.getByRole('dialog');
    await dialog
      .getByRole('checkbox', { name: '办赛基础信息确认表', exact: true })
      .check();
    await dialog
      .getByLabel('退回原因 · 办赛基础信息确认表', { exact: true })
      .fill('场馆信息不完整');
    await dialog
      .getByLabel('修改要求 · 办赛基础信息确认表', { exact: true })
      .fill('补充场馆地址和联系人');
    await dialog.screenshot({
      path: '.local/evidence/caau-005-phase3/review-return-dialog.png',
    });
    await dialog.getByRole('button', { name: '确认执行', exact: true }).click();
    await expect(
      reviewer.getByText('操作已完成，历史已保留', { exact: true }),
    ).toBeVisible();
    await organizer
      .getByRole('button', { name: '核对最新状态（保留输入）', exact: true })
      .click();
    await expect(
      organizer.getByText('退回原因：场馆信息不完整', { exact: true }),
    ).toBeVisible();
    await input().fill('已补充合成场馆地址与联系人');
    await save();
    await submit();
    await expect(
      organizer.getByText('提交成功 · V2', { exact: true }),
    ).toBeVisible();
    await pass('UI returned revision');
    const versions = await api('a', 'GET', `material-tasks/${two}/submissions`);
    assert.equal(versions.length, 2);
    assert.equal(versions[0].review.decision, 'RETURN');
    assert.equal(versions[1].review.decision, 'PASS');
    await organizer
      .getByRole('button', { name: '核对最新状态（保留输入）', exact: true })
      .click();
    await expect(
      organizer.getByRole('button', { name: '保存草稿', exact: true }),
    ).toBeDisabled();
    await organizer.screenshot({
      path: '.local/evidence/caau-005-phase3/organizer-history-mobile.png',
      fullPage: true,
    });
    const late = await createTask('UI overdue handover', '2000-01-01T12:00');
    await open(organizer, 'UI overdue handover');
    await input().fill('逾期仍可保存的草稿');
    await save();
    await expect(
      organizer.getByText('已逾期：仍可保存草稿，正式提交需要总部延期。', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      organizer.getByRole('button', { name: '正式提交', exact: true }),
    ).toBeDisabled();
    await manager.getByRole('button', { name: '延期', exact: true }).click();
    await manager.getByLabel('操作原因', { exact: true }).fill('合成延期原因');
    await manager
      .getByLabel('新截止时间', { exact: true })
      .fill('2036-01-01T12:00');
    await manager
      .getByRole('button', { name: '确认执行', exact: true })
      .click();
    await expect(
      manager.getByText('操作已完成，历史已保留', { exact: true }),
    ).toBeVisible();
    await manager
      .getByRole('button', { name: '同机构交接', exact: true })
      .click();
    await manager
      .getByLabel('新经办人', { exact: true })
      .selectOption({ label: 'Synthetic a2' });
    await manager
      .getByRole('button', { name: '确认执行', exact: true })
      .click();
    await expect(
      manager.getByText('操作已完成，历史已保留', { exact: true }),
    ).toBeVisible();
    await organizer
      .getByRole('button', { name: '核对最新状态（保留输入）', exact: true })
      .click();
    await expect(
      organizer.getByText('权限已变更，可能已交接或停用；请返回任务列表。', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      organizer.getByRole('button', { name: '保存草稿', exact: true }),
    ).toBeDisabled();
    await login(organizer, 'a2');
    await open(organizer, 'UI overdue handover');
    await expect(input()).toHaveValue('逾期仍可保存的草稿');
    await expect(
      organizer.getByRole('button', { name: '正式提交', exact: true }),
    ).toBeEnabled();
    await manager
      .getByRole('button', { name: '关闭任务', exact: true })
      .click();
    await manager.getByLabel('操作原因', { exact: true }).fill('合成关闭原因');
    await manager
      .getByRole('button', { name: '确认执行', exact: true })
      .click();
    await expect(
      manager
        .getByRole('region', { name: '总部材料执行', exact: true })
        .getByText(/当前状态：已关闭/),
    ).toBeVisible();
    assert.equal(
      (await api('a2', 'GET', `material-tasks/${late}/execution`)).state,
      'CLOSED',
    );
    assert.ok(
      await organizer.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
  } catch (error) {
    await manager.screenshot({
      path: '.local/evidence/caau-005-phase3/failure-manager.png',
      fullPage: true,
    });
    throw error;
  } finally {
    await Promise.all([manager.close(), reviewer.close(), organizer.close()]);
  }
}
