import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile, appendFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { requireDocker } from './database.mjs';
await requireDocker();
const exec = promisify(execFile);
async function inside(url) {
  const code = `const r=await fetch(${JSON.stringify(url)},{headers:{Accept:'application/json'}});console.log(JSON.stringify({status:r.status,body:await r.text()}));`;
  const r = await exec('docker', [
    'exec',
    'caau-monitoring-notifier-1',
    'node',
    '-e',
    code,
  ]);
  return JSON.parse(r.stdout);
}
const traceId = randomBytes(16).toString('hex');
const spanId = randomBytes(8).toString('hex');
const now = BigInt(Date.now()) * 1000000n;
const response = await fetch('http://127.0.0.1:14318/v1/traces', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    resourceSpans: [
      {
        resource: {
          attributes: [
            {
              key: 'service.name',
              value: { stringValue: 'caau-synthetic-monitor-test' },
            },
          ],
        },
        scopeSpans: [
          {
            spans: [
              {
                traceId,
                spanId,
                name: 'governance.safe-probe',
                startTimeUnixNano: String(now),
                endTimeUnixNano: String(now + 1000000n),
                kind: 1,
              },
            ],
          },
        ],
      },
    ],
  }),
});
assert.equal(response.status, 200);
await mkdir('.local/monitoring/logs', { recursive: true });
await appendFile(
  '.local/monitoring/logs/probe.jsonl',
  JSON.stringify({
    event: 'synthetic.monitor.probe',
    traceId,
    at: new Date().toISOString(),
  }) + '\n',
  { mode: 0o600 },
);
let trace, logs;
for (let n = 0; n < 30; n++) {
  trace = await inside(`http://tempo:3200/api/traces/${traceId}`);
  logs = await inside(
    'http://loki:3100/loki/api/v1/query_range?query=' +
      encodeURIComponent('{app="caau-api"} |= "' + traceId + '"'),
  );
  if (
    trace.status === 200 &&
    logs.status === 200 &&
    logs.body.includes(traceId)
  )
    break;
  await delay(1000);
}
assert.equal(trace.status, 200, 'trace must be queryable');
assert.ok(logs.body.includes(traceId), 'safe file log must be queryable');
const status = {};
for (const [key, url] of Object.entries({
  tempo: 'http://tempo:3200/ready',
  loki: 'http://loki:3100/ready',
  prometheus: 'http://prometheus:9090/-/ready',
  grafana: 'http://grafana:3000/api/health',
})) {
  status[key] = (await inside(url)).status;
  assert.equal(status[key], 200);
}
await mkdir('.local/evidence/governance', { recursive: true });
await writeFile(
  '.local/evidence/governance/monitoring.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      synthetic: true,
      traceRoundtrip: true,
      fileLogRoundtrip: true,
      status,
    },
    null,
    2,
  ),
);
console.log(
  'Synthetic trace and file log roundtrip passed; Tempo/Loki/Prometheus/Grafana ready. Real API metrics and Feishu are separate acceptance.',
);
