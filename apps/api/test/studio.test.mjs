import assert from 'node:assert/strict';
import test from 'node:test';
import { assertStudioEnvironment } from '../dist/studio/guard.js';
import { AiService } from '../dist/modules/ai/ai.service.js';
import { RuleAgentModelAdapter } from '../dist/modules/ai/model-adapter.js';

test('Studio exposes the same staged read-only query branch as the API service', () => {
  const service = new AiService({}, new RuleAgentModelAdapter(), {});
  const graph = service.createStudioGraph('synthetic-token').getGraph();
  const names = Object.keys(graph.nodes);
  for (const node of [
    'intent_router',
    'plan_query',
    'execute_query',
    'save_query',
    'plan_requirements',
    'save_requirements',
    'generate_candidate',
    'validate_candidate',
    'prepare_task',
    'deterministic_preview',
  ])
    assert.ok(names.includes(node), `${node} must be visible in Studio`);
  assert.ok(
    graph.edges.some(
      (edge) => edge.source === 'plan_query' && edge.target === 'execute_query',
    ),
  );
  assert.ok(
    graph.edges.some(
      (edge) => edge.source === 'execute_query' && edge.target === 'save_query',
    ),
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === 'plan_requirements' &&
        edge.target === 'save_requirements',
    ),
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === 'generate_candidate' &&
        edge.target === 'validate_candidate',
    ),
  );
  assert.ok(!names.some((name) => /confirm|publish|save_schedule/i.test(name)));
});

test('Studio rejects development/remote databases and cloud tracing', () => {
  const allowed = {
    CAAU_STUDIO: '1',
    CAAU_IDENTITY_MODE: 'local',
    LANGSMITH_TRACING: 'false',
    LANGCHAIN_TRACING_V2: 'false',
    DATABASE_URL:
      'postgresql://caau_test_app:example@127.0.0.1:15433/caau_studio_0123456789abcdef0123456789abcdef',
  };
  assert.doesNotThrow(() => assertStudioEnvironment(allowed));
  for (const change of [
    { CAAU_STUDIO: undefined },
    { NODE_ENV: 'production' },
    { CAAU_IDENTITY_MODE: 'disabled' },
    { LANGSMITH_TRACING: 'true' },
    { DATABASE_URL: allowed.DATABASE_URL.replace('15433', '15432') },
    {
      DATABASE_URL: allowed.DATABASE_URL.replace('127.0.0.1', 'db.example.com'),
    },
    {
      DATABASE_URL: allowed.DATABASE_URL.replace(
        /caau_studio_.+$/,
        'caau_test',
      ),
    },
    {
      DATABASE_URL: allowed.DATABASE_URL.replace(
        'caau_test_app',
        'caau_test_owner',
      ),
    },
  ])
    assert.throws(() => assertStudioEnvironment({ ...allowed, ...change }));
});
