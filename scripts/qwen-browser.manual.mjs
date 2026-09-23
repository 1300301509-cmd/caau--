// Explicit, non-CI acceptance. Run only with the isolated test database and server-side Qwen env files.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { chromium, expect } from '@playwright/test';
import { createApplication } from '../apps/api/dist/application.js';
import { readConfig } from '../apps/api/dist/config.js';
import {
  assertLocalDatabaseUrls,
  requireDocker,
  root,
  run,
} from './database.mjs';

const apiPort = 3100;
const webPort = 4173;
const origin = `http://127.0.0.1:${apiPort}`;
const eventDate = '2027-06-05'; // Saturday in Beijing; next day is Sunday.
const targetTime = '2027-06-06T02:30:00.000Z'; // Sunday 10:30 Beijing.

let stage = 'initialization';
async function main() {
  assert.equal(process.env.CAAU_DATABASE_INTEGRATION, 'test');
  assertLocalDatabaseUrls(process.env, 'test');
  assert.ok(
    process.env.CAAU_QWEN_API_KEY?.trim(),
    'Server-side Qwen configuration is required',
  );
  await requireDocker();
  const owner = new pg.Client({
    connectionString: process.env.MIGRATION_DATABASE_URL,
  });
  await owner.connect();
  const name = `caau_qwen_${randomUUID().replaceAll('-', '')}`;
  const ownerUrl = new URL(process.env.MIGRATION_DATABASE_URL);
  ownerUrl.pathname = `/${name}`;
  const appUrl = new URL(process.env.DATABASE_URL);
  appUrl.pathname = `/${name}`;
  let created = false;
  let sql;
  let app;
  let web;
  let browser;
  try {
    await owner.query(`CREATE DATABASE "${name}"`);
    created = true;
    const migrationEnv = {
      ...process.env,
      MIGRATION_DATABASE_URL: ownerUrl.href,
    };
    delete migrationEnv.CAAU_QWEN_API_KEY;
    await run('corepack', ['pnpm', 'exec', 'prisma', 'migrate', 'deploy'], {
      cwd: path.join(root, 'database'),
      env: migrationEnv,
    });
    sql = new pg.Client({ connectionString: ownerUrl.href });
    await sql.connect();
    await sql.query(`REVOKE CONNECT ON DATABASE "${name}" FROM PUBLIC`);
    await sql.query(`GRANT CONNECT ON DATABASE "${name}" TO caau_test_app`);
    await sql.query('GRANT USAGE ON SCHEMA public TO caau_test_app');
    const config = {
      ...readConfig({
        ...process.env,
        CAAU_IDENTITY_MODE: 'local',
        PORT: String(apiPort),
      }),
      databaseUrl: appUrl.href,
    };
    app = await createApplication(config); // No model mock: module reads the real process-level Qwen configuration.
    await app.listen(apiPort, '127.0.0.1');
    web = createServer(async (request, response) => {
      try {
        const pathname = new URL(request.url, `http://127.0.0.1:${webPort}`)
          .pathname;
        const asset = /^\/assets\/[a-zA-Z0-9_.-]+\.(js|css|jpg|png|svg)$/.test(
          pathname,
        );
        const file = new URL(
          '../apps/admin/dist/' + (asset ? pathname.slice(1) : 'index.html'),
          import.meta.url,
        );
        const data = await readFile(file);
        response.writeHead(200, {
          'Content-Type': pathname.endsWith('.js')
            ? 'text/javascript'
            : pathname.endsWith('.css')
              ? 'text/css'
              : 'text/html',
        });
        response.end(data);
      } catch {
        response.writeHead(404);
        response.end();
      }
    });
    await new Promise((resolve, reject) => {
      web.once('error', reject);
      web.listen(webPort, '127.0.0.1', resolve);
    });
    async function api(token, method, route, body) {
      const response = await fetch(`${origin}/api/v1/${route}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      assert.equal(
        response.status,
        200,
        `${method} ${route}: HTTP ${response.status}`,
      );
      return response.json();
    }
    const identity = await api(null, 'POST', 'local-test-identities/sessions', {
      identity: 'super-admin',
    });
    const token = identity.token;
    const model = await api(token, 'GET', 'agent/model-status');
    assert.equal(model.mode, 'QWEN');
    assert.equal(model.credentialsConfigured, true);
    console.log(
      'Model mode:',
      model.mode,
      'model:',
      model.modelName,
      'host:',
      model.baseUrlHost,
    );
    const event = await api(token, 'POST', 'events', {
      name: 'CAAU-049 Qwen isolated acceptance',
      description: 'Temporary synthetic event',
    });
    for (let index = 1; index <= 4; index++) {
      await api(token, 'POST', 'teams', {
        id: randomUUID(),
        organizationId: (
          await sql.query('SELECT id FROM "Organization" WHERE name=$1', [
            'CAAU 总部（本地测试）',
          ])
        ).rows[0]?.id,
        eventId: event.id,
        profile: {
          name: `Synthetic Qwen team ${index}`,
          contactName: `Synthetic contact ${index}`,
          contactPhone: `1380000000${index}`,
          province: '广东省',
          city: '广州市',
          district: '',
          address: '',
          shortName: '',
          clubName: '',
          introduction: '',
          notes: '',
        },
      });
    }
    const teams = await api(token, 'GET', `events/${event.id}/teams`);
    const generated = await api(
      token,
      'POST',
      `events/${event.id}/schedule/generate`,
      {
        commandId: randomUUID(),
        format: 'ROUND_ROBIN',
        config: {
          teamIds: teams.map((team) => team.id),
          venues: ['一号场', '二号场'],
          startDate: eventDate,
          endDate: '2027-06-06',
          dailyStart: '09:00',
          dailyEnd: '18:00',
          durationMinutes: 40,
          bufferMinutes: 10,
          minRestMinutes: 60,
        },
      },
    );
    assert.equal(generated.status, 'DRAFT');
    const source = generated.matches
      .filter(
        (match) =>
          match.startAt &&
          new Date(match.startAt).toLocaleDateString('en-CA', {
            timeZone: 'Asia/Shanghai',
          }) === eventDate,
      )
      .sort(
        (a, b) =>
          Date.parse(a.startAt) - Date.parse(b.startAt) || a.order - b.order,
      )[1];
    assert.ok(source, 'Saturday second match must exist');
    const baseline = JSON.stringify(generated.matches);
    browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await page.goto(
      `http://127.0.0.1:${webPort}/competition?module=schedule&event=${event.id}`,
    );
    await expect(page.locator('.schedule-week')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator('.schedule-agent-model-status')).toContainText(
      'QWEN',
    );
    await expect(page.locator('.schedule-agent-model-status')).toContainText(
      '已配置',
    );
    await page.getByRole('button', { name: '测试模型连接' }).click();
    await expect(page.locator('.schedule-agent-model-status')).toContainText(
      '连接测试成功',
      { timeout: 30000 },
    );
    assert.equal(
      (await api(token, 'GET', 'agent/model-status')).lastConnectionTest.status,
      'SUCCEEDED',
    );
    console.log('Web QWEN status and real connection test succeeded');
    async function send(text) {
      await page.getByLabel('调整要求').fill(text);
      const [response] = await Promise.all([
        page.waitForResponse(
          (item) =>
            item.url().endsWith('/messages') &&
            item.request().method() === 'POST',
          { timeout: 45000 },
        ),
        page.getByRole('button', { name: '生成调整预览' }).click(),
      ]);
      console.log('Qwen message HTTP status:', response.status());
      assert.equal(
        response.status(),
        200,
        `Qwen message HTTP ${response.status()}`,
      );
      await expect(page.getByLabel('调整要求')).toHaveValue('', {
        timeout: 15000,
      });
    }
    stage = 'Qwen turn 1';
    await send('把周六第二场移到周日，场地保持不变');
    const afterFirst = (await api(token, 'GET', 'agent/sessions')).find(
      (item) => item.currentEventId === event.id,
    );
    stage = 'turn 1 task assertion';
    assert.equal(afterFirst?.task?.step, 'WAITING_PARAMETERS');
    assert.equal(afterFirst.task.parameters.sourceWeekday, 6);
    assert.equal(afterFirst.task.parameters.sourceOrdinal, 2);
    assert.equal(afterFirst.task.parameters.targetWeekday, 7);
    console.log('Turn 1: waiting for clock');
    stage = 'Qwen turn 2';
    await send('上午十点');
    await expect(page.locator('.schedule-agent-preview')).toBeVisible({
      timeout: 30000,
    });
    const afterSecond = (await api(token, 'GET', 'agent/sessions')).find(
      (item) => item.currentEventId === event.id,
    );
    assert.equal(
      afterSecond?.task?.preview?.after?.startAt,
      '2027-06-06T02:00:00.000Z',
    );
    stage = 'Qwen turn 3';
    await send('再晚半小时');
    await expect(page.locator('.schedule-agent-preview')).toBeVisible({
      timeout: 30000,
    });
    stage = 'preview assertion';
    const sessions = await api(token, 'GET', 'agent/sessions');

    const active = sessions.find(
      (item) =>
        item.currentEventId === event.id &&
        item.task?.confirmation?.state === 'PENDING',
    );
    assert.ok(active, 'Pending confirmation ticket after three Qwen turns');
    const preview = active.task.preview;
    assert.equal(preview.before.id, source.id);
    assert.equal(preview.after.startAt, targetTime);
    assert.equal(preview.after.venue, source.venue);
    assert.equal(preview.before.venue, source.venue);
    await expect(page.locator('.schedule-agent-preview')).toContainText(
      '此操作尚未保存',
    );
    await expect(
      page.locator('.schedule-agent-diff > div').last(),
    ).toContainText('2027-06-06 10:30');
    await expect(
      page.locator('.schedule-agent-diff > div').last(),
    ).toContainText(source.venue);
    const unchanged = await api(token, 'GET', `events/${event.id}/schedule`);
    assert.equal(unchanged.revision, generated.revision);
    assert.equal(JSON.stringify(unchanged.matches), baseline);
    assert.equal(
      (
        await sql.query(
          'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
          [event.id],
        )
      ).rows[0].n,
      1,
    );
    stage = 'Web confirmation';
    await page.getByRole('button', { name: '确认保存草稿' }).click();
    await expect(page.locator('.schedule-agent-result-details')).toContainText(
      '首次执行回执',
      { timeout: 20000 },
    );
    const saved = await api(token, 'GET', `events/${event.id}/schedule`);
    assert.equal(saved.revision, generated.revision + 1);
    assert.equal(saved.status, 'DRAFT');
    assert.equal(
      saved.matches.find((match) => match.id === source.id).startAt,
      targetTime,
    );
    assert.equal(
      saved.matches.find((match) => match.id === source.id).venue,
      source.venue,
    );
    assert.equal(
      (
        await sql.query(
          'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
          [event.id],
        )
      ).rows[0].n,
      2,
    );
    const afterSession = await api(token, 'GET', `agent/sessions/${active.id}`);
    const receipt = afterSession.lastExecution?.result;
    assert.ok(receipt?.commandId);
    assert.equal(receipt.matchId, source.id);
    assert.equal(receipt.revision, saved.revision);
    stage = 'Web refresh and retry';
    await page.reload();
    await expect(page.locator('.schedule-agent-result-details')).toContainText(
      receipt.commandId,
      { timeout: 15000 },
    );
    await expect(
      page.locator('.schedule-agent > .ant-alert').last(),
    ).toContainText(`该命令当时执行 · 草稿 V${receipt.revision}`);
    await expect(page.locator('.schedule-agent-result-details')).toContainText(
      '持久执行回执（恢复）',
    );
    await expect(page.locator('.schedule-agent-result-details')).toContainText(
      `赛程当前状态：DRAFT · V${saved.revision}`,
    );
    const ticket = active.task.confirmation;
    const retry = await api(
      token,
      'POST',
      `agent/confirmation-tickets/${ticket.id}/confirm`,
      {
        eventId: event.id,
        matchId: source.id,
        parameterHash: ticket.parameterHash,
      },
    );
    assert.equal(retry.commandId, receipt.commandId);
    assert.equal(retry.revision, saved.revision);
    assert.equal(retry.replayed, true);
    assert.equal(
      (await api(token, 'GET', `events/${event.id}/schedule`)).revision,
      saved.revision,
    );
    assert.equal(
      (
        await sql.query(
          'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1',
          [event.id],
        )
      ).rows[0].n,
      2,
    );
    assert.equal(
      (
        await sql.query(
          'SELECT count(*)::int n FROM "AgentCommandReceipt" WHERE "eventId"=$1',
          [event.id],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await sql.query(
          'SELECT count(*)::int n FROM "EventScheduleVersion" WHERE "eventId"=$1 AND status=$2',
          [event.id, 'PUBLISHED'],
        )
      ).rows[0].n,
      0,
    );
    console.log(
      'PASS: real Qwen three-turn Web preview, single DRAFT write, refresh and persisted retry; temporary synthetic database only',
    );
    console.log(
      'Execution revision:',
      receipt.revision,
      'current revision:',
      saved.revision,
      'published versions: 0',
    );
  } finally {
    if (browser) await browser.close();
    if (web) await new Promise((resolve) => web.close(resolve));
    if (app) await app.close();
    if (sql) await sql.end();
    if (created) await owner.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await owner.end();
  }
}

main().catch(() => {
  console.error(
    `Qwen Web acceptance failed at ${stage}; exception/provider details suppressed. No success claimed.`,
  );
  process.exitCode = 1;
});
