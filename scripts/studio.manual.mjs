// Explicit real-Qwen acceptance against an already running disposable Studio.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { databaseEnvironment, root } from './database.mjs';
import path from 'node:path';

const current = JSON.parse(
  await readFile(path.join(root, '.local/studio/current.json'), 'utf8'),
);
assert.match(current.database, /^caau_studio_[a-f0-9]{32}$/);
const base = `http://127.0.0.1:${current.port}`;
async function api(route, body) {
  const response = await fetch(base + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(90000),
  });
  assert.equal(response.status, 200, route);
  const value = await response.json();
  assert.ok(
    !value.__error__,
    `Studio run failed: ${value.__error__?.error ?? 'unknown'}`,
  );
  return value;
}
const assistants = await api('/assistants/search', { limit: 10 });
const assistant = assistants.find((item) => item.graph_id === 'caau_agent');
assert.ok(assistant);
const graph = await api(`/assistants/${assistant.assistant_id}/graph`);
assert.ok(graph.nodes.some((node) => node.id === 'deterministic_preview'));
assert.ok(!graph.nodes.some((node) => /confirm|publish/.test(node.id)));
const schemas = await api(`/assistants/${assistant.assistant_id}/schemas`);
assert.ok(schemas.input_schema.properties.message);
const env = await databaseEnvironment('test');
const url = new URL(env.MIGRATION_DATABASE_URL);
url.pathname = `/${current.database}`;
const sql = new pg.Client({ connectionString: url.href });
await sql.connect();
const counts = async () =>
  (
    await sql.query(
      'SELECT (SELECT count(*)::int FROM "EventScheduleVersion") AS versions, (SELECT count(*)::int FROM "AgentCommandReceipt") AS receipts',
    )
  ).rows[0];
try {
  const baseline = await counts();
  const thread = await api('/threads', {});
  let sessionId;
  for (const [message, expected] of [
    ['你好，请只用一句话回答。', 'CHAT'],
    ['把周六第二场比赛移到周日，场地保持不变。', 'NEED_PARAMETERS'],
    ['上午十点', 'PREVIEW'],
    ['再晚半小时', 'PREVIEW'],
  ]) {
    const state = await api(`/threads/${thread.thread_id}/runs/wait`, {
      assistant_id: assistant.assistant_id,
      input: { message },
    });
    sessionId ??= state.sessionId;
    assert.equal(state.sessionId, sessionId);
    const status = state.kind === 'CHAT' ? state.reply.status : state.status;
    assert.equal(status, expected);
    const serialized = JSON.stringify(state);
    assert.ok(
      !/"(?:token|apiKey|authorization|databaseUrl)"\s*:/i.test(serialized),
    );
    if (message === '再晚半小时') {
      assert.equal(
        state.reply.task.preview.after.startAt,
        '2027-06-06T02:30:00.000Z',
      );
    }
    console.log(
      JSON.stringify({
        message,
        status,
        sessionId,
        threadId: thread.thread_id,
      }),
    );
  }
  assert.deepEqual(await counts(), baseline);
  console.log(
    'PASS: real Qwen Studio chat, same-thread three-turn preview, no schedule versions/receipts added.',
  );
} finally {
  await sql.end();
}
