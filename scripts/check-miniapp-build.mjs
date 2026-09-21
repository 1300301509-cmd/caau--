import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../apps/miniapp/dist/', import.meta.url);
const app = JSON.parse(await readFile(new URL('app.json', root), 'utf8'));
assert.deepEqual(app.pages, [
  'pages/login/index',
  'pages/home/index',
  'pages/staff/index',
  'pages/competition-hub/index',
  'pages/competition-teams/index',
  'pages/competition-schedule/index',
  'pages/competition-supplies/index',
  'pages/competition-situation/index',
  'pages/hosting/index',
  'pages/hosting-hub/index',
  'pages/hosting-progress/index',
  'pages/event-materials/index',
  'pages/event-info/index',
  'pages/materials/index',
  'pages/progress/index',
  'pages/profile/index',
  'pages/task/index',
  'pages/index/index',
]);
assert.deepEqual(
  app.tabBar.list.map(({ pagePath, text }) => ({ pagePath, text })),
  [
    { pagePath: 'pages/home/index', text: '首页' },
    { pagePath: 'pages/profile/index', text: '我的' },
  ],
);
for (const file of [
  'app.js',
  'app.wxss',
  ...app.tabBar.list.flatMap((tab) => [tab.iconPath, tab.selectedIconPath]),
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
