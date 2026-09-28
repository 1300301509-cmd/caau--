// Explicit CAAU-095 real-model acceptance. Uses a disposable local test DB only.
// Never print credentials, supplier responses, business text or database URLs.
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

  const name = `caau_qwen_team_${randomUUID().replaceAll('-', '')}`;
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

    // Only the fixture is seeded directly. Every team action below uses the
    // authenticated HTTP assistant flow and its production Qwen adapter.
    const superId = randomUUID();
    const organizerId = randomUUID();
    const hqId = randomUUID();
    const organizationId = randomUUID();
    const organizerMemberId = randomUUID();
    await sql.query(
      'INSERT INTO "InternalUser" (id,"displayName") VALUES ($1,$2),($3,$4)',
      [
        superId,
        'Synthetic Qwen super',
        organizerId,
        'Synthetic Qwen organizer',
      ],
    );
    await sql.query(
      'INSERT INTO "Organization" (id,name) VALUES ($1,$2),($3,$4)',
      [hqId, 'Synthetic Qwen HQ', organizationId, 'Synthetic Qwen organizer'],
    );
    await sql.query(
      'INSERT INTO "OrganizationMember" (id,"userId","organizationId",role) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)',
      [
        randomUUID(),
        superId,
        hqId,
        'HEADQUARTERS_SUPER_ADMIN',
        organizerMemberId,
        organizerId,
        organizationId,
        'ORGANIZER',
      ],
    );
    await sql.query(
      'INSERT INTO "HostingApplicationHandlerGrant" (id,"memberId","organizationId","grantedBy") VALUES ($1,$2,$3,$4)',
      [randomUUID(), organizerMemberId, organizationId, superId],
    );
    const token = randomBytes(32).toString('base64url');
    await sql.query(
      'INSERT INTO "Session" (id,"tokenHash","userId","expiresAt") VALUES ($1,$2,$3,$4)',
      [
        randomUUID(),
        createHash('sha256').update(token).digest('hex'),
        organizerId,
        new Date(Date.now() + 60 * 60 * 1000),
      ],
    );
    const superToken = randomBytes(32).toString('base64url');
    await sql.query(
      'INSERT INTO "Session" (id,"tokenHash","userId","expiresAt") VALUES ($1,$2,$3,$4)',
      [
        randomUUID(),
        createHash('sha256').update(superToken).digest('hex'),
        superId,
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
    async function request(authToken, method, route, body) {
      const response = await fetch(`${origin}/api/v1/${route}`, {
        method,
        headers: {
          Authorization: `Bearer ${authToken}`,
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
    stage = 'create synthetic event';
    const event = await request(superToken, 'POST', 'events', {
      name: 'CAAU Qwen team acceptance event',
      description: 'Disposable synthetic event',
    });
    const applicationId = randomUUID();
    const submissionId = randomUUID();
    await sql.query(
      'INSERT INTO "EventHostingApplication" (id,"applicantOrganizationId",status,"createdBy","approvedEventId") VALUES ($1,$2,$3,$4,$5)',
      [applicationId, organizationId, 'APPROVED', organizerId, event.id],
    );
    await sql.query(
      'INSERT INTO "HostingApplicationSubmission" (id,"applicationId",version,form,"requirementSnapshot","submittedBy") VALUES ($1,$2,$3,$4,$5,$6)',
      [submissionId, applicationId, 1, {}, {}, organizerId],
    );
    await sql.query(
      'INSERT INTO "EventOrganizerAppointment" (id,"eventId","organizationId","sourceApplicationId","sourceSubmissionId","createdBy") VALUES ($1,$2,$3,$4,$5,$6)',
      [
        randomUUID(),
        event.id,
        organizationId,
        applicationId,
        submissionId,
        superId,
      ],
    );
    const status = await request(superToken, 'GET', 'agent/model-status');
    assert.equal(status.mode, 'QWEN');
    assert.equal(status.credentialsConfigured, true);

    const conversation = await request(token, 'POST', 'agent/sessions', {
      currentEventId: event.id,
    });
    const conversationRoute = `agent/sessions/${conversation.id}`;
    const send = (message) =>
      request(token, 'POST', `${conversationRoute}/messages`, {
        eventId: event.id,
        message,
      });
    const teamCount = async () =>
      (
        await sql.query(
          'SELECT (SELECT count(*)::int FROM "Team") AS teams, (SELECT count(*)::int FROM "EventTeam") AS event_teams',
        )
      ).rows[0];
    const baseline = await teamCount();
    assert.deepEqual(baseline, { teams: 0, event_teams: 0 });

    stage = 'Qwen routes create team and asks for missing fields';
    const collecting = await send('帮我添加一支球队吧');
    assert.equal(collecting.status, 'TEAM');
    assert.equal(collecting.teamAction?.state, 'COLLECTING');
    assert.ok(collecting.teamAction.missing.includes('球队名称'));
    assert.deepEqual(await teamCount(), baseline);

    stage = 'Qwen merges team details into preview';
    const preview = await send(
      '球队叫内测青云队，负责人张测试，联系电话13800000000，省份北京市，城市北京市',
    );
    assert.equal(preview.status, 'TEAM');
    assert.equal(preview.teamAction?.id, collecting.teamAction.id);
    assert.equal(preview.teamAction.state, 'PREVIEW_READY');
    assert.deepEqual(preview.teamAction.missing, []);
    assert.equal(preview.teamAction.profiles[0].name, '内测青云队');
    assert.deepEqual(await teamCount(), baseline);

    stage = 'Qwen routes explicit confirmation to one write';
    const confirmed = await send('确认添加这支球队');
    assert.equal(confirmed.status, 'TEAM');
    assert.equal(confirmed.teamAction?.state, 'EXECUTED');
    assert.equal(confirmed.teamAction.id, preview.teamAction.id);
    assert.deepEqual(confirmed.teamAction.teamIds, preview.teamAction.teamIds);
    assert.deepEqual(await teamCount(), { teams: 1, event_teams: 1 });
    const eventTeams = await request(token, 'GET', `events/${event.id}/teams`);
    assert.equal(eventTeams.length, 1);
    assert.equal(eventTeams[0].profile.name, '内测青云队');

    stage = 'Qwen replays original result without duplicate';
    const replay = await send('重试刚才添加这支球队的操作，不要新增另一支');
    assert.equal(replay.teamAction?.state, 'EXECUTED');
    assert.equal(replay.teamAction.id, confirmed.teamAction.id);
    assert.deepEqual(replay.teamAction.teamIds, confirmed.teamAction.teamIds);
    assert.deepEqual(await teamCount(), { teams: 1, event_teams: 1 });
    const restored = await request(token, 'GET', conversationRoute);
    assert.equal(restored.teamAction?.state, 'EXECUTED');
    assert.deepEqual(restored.teamAction.teamIds, confirmed.teamAction.teamIds);
    console.log(
      'PASS: real Qwen, organizer HTTP, missing fields, preview, one Team and EventTeam, replay and refresh.',
    );

    stage = 'Qwen routes explicit synthetic three-team batch';
    const testPreview = await send('我在做测试，请随机生成3支球队');
    assert.equal(testPreview.status, 'TEAM');
    assert.equal(testPreview.teamAction?.state, 'PREVIEW_READY');
    assert.equal(testPreview.teamAction.mode, 'TEST');
    assert.equal(testPreview.teamAction.profiles.length, 3);
    assert.deepEqual(await teamCount(), { teams: 1, event_teams: 1 });
    const testConfirmed = await send('确认添加这些测试球队');
    assert.equal(testConfirmed.teamAction?.state, 'EXECUTED');
    assert.deepEqual(await teamCount(), { teams: 4, event_teams: 4 });
    console.log(
      'PASS: real Qwen, explicit test mode, three labeled synthetic teams created only after confirmation.',
    );
  } finally {
    if (app) await app.close();
    if (sql) await sql.end();
    if (created) await owner.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await owner.end();
  }
}

main().catch((error) => {
  console.error(`Qwen team acceptance failed at ${stage}; details suppressed.`);
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
