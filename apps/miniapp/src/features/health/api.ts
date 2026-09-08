import { createApiClient } from '@caau/api-client';
import { createTaroTransport, type TaroRequest } from '@caau/api-client/taro';

export type HealthRequest = TaroRequest;
export function getHealth(baseUrl: string, request: TaroRequest) {
  return createApiClient(baseUrl, createTaroTransport(request)).getHealth();
}

export function getReadiness(baseUrl: string, request: TaroRequest) {
  return createApiClient(baseUrl, createTaroTransport(request)).getReadiness();
}
