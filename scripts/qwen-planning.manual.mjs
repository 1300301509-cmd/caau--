// Explicit CAAU-063 real-model acceptance: disposable local test DB only.
// Do not print user content, credentials, provider errors or DB URLs.
// CAAU_CHAT_ONLY displays only answers to this file's synthetic review questions.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import path from 'node:path';
import { createApplication } from '../apps/api/dist/application.js';
import { readConfig } from '../apps/api/dist/config.js';
import { createAgentModel } from '../apps/api/dist/modules/ai/model-adapter.js';
import {
  assertLocalDatabaseUrls,
  requireDocker,
  root,
  run,
} from './database.mjs';

let stage = 'bootstrap';
async function main() {
  assert.equal(process.env.CAAU_DATABASE_INTEGRATION, 'test');
  assertLocalDatabaseUrls(process.env, 'test');
  assert.ok(process.env.CAAU_QWEN_API_KEY?.trim(), 'Qwen env required');
  await requireDocker();
  const name = `caau_qwen_plan_${randomUUID().replaceAll('-', '')}`;
  const ownerUrl = new URL(process.env.MIGRATION_DATABASE_URL);
  ownerUrl.pathname = `/${name}`;
  const appUrl = new URL(process.env.DATABASE_URL);
  appUrl.pathname = `/${name}`;
  const owner = new pg.Client({
    connectionString: process.env.MIGRATION_DATABASE_URL,
  });
  await owner.connect();
  let created = false;
  let sql;
  let app;
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
    app = await createApplication({
      ...readConfig({ ...process.env, CAAU_IDENTITY_MODE: 'local' }),
      databaseUrl: appUrl.href,
      agentModel: realModel,
    });
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    async function request(token, method, route, body) {
      const response = await fetch(`${origin}/api/v1/${route}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(80000),
      });
      if (response.status !== 200)
        console.log('Synthetic HTTP status', response.status, 'at', stage);
      assert.equal(response.status, 200, `HTTP ${response.status} at ${stage}`);
      return response.json();
    }
    const session = await request(
      null,
      'POST',
      'local-test-identities/sessions',
      { identity: 'super-admin' },
    );
    const token = session.token;
    const status = await request(token, 'GET', 'agent/model-status');
    assert.equal(status.mode, 'QWEN');
    const event = await request(token, 'POST', 'events', {
      name: 'CAAU063临时规划赛事',
      description: 'Temporary synthetic data',
    });
    // Opt-in general dialogue regression. No browser or development DB access.
    if (process.env.CAAU_CHAT_ONLY === '1') {
      const counts = async () =>
        (
          await sql.query(
            'SELECT (SELECT count(*)::int FROM "EventScheduleVersion") versions, (SELECT count(*)::int FROM "AgentConfirmationTicket") tickets, (SELECT count(*)::int FROM "AgentPlanningRequest") plans, (SELECT count(*)::int FROM "AgentTask") tasks',
          )
        ).rows[0];
      const baseline = await counts();
      const chat = await request(token, 'POST', 'agent/sessions', {});
      const route = `agent/sessions/${chat.id}`;
      const send = (message, extra = {}) =>
        request(token, 'POST', `${route}/messages`, { message, ...extra });
      const cases = [
        ['self introduction', '你好，能给我简单介绍一下你自己'],
        ['general knowledge', '请用简单的话解释一下为什么会下雨'],
        ['follow-up', '把刚才的解释缩短成一句话，讲给小朋友听'],
      ];
      for (const [label, message] of cases) {
        stage = label;
        const reply = await send(message);
        assert.equal(reply.status, 'CHAT');
        assert.ok(reply.message.trim().length > 5);
        assert.doesNotMatch(
          reply.message,
          /请(?:先)?选择(?:赛事|场次)|待补字段|PREVIEW_READY/,
        );
        if (label !== 'self introduction')
          assert.doesNotMatch(reply.message, /改期预览|请提供比赛|DRAFT/);
        // Only synthetic test answers are displayed for human quality review.
        console.log('Synthetic chat review:', label, reply.message);
      }
      assert.deepEqual(await counts(), baseline);
      const history = await request(token, 'GET', route);
      assert.equal(history.turns.length, 6);
      assert.deepEqual(
        history.turns.map((turn) => turn.role),
        ['USER', 'ASSISTANT', 'USER', 'ASSISTANT', 'USER', 'ASSISTANT'],
      );
      stage = 'start pending task';
      const pending = await send('把周六第二场改到周日上午十点');
      assert.ok(pending.task);
      const savedTask = (await request(token, 'GET', route)).task;
      const taskCounts = await counts();
      stage = 'chat with page event and pending task';
      const inserted = await send(
        '先聊点别的，你能帮我做什么？简单介绍一下自己',
        {
          eventId: event.id,
          taskId: pending.task.id,
        },
      );
      assert.equal(inserted.status, 'CHAT');
      assert.doesNotMatch(
        inserted.message,
        /请先选择赛事|没有唯一定位|预览已过期|系统自动清空/,
      );
      console.log(
        'Synthetic chat review: pending task interruption',
        inserted.message,
      );
      assert.deepEqual((await request(token, 'GET', route)).task, savedTask);
      assert.deepEqual(await counts(), taskCounts);
      console.log(
        'PASS: QWEN general chat, follow-up, ordered recovery and unchanged pending task; no schedule writes.',
      );
      return;
    }
    const organization = (
      await sql.query('SELECT id FROM "Organization" WHERE name=$1', [
        'CAAU 总部（本地测试）',
      ])
    ).rows[0]?.id;
    assert.ok(organization);
    for (const name of [
      'CAAU063合成A队',
      'CAAU063合成B队',
      'CAAU063合成C队',
      'CAAU063合成D队',
    ])
      await request(token, 'POST', 'teams', {
        id: randomUUID(),
        organizationId: organization,
        eventId: event.id,
        profile: {
          name,
          contactName: 'Synthetic contact',
          contactPhone: '13800000001',
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
    const before = await sql.query(
      'SELECT (SELECT count(*)::int FROM "EventScheduleVersion") versions, (SELECT count(*)::int FROM "AgentConfirmationTicket") tickets, (SELECT count(*)::int FROM "AgentTask") tasks',
    );
    if (process.env.CAAU_CANDIDATE_ONLY !== '1') {
      const chat = await request(token, 'POST', 'agent/sessions', {});
      const route = `agent/sessions/${chat.id}`;
      const send = async (message, plan) =>
        request(token, 'POST', `${route}/messages`, {
          message,
          eventId: event.id,
          ...(plan
            ? { planningId: plan.id, planningRevision: plan.revision }
            : {}),
        });
      stage = 'date range proposal';
      let reply = await send(
        '请收集排程需求，赛事日期范围 2027-06-01 到 2027-06-07',
      );
      assert.equal(reply.status, 'PLAN', stage);
      let plan = reply.planningRequest;
      assert.equal(
        plan.conditions.find((item) => item.kind === 'DATE_RANGE')?.to,
        '2027-06-07',
      );
      console.log(
        'Real Qwen planning: date range extracted and persisted, revision',
        plan.revision,
      );
      stage = 'team window proposal';
      reply = await send('CAAU063合成D队只能周三安排比赛', plan);
      console.log('Qwen requirement stage', {
        status: ['PLAN', 'NEED_TEAM', 'CLARIFY', 'NEED_EVENT'].includes(
          reply.status,
        )
          ? reply.status
          : 'OTHER',
        kinds:
          reply.planningRequest?.conditions?.map((item) => item.kind) ?? [],
      });
      assert.equal(reply.status, 'PLAN', stage);
      plan = reply.planningRequest;
      assert.deepEqual(
        plan.conditions.find((item) => item.kind === 'TEAM_WINDOW')?.dates,
        ['2027-06-02'],
      );
      stage = 'multi-turn replacement';
      reply = await send('改成周三和周五', plan);
      assert.equal(reply.status, 'PLAN', stage);
      plan = reply.planningRequest;
      assert.deepEqual(
        plan.conditions.find((item) => item.kind === 'TEAM_WINDOW')?.dates,
        ['2027-06-02', '2027-06-04'],
      );
      stage = 'cancel team restriction';
      reply = await send('取消CAAU063合成D队时间限制', plan);
      assert.equal(reply.status, 'PLAN', stage);
      plan = reply.planningRequest;
      assert.equal(
        plan.conditions.some((item) => item.kind === 'TEAM_WINDOW'),
        false,
      );
      stage = 'matchup preference proposal';
      reply = await send('希望CAAU063合成A队与CAAU063合成B队尽量对阵', plan);
      assert.equal(reply.status, 'PLAN', stage);
      plan = reply.planningRequest;
      assert.equal(
        plan.conditions.find((item) => item.kind === 'MATCHUP')?.priority,
        'PREFER',
      );
      stage = 'confirmation only';
      const confirmed = await request(
        token,
        'POST',
        `agent/planning-requests/${plan.id}/confirm`,
        { expectedRevision: plan.revision },
      );
      assert.equal(confirmed.status, 'CONFIRMED');
      assert.equal(
        (await request(token, 'GET', route)).planningRequest.confirmedRevision,
        plan.revision,
      );
    }
    stage = 'independent planning request for whole-schedule candidate';
    const previewChat = await request(token, 'POST', 'agent/sessions', {
      currentEventId: event.id,
    });
    const previewRoute = `agent/sessions/${previewChat.id}/messages`;
    let previewReply = await request(token, 'POST', previewRoute, {
      message: '收集排程需求，赛事日期范围 2027-06-01 到 2027-06-07',
      eventId: event.id,
    });
    assert.equal(previewReply.status, 'PLAN');
    let previewPlan = previewReply.planningRequest;
    stage = 'Qwen understands hard Wednesday-only condition';
    previewReply = await request(token, 'POST', previewRoute, {
      message: 'CAAU063合成D队只能周三安排比赛',
      eventId: event.id,
      planningId: previewPlan.id,
      planningRevision: previewPlan.revision,
    });
    console.log('Qwen candidate requirement stage', {
      status: ['PLAN', 'NEED_TEAM', 'CLARIFY', 'NEED_EVENT'].includes(
        previewReply.status,
      )
        ? previewReply.status
        : 'OTHER',
      kinds:
        previewReply.planningRequest?.conditions?.map((item) => item.kind) ??
        [],
    });
    assert.equal(previewReply.status, 'PLAN');
    previewPlan = previewReply.planningRequest;
    assert.deepEqual(
      previewPlan.conditions.find((item) => item.kind === 'TEAM_WINDOW')?.dates,
      ['2027-06-02'],
    );
    stage = 'confirmed candidate input';
    await request(
      token,
      'POST',
      `agent/planning-requests/${previewPlan.id}/confirm`,
      { expectedRevision: previewPlan.revision },
    );
    const participants = await request(
      token,
      'GET',
      `events/${event.id}/teams`,
    );
    const config = {
      teamIds: participants.map((team) => team.id),
      venues: ['合成一号场', '合成二号场'],
      startDate: '2027-06-01',
      endDate: '2027-06-07',
      dailyStart: '09:00',
      dailyEnd: '17:00',
      durationMinutes: 40,
      bufferMinutes: 10,
      minRestMinutes: 60,
    };
    const candidate = await request(
      token,
      'POST',
      `agent/planning-requests/${previewPlan.id}/candidates`,
      {
        expectedRevision: previewPlan.revision,
        baselineRevision: 0,
        format: 'ROUND_ROBIN',
        configSource: 'EXPLICIT',
        config,
        fixedMatchIds: [],
      },
    );
    assert.equal(candidate.status, 'FOUND');
    assert.equal(candidate.matches.length, 6);
    assert.equal(
      new Set(
        candidate.matches.map((match) =>
          [match.homeEventTeamId, match.awayEventTeamId].sort().join(':'),
        ),
      ).size,
      6,
    );
    assert.ok(
      candidate.matches
        .filter((match) =>
          [match.homeEventTeamId, match.awayEventTeamId].includes(
            participants.find((team) => team.profile.name === 'CAAU063合成D队')
              .id,
          ),
        )
        .every((match) => match.startAt.startsWith('2027-06-02')),
    );
    assert.deepEqual(candidate.issues, []);
    assert.equal(
      (
        await request(
          token,
          'GET',
          `agent/planning-requests/${previewPlan.id}/candidates/${candidate.id}`,
        )
      ).status,
      'FOUND',
    );
    assert.equal(
      (await request(token, 'GET', `events/${event.id}/schedule`)).exists,
      false,
    );
    const after = await sql.query(
      'SELECT (SELECT count(*)::int FROM "EventScheduleVersion") versions, (SELECT count(*)::int FROM "AgentConfirmationTicket") tickets, (SELECT count(*)::int FROM "AgentTask") tasks',
    );
    assert.deepEqual(after.rows[0], before.rows[0]);
    console.log(
      'PASS: QWEN requirement understanding + deterministic whole-schedule preview; 6 unique matches and 0 schedule versions, tickets or tasks added.',
    );
  } finally {
    if (app) await app.close();
    if (sql) await sql.end();
    if (created) await owner.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await owner.end();
  }
}
main().catch((error) => {
  console.error(
    `Qwen planning acceptance failed at ${stage}; sensitive details suppressed.`,
  );
  console.error(
    'Failure category:',
    error instanceof assert.AssertionError
      ? 'assertion'
      : error instanceof Error
        ? error.name
        : 'unknown',
  );
  process.exitCode = 1;
});
