import { operations as wire } from './generated/operations.js';
export {
  MaterialEditor,
  executionLabels,
  executionStatus,
  workflowError,
} from './material-editor.js';
export { sha256, uuidFromBytes } from './sha256.js';
export {
  IndividualWorkspace,
  type IndividualWorkspaceState,
  type IndividualSyncStatus,
} from './individual-workspace.js';
import type { operations } from './generated/schema.js';
export type { paths, components, operations } from './generated/schema.js';
export {
  AgentStreamInterruptedError,
  agentStreamPath,
  createAgentStreamDecoder,
  type AgentStreamInput,
  type AgentStreamReply,
} from './agent-stream.js';

export type RequestOptions = {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  timeout: number;
  header?: Record<string, string>;
  data?: unknown;
  responseType?: 'arraybuffer';
};
export type Transport = (
  options: RequestOptions,
) => Promise<{ status: number; data: unknown }>;
export type Health =
  operations['getHealth']['responses'][200]['content']['application/json'];
export type Ready =
  operations['getReadiness']['responses'][200]['content']['application/json'];
export type NotReady =
  operations['getReadiness']['responses'][503]['content']['application/json'];
type Success<K extends keyof typeof wire> =
  operations[K]['responses'][200]['content'] extends {
    'application/json': infer T;
  }
    ? T
    : ArrayBuffer;
type WireSchema = {
  type: string;
  nullable?: boolean;
  enum?: readonly unknown[];
  required?: readonly string[];
  properties?: Readonly<Record<string, WireSchema>>;
  items?: WireSchema;
};
type Input<K extends keyof typeof wire> = (operations[K] extends {
  requestBody: { content: { 'application/json': infer B } };
}
  ? { body: B }
  : operations[K] extends {
        requestBody: { content: { 'application/octet-stream': unknown } };
      }
    ? { body: ArrayBuffer }
    : { body?: never }) &
  (operations[K]['parameters'] extends { path: infer P }
    ? { path: P }
    : { path?: never }) &
  (operations[K]['parameters'] extends { query?: infer Q }
    ? { query?: Q }
    : { query?: never }) & { token?: string };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: NotReady['code'],
    public readonly detail?: unknown,
  ) {
    super(`接口返回 HTTP ${status}`);
    this.name = 'ApiError';
  }
}

function matches(schema: WireSchema, value: unknown): boolean {
  if (value === null && schema.nullable) return true;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === 'array')
    return (
      Array.isArray(value) &&
      !!schema.items &&
      value.every((v) => matches(schema.items!, v))
    );
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return false;
    const record = value as Record<string, unknown>;
    return (
      (schema.required ?? []).every((k) => k in record) &&
      Object.entries(schema.properties ?? {}).every(
        ([k, v]) => !(k in record) || matches(v, record[k]),
      )
    );
  }
  if (schema.type === 'integer') return Number.isInteger(value);
  return typeof value === schema.type;
}

export function isAgentReply(
  value: unknown,
): value is operations['sendAgentMessage']['responses'][200]['content']['application/json'] {
  return matches(wire.sendAgentMessage.responses[200], value);
}

// Handwritten transport facade. Paths, statuses, response types and wire enums
// are generated from Nest; there are no business rules or platform imports here.
export function createApiClient(baseUrl: string, transport: Transport) {
  async function request<K extends keyof typeof wire>(
    name: K,
    ...args: Input<K> extends { body: unknown } | { path: unknown }
      ? [input: Input<K>]
      : [input?: Input<K>]
  ): Promise<Success<K>> {
    const operation = wire[name];
    const input = args[0];
    const path = operation.path.replace(
      /\{([^}]+)\}/g,
      (_match, key: string) => {
        const value = (input?.path as Record<string, string> | undefined)?.[
          key
        ];
        if (!value) throw new Error('Missing path parameter');
        return encodeURIComponent(value);
      },
    );
    const query = Object.entries(
      (input?.query ?? {}) as Record<string, unknown>,
    )
      .filter(([, v]) => v !== undefined)
      .map(
        ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
      )
      .join('&');
    const response = await transport({
      url: baseUrl.replace(/\/$/, '') + path + (query ? `?${query}` : ''),
      method: operation.method,
      timeout:
        name === 'sendAgentMessage'
          ? 95000 // An optional 18s memory summary, 18s route and 45s chat, plus API overhead.
          : operation.requestMediaType === 'application/octet-stream'
            ? 15000
            : 5000,
      ...(operation.responseMediaType === 'application/octet-stream'
        ? { responseType: 'arraybuffer' as const }
        : {}),
      ...(input?.token
        ? {
            header: {
              Authorization: `Bearer ${input.token}`,
              'Content-Type': operation.requestMediaType,
            },
          }
        : input?.body
          ? { header: { 'Content-Type': operation.requestMediaType } }
          : {}),
      ...(input?.body ? { data: input.body } : {}),
    });
    if (response.status !== 200) {
      const unavailable =
        name === 'getReadiness' &&
        response.status === 503 &&
        matches(wire.getReadiness.responses[503], response.data);
      throw new ApiError(
        response.status,
        unavailable ? 'DATABASE_UNAVAILABLE' : undefined,
        response.status === 409 &&
        '409' in operation.responses &&
        matches(operation.responses['409'] as WireSchema, response.data)
          ? response.data
          : undefined,
      );
    }
    if (operation.responseMediaType === 'application/octet-stream') {
      if (!(response.data instanceof ArrayBuffer))
        throw new Error('接口二进制响应格式不符合生成契约');
      return response.data as Success<K>;
    }
    if (!matches(operation.responses[200], response.data))
      throw new Error('接口响应格式不符合生成契约');
    return response.data as Success<K>;
  }
  return {
    request,
    getHealth: () => request('getHealth'),
    getReadiness: () => request('getReadiness'),
  };
}
