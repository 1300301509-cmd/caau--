import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { scanPrivateStorage } from './governance-storage.mjs';

test('private storage scan detects missing/size/orphan metadata, never follows links or deletes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'caau-storage-'));
  try {
    const good = randomUUID(),
      orphan = randomUUID(),
      missing = randomUUID(),
      link = randomUUID();
    await writeFile(path.join(root, good), 'synthetic');
    await writeFile(path.join(root, orphan), 'orphan');
    await symlink(path.join(root, good), path.join(root, link));
    const result = await scanPrivateStorage(root, [
      { key: good, confirmed: true, bytes: 123 },
      { key: missing, confirmed: true, bytes: 1 },
      { key: randomUUID(), confirmed: false, bytes: 1 },
    ]);
    assert.equal(result.files, 2);
    assert.equal(result.bytes, 15);
    assert.equal(result.unregistered, 1);
    assert.equal(result.missingConfirmed, 1);
    assert.equal(result.sizeMismatch, 1);
    assert.equal(result.unsafeEntries, 1);
    assert.equal((await readdir(root)).length, 3);
    assert.doesNotMatch(
      JSON.stringify(result),
      new RegExp(`${good}|${orphan}|${missing}|synthetic`),
    );
    await assert.rejects(scanPrivateStorage(root, [], 1), /limit exceeded/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
