import { operations as wire } from './generated/operations.js';
import type { operations } from './generated/schema.js';
export type { paths, components, operations } from './generated/schema.js';

export type RequestOptions = { url: string; method: 'GET'; timeout: number };
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
  operations[K]['responses'][200]['content']['application/json'];
type WireSchema = {
  required: readonly string[];
  properties: Readonly<Record<string, { enum: readonly string[] }>>;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: NotReady['code'],
  ) {
    super(`接口返回 HTTP ${status}`);
    this.name = 'ApiError';
  }
}

function matches(
  schema: WireSchema,
  value: unknown,
): value is Record<string, string> {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return schema.required.every((key) => {
    const property = schema.properties[key];
    return (
      typeof record[key] === 'string' &&
      property?.enum.includes(record[key]) === true
    );
  });
}

// Handwritten transport facade. Paths, statuses, response types and wire enums
// are generated from Nest; there are no business rules or platform imports here.
export function createApiClient(baseUrl: string, transport: Transport) {
  async function request<K extends keyof typeof wire>(
    name: K,
  ): Promise<Success<K>> {
    const operation = wire[name];
    const response = await transport({
      url: baseUrl.replace(/\/$/, '') + operation.path,
      method: operation.method,
      timeout: 5000,
    });
    if (response.status !== 200) {
      const unavailable =
        name === 'getReadiness' &&
        response.status === 503 &&
        matches(wire.getReadiness.responses[503], response.data);
      throw new ApiError(
        response.status,
        unavailable ? 'DATABASE_UNAVAILABLE' : undefined,
      );
    }
    if (!matches(operation.responses[200], response.data))
      throw new Error('接口响应格式不符合生成契约');
    return response.data as Success<K>;
  }
  return {
    getHealth: () => request('getHealth'),
    getReadiness: () => request('getReadiness'),
  };
}
