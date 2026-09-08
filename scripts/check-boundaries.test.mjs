import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  boundaryError,
  importSpecifiers,
  checkBoundaries,
} from './check-boundaries.mjs';

const root = path.resolve('/caau-fixture');
const frontend = path.join(root, 'apps/admin/src/app.ts');

test('allows local features and generated client, forbids cross-app/database imports', () => {
  assert.equal(boundaryError(root, frontend, './feature'), null);
  assert.equal(boundaryError(root, frontend, '@caau/api-client'), null);
  for (const specifier of [
    '../../api/src/main',
    '../../../database/client',
    '@caau/api',
    '@prisma/client',
    'pg',
    'node:fs',
  ]) {
    assert.ok(boundaryError(root, frontend, specifier), specifier);
  }
  assert.equal(
    boundaryError(
      root,
      path.join(root, 'apps/api/src/main.ts'),
      '@prisma/client',
    ),
    null,
  );
});

test('inspects static imports, re-exports, require, dynamic import and type imports', () => {
  assert.deepEqual(
    importSpecifiers(
      'fixture.ts',
      `
    import { x } from './one';
    export * from './two';
    const x = require('./three');
    import('./four');
    type Y = import('./five').Y;
    import(variable);
  `,
    ),
    ['./one', './two', './three', './four', './five', '<computed-import>'],
  );
});

test('current application and package manifests/imports follow the repository boundary', async () => {
  assert.deepEqual((await checkBoundaries(process.cwd())).errors, []);
});
