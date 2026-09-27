import type { RequestOptions, Transport } from './index.js';
import {
  agentStreamPath,
  AgentStreamInterruptedError,
  createAgentStreamDecoder,
  ApiError,
  type AgentStreamInput,
  type AgentStreamReply,
} from './index.js';

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

export type TaroChunkRequest = (options: {
  url: string;
  method: 'POST';
  data: AgentStreamInput;
  header: Record<string, string>;
  enableChunked: true;
  responseType: 'arraybuffer';
  dataType: 'text';
  timeout: number;
}) => PromiseLike<{ statusCode: number; data: unknown }> & {
  onChunkReceived(callback: (result: { data: ArrayBuffer }) => void): void;
  abort(): void;
};

export async function streamAgentMessageTaro(
  options: {
    baseUrl: string;
    sessionId: string;
    body: AgentStreamInput;
    token: string;
    onDelta: (text: string) => void;
    signal?: AbortSignal;
  },
  request: TaroChunkRequest,
): Promise<AgentStreamReply> {
  const decoder = createAgentStreamDecoder(options.onDelta);
  let received = false;
  let chunkFailure: unknown;
  const task = request({
    url:
      options.baseUrl.replace(/\/$/, '') + agentStreamPath(options.sessionId),
    method: 'POST',
    data: options.body,
    header: {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson',
      Authorization: `Bearer ${options.token}`,
    },
    enableChunked: true,
    responseType: 'arraybuffer',
    dataType: 'text',
    timeout: 95000,
  });
  const cancel = () => task.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) task.abort();
  task.onChunkReceived(({ data }) => {
    received = true;
    try {
      decoder.push(data);
    } catch (error) {
      chunkFailure = error;
      task.abort();
    }
  });
  try {
    let response: { statusCode: number; data: unknown };
    try {
      response = await task;
    } catch (error) {
      throw chunkFailure ?? error;
    }
    if (chunkFailure) throw chunkFailure;
    if (response.statusCode !== 200) throw new ApiError(response.statusCode);
    // Some Taro runtimes do not deliver onChunkReceived. Their final binary
    // response is still valid; it simply appears all at once.
    if (!received) {
      if (!(response.data instanceof ArrayBuffer))
        throw new Error('小程序流式回复格式无效');
      decoder.push(response.data);
    }
    return decoder.finish();
  } catch (error) {
    if (error instanceof ApiError || options.signal?.aborted) throw error;
    throw new AgentStreamInterruptedError();
  } finally {
    options.signal?.removeEventListener('abort', cancel);
  }
}
