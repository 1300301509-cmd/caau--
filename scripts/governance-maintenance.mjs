import pg from 'pg';
import {
  mkdir,
  open,
  readdir,
  stat,
  unlink,
  rename,
  writeFile,
} from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  scanPrivateStorage,
  registeredObjects,
} from './governance-storage.mjs';
import {
  databaseEnvironment,
  requireDocker,
  assertLocalDatabaseUrls,
  root,
} from './database.mjs';

export async function backupRestoreTest(connectionString, directory) {
  const url = new URL(connectionString);
  if (url.hostname !== '127.0.0.1' || url.port !== '15433')
    throw new Error('Restore tests require the isolated local test service');
  await requireDocker();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const db = new pg.Client({ connectionString });
  await db.connect();
  const restoreName = `caau_restore_${randomUUID().replaceAll('-', '')}`;
  const file = path.join(directory, `${restoreName}.dump`);
  let made = false;
  const dockerArgs = [
    'exec',
    '-e',
    'PGPASSWORD',
    'caau-database-postgres-test-1',
  ];
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
  const user = decodeURIComponent(url.username),
    source = url.pathname.slice(1);
  try {
    const fd = await open(file, 'wx', 0o600);
    const dump = spawn(
      'docker',
      [...dockerArgs, 'pg_dump', '-U', user, '-d', source, '-Fc'],
      { env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    dump.stderr.resume();
    const exited = new Promise((resolve, reject) => {
      dump.once('error', reject);
      dump.once('exit', (c) =>
        c === 0 ? resolve() : reject(new Error('Backup command failed')),
      );
    });
    await pipeline(dump.stdout, fd.createWriteStream());
    await exited;
    await db.query(`CREATE DATABASE "${restoreName}"`);
    made = true;
    const input = await open(file, 'r');
    const restore = spawn(
      'docker',
      [
        'exec',
        '-i',
        '-e',
        'PGPASSWORD',
        'caau-database-postgres-test-1',
        'pg_restore',
        '-U',
        user,
        '-d',
        restoreName,
        '--no-owner',
      ],
      { env, stdio: ['pipe', 'ignore', 'pipe'] },
    );
    restore.stderr.resume();
    const restored = new Promise((resolve, reject) => {
      restore.once('error', reject);
      restore.once('exit', (c) =>
        c === 0 ? resolve() : reject(new Error('Restore command failed')),
      );
    });
    await pipeline(input.createReadStream(), restore.stdin);
    await restored;
    const targetUrl = new URL(url);
    targetUrl.pathname = '/' + restoreName;
    const target = new pg.Client({ connectionString: targetUrl.href });
    await target.connect();
    try {
      const tables = [
        'InternalUser',
        'AgentSession',
        'AgentTurn',
        'EventScheduleVersion',
        'AgentCommandReceipt',
      ];
      const counts = {};
      for (const table of tables) {
        const before = (
          await db.query(`SELECT count(*)::int n FROM "${table}"`)
        ).rows[0].n;
        const after = (
          await target.query(`SELECT count(*)::int n FROM "${table}"`)
        ).rows[0].n;
        if (before !== after) throw new Error('Restored row count differs');
        counts[table] = after;
      }
      await target.query('SELECT caau_governance_retention()');
      return counts;
    } finally {
      await target.end();
    }
  } finally {
    if (made) await db.query(`DROP DATABASE "${restoreName}" WITH (FORCE)`);
    await db.end();
    await unlink(file).catch(() => undefined);
  }
}
async function main() {
  const command = process.argv[2] ?? 'dry-run',
    target = process.argv.includes('--test') ? 'test' : 'dev';
  const env = await databaseEnvironment(target);
  assertLocalDatabaseUrls(env, target);
  await requireDocker();
  const db = new pg.Client({ connectionString: env.MIGRATION_DATABASE_URL });
  await db.connect();
  try {
    if (command === 'storage-scan') {
      if (target === 'test' && !process.env.CAAU_PRIVATE_FILE_ROOT)
        throw new Error(
          'Test storage scan requires an explicit isolated file root',
        );
      const directory = process.env.CAAU_PRIVATE_FILE_ROOT
        ? path.resolve(root, 'apps/api', process.env.CAAU_PRIVATE_FILE_ROOT)
        : path.join(root, '.local/files');
      const result = await scanPrivateStorage(
        directory,
        await registeredObjects(db),
      );
      const source = new URL(env.MIGRATION_DATABASE_URL);
      result.source = createHash('sha256')
        .update(`${source.hostname}:${source.port}${source.pathname}`)
        .digest('hex');
      const output = path.join(root, '.local/monitoring/storage-status.json');
      await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
      await writeFile(output + '.partial', JSON.stringify(result), {
        mode: 0o600,
      });
      await rename(output + '.partial', output);
      await db.query(
        'INSERT INTO "AuditRecord" (id, action, outcome, result, "requestId", context) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
        [
          randomUUID(),
          'governance.storage.scan',
          'ALLOWED',
          'SUCCESS',
          randomUUID(),
          JSON.stringify(result),
        ],
      );
      console.log(result);
    } else if (command === 'dry-run') {
      const rows = await db.query(
        'SELECT count(*)::int AS "expiredAuditRecords" FROM "AuditRecord" WHERE "occurredAt" < CURRENT_TIMESTAMP-INTERVAL \'90 days\'',
      );
      console.log(rows.rows[0]);
    } else if (command === 'purge' && process.argv.includes('--apply')) {
      console.log(
        (await db.query('SELECT caau_governance_retention() AS result')).rows[0]
          .result,
      );
    } else if (command === 'backup') {
      const directory = path.join(root, '.local/monitoring/backups');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const file = path.join(directory, `caau_backup_${randomUUID()}.dump`);
      const url = new URL(env.MIGRATION_DATABASE_URL);
      const fd = await open(file + '.partial', 'wx', 0o600);
      const child = spawn(
        'docker',
        [
          'exec',
          '-e',
          'PGPASSWORD',
          `caau-database-postgres-${target}-1`,
          'pg_dump',
          '-U',
          decodeURIComponent(url.username),
          '-d',
          url.pathname.slice(1),
          '-Fc',
        ],
        {
          env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      child.stderr.resume();
      const exited = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (c) =>
          c === 0 ? resolve() : reject(new Error('Backup failed')),
        );
      });
      try {
        await pipeline(child.stdout, fd.createWriteStream());
        await exited;
        await rename(file + '.partial', file);
      } catch (e) {
        await unlink(file + '.partial').catch(() => undefined);
        throw e;
      }
      await writeFile(
        path.join(root, '.local/monitoring/backup-status.json'),
        JSON.stringify({ success: true, at: new Date().toISOString(), target }),
        { mode: 0o600 },
      );
      console.log(
        'Local database backup completed in the private backup directory',
      );
    } else if (command === 'restore-test' && target === 'test') {
      console.log(
        await backupRestoreTest(
          env.MIGRATION_DATABASE_URL,
          path.join(root, '.local/monitoring/backups'),
        ),
      );
    } else
      throw new Error(
        'Use dry-run, storage-scan, backup, purge --apply, or restore-test --test',
      );
    const directory = path.join(root, '.local/monitoring/backups');
    if (command === 'purge' && process.argv.includes('--apply'))
      for (const name of await readdir(directory).catch(() => [])) {
        if (!/^caau_backup_[a-f0-9-]+\.dump$/.test(name)) continue;
        const file = path.join(directory, name);
        if (Date.now() - (await stat(file)).mtimeMs > 7 * 86400000)
          await unlink(file);
      }
  } finally {
    await db.end();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch(async () => {
    if (process.argv[2] === 'backup')
      await writeFile(
        path.join(root, '.local/monitoring/backup-status.json'),
        JSON.stringify({ success: false, at: new Date().toISOString() }),
        { mode: 0o600 },
      ).catch(() => undefined);
    console.error(
      'Governance maintenance failed; verify local environment and privileges',
    );
    process.exitCode = 1;
  });
