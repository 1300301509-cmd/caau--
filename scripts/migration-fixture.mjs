import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const prisma = fileURLToPath(
  new URL('../database/node_modules/prisma/build/index.js', import.meta.url),
);

export async function migrationFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'caau-migration-probe-'));
  const schema = path.join(directory, 'schema.prisma');
  const config = path.join(directory, 'prisma.config.ts');
  const migrations = path.join(directory, 'migrations');
  await mkdir(path.join(migrations, '20260908000000_probe'), {
    recursive: true,
  });
  await writeFile(
    schema,
    'datasource db {\n  provider = "postgresql"\n}\n\nmodel MigrationProbe {\n  id Int @id\n  marker String\n}\n',
  );
  await writeFile(
    config,
    `export default { schema: ${JSON.stringify(schema)}, migrations: { path: ${JSON.stringify(migrations)} }, datasource: { url: process.env.CAAU_FIXTURE_MIGRATION_URL, shadowDatabaseUrl: process.env.CAAU_FIXTURE_SHADOW_URL } };\n`,
  );
  await writeFile(
    path.join(migrations, 'migration_lock.toml'),
    'provider = "postgresql"\n',
  );
  return { directory, schema, config, migrations };
}

function redacted(text, env) {
  for (const value of Object.values(env)) {
    if (typeof value !== 'string' || !/^postgres(?:ql)?:\/\//.test(value))
      continue;
    text = text.split(value).join('<database-url>');
    try {
      const password = decodeURIComponent(new URL(value).password);
      if (password) text = text.split(password).join('<password>');
    } catch {
      /* Invalid URLs must not be echoed either. */
    }
  }
  return text;
}

export async function runPrisma(fixture, args, env = {}) {
  try {
    const result = await exec(
      process.execPath,
      [prisma, ...args, '--config', fixture.config],
      {
        cwd: fixture.directory,
        env: { ...process.env, ...env },
        timeout: 60000,
        maxBuffer: 2 * 1024 * 1024,
      },
    );
    return result.stdout;
  } catch (error) {
    // eslint-disable-next-line preserve-caught-error -- The child error may contain credentials; do not retain an unsanitized cause.
    throw new Error(
      `Prisma ${args.slice(0, 2).join(' ')} failed: ${redacted(error.stderr || error.message, { ...process.env, ...env })}`,
    );
  }
}

export async function generateFixtureMigration(fixture) {
  const sql = await runPrisma(fixture, [
    'migrate',
    'diff',
    '--from-empty',
    '--to-schema',
    fixture.schema,
    '--script',
  ]);
  await writeFile(
    path.join(fixture.migrations, '20260908000000_probe', 'migration.sql'),
    sql,
  );
  return sql;
}
