import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { parseEnv, promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const composeFile = path.join(root, 'deploy/compose.database.yml');

export async function setupDatabaseFiles(base = root) {
  const directory = path.join(base, '.local/db');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  for (const target of ['dev', 'test']) {
    const envFile = path.join(directory, `${target}.env`);
    let existing;
    try {
      existing = parseEnv(await readFile(envFile, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (existing) {
      assertLocalDatabaseUrls(existing, target);
      for (const role of ['owner', 'app']) {
        const saved = (
          await readFile(
            path.join(directory, `${target}-${role}.password`),
            'utf8',
          )
        ).trim();
        const key =
          role === 'owner' ? 'MIGRATION_DATABASE_URL' : 'DATABASE_URL';
        if (decodeURIComponent(new URL(existing[key]).password) !== saved)
          throw new Error(
            `Existing ${target} secret/config mismatch; no files replaced`,
          );
      }
      continue;
    }
    const passwords = {};
    for (const role of ['owner', 'app']) {
      const file = path.join(directory, `${target}-${role}.password`);
      try {
        await writeFile(file, randomBytes(32).toString('hex'), {
          flag: 'wx',
          mode: 0o600,
        });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      passwords[role] = (await readFile(file, 'utf8')).trim();
    }
    const port = target === 'dev' ? 15432 : 15433;
    const url = (role, database) =>
      `postgresql://caau_${target}_${role}:${encodeURIComponent(passwords[role])}@127.0.0.1:${port}/${database}`;
    const text = [
      `DATABASE_URL=${url('app', `caau_${target}`)}`,
      `MIGRATION_DATABASE_URL=${url('owner', `caau_${target}`)}`,
      `SHADOW_DATABASE_URL=${url('owner', `caau_${target}_shadow`)}`,
      '',
    ].join('\n');
    try {
      await writeFile(path.join(directory, `${target}.env`), text, {
        flag: 'wx',
        mode: 0o600,
      });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}

export function assertLocalDatabaseUrls(env, target) {
  if (!['dev', 'test'].includes(target))
    throw new Error('Unknown database environment');
  for (const key of [
    'DATABASE_URL',
    'MIGRATION_DATABASE_URL',
    'SHADOW_DATABASE_URL',
  ]) {
    let url;
    try {
      url = new URL(env[key]);
    } catch {
      throw new Error(`Missing/invalid ${key}`);
    }
    const database = `caau_${target}${key === 'SHADOW_DATABASE_URL' ? '_shadow' : ''}`;
    const role = key === 'DATABASE_URL' ? 'app' : 'owner';
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== '127.0.0.1' ||
      url.port !== (target === 'dev' ? '15432' : '15433') ||
      url.pathname !== '/' + database ||
      url.username !== `caau_${target}_${role}` ||
      !url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        `${key} must target the dedicated local ${target} database/account`,
      );
    }
  }
}

export async function databaseEnvironment(target, base = root) {
  const env = parseEnv(
    await readFile(path.join(base, '.local/db', `${target}.env`), 'utf8'),
  );
  assertLocalDatabaseUrls(env, target);
  return Object.fromEntries(
    ['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'SHADOW_DATABASE_URL'].map(
      (key) => [key, env[key]],
    ),
  );
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      ...options,
    });
    child.once('error', () =>
      reject(
        new Error(
          `Cannot execute ${command}; install/start the required tool first`,
        ),
      ),
    );
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with code ${code}`)),
    );
  });
}

export function assertLocalDockerEndpoint(endpoint) {
  if (!endpoint.startsWith('unix:///'))
    throw new Error(
      'Local Unix-socket Docker context required; remote/TCP/SSH engines are refused',
    );
}

export async function requireDocker() {
  if (process.env.DOCKER_HOST)
    assertLocalDockerEndpoint(process.env.DOCKER_HOST);
  const { stdout } = await promisify(execFile)(
    'docker',
    ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
    { timeout: 10000 },
  );
  assertLocalDockerEndpoint(stdout.trim());
  await run('docker', ['compose', 'version']);
  await run('docker', ['info', '--format', '{{.ServerVersion}}']);
}

async function main() {
  const [operation, ...args] = process.argv.slice(2);
  const target = args.includes('--test') ? 'test' : 'dev';
  if (operation === 'setup') {
    await setupDatabaseFiles();
    console.log(
      'Local dev/test secret files prepared under .local/db; existing files were preserved. No credentials printed.',
    );
  } else if (['up', 'stop', 'status'].includes(operation)) {
    await requireDocker();
    await databaseEnvironment(target);
    const command =
      operation === 'up'
        ? ['up', '-d', '--wait']
        : operation === 'stop'
          ? ['stop']
          : ['ps'];
    await run('docker', [
      'compose',
      '-f',
      composeFile,
      ...command,
      `postgres-${target}`,
    ]);
  } else if (operation === 'api') {
    const { DATABASE_URL } = await databaseEnvironment('dev');
    // Migration/shadow credentials are not injected into the running API.
    const env = { ...process.env, DATABASE_URL };
    delete env.MIGRATION_DATABASE_URL;
    delete env.SHADOW_DATABASE_URL;
    await run('corepack', ['pnpm', 'dev:api'], { env });
  } else if (
    ['migrate-dev', 'migrate-deploy', 'migrate-status'].includes(operation)
  ) {
    const env = await databaseEnvironment(target);
    const action = operation.replace('migrate-', '');
    const rest = args.filter((arg) => arg !== '--test');
    if (action !== 'dev' && rest.length)
      throw new Error('Only migrate-dev accepts additional CLI arguments');
    if (
      action === 'dev' &&
      (rest.length !== 2 ||
        rest[0] !== '--name' ||
        !/^[a-z][a-z0-9_]*$/.test(rest[1]))
    ) {
      throw new Error(
        'Use db:migrate:dev --name descriptive_change_name [--test]',
      );
    }
    await run(
      'corepack',
      ['pnpm', 'exec', 'prisma', 'migrate', action, ...rest],
      { cwd: path.join(root, 'database'), env: { ...process.env, ...env } },
    );
  } else if (operation === 'test') {
    await requireDocker();
    const env = await databaseEnvironment('test');
    await run('corepack', [
      'pnpm',
      '--filter',
      '@caau/api...',
      '--filter',
      '@caau/api-client',
      '--filter',
      '@caau/admin',
      'build',
    ]);
    await run('docker', [
      'compose',
      '-f',
      composeFile,
      'up',
      '-d',
      '--wait',
      'postgres-test',
    ]);
    await run(
      process.execPath,
      ['--test', 'scripts/database.integration.mjs'],
      { env: { ...process.env, ...env, CAAU_DATABASE_INTEGRATION: 'test' } },
    );
  } else
    throw new Error(
      'Use setup, up/stop/status [--test], api, migrate-dev/deploy/status, or test',
    );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
