import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { requireDocker, root, run } from './database.mjs';
import path from 'node:path';

const dir = path.join(root, '.local/monitoring');
async function create(name, content, mode = 0o600) {
  try {
    await writeFile(path.join(dir, name), content, { flag: 'wx', mode });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
}
await mkdir(dir, { recursive: true, mode: 0o700 });
const command = process.argv[2] ?? 'status';
if (command === 'setup') {
  await mkdir(path.join(dir, 'logs'), { recursive: true, mode: 0o700 });
  await mkdir(path.join(dir, 'notifier'), { recursive: true, mode: 0o700 });
  await create(
    'backup-status.json',
    JSON.stringify({ success: null, at: null }),
    0o644,
  );
  await create('monitoring.token', randomBytes(32).toString('hex'), 0o644);
  await create(
    'runtime.env',
    `CAAU_ALERT_TOKEN=${randomBytes(32).toString('hex')}\nCAAU_MONITOR_UID=${process.getuid?.() ?? 1000}\nCAAU_MONITOR_GID=${process.getgid?.() ?? 1000}\n# CAAU_FEISHU_WEBHOOK=\n# CAAU_FEISHU_SIGNING_SECRET=\n`,
  );
  await create(
    'api.env',
    `CAAU_MONITORING_TOKEN=${(await readFile(path.join(dir, 'monitoring.token'), 'utf8')).trim()}\nCAAU_OTEL_ENDPOINT=http://127.0.0.1:14318/v1/traces\nCAAU_GRAFANA_PUBLIC_PATH=/ops/grafana/\nCAAU_LOG_PATH=${path.join(dir, 'logs/api.jsonl')}\n`,
  );
  console.log('已准备忽略的 .local/monitoring 配置；未打印密钥，未启动服务。');
} else {
  await requireDocker();
  const args = [
    'compose',
    '--env-file',
    path.join(dir, 'runtime.env'),
    '-f',
    path.join(root, 'deploy/compose.monitoring.yml'),
  ];
  if (command === 'up') await run('docker', [...args, 'up', '-d']);
  else if (command === 'stop') await run('docker', [...args, 'stop']);
  else if (command === 'status') await run('docker', [...args, 'ps']);
  else if (command === 'validate')
    await run('docker', [...args, 'config', '--quiet']);
  else throw new Error('Use setup, up, stop, status or validate');
}
