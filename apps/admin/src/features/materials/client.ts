import { createApiClient } from '@caau/api-client';
import {
  createFetchTransport,
  streamAgentMessageFetch,
} from '@caau/api-client/fetch';
import type { AgentStreamInput } from '@caau/api-client';

let csrfToken = '';
export function setCsrfToken(value: string) {
  csrfToken = value;
}

const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000';
export const client = createApiClient(
  baseUrl,
  createFetchTransport(undefined, {
    csrfToken: () => csrfToken,
    onUnauthorized: () =>
      window.dispatchEvent(new CustomEvent('caau:unauthorized')),
  }),
);

export function streamAgentMessage(
  sessionId: string,
  body: AgentStreamInput,
  token: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
) {
  return streamAgentMessageFetch({
    baseUrl,
    sessionId,
    body,
    token: token || undefined,
    csrfToken: csrfToken || undefined,
    onUnauthorized: () =>
      window.dispatchEvent(new CustomEvent('caau:unauthorized')),
    onDelta,
    signal,
  });
}
