import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertLocalDatabaseUrls,
  assertLocalDockerEndpoint,
  databaseEnvironment,
  setupDatabaseFiles,
} from './database.mjs';
import {
  generateFixtureMigration,
  migrationFixture,
} from './migration-fixture.mjs';

test('local setup is idempotent, separates environments/accounts and protects secret files', async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), 'caau-db-config-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  await setupDatabaseFiles(base);
  const dev = await databaseEnvironment('dev', base);
  const testEnv = await databaseEnvironment('test', base);
  assert.notEqual(
    new URL(dev.DATABASE_URL).password,
    new URL(dev.MIGRATION_DATABASE_URL).password,
  );
  assert.notEqual(
    new URL(dev.DATABASE_URL).password,
    new URL(testEnv.DATABASE_URL).password,
  );
  const before = await readFile(path.join(base, '.local/db/dev.env'), 'utf8');
  await setupDatabaseFiles(base);
  assert.equal(
    await readFile(path.join(base, '.local/db/dev.env'), 'utf8'),
    before,
  );
  if (process.platform !== 'win32')
    assert.equal(
      (await stat(path.join(base, '.local/db/dev.env'))).mode & 0o777,
      0o600,
    );
  const sameShadow = {
    ...dev,
    SHADOW_DATABASE_URL: dev.MIGRATION_DATABASE_URL,
  };
  assert.throws(() => assertLocalDatabaseUrls(sameShadow, 'dev'));
  assert.throws(() => assertLocalDatabaseUrls(dev, 'test'));
  const remote = {
    ...dev,
    MIGRATION_DATABASE_URL: dev.MIGRATION_DATABASE_URL.replace(
      '127.0.0.1',
      'db.example.invalid',
    ),
  };
  assert.throws(() => assertLocalDatabaseUrls(remote, 'dev'));
  assert.throws(() =>
    assertLocalDatabaseUrls(
      { ...dev, DATABASE_URL: dev.DATABASE_URL + '?host=db.example.invalid' },
      'dev',
    ),
  );
});

test('database commands refuse remote Docker endpoints before contacting a daemon', () => {
  assert.doesNotThrow(() =>
    assertLocalDockerEndpoint('unix:///tmp/synthetic-docker.sock'),
  );
  for (const endpoint of [
    'ssh://example.invalid',
    'tcp://127.0.0.1:2375',
    'tcp://example.invalid:2376',
  ])
    assert.throws(() => assertLocalDockerEndpoint(endpoint));
});

test('Prisma generates SQL from an isolated temporary model without changing the formal empty schema', async (t) => {
  const formal = new URL('../database/prisma/schema.prisma', import.meta.url);
  const before = await readFile(formal, 'utf8');
  assert.doesNotMatch(before, /^\s*model\s+/m);
  const fixture = await migrationFixture();
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  const sql = await generateFixtureMigration(fixture);
  assert.match(sql, /CREATE TABLE.*"MigrationProbe"/);
  assert.match(sql, /"marker"\s+TEXT\s+NOT NULL/);
  assert.equal(await readFile(formal, 'utf8'), before);
});
