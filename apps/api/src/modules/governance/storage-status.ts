import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

export function storageStatus(
  databaseUrl?: string,
): Record<string, string | number> {
  const file =
    process.env.CAAU_STORAGE_STATUS_FILE ??
    new URL(
      '../../../../../.local/monitoring/storage-status.json',
      import.meta.url,
    );
  try {
    if (!databaseUrl) return { status: 'NOT_CONFIGURED' };
    const source = new URL(databaseUrl);
    const sourceHash = createHash('sha256')
      .update(`${source.hostname}:${source.port}${source.pathname}`)
      .digest('hex');
    if (statSync(file).size > 16384) return { status: 'INVALID' };
    const value = JSON.parse(readFileSync(file, 'utf8')) as Record<
      string,
      unknown
    >;
    if (value.source !== sourceHash) return { status: 'NOT_CONFIGURED' };
    const at = typeof value.at === 'string' ? Date.parse(value.at) : NaN;
    if (!Number.isFinite(at) || value.status !== 'COMPLETE')
      return { status: 'NOT_CONFIGURED' };
    const result: Record<string, string | number> = {
      status: Date.now() - at > 86400000 ? 'STALE' : 'COMPLETE',
      at: new Date(at).toISOString(),
    };
    for (const key of [
      'registered',
      'files',
      'bytes',
      'unregistered',
      'missingConfirmed',
      'sizeMismatch',
      'unsafeEntries',
    ]) {
      if (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0)
        return { status: 'INVALID' };
      result[key] = Number(value[key]);
    }
    return result;
  } catch {
    return { status: 'NOT_CONFIGURED' };
  }
}
