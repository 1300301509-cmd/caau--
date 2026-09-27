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
import { createAgentModel } from '../apps/api/dist/modules/ai/model-adapter.js';
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
    const realModel = createAgentModel(process.env);
    const probeOrigin = Date.now();
    const config = {
      ...readConfig({
        ...process.env,
        CAAU_IDENTITY_MODE: 'local',
        PORT: String(apiPort),
      }),
      databaseUrl: appUrl.href,
      agentModel: realModel,
    };
    app = await createApplication(config); // Uses the real adapter's redacted per-phase diagnostics.
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
    if (process.env.CAAU_095_EXACT_ONLY === '1') {
      stage = 'CAAU-095 exact Monday instruction';
      const mondaySchedule = await api(
        token,
        'POST',
        `events/${event.id}/schedule/generate`,
        {
          commandId: randomUUID(),
          format: 'ROUND_ROBIN',
          config: {
            teamIds: teams.map((team) => team.id),
            venues: ['一号场', '二号场'],
            startDate: '2027-06-07',
            endDate: '2027-06-13',
            dailyStart: '09:00',
            dailyEnd: '18:00',
            durationMinutes: 40,
            bufferMinutes: 10,
            minRestMinutes: 60,
          },
        },
      );
      const mondaySource = mondaySchedule.matches
        .filter((match) => match.startAt.startsWith('2027-06-07'))
        .sort(
          (a, b) =>
            Date.parse(a.startAt) - Date.parse(b.startAt) || a.order - b.order,
        )[1];
      assert.ok(
        mondaySource,
        'Monday second match exists in the synthetic event',
      );
      const mondaySession = await api(token, 'POST', 'agent/sessions', {
        currentEventId: event.id,
      });
      const mondayPath = `agent/sessions/${mondaySession.id}`;
      const exact = await api(token, 'POST', `${mondayPath}/messages`, {
        eventId: event.id,
        message: '把周一第二场改到周日上午十点半',
      });
      assert.equal(exact.status, 'PREVIEW');
      assert.equal(exact.task.preview.before.id, mondaySource.id);
      assert.equal(
        exact.task.preview.after.startAt,
        '2027-06-13T02:30:00.000Z',
      );
      assert.equal(
        (await api(token, 'GET', `events/${event.id}/schedule`)).revision,
        mondaySchedule.revision,
      );
      const exactConfirmed = await api(
        token,
        'POST',
        `${mondayPath}/messages`,
        {
          eventId: event.id,
          message: '确认执行',
        },
      );
      assert.equal(exactConfirmed.status, 'EXECUTED');
      assert.equal(
        exactConfirmed.execution.revision,
        mondaySchedule.revision + 1,
      );
      const refreshed = await api(token, 'GET', mondayPath);
      assert.equal(
        refreshed.lastExecution.result.commandId,
        exactConfirmed.execution.commandId,
      );
      assert.equal(
        (await api(token, 'GET', `events/${event.id}/schedule`)).matches.find(
          (match) => match.id === mondaySource.id,
        ).startAt,
        '2027-06-13T02:30:00.000Z',
      );
      console.log(
        'CAAU-095 exact Monday instruction, Qwen proposal, single DRAFT and original text receipt: verified',
      );
      return;
    }
    stage = 'CAAU-062 real Qwen read-only query and follow-up';
    const querySession = await api(token, 'POST', 'agent/sessions', {});
    const queryPath = `agent/sessions/${querySession.id}/messages`;
    const scheduleList = await api(token, 'POST', queryPath, {
      message: '查2027-06-05的比赛安排',
      eventId: event.id,
    });
    stage = 'CAAU-062 list assertions';
    assert.equal(scheduleList.status, 'QUERY');
    assert.match(scheduleList.message, /北京日期：2027-06-05/);
    assert.match(
      scheduleList.message,
      new RegExp(`草稿 V${generated.revision}`),
    );
    assert.equal(scheduleList.task, null);
    stage = 'CAAU-062 match proposal';
    const matchDetail = await api(token, 'POST', queryPath, {
      message: '2027-06-05的第二场比赛详情',
      eventId: event.id,
    });
    stage = 'CAAU-062 match assertions';
    assert.equal(matchDetail.status, 'QUERY');
    assert.ok(matchDetail.message.includes(source.id));
    stage = 'CAAU-062 follow-up proposal';
    const followUp = await api(token, 'POST', queryPath, {
      message: '刚才那场的场地呢？',
      eventId: event.id,
    });
    stage = 'CAAU-062 follow-up assertions';
    assert.equal(followUp.status, 'QUERY');
    assert.ok(followUp.message.includes(source.id));
    const queryHistory = await api(
      token,
      'GET',
      `agent/sessions/${querySession.id}`,
    );
    assert.equal(queryHistory.task, null);
    assert.ok(
      queryHistory.turns.some((turn) => turn.content === followUp.message),
    );
    assert.equal(
      (await api(token, 'GET', `events/${event.id}/schedule`)).revision,
      generated.revision,
    );
    console.log('CAAU-062 Qwen read-only list, match and follow-up: verified');
    browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const isAgentMessageRequest = (url) =>
      /\/messages(?:\/stream)?$/.test(new URL(url).pathname);
    page.on('request', (request) => {
      if (isAgentMessageRequest(request.url()))
        console.log(
          `Agent message request sent +${Date.now() - probeOrigin}ms`,
        );
    });
    page.on('requestfailed', (request) => {
      if (isAgentMessageRequest(request.url()))
        console.log(
          `Agent message request failed in browser +${Date.now() - probeOrigin}ms`,
        );
    });
    const messageStatuses = [];
    page.on('response', (response) => {
      if (isAgentMessageRequest(response.url()))
        messageStatuses.push(response.status());
    });
    await page.goto(`http://127.0.0.1:${webPort}/workspace`);
    await page.getByRole('button', { name: '打开 CAAU 智能助手' }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
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
      const scenario = stage;
      stage = `${scenario}: input`;
      await expect(page.getByLabel('对话消息')).toBeEnabled({
        timeout: 20000,
      });
      await page.getByLabel('对话消息').fill(text);
      stage = `${scenario}: send button readiness`;
      await expect(page.getByRole('button', { name: '发送消息' })).toBeEnabled({
        timeout: 20000,
      });
      stage = `${scenario}: dispatch click`;
      const session = (await api(token, 'GET', 'agent/sessions'))[0];
      const before = session.turns.length;
      const responseCount = messageStatuses.length;
      await page
        .getByRole('button', { name: '发送消息' })
        .click({ noWaitAfter: true, timeout: 15000 });
      stage = `${scenario}: persisted reply`;
      let completed = false;
      for (let attempt = 0; attempt < 180; attempt++) {
        const latest = await api(token, 'GET', `agent/sessions/${session.id}`);
        if (
          latest.turns.length >= before + 2 &&
          latest.turns.at(-2)?.content === text &&
          latest.turns.at(-1)?.role === 'ASSISTANT'
        ) {
          completed = true;
          break;
        }
        if (
          messageStatuses.length > responseCount &&
          messageStatuses.at(-1) !== 200
        ) {
          assert.equal(
            latest.turns.length,
            before,
            'Failed model call must not save a partial turn',
          );
          await expect(page.getByLabel('对话消息')).toHaveValue(text, {
            timeout: 5000,
          });
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      assert.ok(completed, 'Model reply must persist before acceptance');
      stage = `${scenario}: HTTP and UI completion`;
      for (
        let attempt = 0;
        attempt < 40 && messageStatuses.length <= responseCount;
        attempt++
      )
        await new Promise((resolve) => setTimeout(resolve, 250));
      assert.equal(messageStatuses.length, responseCount + 1);
      assert.equal(messageStatuses.at(-1), 200);
      console.log('Qwen message HTTP status:', messageStatuses.at(-1));
      await expect(page.getByLabel('对话消息')).toHaveValue('', {
        timeout: 30000,
      });
    }
    stage = 'Qwen no-event input readiness';
    await expect(page.getByLabel('对话消息')).toBeEnabled({ timeout: 20000 });
    stage = 'Qwen no-event greeting request';
    await send('你好');
    stage = 'Qwen no-event seven-team discussion';
    await send('七支球队适合什么赛制？');
    const chatSession = (await api(token, 'GET', 'agent/sessions'))[0];
    assert.equal(chatSession.currentEventId, null);
    assert.equal(chatSession.task, null);
    assert.ok(
      chatSession.turns.some(
        (turn) =>
          turn.role === 'ASSISTANT' &&
          /七支|7支|轮空|单循环/.test(turn.content),
      ),
    );
    assert.equal(
      (
        await sql.query(
          'SELECT count(*)::int n FROM "AgentTask" WHERE "sessionId"=$1',
          [chatSession.id],
        )
      ).rows[0].n,
      0,
    );
    await page.goto(
      `http://127.0.0.1:${webPort}/competition?module=schedule&event=${event.id}`,
    );
    await expect(page.locator('.schedule-week')).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: '打开 CAAU 智能助手' }).click();
    stage = 'Qwen turn 1 from conversation';
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
    stage = 'Qwen question inside task';
    const beforeInterruption = (
      await sql.query(
        'SELECT revision,"checkpointThreadId" FROM "AgentTask" WHERE id=$1',
        [afterFirst.task.id],
      )
    ).rows[0];
    await send('赛制规则是什么？');
    assert.deepEqual(
      (
        await sql.query(
          'SELECT revision,"checkpointThreadId" FROM "AgentTask" WHERE id=$1',
          [afterFirst.task.id],
        )
      ).rows[0],
      beforeInterruption,
    );
    assert.equal(
      (await api(token, 'GET', `agent/sessions/${chatSession.id}`)).task.id,
      afterFirst.task.id,
    );
    stage = 'Qwen turn 2 after question';
    await send('上午十点');
    const afterSecond = (await api(token, 'GET', 'agent/sessions')).find(
      (item) => item.currentEventId === event.id,
    );
    console.log(
      'Second turn task step:',
      afterSecond?.task?.step,
      'continued original task:',
      afterSecond?.task?.id === afterFirst.task.id,
      'preview present:',
      !!afterSecond?.task?.preview,
      'source weekday:',
      afterSecond?.task?.parameters?.sourceWeekday,
      'source ordinal:',
      afterSecond?.task?.parameters?.sourceOrdinal,
      'selected match:',
      !!afterSecond?.task?.parameters?.sourceMatchId,
      'target weekday:',
      afterSecond?.task?.parameters?.targetWeekday,
      'target hour:',
      afterSecond?.task?.parameters?.targetHour,
    );
    assert.ok(afterSecond?.task?.preview, 'Second turn must create a preview');
    await expect(page.locator('.schedule-agent-preview')).toBeVisible({
      timeout: 30000,
    });
    assert.equal(
      afterSecond?.task?.preview?.after?.startAt,
      '2027-06-06T02:00:00.000Z',
    );
    stage = 'Qwen turn 3';
    const previousTicket = afterSecond?.task?.confirmation;
    await send('再晚半小时');
    const thirdTask = (
      await api(token, 'GET', `agent/sessions/${chatSession.id}`)
    ).task;
    console.log(
      'Third turn task step:',
      thirdTask?.step,
      'preview present:',
      !!thirdTask?.preview,
    );
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
    if (process.env.CAAU_095_TEXT_CONFIRM === '1') {
      assert.ok(
        previousTicket && previousTicket.id !== active.task.confirmation.id,
      );
      const obsolete = await fetch(
        `${origin}/api/v1/agent/confirmation-tickets/${previousTicket.id}/confirm`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            eventId: event.id,
            matchId: previousTicket.matchId,
            parameterHash: previousTicket.parameterHash,
          }),
        },
      );
      assert.equal(
        obsolete.status,
        409,
        'Changed conditions invalidate the old preview',
      );
    }
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
    stage =
      process.env.CAAU_095_TEXT_CONFIRM === '1'
        ? 'CAAU-095 Qwen text confirmation'
        : 'Web confirmation';
    let textResult;
    if (process.env.CAAU_095_TEXT_CONFIRM === '1') {
      textResult = await api(
        token,
        'POST',
        `agent/sessions/${active.id}/messages`,
        {
          message: '确认执行',
          eventId: event.id,
        },
      );
      assert.equal(textResult.status, 'EXECUTED');
      assert.equal(textResult.execution.ticketId, active.task.confirmation.id);
      assert.ok(textResult.message.includes(textResult.execution.commandId));
    } else {
      await page.getByRole('button', { name: '确认保存草稿' }).click();
      await expect(
        page.locator('.schedule-agent-result-details'),
      ).toContainText('首次执行回执', { timeout: 20000 });
    }
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
    if (textResult) {
      assert.equal(receipt.commandId, textResult.execution.commandId);
      assert.equal(afterSession.turns.at(-2).content, '确认执行');
      assert.ok(afterSession.turns.at(-1).content.includes(receipt.commandId));
    }
    stage = 'Web refresh and retry';
    await page.reload();
    await page.getByRole('button', { name: '打开 CAAU 智能助手' }).click();
    await expect(page.locator('.schedule-agent-result-details')).toContainText(
      receipt.commandId,
      { timeout: 15000 },
    );
    await expect(page.locator('.agent-execution > summary')).toContainText(
      `草稿 V${receipt.revision} 已保存`,
    );
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
      process.env.CAAU_095_TEXT_CONFIRM === '1'
        ? 'PASS: real Qwen three-turn preview, changed conditions invalidate ticket, text confirmation writes one DRAFT, refresh and persisted retry; temporary synthetic database only'
        : 'PASS: real Qwen three-turn Web preview, single DRAFT write, refresh and persisted retry; temporary synthetic database only',
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

main().catch((error) => {
  console.error(
    `Qwen Web acceptance failed at ${stage}; exception/provider details suppressed. No success claimed.`,
  );
  const firstLine = error instanceof Error ? error.message.split('\n')[0] : '';
  if (
    /^(?:locator\.|page\.|expect\(|Target closed|AssertionError)/.test(
      firstLine,
    )
  )
    console.error('Safe harness failure:', firstLine.slice(0, 120));
  process.exitCode = 1;
});
