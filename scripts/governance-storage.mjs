import { lstat, opendir } from 'node:fs/promises';
import path from 'node:path';

// Metadata only: never open object contents, follow symlinks or remove files.
export async function scanPrivateStorage(directory, records, limit = 100000) {
  const root = await lstat(directory).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!root) return { status: 'NOT_CONFIGURED', at: new Date().toISOString() };
  if (!root.isDirectory() || root.isSymbolicLink())
    throw new Error('Unsafe private file root');
  if (records.length > limit)
    throw new Error('Storage scan record limit exceeded');
  const registered = new Map(records.map((r) => [r.key, r]));
  const found = new Set();
  const result = {
    status: 'COMPLETE',
    at: new Date().toISOString(),
    registered: records.length,
    files: 0,
    bytes: 0,
    unregistered: 0,
    missingConfirmed: 0,
    sizeMismatch: 0,
    unsafeEntries: 0,
  };
  const directoryHandle = await opendir(directory);
  let examined = 0;
  for await (const entry of directoryHandle) {
    if (++examined > limit) throw new Error('Storage scan file limit exceeded');
    if (!/^[a-f0-9-]{36}$/.test(entry.name)) {
      result.unsafeEntries++;
      continue;
    }
    const info = await lstat(path.join(directory, entry.name)).catch((e) => {
      if (e.code === 'ENOENT') return null;
      throw e;
    });
    if (!info) continue;
    if (!info.isFile() || info.isSymbolicLink()) {
      result.unsafeEntries++;
      continue;
    }
    result.files++;
    result.bytes += info.size;
    found.add(entry.name);
    const record = registered.get(entry.name);
    if (!record) result.unregistered++;
    else if (record.confirmed && info.size !== record.bytes)
      result.sizeMismatch++;
  }
  for (const record of records)
    if (record.confirmed && !found.has(record.key)) result.missingConfirmed++;
  return result;
}

export async function registeredObjects(db) {
  return (
    await db.query(`SELECT * FROM (
    SELECT "storageKey" key, "expectedBytes" bytes, state='CONFIRMED' confirmed FROM "FileUpload"
    UNION ALL SELECT "storageKey", "expectedBytes", state='CONFIRMED' FROM "TemplateUpload"
    UNION ALL SELECT "storageKey", "expectedBytes", state='CONFIRMED' FROM "IndividualUpload"
    UNION ALL SELECT "storageKey", "expectedBytes", state='CONFIRMED' FROM "HostingApplicationUpload"
    UNION ALL SELECT "objectKey", "expectedBytes", state IN ('CONFIRMED','REMOVED') FROM "EventSupplyPhoto"
  ) objects LIMIT 100001`)
  ).rows;
}
