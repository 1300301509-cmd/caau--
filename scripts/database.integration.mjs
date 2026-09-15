import assert from 'node:assert/strict';
import { rm, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';
import { authorizationIntegration } from './authorization.integration.mjs';
import pg from 'pg';
import { createApplication } from '../apps/api/dist/application.js';
import { readConfig } from '../apps/api/dist/config.js';
import {
  assertLocalDatabaseUrls,
  composeFile,
  run,
  requireDocker,
} from './database.mjs';
import {
  generateFixtureMigration,
  migrationFixture,
  runPrisma,
} from './migration-fixture.mjs';

test(
  'authorization foundation on isolated PostgreSQL',
  { timeout: 240000 }, // Includes separate old and new multi-session browser suites.
  authorizationIntegration,
);

// Explicit entry only: never silently skip this suite or use arbitrary DB URLs.
assert.equal(
  process.env.CAAU_DATABASE_INTEGRATION,
  'test',
  'Run corepack pnpm db:test after Docker is ready',
);
assertLocalDatabaseUrls(process.env, 'test');
await requireDocker();
const env = process.env;
const sqlClient = (connectionString) =>
  new pg.Client({
    connectionString,
    connectionTimeoutMillis: 3000,
    query_timeout: 4000,
  });

async function readStatus(base) {
  const response = await fetch(`${base}/api/v1/ready`, {
    signal: AbortSignal.timeout(3000),
  });
  return { status: response.status, data: await response.json() };
}

async function awaitReady(base) {
  for (let attempt = 0; attempt < 15; attempt++) {
    const result = await readStatus(base);
    if (result.status === 200) return result;
    await sleep(200);
  }
  throw new Error('PostgreSQL did not become ready again');
}

test(
  'real PostgreSQL connection, container outage and recovery on the same API process',
  { timeout: 120000 },
  async () => {
    const app = await createApplication({
      ...readConfig({}),
      databaseUrl: env.DATABASE_URL,
    });
    let restore = false;
    try {
      await app.listen(0, '127.0.0.1');
      const base = await app.getUrl();
      assert.deepEqual(await awaitReady(base), {
        status: 200,
        data: { status: 'ready', service: 'caau-api' },
      });
      restore = true;
      await run('docker', [
        'compose',
        '-f',
        composeFile,
        'stop',
        '-t',
        '1',
        'postgres-test',
      ]);
      const start = performance.now();
      assert.deepEqual(await readStatus(base), {
        status: 503,
        data: {
          status: 'not_ready',
          service: 'caau-api',
          code: 'DATABASE_UNAVAILABLE',
        },
      });
      assert.ok(performance.now() - start < 2500);
      assert.equal((await fetch(`${base}/api/v1/health`)).status, 200);
      await run('docker', [
        'compose',
        '-f',
        composeFile,
        'up',
        '-d',
        '--wait',
        'postgres-test',
      ]);
      restore = false;
      assert.equal((await awaitReady(base)).status, 200);
    } finally {
      try {
        if (restore)
          await run('docker', [
            'compose',
            '-f',
            composeFile,
            'up',
            '-d',
            '--wait',
            'postgres-test',
          ]);
      } finally {
        await app.close();
      }
    }
  },
);

test('runtime DB account is non-superuser and cannot create application tables', async () => {
  const client = sqlClient(env.DATABASE_URL);
  await client.connect();
  try {
    const { rows } = await client.query(
      'SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user',
    );
    assert.deepEqual(rows[0], {
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
    });
    assert.equal(
      (
        await client.query(
          "SELECT has_database_privilege(current_user, 'caau_test_shadow', 'CONNECT') AS allowed",
        )
      ).rows[0].allowed,
      false,
    );
    await client.query('BEGIN');
    await assert.rejects(
      client.query('CREATE TABLE public."ForbiddenRuntimeProbe" (id integer)'),
      (error) => error.code === '42501',
    );
  } finally {
    try {
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
  }
});

test(
  'isolated migrations: repeat deploy, migrate dev with shadow, replay and data preservation',
  { timeout: 120000 },
  async () => {
    const originalSchema = await readFile(
      new URL('../database/prisma/schema.prisma', import.meta.url),
      'utf8',
    );
    const fixture = await migrationFixture();
    const admin = sqlClient(env.MIGRATION_DATABASE_URL);
    const suffix = randomUUID().replaceAll('-', '');
    const databases = [`caau_probe_a_${suffix}`, `caau_probe_b_${suffix}`];
    const created = [];
    let connected = false;
    try {
      await admin.connect();
      connected = true;
      const sql = await generateFixtureMigration(fixture);
      assert.match(sql, /CREATE TABLE.*"MigrationProbe"/);
      for (const name of databases) {
        // Names are generated internally, never supplied by a user/config/HTTP input.
        assert.match(name, /^caau_probe_[ab]_[a-f0-9]{32}$/);
        await admin.query(`CREATE DATABASE "${name}"`);
        created.push(name);
        const url = new URL(env.MIGRATION_DATABASE_URL);
        url.pathname = '/' + name;
        const migrationEnv = { CAAU_FIXTURE_MIGRATION_URL: url.href };
        await runPrisma(fixture, ['migrate', 'deploy'], migrationEnv);
        await runPrisma(fixture, ['migrate', 'status'], migrationEnv);
        const client = sqlClient(url.href);
        await client.connect();
        try {
          await client.query(
            'INSERT INTO "MigrationProbe" (id, marker) VALUES ($1, $2)',
            [1, 'synthetic-migration-check'],
          );
          await runPrisma(fixture, ['migrate', 'deploy'], migrationEnv);
          assert.equal(
            (
              await client.query(
                'SELECT marker FROM "MigrationProbe" WHERE id = 1',
              )
            ).rows[0].marker,
            'synthetic-migration-check',
          );
          assert.equal(
            (
              await client.query(
                'SELECT count(*)::int AS total FROM _prisma_migrations WHERE finished_at IS NOT NULL',
              )
            ).rows[0].total,
            1,
          );
          await runPrisma(
            fixture,
            [
              'migrate',
              'diff',
              '--from-config-datasource',
              '--to-schema',
              fixture.schema,
              '--exit-code',
            ],
            migrationEnv,
          );
        } finally {
          await client.end();
        }
      }
      // Exercise the real development workflow only in our own temporary databases.
      const shadowName = `caau_probe_shadow_${suffix}`;
      assert.match(shadowName, /^caau_probe_shadow_[a-f0-9]{32}$/);
      await admin.query(`CREATE DATABASE "${shadowName}"`);
      created.push(shadowName);
      const developmentUrl = new URL(env.MIGRATION_DATABASE_URL);
      developmentUrl.pathname = '/' + databases[0];
      const shadowUrl = new URL(env.MIGRATION_DATABASE_URL);
      shadowUrl.pathname = '/' + shadowName;
      const developmentEnv = {
        CAAU_FIXTURE_MIGRATION_URL: developmentUrl.href,
        CAAU_FIXTURE_SHADOW_URL: shadowUrl.href,
      };
      await writeFile(
        fixture.schema,
        (await readFile(fixture.schema, 'utf8')).replace(
          '  marker String',
          '  marker String\n  note String?',
        ),
      );
      await runPrisma(
        fixture,
        ['migrate', 'dev', '--name', 'add_optional_note'],
        developmentEnv,
      );
      await runPrisma(fixture, ['migrate', 'status'], developmentEnv);
      await runPrisma(
        fixture,
        ['migrate', 'dev', '--name', 'no_change'],
        developmentEnv,
      );
      for (const name of databases) {
        const url = new URL(env.MIGRATION_DATABASE_URL);
        url.pathname = '/' + name;
        const migrationEnv = { CAAU_FIXTURE_MIGRATION_URL: url.href };
        await runPrisma(fixture, ['migrate', 'deploy'], migrationEnv);
        await runPrisma(
          fixture,
          [
            'migrate',
            'diff',
            '--from-config-datasource',
            '--to-schema',
            fixture.schema,
            '--exit-code',
          ],
          migrationEnv,
        );
        const client = sqlClient(url.href);
        await client.connect();
        try {
          assert.deepEqual(
            (
              await client.query(
                'SELECT marker, note FROM "MigrationProbe" WHERE id = 1',
              )
            ).rows,
            [{ marker: 'synthetic-migration-check', note: null }],
          );
          assert.equal(
            (
              await client.query(
                'SELECT count(*)::int AS total FROM _prisma_migrations WHERE finished_at IS NOT NULL',
              )
            ).rows[0].total,
            2,
          );
        } finally {
          await client.end();
        }
      }
      assert.equal(
        await readFile(
          new URL('../database/prisma/schema.prisma', import.meta.url),
          'utf8',
        ),
        originalSchema,
      );
    } finally {
      try {
        for (const name of created)
          await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      } finally {
        if (connected) await admin.end();
        await rm(fixture.directory, { recursive: true, force: true });
      }
    }
  },
);
