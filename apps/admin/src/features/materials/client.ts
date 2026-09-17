import { createApiClient } from '@caau/api-client';
import { createFetchTransport } from '@caau/api-client/fetch';

let csrfToken = '';
export function setCsrfToken(value: string) {
  csrfToken = value;
}

export const client = createApiClient(
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000',
  createFetchTransport(undefined, {
    csrfToken: () => csrfToken,
    onUnauthorized: () =>
      window.dispatchEvent(new CustomEvent('caau:unauthorized')),
  }),
);
