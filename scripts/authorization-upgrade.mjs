import { cp, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { runPrisma } from './migration-fixture.mjs';
import { root } from './database.mjs';

// Caller has already validated the isolated test service and created this precise database.
export async function deployAuthorizationBaseline(connectionString) {
  const directory = await mkdtemp(path.join(tmpdir(), 'caau-upgrade-'));
  const migrations = path.join(directory, 'migrations');
  const config = path.join(directory, 'prisma.config.ts');
  const client = new pg.Client({ connectionString });
  try {
    await mkdir(migrations);
    for (const name of ['migration_lock.toml', '202609080001_authorization'])
      await cp(
        path.join(root, 'database/prisma/migrations', name),
        path.join(migrations, name),
        { recursive: true },
      );
    await writeFile(
      config,
      `export default { schema: ${JSON.stringify(path.join(root, 'database/prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(migrations)} }, datasource: { url: process.env.CAAU_FIXTURE_MIGRATION_URL } };\n`,
    );
    await runPrisma({ directory, config }, ['migrate', 'deploy'], {
      CAAU_FIXTURE_MIGRATION_URL: connectionString,
    });
    await client.connect();
    const userId = randomUUID();
    const auditId = randomUUID();
    await client.query(
      'INSERT INTO "InternalUser" (id,"displayName") VALUES ($1,$2)',
      [userId, 'Synthetic preserved 004 user'],
    );
    await client.query(
      'INSERT INTO "AuditRecord" (id,"actorId",action,outcome,"requestId") VALUES ($1,$2,$3,$4,$5)',
      [auditId, userId, 'upgrade.baseline', 'ALLOWED', randomUUID()],
    );
    const checksum = (
      await client.query(
        'SELECT checksum FROM _prisma_migrations WHERE migration_name=$1',
        ['202609080001_authorization'],
      )
    ).rows[0].checksum;
    return { userId, auditId, checksum };
  } finally {
    await client.end();
    await rm(directory, { recursive: true, force: true });
  }
}
