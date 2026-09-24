import { appendFile, stat, rename, unlink } from 'node:fs/promises';
import { statfsSync } from 'node:fs';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { requestScope } from './request-context.js';
import { randomUUID } from 'node:crypto';
import { storageStatus } from './storage-status.js';

const counters = new Map<string, number>(
  [
    'caau_http_requests_total',
    'caau_http_errors_total',
    'caau_audit_failures_total',
    'caau_model_tokens_total',
    'caau_log_dropped_total',
  ].map((k) => [k, 0]),
);
let pendingLogs = 0;
let logQueue = Promise.resolve();
function logLine(value: string) {
  const file = process.env.CAAU_LOG_PATH;
  if (!file) return;
  if (pendingLogs >= 1000) {
    count('caau_log_dropped_total');
    return;
  }
  pendingLogs++;
  logQueue = logQueue
    .then(async () => {
      const previous = await stat(file).catch(() => null);
      if (
        previous &&
        (previous.size > 16 * 1024 * 1024 ||
          previous.mtime.toISOString().slice(0, 10) !==
            new Date().toISOString().slice(0, 10))
      ) {
        for (let n = 4; n >= 1; n--)
          await rename(
            n === 1 ? file : `${file}.${n - 1}`,
            `${file}.${n}`,
          ).catch(() => undefined);
      }
      for (let n = 1; n <= 4; n++) {
        const old = await stat(`${file}.${n}`).catch(() => null);
        if (old && Date.now() - old.mtimeMs > 30 * 86400000)
          await unlink(`${file}.${n}`);
      }
      await appendFile(file, value + '\n', { mode: 0o600 });
    })
    .catch(() => {
      count('caau_log_dropped_total');
    })
    .finally(() => {
      pendingLogs--;
    });
}
export async function traceStep<T>(
  action: string,
  work: () => Promise<T>,
): Promise<T> {
  return governanceTracer.startActiveSpan(
    'business.' + action,
    async (span) => {
      const scope = requestScope.getStore();
      if (scope) span.setAttribute('caau.request_id', scope.requestId);
      try {
        return await work();
      } catch (e) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw e;
      } finally {
        span.end();
      }
    },
  );
}
export function count(name: string, amount = 1) {
  counters.set(name, (counters.get(name) ?? 0) + amount);
}
export function prometheusMetrics() {
  const storage = storageStatus(process.env.DATABASE_URL);
  const storageMetrics =
    typeof storage.bytes === 'number'
      ? `caau_private_storage_bytes ${storage.bytes}\ncaau_private_storage_files ${storage.files}\ncaau_private_storage_anomalies ${Number(storage.unregistered) + Number(storage.missingConfirmed) + Number(storage.sizeMismatch) + Number(storage.unsafeEntries)}\ncaau_private_storage_sample_seconds ${Date.parse(String(storage.at)) / 1000}\n`
      : '';
  let disk: string;
  try {
    const s = statfsSync(process.cwd());
    disk = `caau_disk_used_ratio ${1 - s.bavail / s.blocks}\n`;
  } catch {
    disk = 'caau_disk_probe_failed 1\n';
  }
  return (
    storageMetrics +
    disk +
    [...counters.entries()]
      .map(([k, v]) => `${k} ${v}`)
      .concat([
        `caau_process_uptime_seconds ${process.uptime()}`,
        `caau_process_resident_memory_bytes ${process.memoryUsage().rss}`,
        `caau_process_heap_bytes ${process.memoryUsage().heapUsed}`,
      ])
      .join('\n') +
    '\n'
  );
}
export const governanceTracer = trace.getTracer('caau-governance');
export function requestMiddleware(
  req: { method?: string; route?: { path?: string } },
  res: {
    statusCode: number;
    setHeader(k: string, v: string): void;
    once(event: string, fn: () => void): void;
  },
  next: () => void,
) {
  const start = performance.now();
  const requestId = randomUUID();
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Request-Id', requestId);
  governanceTracer.startActiveSpan('http.request', (span) => {
    const candidateTraceId = span.spanContext().traceId;
    const traceId = /^0+$/.test(candidateTraceId)
      ? undefined
      : candidateTraceId;
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      const elapsed = (performance.now() - start) / 1000;
      const status = res.statusCode;
      count('caau_http_requests_total');
      if (status >= 500) count('caau_http_errors_total');
      count('caau_http_duration_seconds_sum', elapsed);
      count('caau_http_duration_seconds_count');
      for (const bound of [0.1, 0.5, 1, 2, 5, 15, 60])
        if (elapsed <= bound)
          count(`caau_http_duration_seconds_bucket{le="${bound}"}`);
      count('caau_http_duration_seconds_bucket{le="+Inf"}');
      span.setAttributes({
        'http.request.method': req.method ?? 'UNKNOWN',
        'http.route': req.route?.path ?? 'unmatched',
        'http.response.status_code': status,
        'caau.request_id': requestId,
      });
      if (status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
      const line = JSON.stringify({
        at: new Date().toISOString(),
        event: 'http.complete',
        requestId,
        traceId,
        status,
        elapsedMs: Math.round(elapsed * 1000),
        route: req.route?.path ?? 'unmatched',
      });
      logLine(line);
    };
    res.once('finish', end);
    res.once('close', end);
    requestScope.run(
      { requestId, traceId: traceId === '0'.repeat(32) ? undefined : traceId },
      next,
    );
  });
}
