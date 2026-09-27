import type { Transport } from './index.js';
import {
  agentStreamPath,
  AgentStreamInterruptedError,
  createAgentStreamDecoder,
  ApiError,
  type AgentStreamInput,
  type AgentStreamReply,
} from './index.js';

export async function streamAgentMessageFetch(options: {
  baseUrl: string;
  sessionId: string;
  body: AgentStreamInput;
  token?: string;
  csrfToken?: string;
  onUnauthorized?: () => void;
  onDelta: (text: string) => void;
  signal?: AbortSignal;
  request?: typeof fetch;
}): Promise<AgentStreamReply> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(cancel, 95000);
  try {
    const response = await (options.request ?? fetch)(
      options.baseUrl.replace(/\/$/, '') + agentStreamPath(options.sessionId),
      {
        method: 'POST',
        credentials: options.token ? 'omit' : 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/x-ndjson',
          ...(options.token
            ? { Authorization: `Bearer ${options.token}` }
            : options.csrfToken
              ? { 'X-CSRF-Token': options.csrfToken }
              : {}),
        },
        body: JSON.stringify(options.body),
        signal: controller.signal,
        cache: 'no-store',
      },
    );
    if (response.status === 401) options.onUnauthorized?.();
    if (response.status !== 200) throw new ApiError(response.status);
    if (!response.body) throw new Error('浏览器不支持流式回复');
    const decoder = createAgentStreamDecoder(options.onDelta);
    const reader = response.body.getReader();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        decoder.push(chunk.value);
      }
      return decoder.finish();
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (error instanceof ApiError || options.signal?.aborted) throw error;
    throw new AgentStreamInterruptedError();
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}

// This entry is for browser/standard-fetch environments only. It is not
// imported by the Taro adapter or the package's platform-neutral entry.
export function createFetchTransport(
  request: typeof fetch = fetch,
  authentication: {
    csrfToken?: () => string | undefined;
    onUnauthorized?: () => void;
  } = {},
): Transport {
  return async ({ url, method, timeout, header, data: body, responseType }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const bearer = !!header?.Authorization;
      const csrfToken = !bearer ? authentication.csrfToken?.() : undefined;
      const response = await request(url, {
        method,
        credentials: bearer ? 'omit' : 'include',
        headers: {
          ...header,
          ...(csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
            ? { 'X-CSRF-Token': csrfToken }
            : {}),
        },
        body:
          body === undefined
            ? undefined
            : body instanceof ArrayBuffer
              ? body
              : JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store',
      });
      if (response.status === 401) authentication.onUnauthorized?.();
      let data: unknown;
      try {
        data =
          responseType === 'arraybuffer' && response.status === 200
            ? await response.arrayBuffer()
            : await response.json();
      } catch {
        data = undefined;
      }
      return { status: response.status, data };
    } finally {
      clearTimeout(timer);
    }
  };
}
