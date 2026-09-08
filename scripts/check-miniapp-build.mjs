import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../apps/miniapp/dist/', import.meta.url);
const app = JSON.parse(await readFile(new URL('app.json', root), 'utf8'));
assert.deepEqual(app.pages, [
  'pages/todo/index',
  'pages/events/index',
  'pages/profile/index',
  'pages/task/index',
  'pages/index/index',
]);
assert.deepEqual(
  app.tabBar.list.map((x) => x.text),
  ['待办', '赛事', '我的'],
);
for (const file of [
  'app.js',
  'app.wxss',
  ...app.pages.flatMap((page) => [`${page}.js`, `${page}.wxml`]),
]) {
  assert.ok(
    (await stat(new URL(file, root))).size > 0,
    `Missing/empty miniapp artifact: ${file}`,
  );
}
console.log(
  'WeChat miniapp build artifacts exist; this is NOT developer-tool or device acceptance.',
);
