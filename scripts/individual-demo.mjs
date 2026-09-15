import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  ApiError,
  createApiClient,
} from '../packages/api-client/dist/index.js';
import { createFetchTransport } from '../packages/api-client/dist/fetch.js';
const exec = promisify(execFile);
let stage = 'local-identity';
// Explicit local-only seed: append synthetic resources; never reset or modify old tasks.
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Local only');
  async function session(user) {
    const { stdout } = await exec(process.execPath, [
      'scripts/local-identity.mjs',
      user,
    ]);
    const file = stdout.match(/\.local\/db\/session-[a-f0-9-]+\.json/)?.[0];
    if (!file) throw new Error('Session file missing');
    return { file, ...JSON.parse(await readFile(file, 'utf8')) };
  }
  const apiClient = createApiClient(
    'http://127.0.0.1:3000',
    createFetchTransport(),
  );
  const client = {
    request(name, input) {
      stage = name;
      return apiClient.request(name, input);
    },
  };
  const admin = await session('bootstrap');
  const identity = await client.request('getWorkspaceIdentity', {
    token: admin.token,
  });
  if (identity.id !== admin.userId || !identity.roles.includes('SYSTEM_ADMIN'))
    throw new Error('Local API identity mismatch');
  const stamp = new Date().toISOString();
  const hq = await client.request('createOrganization', {
    token: admin.token,
    body: { name: `单份演示总部 ${stamp}` },
  });
  const organizer = await client.request('createOrganization', {
    token: admin.token,
    body: { name: `单份演示承办 ${stamp}` },
  });
  const people = {};
  for (const [key, displayName, role, organizationId] of [
    ['manager', '单份演示·任务管理员', 'EVENT_MANAGER', hq.id],
    ['organizer', '单份演示·承办', 'ORGANIZER', organizer.id],
    ['reviewerA', '单份演示·审核甲', 'REVIEWER', hq.id],
    ['reviewerB', '单份演示·审核乙', 'REVIEWER', hq.id],
  ]) {
    const user = await client.request('createInternalUser', {
      token: admin.token,
      body: { displayName },
    });
    const member = await client.request('createOrganizationMember', {
      token: admin.token,
      body: { userId: user.id, organizationId, role },
    });
    people[key] = {
      userId: user.id,
      memberId: member.id,
      ...(await session(user.id)),
    };
  }
  const managerToken = people.manager.token;
  const event = await client.request('createEvent', {
    token: managerToken,
    body: {
      name: `单份演示赛事 ${stamp}`,
      description: '仅本地合成演示，不代表正式业务数据',
    },
  });
  for (const key of ['reviewerA', 'reviewerB'])
    await client.request('createEventGrant', {
      token: admin.token,
      body: { eventId: event.id, memberId: people[key].memberId },
    });
  const task = await client.request('createIndividualMaterialTask', {
    token: managerToken,
    body: {
      eventId: event.id,
      organizationId: organizer.id,
      handlerMemberId: people.organizer.memberId,
      title: `单份演示任务 ${stamp}`,
    },
  });
  const draft = await client.request('getMaterialTask', {
    token: managerToken,
    path: { id: task.id },
  });
  const configured = await client.request('configureMaterialTask', {
    token: managerToken,
    path: { id: task.id },
    body: {
      expectedRevision: draft.revision,
      requirements: {
        deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
        materials: [],
      },
    },
  });
  await client.request('publishMaterialTask', {
    token: managerToken,
    path: { id: task.id },
    body: { expectedRevision: configured.revision },
  });
  const manifest = {
    eventId: event.id,
    taskId: task.id,
    createdAt: stamp,
    identities: Object.fromEntries(
      Object.entries(people).map(([key, p]) => [
        key,
        { userId: p.userId, sessionFile: p.file, expiresAt: p.expiresAt },
      ]),
    ),
  };
  const file = `.local/db/individual-demo-${randomUUID()}.json`;
  await writeFile(file, JSON.stringify(manifest, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(
    `本地合成演示已新增；任务与会话文件索引：${file}（无令牌正文）。`,
  );
  for (const [key, p] of Object.entries(people))
    console.log(`${key}: ${p.file}`);
  console.log(
    '在 http://127.0.0.1:5173/materials 的独立浏览器会话分别导入 organizer/reviewerA/reviewerB 文件；令牌约8小时过期。',
  );
}
main().catch((error) => {
  console.error(
    `失败步骤：${stage}；${error instanceof ApiError ? `HTTP ${error.status}` : '本地工具或传输失败'}`,
  );
  console.error(
    '本地演示初始化未完成。请核对 dev 数据库、已构建客户端和本地 API；可能留有新增合成资源，不自动回滚或删除历史。未输出凭据。',
  );
  process.exitCode = 1;
});
