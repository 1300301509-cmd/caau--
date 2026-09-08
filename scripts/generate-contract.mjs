import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import openapiTS, { astToString } from 'openapi-typescript';
import { format } from 'prettier';
import { createApplication } from '../apps/api/dist/application.js';
import { readConfig } from '../apps/api/dist/config.js';
import { createOpenApiDocument } from '../apps/api/dist/openapi.js';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sorted(value[key])]),
    );
  return value;
}

// No listening, environment files, DB connections, or external schema references.
const app = await createApplication(readConfig({}));
let spec;
try {
  spec = sorted(createOpenApiDocument(app));
} finally {
  await app.close();
}
assert.deepEqual(Object.keys(spec.paths), ['/api/v1/health', '/api/v1/ready']);
const metadata = {};
for (const [url, item] of Object.entries(spec.paths)) {
  assert.deepEqual(Object.keys(item), ['get']);
  const operation = item.get;
  assert.ok(operation.operationId && !metadata[operation.operationId]);
  const responses = {};
  for (const [status, response] of Object.entries(operation.responses)) {
    const reference = response.content?.['application/json']?.schema?.$ref;
    assert.ok(
      reference?.startsWith('#/components/schemas/'),
      'Only local DTO schema references are supported',
    );
    const schema = spec.components.schemas[reference.split('/').at(-1)];
    assert.equal(schema.type, 'object');
    for (const property of Object.values(schema.properties)) {
      assert.equal(property.type, 'string');
      assert.ok(
        Array.isArray(property.enum),
        'Extend generator deliberately when new wire shapes are approved',
      );
    }
    responses[status] = schema;
  }
  metadata[operation.operationId] = { path: url, method: 'GET', responses };
}
const header =
  '/** Generated from the Nest OpenAPI contract. DO NOT EDIT. */\n';
const outputs = {
  'packages/api-client/openapi.json': JSON.stringify(spec, null, 2) + '\n',
  'packages/api-client/src/generated/schema.ts':
    header + astToString(await openapiTS(spec)),
  'packages/api-client/src/generated/operations.ts':
    header +
    'export const operations = ' +
    JSON.stringify(metadata) +
    ' as const;\n',
};
for (const [relative, raw] of Object.entries(outputs)) {
  const target = path.join(root, relative);
  const output = await format(raw, {
    filepath: target,
    singleQuote: true,
    trailingComma: 'all',
  });
  if (process.argv.includes('--check')) {
    assert.equal(
      await readFile(target, 'utf8'),
      output,
      `${relative} is stale; run contract:generate`,
    );
  } else {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, output);
  }
}
console.log(
  process.argv.includes('--check')
    ? 'Contract and generated client metadata match Nest source.'
    : 'Generated OpenAPI, TypeScript contract and transport metadata.',
);
