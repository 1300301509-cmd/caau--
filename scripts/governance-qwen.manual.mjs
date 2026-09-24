// Explicit governance real-model ledger acceptance: disposable local test DB only.
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
  const name = `caau_qwen_usage_${randomUUID().replaceAll('-', '')}`;
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
    stage = 'synthetic governance chat';
    const dialogue = await request(token, 'POST', 'agent/sessions', {});
    const reply = await request(
      token,
      'POST',
      `agent/sessions/${dialogue.id}/messages`,
      { message: 'Please introduce yourself briefly in one sentence.' },
    );
    assert.equal(reply.status, 'CHAT');
    const calls = (
      await sql.query(
        'SELECT mode,phase,status,"usageStatus","inputTokens","outputTokens","estimatedMicros","requestId" FROM "AiUsageCall" ORDER BY "createdAt"',
      )
    ).rows;
    assert.deepEqual(
      calls.map((c) => c.phase),
      ['route', 'chat'],
    );
    assert.ok(
      calls.every(
        (c) =>
          c.mode === 'QWEN' &&
          c.status === 'SUCCESS' &&
          c.estimatedMicros === null,
      ),
    );
    assert.equal(new Set(calls.map((c) => c.requestId)).size, 1);
    const first = await request(
      token,
      'GET',
      'observability/usage-summary?limit=1',
    );
    assert.ok(first.nextCursor);
    const second = await request(
      token,
      'GET',
      `observability/usage-summary?limit=1&cursor=${first.nextCursor}`,
    );
    assert.equal(second.items.length, 1);
    assert.notEqual(first.items[0].id, second.items[0].id);
    assert.ok(
      calls.every(
        (c) => c.usageStatus === 'KNOWN' || c.usageStatus === 'UNKNOWN',
      ),
    );
    console.log(
      JSON.stringify({
        realModel: true,
        phases: calls.map((c) => c.phase),
        known: calls.filter((c) => c.usageStatus === 'KNOWN').length,
        unknown: calls.filter((c) => c.usageStatus === 'UNKNOWN').length,
        input: calls.reduce((n, c) => n + (c.inputTokens ?? 0), 0),
        output: calls.reduce((n, c) => n + (c.outputTokens ?? 0), 0),
        priceMissing: true,
        commonRequestId: true,
      }),
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
