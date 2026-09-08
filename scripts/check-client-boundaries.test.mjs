import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { boundaryError } from './check-boundaries.mjs';

test('portable generated-contract package cannot become a transitive Node/server dependency', () => {
  const root = path.resolve('/caau-fixture');
  const client = path.join(root, 'packages/api-client/src/index.ts');
  for (const module of [
    'node:fs',
    'http',
    'pg',
    '@nestjs/common',
    '@prisma/client',
    '@caau/database',
    '../../../database/src/index',
  ]) {
    assert.ok(boundaryError(root, client, module), module);
  }
  assert.equal(boundaryError(root, client, './generated/schema.js'), null);
  assert.ok(
    boundaryError(
      root,
      path.join(root, 'database/src/index.ts'),
      '@caau/api-client',
    ),
  );
});
