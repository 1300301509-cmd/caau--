import type { RequestOptions, Transport } from './index.js';

// Structural interface: no Nest, Prisma, Node, fetch, or Taro runtime dependency.
export type TaroRequest = (
  options: RequestOptions,
) => Promise<{ statusCode: number; data: unknown }>;
export function createTaroTransport(request: TaroRequest): Transport {
  return async (options) => {
    const response = await request(options);
    return { status: response.statusCode, data: response.data };
  };
}
