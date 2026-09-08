import type { Transport } from './index.js';

// This entry is for browser/standard-fetch environments only. It is not
// imported by the Taro adapter or the package's platform-neutral entry.
export function createFetchTransport(request: typeof fetch = fetch): Transport {
  return async ({ url, method, timeout, header, data: body }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await request(url, {
        method,
        headers: header,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store',
      });
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        data = undefined;
      }
      return { status: response.status, data };
    } finally {
      clearTimeout(timer);
    }
  };
}
