import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createHmac } from 'node:crypto';
import { startNotifier, feishuPayload } from './observability-notifier.mjs';

test('notification: signed delivery, deduplication, recovery and restart use a synthetic endpoint', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'caau-notifier-'));
  const received = [];
  const sink = createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    received.push(JSON.parse(body));
    res.setHeader('Content-Type', 'application/json');
    res.end('{"code":0}');
  });
  await new Promise((r) => sink.listen(0, '127.0.0.1', r));
  let notifier;
  const env = {
    CAAU_ALERT_TOKEN: 'a'.repeat(64),
    CAAU_NOTIFY_STATE: path.join(dir, 'state.json'),
    CAAU_NOTIFY_TEST_MODE: '1',
    CAAU_NOTIFY_PORT: '0',
    CAAU_NOTIFY_HOST: '127.0.0.1',
    CAAU_NOTIFY_TICK_MS: '20',
    CAAU_FEISHU_WEBHOOK: `http://127.0.0.1:${sink.address().port}`,
    CAAU_FEISHU_SIGNING_SECRET: 'synthetic',
  };
  try {
    notifier = await startNotifier(env);
    let base = `http://127.0.0.1:${notifier.server.address().port}`;
    const submit = (state) =>
      fetch(base + '/alerts', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + env.CAAU_ALERT_TOKEN },
        body: JSON.stringify({
          alerts: [
            {
              fingerprint: 'synthetic-1',
              status: state,
              labels: { severity: 'critical' },
              annotations: { summary: 'CAAU 合成故障' },
            },
          ],
        }),
      });
    assert.equal(
      (await fetch(base + '/alerts', { method: 'POST' })).status,
      403,
    );
    assert.equal((await submit('firing')).status, 202);
    for (let i = 0; i < 100 && received.length < 1; i++) await delay(20);
    assert.equal(received.length, 1);
    await submit('firing');
    await delay(80);
    assert.equal(received.length, 1);
    await submit('resolved');
    for (let i = 0; i < 100 && received.length < 2; i++) await delay(20);
    assert.equal(received.length, 2);
    assert.match(received[1].content.text, /已恢复/);
    const signed = feishuPayload(
      'CAAU 合成故障',
      'FIRING',
      'synthetic',
      1000000,
    );
    assert.equal(
      signed.sign,
      createHmac('sha256', '1000\nsynthetic').update('').digest('base64'),
    );
    await notifier.close();
    notifier = await startNotifier(env);
    base = `http://127.0.0.1:${notifier.server.address().port}`;
    await delay(80);
    assert.equal(received.length, 2);
  } finally {
    await notifier?.close();
    await new Promise((r) => sink.close(r));
    await rm(dir, { recursive: true, force: true });
  }
});
