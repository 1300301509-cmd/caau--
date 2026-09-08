import { createApiClient } from '@caau/api-client';
import { createFetchTransport } from '@caau/api-client/fetch';

export function getHealth(baseUrl: string, request: typeof fetch = fetch) {
  return createApiClient(baseUrl, createFetchTransport(request)).getHealth();
}

export function getReadiness(baseUrl: string, request: typeof fetch = fetch) {
  return createApiClient(baseUrl, createFetchTransport(request)).getReadiness();
}
