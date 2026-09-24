import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function feishuPayload(title, state, secret, now = Date.now()) {
  const timestamp = String(Math.floor(now / 1000));
  return {
    ...(secret
      ? {
          timestamp,
          sign: createHmac('sha256', `${timestamp}\n${secret}`)
            .update('')
            .digest('base64'),
        }
      : {}),
    msg_type: 'text',
    content: {
      text: `CAAU 平台监控\n${state === 'RECOVERED' ? '故障已恢复' : '需要处理'}：${title}\n时间：${new Date(now).toISOString()}\n请登录总部平台治理中心核对。`,
    },
  };
}
export async function startNotifier(env = process.env) {
  const auth = env.CAAU_ALERT_TOKEN ?? '';
  if (auth.length < 32) throw new Error('CAAU_ALERT_TOKEN must be configured');
  const file =
    env.CAAU_NOTIFY_STATE ?? '.local/monitoring/notifier/notifications.json';
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  let state = {};
  try {
    state = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT')
      throw new Error('Notification state is unreadable', { cause: e });
  }
  let serial = Promise.resolve();
  const save = () => {
    const data = JSON.stringify(state);
    serial = serial
      .catch(() => undefined)
      .then(async () => {
        await writeFile(`${file}.tmp`, data, { mode: 0o600 });
        await rename(`${file}.tmp`, file);
      });
    return serial;
  };
  let sendFailures = 0,
    dropped = 0;
  const token = env.CAAU_MONITORING_TOKEN_FILE
    ? (await readFile(env.CAAU_MONITORING_TOKEN_FILE, 'utf8')).trim()
    : '';
  const webhook = env.CAAU_FEISHU_WEBHOOK;
  if (
    webhook &&
    !(
      new URL(webhook).protocol === 'https:' &&
      new URL(webhook).hostname === 'open.feishu.cn'
    ) &&
    env.CAAU_NOTIFY_TEST_MODE !== '1'
  )
    throw new Error('Invalid Feishu endpoint');
  const push = async () => {
    const now = Date.now();
    if (env.CAAU_API_BASE && token) {
      try {
        const r = await fetch(
          `${env.CAAU_API_BASE}/api/v1/observability/quota-signals`,
          {
            headers: { 'X-CAAU-Monitoring-Token': token },
            signal: AbortSignal.timeout(3000),
          },
        );
        if (r.ok)
          for (const a of await r.json()) {
            const old = state[a.fingerprint];
            if (
              (!old || old.state !== a.state || now - old.seen >= 1800000) &&
              Object.keys(state).length < 1000
            )
              state[a.fingerprint] = {
                title: a.title,
                state: a.state,
                severity: a.severity,
                seen: now,
                generation: (old?.generation ?? 0) + 1,
                delivered: 0,
                next: 0,
                attempts: 0,
              };
          }
      } catch {
        /* API failure does not block notification. */
      }
    }
    for (const [key, item] of Object.entries(state)) {
      if (now - item.seen > 90 * 86400000) {
        delete state[key];
        continue;
      }
      if (item.next > now || item.delivered === item.generation) continue;
      let delivered = item.feishuGeneration === item.generation,
        synced = !env.CAAU_API_BASE;
      if (webhook && !delivered) {
        try {
          const response = await fetch(webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              feishuPayload(
                item.title,
                item.state,
                env.CAAU_FEISHU_SIGNING_SECRET,
              ),
            ),
            signal: AbortSignal.timeout(5000),
          });
          const result = await response.json();
          delivered = response.ok && result.code === 0;
        } catch {
          /* Retry without logging credentials or provider content. */
        }
      }
      if (env.CAAU_API_BASE && token) {
        try {
          const response = await fetch(
            `${env.CAAU_API_BASE}/api/v1/observability/signals`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-CAAU-Monitoring-Token': token,
              },
              body: JSON.stringify({
                fingerprint: key,
                title: item.title,
                severity: item.severity,
                state: item.state,
                deliveryState: delivered
                  ? 'DELIVERED'
                  : webhook
                    ? 'FAILED'
                    : 'UNCONFIGURED',
                deliveryAttempts: item.attempts + 1,
              }),
              signal: AbortSignal.timeout(3000),
            },
          );
          synced = response.ok;
        } catch {
          /* API outage must not prevent external notification. */
        }
      }
      item.attempts++;
      if (delivered) {
        item.feishuDeliveredAt = now;
        item.feishuGeneration = item.generation;
      }
      if (!delivered) sendFailures++;
      if (delivered && synced) item.delivered = item.generation;
      item.next =
        now + Math.min(1800000, 1000 * 2 ** Math.min(item.attempts, 10));
    }
    await save();
  };
  let working = false;
  const timer = setInterval(
    () => {
      if (working) return;
      working = true;
      void push()
        .catch(() => {
          sendFailures++;
        })
        .finally(() => {
          working = false;
        });
    },
    Number(env.CAAU_NOTIFY_TICK_MS ?? 5000),
  );
  const server = createServer(async (req, res) => {
    if (req.url === '/metrics' && req.method === 'GET') {
      res.setHeader('Content-Type', 'text/plain');
      let backup = { success: false, at: null };
      if (env.CAAU_BACKUP_STATUS_PATH) {
        try {
          backup = JSON.parse(
            await readFile(env.CAAU_BACKUP_STATUS_PATH, 'utf8'),
          );
        } catch {
          /* unknown is not healthy */
        }
      }
      const backupAt = backup.at ? Date.parse(backup.at) / 1000 : 0;
      res.end(
        `caau_backup_success ${backup.success === true ? 1 : 0}\ncaau_backup_timestamp_seconds ${Number.isFinite(backupAt) ? backupAt : 0}\ncaau_notifier_failures_total ${sendFailures}\ncaau_notifier_dropped_total ${dropped}\ncaau_notifier_configured ${webhook ? 1 : 0}\ncaau_notifier_pending ${Object.values(state).filter((i) => i.delivered !== i.generation).length}\n`,
      );
      return;
    }
    const supplied = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (
      req.url !== '/alerts' ||
      req.method !== 'POST' ||
      supplied.length !== auth.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(auth))
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      let data = '';
      for await (const chunk of req) {
        data += chunk;
        if (data.length > 65536) throw new Error('too large');
      }
      const body = JSON.parse(data);
      if (!Array.isArray(body.alerts) || body.alerts.length > 100)
        throw new Error('Invalid alerts');
      for (const alert of body.alerts) {
        const key = String(alert.fingerprint ?? '');
        if (!/^[a-zA-Z0-9:._-]{1,200}$/.test(key))
          throw new Error('Invalid fingerprint');
        const title = String(
          alert.annotations?.summary ?? alert.labels?.alertname ?? '监控异常',
        ).slice(0, 200);
        // Only provisioned operational labels are accepted; never forward arbitrary content.
        if (!/^CAAU [\p{L}\p{N} ._%/：:（）()-]{1,190}$/u.test(title))
          throw new Error('Invalid summary');
        const nextState = alert.status === 'resolved' ? 'RECOVERED' : 'FIRING';
        const now = Date.now();
        const old = state[key];
        if (!old && Object.keys(state).length >= 1000) {
          dropped++;
          continue;
        }
        if (!old || old.state !== nextState || now - old.seen >= 1800000)
          state[key] = {
            title,
            state: nextState,
            severity:
              alert.labels?.severity === 'critical' ? 'CRITICAL' : 'WARNING',
            seen: now,
            generation: (old?.generation ?? 0) + 1,
            delivered: 0,
            next: 0,
            attempts: 0,
          };
      }
      await save();
      res.writeHead(202);
      res.end('accepted');
    } catch {
      res.writeHead(400);
      res.end('invalid alert');
    }
  });
  await new Promise((resolve) =>
    server.listen(
      Number(env.CAAU_NOTIFY_PORT ?? 9098),
      env.CAAU_NOTIFY_HOST ?? '0.0.0.0',
      resolve,
    ),
  );
  return {
    server,
    close: async () => {
      clearInterval(timer);
      await new Promise((resolve) => server.close(resolve));
      while (working) await new Promise((resolve) => setTimeout(resolve, 20));
      await serial;
    },
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  startNotifier().catch(() => {
    console.error(
      'Notification service could not start; check local configuration',
    );
    process.exitCode = 1;
  });
