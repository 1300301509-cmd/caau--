// Local Studio owns only its random test database. Never load the dev DB env.
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import pg from 'pg';
import { databaseEnvironment, requireDocker, root, run } from './database.mjs';
import { createApplication } from '../apps/api/dist/application.js';
import { readConfig } from '../apps/api/dist/config.js';

const port = 2024;
const directory = path.join(root, '.local/studio');
let stopping = false;
let child;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    child?.kill('SIGTERM');
  });
}

async function main() {
  // Fail before creating resources if the selected listener is already owned.
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', resolve);
  });
  await new Promise((resolve) => probe.close(resolve));
  await requireDocker();
  const database = await databaseEnvironment('test');
  const provider = parseEnv(
    await readFile(path.join(root, 'apps/api/.env'), 'utf8'),
  );
  if (!provider.CAAU_QWEN_API_KEY?.trim())
    throw new Error('Configure Qwen in apps/api/.env before starting Studio');
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    PORT: '3101',
    CAAU_DEPLOYMENT_STAGE: 'local',
    CAAU_IDENTITY_MODE: 'local',
    CAAU_STUDIO: '1',
    LANGSMITH_TRACING: 'false',
    LANGCHAIN_TRACING_V2: 'false',
    LANGSMITH_TRACING_V2: 'false',
    LANGCHAIN_TRACING: 'false',
    LANGGRAPH_API_DISABLE_ANALYTICS: '1',
  };
  // Copy model configuration only; never inherit development database settings.
  for (const [key, value] of Object.entries(provider)) {
    if (key.startsWith('CAAU_QWEN_')) env[key] = value;
  }
  delete env.LANGSMITH_API_KEY;
  delete env.LANGCHAIN_API_KEY;
  delete env.MIGRATION_DATABASE_URL;
  delete env.SHADOW_DATABASE_URL;
  const name = `caau_studio_${randomUUID().replaceAll('-', '')}`;
  const ownerUrl = new URL(database.MIGRATION_DATABASE_URL);
  const appUrl = new URL(database.DATABASE_URL);
  ownerUrl.pathname = appUrl.pathname = `/${name}`;
  env.DATABASE_URL = appUrl.href;
  const owner = new pg.Client({
    connectionString: database.MIGRATION_DATABASE_URL,
  });
  await owner.connect();
  let created = false;
  let sql;
  let app;
  const workdir = path.join(directory, name);
  try {
    await owner.query(`CREATE DATABASE "${name}"`);
    created = true;
    await run('corepack', ['pnpm', 'exec', 'prisma', 'migrate', 'deploy'], {
      cwd: path.join(root, 'database'),
      env: { ...process.env, MIGRATION_DATABASE_URL: ownerUrl.href },
    });
    sql = new pg.Client({ connectionString: ownerUrl.href });
    await sql.connect();
    await sql.query(`REVOKE CONNECT ON DATABASE "${name}" FROM PUBLIC`);
    await sql.query(`GRANT CONNECT ON DATABASE "${name}" TO caau_test_app`);
    await sql.query('GRANT USAGE ON SCHEMA public TO caau_test_app');
    app = await createApplication(readConfig(env));
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const api = async (token, method, route, body) => {
      const response = await fetch(`${base}/api/v1/${route}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok)
        throw new Error(`Studio fixture ${route}: HTTP ${response.status}`);
      return response.json();
    };
    const { token } = await api(
      null,
      'POST',
      'local-test-identities/sessions',
      { identity: 'super-admin' },
    );
    const event = await api(token, 'POST', 'events', {
      name: 'Studio 合成测试赛（2027年6月5—6日）',
      description: '独立工作台调试数据',
    });
    const division = await api(token, 'POST', `events/${event.id}/divisions`, {
      id: randomUUID(),
      name: 'U12 男子组',
    });
    const organization = (
      await sql.query('SELECT id FROM "Organization" WHERE name=$1', [
        'CAAU 总部（本地测试）',
      ])
    ).rows[0];
    for (let index = 1; index <= 4; index++) {
      await api(token, 'POST', 'teams', {
        id: randomUUID(),
        organizationId: organization.id,
        eventId: event.id,
        divisionId: division.id,
        profile: {
          name: `Studio 测试队 ${index}`,
          contactName: `测试联系人 ${index}`,
          contactPhone: `1380000000${index}`,
          province: '广东省',
          city: '广州市',
          district: '',
          address: '',
          shortName: '',
          clubName: '',
          introduction: '',
          notes: '',
        },
      });
    }
    const teams = await api(token, 'GET', `events/${event.id}/teams`);
    await api(token, 'POST', `events/${event.id}/schedule/generate`, {
      commandId: randomUUID(),
      format: 'ROUND_ROBIN',
      config: {
        teamIds: teams.map((team) => team.id),
        venues: ['一号场', '二号场'],
        startDate: '2027-06-05',
        endDate: '2027-06-06',
        dailyStart: '09:00',
        dailyEnd: '18:00',
        durationMinutes: 40,
        bufferMinutes: 10,
        minRestMinutes: 60,
      },
    });
    await app.close();
    app = undefined;
    await mkdir(workdir, { recursive: true, mode: 0o700 });
    // Checkpoints live in a per-launch directory; no stale thread can bind a new DB.
    const config = JSON.parse(
      await readFile(path.join(root, 'apps/api/langgraph.json'), 'utf8'),
    );
    config.graphs.caau_agent = `${path.relative(workdir, path.join(root, 'apps/api/dist/studio/graph.js'))}:graph`;
    const configFile = path.join(workdir, 'langgraph.json');
    await writeFile(configFile, JSON.stringify(config), { mode: 0o600 });
    await writeFile(
      path.join(directory, 'current.json'),
      JSON.stringify(
        { database: name, eventId: event.id, port, pid: process.pid, workdir },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(`Studio 测试赛事：${event.id}（2027-06-05 周六至周日）`);
    console.log(
      '输入示例：{"message":"你好"} 或 {"message":"把周六第二场移到周日十点半"}',
    );
    console.log(
      `独立工作台：https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:${port}`,
    );
    console.log(
      'Qwen 使用现有服务端配置；云端 tracing 已关闭；Ctrl+C 清理本次合成库。',
    );
    if (stopping) return;
    child = spawn(
      path.join(root, 'apps/api/node_modules/.bin/langgraphjs'),
      [
        'dev',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--no-browser',
        '--config',
        configFile,
      ],
      { cwd: workdir, env, stdio: 'inherit' },
    );
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    if (!stopping)
      throw new Error(`Studio server stopped unexpectedly (${exitCode})`);
  } finally {
    child?.kill('SIGTERM');
    await app?.close();
    await sql?.end();
    // The exact database created by this invocation only; no reset/drop volume.
    if (created) await owner.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await owner.end();
    await rm(workdir, { recursive: true, force: true });
    await rm(path.join(directory, 'current.json'), { force: true });
  }
}

main().catch((error) => {
  // Do not print raw provider/database errors or connection strings.
  console.error(
    `Studio 启动失败（${error.code ?? error.name}）。检查端口 2024、Docker test 服务和服务端千问配置。`,
  );
  process.exitCode = 1;
});
