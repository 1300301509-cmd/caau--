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
function resolveSchema(schema) {
  if (schema.$ref) {
    assert.ok(schema.$ref.startsWith('#/components/schemas/'));
    return resolveSchema(
      spec.components.schemas[schema.$ref.split('/').at(-1)],
    );
  }
  assert.ok(
    ['object', 'array', 'string', 'boolean', 'integer', 'number'].includes(
      schema.type,
    ),
    'Unsupported schema shape',
  );
  if (schema.type === 'object')
    return {
      ...schema,
      properties: Object.fromEntries(
        Object.entries(schema.properties ?? {}).map(([key, value]) => [
          key,
          resolveSchema(value),
        ]),
      ),
    };
  if (schema.type === 'array')
    return { ...schema, items: resolveSchema(schema.items) };
  return schema;
}
const metadata = {};
for (const [url, item] of Object.entries(spec.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    assert.ok(['get', 'post', 'patch', 'delete'].includes(method));
    assert.ok(operation.operationId && !metadata[operation.operationId]);
    const responses = {};
    for (const [status, response] of Object.entries(operation.responses)) {
      const schema = response.content?.['application/json']?.schema;
      if (schema) responses[status] = resolveSchema(schema);
    }
    assert.ok(
      responses['200'],
      'Current facade requires a documented 200 success',
    );
    metadata[operation.operationId] = {
      path: url,
      method: method.toUpperCase(),
      responses,
      parameters: operation.parameters ?? [],
      body: operation.requestBody
        ? resolveSchema(
            operation.requestBody.content['application/json'].schema,
          )
        : null,
      authenticated: (operation.security?.length ?? 0) > 0,
    };
  }
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
