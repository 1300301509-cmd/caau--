import { backupRestoreTest } from './governance-maintenance.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cpus, totalmem, platform, arch } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import {
  UsageService,
  captureUsage,
} from '../apps/api/dist/modules/governance/usage.service.js';
import { requestScope } from '../apps/api/dist/modules/governance/request-context.js';
import { RuleAgentModelAdapter } from '../apps/api/dist/modules/ai/model-adapter.js';

export async function governanceIntegration(
  t,
  { base, tokens, users, orgA, sql, app, session, migrationUrl, runtime },
) {
  await session('super', users.super);
  await session('manager', users.manager);
  async function call(key, method, path, body, status = 200) {
    const response = await fetch(`${base}/api/v1/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${tokens[key]}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    assert.equal(response.status, status, `${path}: ${JSON.stringify(data)}`);
    return data;
  }
  await t.test(
    'governance: super-only overview, cursor audit, request correlation and credential-free sessions',
    async () => {
      await call('manager', 'GET', 'observability/overview', undefined, 403);
      const overview = await call('super', 'GET', 'observability/overview');
      assert.ok(overview.metrics.some((m) => m.label === '账号总数'));
      assert.equal(
        overview.metrics.find((m) => m.label === '附件实体扫描')?.value,
        'NOT_CONFIGURED',
        'isolated DB must not inherit development storage snapshots',
      );
      const first = await call('super', 'GET', 'observability/audit?limit=2');
      assert.equal(first.items.length, 2);
      assert.ok(first.nextCursor);
      const second = await call(
        'super',
        'GET',
        `observability/audit?limit=2&cursor=${first.nextCursor}`,
      );
      assert.ok(
        !second.items.some((r) => first.items.some((a) => a.id === r.id)),
      );
      const sessions = await call(
        'super',
        'GET',
        `observability/sessions?actorId=${users.super}`,
      );
      assert.ok(sessions.items.length);
      assert.doesNotMatch(
        JSON.stringify(sessions),
        /tokenHash|Bearer|passwordHash/,
      );
      await call(
        'super',
        'GET',
        'observability/audit?limit=1000',
        undefined,
        400,
      );
      const exported = await call(
        'super',
        'POST',
        'observability/audit/export',
        { actorId: users.manager },
      );
      assert.match(exported.csv, /记录ID/);
      const account = await call(
        'super',
        'GET',
        `observability/accounts/${users.manager}`,
      );
      assert.ok(account.metrics.some((m) => m.label === '赛事操作范围'));
      for (const kind of ['business-records', 'files', 'agent-runs']) {
        await call('manager', 'GET', `observability/${kind}`, undefined, 403);
        const records = await call(
          'super',
          'GET',
          `observability/${kind}?limit=2`,
        );
        assert.ok(
          records.items.length > 0,
          `${kind} should use existing integration facts`,
        );
        if (records.nextCursor) {
          const next = await call(
            'super',
            'GET',
            `observability/${kind}?limit=2&cursor=${records.nextCursor}`,
          );
          assert.ok(
            !next.items.some((r) =>
              records.items.some((old) => old.id === r.id),
            ),
          );
        }
        assert.doesNotMatch(
          JSON.stringify(records),
          /storageKey|objectKey|downloadUrl|passwordHash|tokenHash/,
        );
        if (kind === 'agent-runs')
          assert.ok(
            records.items.every((r) => /^(agent\.|ai\.usage\.)/.test(r.title)),
          );
      }
    },
  );
  await t.test(
    'governance: complete conversation review requires reason and records access before returning',
    async () => {
      const id = randomUUID();
      await sql.query(
        'INSERT INTO "AgentSession" (id,"ownerId") VALUES ($1,$2)',
        [id, users.manager],
      );
      await sql.query(
        'INSERT INTO "AgentTurn" (id,"sessionId",role,content,sequence) VALUES ($1,$2,\'USER\',$3,1),($4,$2,\'ASSISTANT\',$5,2)',
        [
          randomUUID(),
          id,
          '合成内容 sk-testingsecret',
          randomUUID(),
          '完整回答'.repeat(800),
        ],
      );
      await call(
        'manager',
        'POST',
        `observability/dialogues/${id}/review`,
        { reason: '合成审查' },
        403,
      );
      await call(
        'super',
        'POST',
        `observability/dialogues/${id}/review`,
        { reason: '' },
        400,
      );
      const result = await call(
        'super',
        'POST',
        `observability/dialogues/${id}/review`,
        { reason: '核对合成验收问题' },
      );
      assert.deepEqual(
        result.items.map((r) => r.status),
        ['USER', 'ASSISTANT'],
      );
      assert.doesNotMatch(JSON.stringify(result), /sk-testingsecret/);
      assert.equal(
        result.items[1].fields.find((f) => f.label === '正文').value.length,
        3200,
      );
      const audit = await sql.query(
        'SELECT context FROM "AuditRecord" WHERE action=\'governance.dialogue.content.read\' AND "resourceId"=$1',
        [id],
      );
      assert.equal(audit.rows.length, 1);
      assert.equal(audit.rows[0].context.reason, '核对合成验收问题');
    },
  );
  await t.test(
    'governance: quota concurrency, captured usage, price snapshot, unknown resolution and disabled defaults',
    async () => {
      const policy = {
        scope: 'ACCOUNT',
        subjectId: users.manager,
        enabled: true,
        paused: false,
        dailyTokens: 20000,
        monthlyTokens: 40000,
        expectedRevision: 0,
        reason: '合成额度测试',
      };
      await call('super', 'POST', 'ai-usage/quotas', policy);
      await call('super', 'POST', 'ai-usage/quotas', policy, 409);
      await call('super', 'POST', 'ai-usage/prices', {
        provider: 'synthetic.invalid',
        model: 'governance-test',
        currency: 'CNY',
        inputMicrosPerMillion: '1000000',
        outputMicrosPerMillion: '2000000',
        cachedMicrosPerMillion: null,
        effectiveAt: new Date().toISOString(),
        reason: '合成价格',
      });
      const usage = app.get(UsageService);
      const model = new RuleAgentModelAdapter();
      Object.defineProperty(model, 'mode', { value: 'QWEN' });
      model.status = () => ({
        mode: 'QWEN',
        modelName: 'governance-test',
        baseUrlHost: 'synthetic.invalid',
        credentialsConfigured: true,
        lastConnectionTest: {
          status: 'NOT_TESTED',
          testedAt: null,
          message: '',
        },
      });
      let release;
      const gate = new Promise((r) => {
        release = r;
      });
      model.route = async () => {
        await gate;
        captureUsage({
          id: 'synthetic-call',
          usage_metadata: { input_tokens: 1000, output_tokens: 3000 },
        });
        return 'CHAT';
      };
      const wrapped = usage.wrap(model);
      let rejected = 0;
      const jobs = Array.from({ length: 8 }, () =>
        requestScope
          .run({ requestId: randomUUID(), token: tokens.manager }, () =>
            wrapped.route('你好', { history: [] }),
          )
          .catch((e) => {
            rejected++;
            throw e;
          }),
      );
      const done = Promise.allSettled(jobs);
      for (let i = 0; i < 100 && rejected < 6; i++) await delay(30);
      release();
      const results = await done;
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2);
      assert.equal(rejected, 6);
      const calls = (
        await sql.query(
          'SELECT * FROM "AiUsageCall" WHERE model=\'governance-test\'',
        )
      ).rows;
      assert.equal(calls.length, 2);
      assert.ok(
        calls.every(
          (c) =>
            c.inputTokens === 1000 &&
            c.outputTokens === 3000 &&
            c.estimatedMicros === '7000',
        ),
      );
      const bucket = (
        await sql.query(
          'SELECT used,reserved FROM "AiQuotaBucket" WHERE "subjectId"=$1',
          [users.manager],
        )
      ).rows;
      assert.ok(bucket.every((b) => b.used === '8000' && b.reserved === '0'));
      await call('super', 'POST', 'ai-usage/quotas', {
        ...policy,
        enabled: false,
        expectedRevision: 1,
      });
      model.route = async () => {
        throw new Error('synthetic failure');
      };
      await assert.rejects(
        requestScope.run(
          { requestId: randomUUID(), token: tokens.manager },
          () => wrapped.route('失败', { history: [] }),
        ),
      );
      const unknown = (
        await sql.query(
          'SELECT * FROM "AiUsageCall" WHERE model=\'governance-test\' AND "usageStatus"=\'UNKNOWN\'',
        )
      ).rows[0];
      assert.ok(unknown);
      assert.equal(unknown.inputTokens, null);
      await call('super', 'POST', `ai-usage/calls/${unknown.id}/resolve`, {
        inputTokens: 100,
        outputTokens: 0,
        reason: '合成供应商回执已核实',
      });
      await call(
        'super',
        'POST',
        `ai-usage/calls/${unknown.id}/resolve`,
        { inputTokens: 100, outputTokens: 0, reason: '重复核对' },
        400,
      );
      await call(
        'super',
        'POST',
        `ai-usage/accounts/${users.manager}/assignment`,
        { organizationId: orgA, reason: '管理员明确配置独立费用归属' },
      );
      await call('super', 'POST', 'ai-usage/quotas', {
        scope: 'ORGANIZATION',
        subjectId: orgA,
        enabled: false,
        paused: true,
        dailyTokens: null,
        monthlyTokens: null,
        expectedRevision: 0,
        reason: '合成机构暂停测试',
      });
      await assert.rejects(
        requestScope.run(
          { requestId: randomUUID(), token: tokens.manager },
          () => wrapped.route('pause', { history: [] }),
        ),
        (e) => e.getStatus() === 429,
      );
      await call('super', 'POST', 'ai-usage/quotas', {
        scope: 'ORGANIZATION',
        subjectId: orgA,
        enabled: true,
        paused: false,
        dailyTokens: 1,
        monthlyTokens: null,
        expectedRevision: 1,
        reason: '合成机构限额测试',
      });
      await assert.rejects(
        requestScope.run(
          { requestId: randomUUID(), token: tokens.manager },
          () => wrapped.route('limit', { history: [] }),
        ),
        (e) => e.getStatus() === 429,
      );
      await call('super', 'POST', 'ai-usage/quotas', {
        scope: 'ORGANIZATION',
        subjectId: orgA,
        enabled: false,
        paused: false,
        dailyTokens: null,
        monthlyTokens: null,
        expectedRevision: 2,
        reason: '恢复机构后续调用',
      });
      await call(
        'super',
        'POST',
        `ai-usage/accounts/${users.manager}/assignment`,
        { organizationId: null, reason: '仅归属账号' },
      );
    },
  );
  await t.test(
    'governance: single-session revocation takes effect without exposing secrets',
    async () => {
      const records = await call(
        'super',
        'GET',
        `observability/sessions?actorId=${users.manager}`,
      );
      const target = records.items[0];
      assert.ok(target);
      await call(
        'super',
        'POST',
        `observability/accounts/${users.manager}/revoke`,
        { sessionId: target.id, reason: '合成撤销验证' },
      );
      const stored = (
        await sql.query('SELECT "revokedAt" FROM "Session" WHERE id=$1', [
          target.id,
        ])
      ).rows[0];
      assert.ok(stored.revokedAt);
      await session('manager', users.manager);
    },
  );
  await t.test(
    'governance: bounded retention preserves business history and backup restores isolated data',
    async () => {
      const id = randomUUID();
      await sql.query(
        'INSERT INTO "AuditRecord" (id,action,outcome,"requestId","occurredAt") VALUES ($1,\'synthetic.expired\',\'ALLOWED\',$2,now()-interval \'91 days\')',
        [id, randomUUID()],
      );
      await assert.rejects(
        runtime.query('SELECT caau_governance_retention()'),
        (e) => e.code === '42501',
      );
      const before = (
        await sql.query('SELECT count(*)::int n FROM "AgentTurn"')
      ).rows[0].n;
      await sql.query('SELECT caau_governance_retention()');
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int n FROM "AuditRecord" WHERE id=$1',
            [id],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (await sql.query('SELECT count(*)::int n FROM "AgentTurn"')).rows[0].n,
        before,
      );
      await assert.rejects(
        runtime.query('DELETE FROM "AuditRecord"'),
        (e) => e.code === '42501',
      );
      const restored = await backupRestoreTest(
        migrationUrl,
        '.local/governance/restore',
      );
      assert.equal(restored.AgentTurn, before);
    },
  );
  await t.test(
    'governance: alert receipt does not recover an active fault and recovery delivery can retry',
    async () => {
      const usage = app.get(UsageService);
      const fingerprint = `synthetic-${randomUUID()}`;
      const alert = await usage.signal(
        fingerprint,
        'CAAU 合成故障',
        'warning',
        'FIRING',
      );
      await call(
        'super',
        'POST',
        `observability/alerts/${alert.id}/acknowledge`,
        { ownerId: users.super, note: '已收到，尚未恢复' },
      );
      assert.equal(
        (
          await sql.query('SELECT state FROM "GovernanceAlert" WHERE id=$1', [
            alert.id,
          ])
        ).rows[0].state,
        'FIRING',
      );
      await usage.signal(
        fingerprint,
        'CAAU 合成故障',
        'warning',
        'RECOVERED',
        'FAILED',
        1,
      );
      await usage.signal(
        fingerprint,
        'CAAU 合成故障',
        'warning',
        'RECOVERED',
        'DELIVERED',
        2,
      );
      const rows = (
        await sql.query(
          'SELECT * FROM "GovernanceAlert" WHERE fingerprint=$1',
          [fingerprint],
        )
      ).rows;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].deliveryState, 'DELIVERED');
      assert.ok(rows[0].acknowledgedAt);
      assert.ok(rows[0].recoveredAt);
      const summary = await call('super', 'GET', 'observability/usage-summary');
      assert.ok(summary.items.length);
      const summaryFirst = await call(
        'super',
        'GET',
        'observability/usage-summary?limit=1',
      );
      assert.ok(summaryFirst.nextCursor);
      const summaryNext = await call(
        'super',
        'GET',
        `observability/usage-summary?limit=1&cursor=${summaryFirst.nextCursor}`,
      );
      assert.ok(summaryNext.items.length);
      assert.notEqual(summaryNext.items[0].id, summaryFirst.items[0].id);
    },
  );
  if (process.env.CAAU_GOVERNANCE_PERFORMANCE === '1')
    await t.test(
      'governance: one million synthetic audit rows, authenticated cursor P95 under 2s',
      async () => {
        await sql.query(
          `INSERT INTO "AuditRecord" (id,"actorId",action,outcome,result,"requestId","occurredAt") SELECT gen_random_uuid(),$1,'synthetic.performance','ALLOWED','SUCCESS',gen_random_uuid(),now()-(g%86400)*interval '1 second' FROM generate_series(1,1000000) g`,
          [users.super],
        );
        await sql.query('ANALYZE "AuditRecord"');
        const timings = [];
        let cursor = '';
        for (let i = 0; i < 25; i++) {
          const start = performance.now();
          const result = await call(
            'super',
            'GET',
            `observability/audit?limit=50&action=synthetic.performance${cursor ? `&cursor=${cursor}` : ''}`,
          );
          timings.push(performance.now() - start);
          cursor = result.nextCursor;
          assert.equal(result.items.length, 50);
        }
        timings.sort((a, b) => a - b);
        const p95 = timings[Math.ceil(timings.length * 0.95) - 1];
        await mkdir('.local/evidence/governance', { recursive: true });
        await writeFile(
          '.local/evidence/governance/performance.json',
          JSON.stringify(
            {
              at: new Date().toISOString(),
              rows: 1000000,
              samples: 25,
              p95Ms: p95,
              platform: platform(),
              arch: arch(),
              cpu: cpus()[0]?.model,
              logicalCpus: cpus().length,
              memoryBytes: totalmem(),
              scope:
                'isolated local PostgreSQL; authenticated HTTP cursor; no old-version overhead baseline',
            },
            null,
            2,
          ),
        );
        assert.ok(p95 <= 2000, `audit P95 ${p95}ms exceeds 2000ms`);
      },
    );
}
