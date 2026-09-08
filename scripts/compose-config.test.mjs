import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse } from 'yaml';

test('Compose declares pinned, loopback-only, isolated dev/test PostgreSQL services', async () => {
  const config = parse(
    await readFile(
      new URL('../deploy/compose.database.yml', import.meta.url),
      'utf8',
    ),
    { merge: true },
  );
  const dev = config.services['postgres-dev'];
  const testDb = config.services['postgres-test'];
  assert.match(dev.image, /^postgres:17\.11-bookworm@sha256:[a-f0-9]{64}$/);
  assert.equal(testDb.image, dev.image);
  assert.deepEqual(dev.ports, ['127.0.0.1:15432:5432']);
  assert.deepEqual(testDb.ports, ['127.0.0.1:15433:5432']);
  assert.notDeepEqual(dev.networks, testDb.networks);
  assert.notEqual(dev.volumes[0], testDb.volumes[0]);
  assert.notDeepEqual(dev.secrets, testDb.secrets);
  for (const service of [dev, testDb]) {
    assert.equal(service.environment.POSTGRES_PASSWORD, undefined);
    assert.match(
      service.environment.POSTGRES_PASSWORD_FILE,
      /^\/run\/secrets\//,
    );
    assert.equal(
      service.environment.POSTGRES_HOST_AUTH_METHOD,
      'scram-sha-256',
    );
    assert.match(service.entrypoint[2], /docker-entrypoint\.sh/);
    assert.match(
      service.entrypoint[2],
      /install -m 0644 \/opt\/caau\/01-access\.sh/,
    );
    assert.equal(
      service.volumes[1],
      '../database/init/01-access.sh:/opt/caau/01-access.sh:ro',
    );
  }
  for (const secret of Object.values(config.secrets))
    assert.match(secret.file, /^\.\.\/\.local\/db\//);
});

test('database initialization shell script parses (not PostgreSQL execution)', async () => {
  const source = await readFile(
    new URL('../database/init/01-access.sh', import.meta.url),
    'utf8',
  );
  assert.match(source, /REVOKE CREATE ON SCHEMA public FROM PUBLIC/);
  assert.doesNotMatch(source, /ALTER DEFAULT PRIVILEGES.*GRANT.*TABLES/);
  await promisify(execFile)('sh', [
    '-n',
    fileURLToPath(new URL('../database/init/01-access.sh', import.meta.url)),
  ]);
});
