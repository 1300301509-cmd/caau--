import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../apps/miniapp/dist/', import.meta.url);
const app = JSON.parse(await readFile(new URL('app.json', root), 'utf8'));
assert.deepEqual(app.pages, ['pages/index/index']);
for (const file of [
  'app.js',
  'app.wxss',
  'pages/index/index.js',
  'pages/index/index.wxml',
]) {
  assert.ok(
    (await stat(new URL(file, root))).size > 0,
    `Missing/empty miniapp artifact: ${file}`,
  );
}
console.log(
  'WeChat miniapp build artifacts exist; this is NOT developer-tool or device acceptance.',
);
