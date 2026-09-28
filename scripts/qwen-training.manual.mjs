// Explicit CAAU team-training real-model acceptance in a disposable local test DB.
// Never print credentials, provider responses, user content, or database URLs.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
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

  const name = `caau_qwen_training_${randomUUID().replaceAll('-', '')}`;
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

    // Fixture only: all advice and conversation turns must use production HTTP.
    const userId = randomUUID();
    const token = randomBytes(32).toString('base64url');
    await sql.query(
      'INSERT INTO "InternalUser" (id,"displayName") VALUES ($1,$2)',
      [userId, 'Synthetic training reviewer'],
    );
    await sql.query(
      'INSERT INTO "Session" (id,"tokenHash","userId","expiresAt") VALUES ($1,$2,$3,$4)',
      [
        randomUUID(),
        createHash('sha256').update(token).digest('hex'),
        userId,
        new Date(Date.now() + 60 * 60 * 1000),
      ],
    );
    const model = createAgentModel(process.env);
    assert.equal(model.mode, 'QWEN');
    app = await createApplication({
      ...readConfig({ ...process.env, CAAU_IDENTITY_MODE: 'local' }),
      databaseUrl: appUrl.href,
      agentModel: model,
    });
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    async function request(method, route, body) {
      const response = await fetch(`${origin}/api/v1/${route}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(80000),
      });
      if (response.status !== 200)
        console.error('Synthetic HTTP status', response.status, 'at', stage);
      assert.equal(response.status, 200, `${stage}: HTTP ${response.status}`);
      return response.json();
    }
    const businessCounts = async () =>
      (
        await sql.query(
          'SELECT (SELECT count(*)::int FROM "Team") teams, (SELECT count(*)::int FROM "EventTeam") event_teams, (SELECT count(*)::int FROM "AgentTask") tasks, (SELECT count(*)::int FROM "AgentPlanningRequest") plans, (SELECT count(*)::int FROM "EventScheduleVersion") versions',
        )
      ).rows[0];
    const baseline = await businessCounts();
    assert.deepEqual(baseline, {
      teams: 0,
      event_teams: 0,
      tasks: 0,
      plans: 0,
      versions: 0,
    });

    const conversation = await request('POST', 'agent/sessions', {});
    const route = `agent/sessions/${conversation.id}`;
    stage = 'Qwen asks for relevant training context';
    const first = await request('POST', `${route}/messages`, {
      message: '我应该怎么去训练球队？',
    });
    assert.equal(first.status, 'CHAT');
    assert.ok(first.message?.length > 10);
    assert.match(first.message, /运动项目|什么运动|哪种运动|篮球|足球/);
    assert.match(first.message, /年龄|水平|目标|每周|时间|时长/);
    assert.ok(!first.task && !first.planningRequest && !first.teamAction);
    assert.deepEqual(await businessCounts(), baseline);

    stage = 'Qwen provides complete four-week youth basketball plan';
    const second = await request('POST', `${route}/messages`, {
      message:
        '是篮球队，队员13岁，共10人，零基础。目标是在4周内提升运球、传球和团队配合。每周训练2次，每次90分钟，室内篮球场，有篮球和标志桶，目前没有已知伤病或训练限制。请直接给我完整的4周训练计划。',
    });
    assert.equal(second.status, 'CHAT');
    assert.ok(second.message?.length >= 250);
    assert.match(second.message, /4\s*周|四周|第[一二三四1-4]\s*周/);
    assert.match(second.message, /运球|控球/);
    assert.match(second.message, /传球/);
    assert.match(second.message, /配合|协作|对抗|战术/);
    assert.match(second.message, /热身|准备活动/);
    assert.match(second.message, /休息|恢复|放松|整理/);
    assert.match(second.message, /检查|评估|记录|指标|进步|测试/);
    assert.ok(!second.task && !second.planningRequest && !second.teamAction);
    assert.deepEqual(await businessCounts(), baseline);

    stage = 'persisted conversation restores in order';
    const restored = await request('GET', route);
    assert.equal(restored.currentEventId, null);
    assert.deepEqual(
      restored.turns.map((turn) => turn.role),
      ['USER', 'ASSISTANT', 'USER', 'ASSISTANT'],
    );
    assert.equal(restored.turns[1].content, first.message);
    assert.equal(restored.turns[3].content, second.message);
    assert.deepEqual(await businessCounts(), baseline);
    console.log(
      'PASS: real Qwen, no-event training clarification, complete four-week plan, persisted dialogue, and no business writes.',
    );

    stage = 'ordinary greeting stays ordinary chat';
    const greetingSession = await request('POST', 'agent/sessions', {});
    const greeting = await request(
      'POST',
      `agent/sessions/${greetingSession.id}/messages`,
      { message: '你好' },
    );
    assert.equal(greeting.status, 'CHAT');
    assert.ok(greeting.message?.trim().length > 0);
    assert.ok(
      !greeting.task && !greeting.planningRequest && !greeting.teamAction,
    );
    assert.deepEqual(await businessCounts(), baseline);
    console.log('PASS: real Qwen greeting remains ordinary chat.');
  } finally {
    if (app) await app.close();
    if (sql) await sql.end();
    if (created) await owner.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await owner.end();
  }
}

main().catch((error) => {
  console.error(
    `Qwen training acceptance failed at ${stage}; details suppressed.`,
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
