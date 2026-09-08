import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { workflowIntegration } from './workflow.integration.mjs';
import { deployAuthorizationBaseline } from './authorization-upgrade.mjs';
import { materialsIntegration } from './materials.integration.mjs';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { createApplication } from '../apps/api/dist/application.js';
import { readConfig } from '../apps/api/dist/config.js';
import { createApiClient } from '../packages/api-client/dist/index.js';
import { createFetchTransport } from '../packages/api-client/dist/fetch.js';
import {
  assertLocalDatabaseUrls,
  requireDocker,
  root,
  run,
} from './database.mjs';

export async function authorizationIntegration(t) {
  assert.equal(process.env.CAAU_DATABASE_INTEGRATION, 'test');
  assertLocalDatabaseUrls(process.env, 'test');
  await requireDocker();
  const owner = new pg.Client({
    connectionString: process.env.MIGRATION_DATABASE_URL,
  });
  await owner.connect();
  const name = `caau_auth_${randomUUID().replaceAll('-', '')}`;
  assert.match(name, /^caau_auth_[a-f0-9]{32}$/);
  let created = false;
  let sql;
  let app;
  let runtime;
  try {
    await owner.query(`CREATE DATABASE "${name}"`);
    created = true;
    const url = new URL(process.env.MIGRATION_DATABASE_URL);
    url.pathname = '/' + name;
    const appUrl = new URL(process.env.DATABASE_URL);
    appUrl.pathname = '/' + name;
    const baseline = await deployAuthorizationBaseline(url.href);
    const migrationEnv = { ...process.env, MIGRATION_DATABASE_URL: url.href };
    for (const command of ['deploy', 'status', 'deploy'])
      await run('corepack', ['pnpm', 'exec', 'prisma', 'migrate', command], {
        cwd: path.join(root, 'database'),
        env: migrationEnv,
      });
    await run(
      'corepack',
      [
        'pnpm',
        'exec',
        'prisma',
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema.prisma',
        '--exit-code',
      ],
      { cwd: path.join(root, 'database'), env: migrationEnv },
    );
    sql = new pg.Client({ connectionString: url.href });
    await sql.connect();
    await t.test(
      'phase-2 migration preserves identity/audit and published snapshots, backfilling execution only',
      async () => {
        assert.equal(
          (
            await sql.query(
              'SELECT "displayName" FROM "InternalUser" WHERE id=$1',
              [baseline.userId],
            )
          ).rows[0].displayName,
          'Synthetic preserved 004 user',
        );
        assert.equal(
          (
            await sql.query('SELECT action FROM "AuditRecord" WHERE id=$1', [
              baseline.auditId,
            ])
          ).rows[0].action,
          'upgrade.baseline',
        );
        assert.equal(
          (
            await sql.query(
              'SELECT checksum FROM _prisma_migrations WHERE migration_name=$1',
              ['202609080001_authorization'],
            )
          ).rows[0].checksum,
          baseline.checksum,
        );
        assert.deepEqual(
          (
            await sql.query(
              'SELECT row_to_json(r) snapshot FROM "RequirementVersion" r WHERE "taskId"=$1',
              [baseline.taskId],
            )
          ).rows,
          baseline.snapshots,
        );
        const backfill = (
          await sql.query(
            'SELECT e.*, d.entries FROM "TaskExecution" e JOIN "MaterialDraft" d USING ("taskId") WHERE e."taskId"=$1',
            [baseline.taskId],
          )
        ).rows[0];
        assert.equal(backfill.state, 'EDITING');
        assert.equal(backfill.revision, 1);
        assert.deepEqual(backfill.entries, []);
        assert.equal(backfill.deadlines.task, baseline.configuration.deadline);
      },
    );
    await sql.query(`REVOKE CONNECT ON DATABASE "${name}" FROM PUBLIC`);
    await sql.query(`GRANT CONNECT ON DATABASE "${name}" TO caau_test_app`);
    await sql.query('GRANT USAGE ON SCHEMA public TO caau_test_app');
    runtime = new pg.Client({ connectionString: appUrl.href });
    await runtime.connect();
    const tokens = {};
    const users = {};
    const members = {};
    async function session(
      key,
      userId,
      expiresAt = new Date(Date.now() + 3600000),
    ) {
      const token = randomBytes(32).toString('base64url');
      await sql.query(
        'INSERT INTO "Session" (id, "tokenHash", "userId", "expiresAt") VALUES ($1,$2,$3,$4)',
        [
          randomUUID(),
          createHash('sha256').update(token).digest('hex'),
          userId,
          expiresAt,
        ],
      );
      tokens[key] = token;
    }
    const sys = randomUUID();
    const hq = randomUUID();
    await sql.query(
      'INSERT INTO "InternalUser" (id,"displayName") VALUES ($1,$2)',
      [sys, 'Synthetic sys'],
    );
    await sql.query('INSERT INTO "Organization" (id,name) VALUES ($1,$2)', [
      hq,
      'Synthetic HQ',
    ]);
    await sql.query(
      'INSERT INTO "OrganizationMember" (id,"userId","organizationId",role) VALUES ($1,$2,$3,$4)',
      [randomUUID(), sys, hq, 'SYSTEM_ADMIN'],
    );
    await session('sys', sys);
    const config = {
      ...readConfig({ CAAU_IDENTITY_MODE: 'local' }),
      databaseUrl: appUrl.href,
      privateFileRoot: path.join(root, '.local/files', name),
    };
    app = await createApplication(config);
    await app.listen(0, '127.0.0.1');
    let base = await app.getUrl();
    async function api(key, method, route, body, status = 200) {
      const response = await fetch(`${base}/api/v1/authorization/${route}`, {
        method,
        headers: {
          ...(tokens[key] ? { Authorization: `Bearer ${tokens[key]}` } : {}),
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      assert.equal(response.status, status, `${key} ${method} ${route}`);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return response.json();
    }
    const orgA = (
      await api('sys', 'POST', 'organizations', {
        name: 'Synthetic organizer A',
      })
    ).id;
    const orgB = (
      await api('sys', 'POST', 'organizations', {
        name: 'Synthetic organizer B',
      })
    ).id;
    for (const [key, role, organizationId] of [
      ['manager', 'EVENT_MANAGER', hq],
      ['managerB', 'EVENT_MANAGER', hq],
      ['a', 'ORGANIZER', orgA],
      ['a2', 'ORGANIZER', orgA],
      ['b', 'ORGANIZER', orgB],
      ['reviewer', 'REVIEWER', hq],
      ['reviewer2', 'REVIEWER', hq],
    ]) {
      users[key] = (
        await api('sys', 'POST', 'users', { displayName: 'Synthetic ' + key })
      ).id;
      members[key] = (
        await api('sys', 'POST', 'members', {
          userId: users[key],
          organizationId,
          role,
        })
      ).id;
      await session(key, users[key]);
    }
    const eventA = (await api('manager', 'POST', 'event-scopes')).id;
    const eventB = (await api('managerB', 'POST', 'event-scopes')).id;
    const grants = {};
    for (const [key, eventId] of [
      ['a', eventA],
      ['a2', eventA],
      ['b', eventB],
      ['reviewer', eventA],
      ['reviewer2', eventB],
    ])
      grants[key] = (
        await api('sys', 'POST', 'event-grants', {
          eventId,
          memberId: members[key],
        })
      ).id;
    const taskA = (
      await api('manager', 'POST', 'task-scopes', {
        eventId: eventA,
        handlerGrantId: grants.a,
      })
    ).id;
    const taskB = (
      await api('managerB', 'POST', 'task-scopes', {
        eventId: eventB,
        handlerGrantId: grants.b,
      })
    ).id;
    await api('manager', 'PATCH', `task-scopes/${taskA}/reviewer`, {
      reviewerGrantId: grants.reviewer,
    });
    await api('managerB', 'PATCH', `task-scopes/${taskB}/reviewer`, {
      reviewerGrantId: grants.reviewer2,
    });
    await t.test(
      'two events / organizers, task assignment and all four policy actions',
      async () => {
        for (const [key, own, other, event, otherEvent] of [
          ['a', taskA, taskB, eventA, eventB],
          ['b', taskB, taskA, eventB, eventA],
        ]) {
          await api(key, 'GET', `event-scopes/${event}`);
          await api(key, 'GET', `event-scopes/${otherEvent}`, undefined, 403);
          await api(key, 'GET', `task-scopes/${own}`);
          await api(key, 'GET', `task-scopes/${other}`, undefined, 403);
          for (const action of [
            'task.read',
            'content.write',
            'file.download',
          ]) {
            await api(key, 'POST', `task-scopes/${own}/access`, { action });
            await api(
              key,
              'POST',
              `task-scopes/${other}/access`,
              { action },
              403,
            );
          }
          await api(
            key,
            'POST',
            `task-scopes/${own}/access`,
            { action: 'review' },
            403,
          );
          await api(
            key,
            'POST',
            `task-scopes/${other}/access`,
            { action: 'review' },
            403,
          );
          await api(
            key,
            'PATCH',
            `task-scopes/${other}/reviewer`,
            { reviewerGrantId: grants.reviewer },
            403,
          );
        }
        // Same organization but not assigned to this task is not sufficient.
        await api('a2', 'GET', `task-scopes/${taskA}`, undefined, 403);
        await api('manager', 'GET', `task-scopes/${taskB}`, undefined, 403);
        await api(
          'manager',
          'POST',
          'task-scopes',
          { eventId: eventA, handlerGrantId: grants.b },
          403,
        );
        await api(
          'manager',
          'PATCH',
          `task-scopes/${taskB}/reviewer`,
          { reviewerGrantId: grants.reviewer },
          403,
        );
        await api(
          'manager',
          'PATCH',
          `task-scopes/${taskA}/reviewer`,
          { reviewerGrantId: grants.reviewer2 },
          403,
        );
        await api(
          'manager',
          'POST',
          `task-scopes/${taskA}/access`,
          { action: 'content.write' },
          403,
        );
        await api(
          'manager',
          'POST',
          `task-scopes/${taskA}/access`,
          { action: 'review' },
          403,
        );
      },
    );
    await t.test(
      'system admin has no business access; reviewers cannot alter content or self-assign',
      async () => {
        await api('sys', 'POST', 'event-scopes', undefined, 403);
        for (const id of [taskA, taskB]) {
          await api('sys', 'GET', `task-scopes/${id}`, undefined, 403);
          for (const action of [
            'task.read',
            'content.write',
            'review',
            'file.download',
          ])
            await api(
              'sys',
              'POST',
              `task-scopes/${id}/access`,
              { action },
              403,
            );
          await api(
            'sys',
            'PATCH',
            `task-scopes/${id}/reviewer`,
            { reviewerGrantId: grants.reviewer },
            403,
          );
        }
        await api('sys', 'GET', `event-scopes/${eventA}`, undefined, 403);
        await api('reviewer', 'POST', `task-scopes/${taskA}/access`, {
          action: 'review',
        });
        await api('reviewer', 'POST', `task-scopes/${taskA}/access`, {
          action: 'file.download',
        });
        await api(
          'reviewer',
          'POST',
          `task-scopes/${taskA}/access`,
          { action: 'content.write' },
          403,
        );
        await api(
          'reviewer',
          'POST',
          `task-scopes/${taskB}/access`,
          { action: 'review' },
          403,
        );
        await api(
          'reviewer',
          'PATCH',
          `task-scopes/${taskA}/reviewer`,
          { reviewerGrantId: grants.reviewer },
          403,
        );
        await api(
          'a',
          'POST',
          'event-grants',
          { eventId: eventB, memberId: members.a },
          403,
        );
        await api('manager', 'GET', 'audit', undefined, 403);
        const selfMember = (
          await api('sys', 'POST', 'members', {
            userId: users.a,
            organizationId: hq,
            role: 'REVIEWER',
          })
        ).id;
        const selfGrant = (
          await api('sys', 'POST', 'event-grants', {
            eventId: eventA,
            memberId: selfMember,
          })
        ).id;
        await api(
          'manager',
          'PATCH',
          `task-scopes/${taskA}/reviewer`,
          { reviewerGrantId: selfGrant },
          403,
        );
        await api(
          'a',
          'POST',
          `task-scopes/${taskA}/access`,
          { action: 'review' },
          403,
        );
        await api('sys', 'PATCH', `members/${selfMember}`, { active: false });
        const conflictedMember = (
          await api('sys', 'POST', 'members', {
            userId: users.reviewer,
            organizationId: orgA,
            role: 'REVIEWER',
          })
        ).id;
        await api(
          'reviewer',
          'POST',
          `task-scopes/${taskA}/access`,
          { action: 'review' },
          403,
        );
        await api(
          'manager',
          'PATCH',
          `task-scopes/${taskA}/reviewer`,
          { reviewerGrantId: grants.reviewer },
          403,
        );
        await api('sys', 'PATCH', `members/${conflictedMember}`, {
          active: false,
        });
      },
    );
    await t.test(
      'validation, unique and compound foreign keys; denied writes leave no changes',
      async () => {
        await api(
          'sys',
          'POST',
          'users',
          { displayName: 'x', role: 'SYSTEM_ADMIN' },
          400,
        );
        await api(
          'sys',
          'POST',
          'members',
          { userId: users.a, organizationId: orgA, role: 'ROOT' },
          400,
        );
        await api(
          'sys',
          'POST',
          'members',
          { userId: users.a, organizationId: orgA, role: 'ORGANIZER' },
          409,
        );
        await api('a', 'GET', 'task-scopes/not-a-uuid', undefined, 400);
        await api('a', 'GET', `task-scopes/${randomUUID()}`, undefined, 403);
        await assert.rejects(
          sql.query(
            'INSERT INTO "TaskScope" (id,"eventId","handlerGrantId") VALUES ($1,$2,$3)',
            [randomUUID(), eventA, grants.b],
          ),
          (e) => e.code === '23503',
        );
        assert.equal(
          (
            await sql.query(
              'SELECT "reviewerGrantId" FROM "TaskScope" WHERE id=$1',
              [taskA],
            )
          ).rows[0].reviewerGrantId,
          grants.reviewer,
        );
        assert.equal(
          (await sql.query('SELECT count(*)::int n FROM "TaskScope"')).rows[0]
            .n,
          3,
        );
      },
    );
    await t.test(
      'concurrent duplicate grants create one row and one success audit',
      async () => {
        const responses = await Promise.all(
          [1, 2].map(() =>
            fetch(`${base}/api/v1/authorization/event-grants`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${tokens.sys}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                eventId: eventA,
                memberId: members.reviewer2,
              }),
            }),
          ),
        );
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
        assert.equal(
          (
            await sql.query(
              'SELECT count(*)::int n FROM "EventGrant" WHERE "eventId"=$1 AND "memberId"=$2',
              [eventA, members.reviewer2],
            )
          ).rows[0].n,
          1,
        );
        assert.equal(
          (
            await sql.query(
              "SELECT count(*)::int n FROM \"AuditRecord\" WHERE action=$1 AND outcome=$2 AND context->>'memberId'=$3 AND context->>'eventId'=$4",
              ['admin.grant.create', 'ALLOWED', members.reviewer2, eventA],
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      'immediate revocation, reassignment, expired/forged sessions and restart persistence',
      async () => {
        await api('anonymous', 'GET', 'me', undefined, 401);
        tokens.forged = randomBytes(32).toString('base64url');
        await api('forged', 'GET', 'me', undefined, 401);
        await session('expired', users.a, new Date(Date.now() - 1000));
        await api('expired', 'GET', 'me', undefined, 401);
        await api('sys', 'PATCH', `members/${members.a}`, { active: false });
        await api('a', 'GET', `task-scopes/${taskA}`, undefined, 403);
        await api('sys', 'PATCH', `members/${members.a}`, { active: true });
        await api('sys', 'PATCH', `users/${users.a}`, { active: false });
        await api('a', 'GET', 'me', undefined, 401);
        await api('sys', 'PATCH', `users/${users.a}`, { active: true });
        await api('manager', 'PATCH', `task-scopes/${taskA}/reviewer`, {
          reviewerGrantId: null,
        });
        await api(
          'reviewer',
          'POST',
          `task-scopes/${taskA}/access`,
          { action: 'review' },
          403,
        );
        await api('sys', 'DELETE', `event-grants/${grants.reviewer}`);
        await api('reviewer', 'GET', `event-scopes/${eventA}`, undefined, 403);
        await app.close();
        app = await createApplication(config);
        await app.listen(0, '127.0.0.1');
        base = await app.getUrl();
        await api('a', 'GET', `task-scopes/${taskA}`);
        await api('a', 'POST', 'logout');
        await api('a', 'GET', 'me', undefined, 401);
        const sdk = createApiClient(base, createFetchTransport());
        assert.deepEqual(
          await sdk.request('getTaskScope', {
            token: tokens.b,
            path: { id: taskB },
          }),
          { id: taskB },
        );
        assert.deepEqual(
          await sdk.request('checkTaskAccess', {
            token: tokens.b,
            path: { id: taskB },
            body: { action: 'content.write' },
          }),
          { id: taskB },
        );
      },
    );
    await t.test(
      'audit persists allow/deny, is append-only and failure rolls back authorization changes',
      async () => {
        const audit = await api('sys', 'GET', 'audit');
        assert.ok(audit.some((r) => r.outcome === 'DENIED' && r.actorId));
        assert.ok(audit.some((r) => r.outcome === 'ALLOWED'));
        const policyAudit = (
          await sql.query(
            'SELECT context FROM "AuditRecord" WHERE action=$1 AND outcome=$2',
            ['task.access', 'DENIED'],
          )
        ).rows;
        assert.ok(
          policyAudit.some((r) => r.context.action === 'file.download'),
        );
        assert.ok(policyAudit.some((r) => r.context.action === 'review'));
        const serialized = JSON.stringify(
          (await sql.query('SELECT * FROM "AuditRecord"')).rows,
        );
        assert.ok(!serialized.includes('Bearer'));
        for (const token of Object.values(tokens))
          assert.ok(!serialized.includes(token));
        await assert.rejects(
          runtime.query('DELETE FROM "AuditRecord"'),
          (e) => e.code === '42501',
        );
        await assert.rejects(
          sql.query('UPDATE "AuditRecord" SET outcome=\'ALTERED\''),
          (e) => e.code === '42501',
        );
        await assert.rejects(
          runtime.query("UPDATE _prisma_migrations SET checksum='x'"),
          (e) => e.code === '42501',
        );
        await sql.query('REVOKE INSERT ON "AuditRecord" FROM caau_test_app');
        try {
          await api(
            'sys',
            'POST',
            'organizations',
            { name: 'must roll back' },
            503,
          );
        } finally {
          await sql.query('GRANT INSERT ON "AuditRecord" TO caau_test_app');
        }
        assert.equal(
          (
            await sql.query(
              'SELECT count(*)::int n FROM "Organization" WHERE name=\'must roll back\'',
            )
          ).rows[0].n,
          0,
        );
        assert.equal(
          (
            await sql.query(
              'SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NOT NULL',
            )
          ).rows[0].n,
          3,
        );
      },
    );
    await materialsIntegration(t, {
      base,
      config,
      sql,
      runtime,
      tokens,
      users,
      members,
      orgA,
      orgB,
      session,
    });
    await workflowIntegration(t, {
      base,
      config,
      sql,
      runtime,
      tokens,
      users,
      members,
      orgA,
      orgB,
    });
  } finally {
    await app?.close();
    await rm(path.join(root, '.local/files', name), {
      recursive: true,
      force: true,
    });
    await runtime?.end();
    await sql?.end();
    try {
      if (created) await owner.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    } finally {
      await owner.end();
    }
  }
}
