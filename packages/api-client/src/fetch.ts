import type { Transport } from './index.js';

// This entry is for browser/standard-fetch environments only. It is not
// imported by the Taro adapter or the package's platform-neutral entry.
export function createFetchTransport(
  request: typeof fetch = fetch,
  authentication: { csrfToken?: () => string | undefined } = {},
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
