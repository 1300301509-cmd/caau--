import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import test from 'node:test';
import { createDatabase } from '../dist/index.js';

async function listener() {
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, sockets, port: server.address().port };
}

test('missing configuration stays not ready and invalid URLs are sanitized', async () => {
  const db = createDatabase();
  assert.equal(await db.check(), false);
  await db.close();
  assert.throws(() => createDatabase('synthetic-invalid-secret'), {
    message: 'Invalid DATABASE_URL configuration',
  });
});

test('real TCP connection refusal is bounded and safe to close repeatedly', async () => {
  const { server, port } = await listener();
  await new Promise((resolve) => server.close(resolve));
  const db = createDatabase(
    `postgresql://synthetic_user:synthetic_password@127.0.0.1:${port}/synthetic_db`,
  );
  const start = performance.now();
  try {
    assert.equal(await db.check(), false);
    assert.ok(performance.now() - start < 2500);
  } finally {
    await db.close();
    await db.close();
  }
  assert.equal(await db.check(), false);
});

test('TCP server with no PostgreSQL handshake times out; concurrent probes share one query', async () => {
  const { server, sockets, port } = await listener();
  const db = createDatabase(
    `postgresql://synthetic_user:synthetic_password@127.0.0.1:${port}/synthetic_db`,
  );
  const start = performance.now();
  try {
    const first = db.check();
    assert.equal(db.check(), first);
    assert.equal(await first, false);
    assert.ok(performance.now() - start < 2500);
  } finally {
    for (const socket of sockets) socket.destroy();
    await db.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
