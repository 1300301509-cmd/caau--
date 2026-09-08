import { createApiClient } from '@caau/api-client';
import { createFetchTransport } from '@caau/api-client/fetch';
export const client = createApiClient(
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000',
  createFetchTransport(),
);
