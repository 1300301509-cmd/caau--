import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkDocLinks } from './check-doc-links.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'caau-doc-links-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('checks relative files and directories without fetching external URLs', async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'docs'));
  await writeFile(path.join(root, 'docs', '说明.md'), '# Local target\n');
  await writeFile(
    path.join(root, 'README.md'),
    '[file](docs/说明.md#section) [dir](docs/) [remote](https://example.invalid/) [anchor](#local)\n',
  );
  assert.deepEqual(await checkDocLinks(root), {
    files: 2,
    checked: 2,
    errors: [],
  });
});

test('reports missing targets rather than treating an empty check as success', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'README.md'), '[broken](missing.md)\n');
  const result = await checkDocLinks(root);
  assert.equal(result.checked, 1);
  assert.deepEqual(result.errors, ['README.md: missing missing.md']);
});

test('excludes dependency directories and fenced examples', async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'node_modules'));
  await writeFile(
    path.join(root, 'node_modules', 'README.md'),
    '[dependency link](missing.md)\n',
  );
  await writeFile(
    path.join(root, 'README.md'),
    '# Example\n\n```md\n[example](not-a-real-file.md)\n```\n',
  );
  assert.deepEqual(await checkDocLinks(root), {
    files: 1,
    checked: 0,
    errors: [],
  });
});
