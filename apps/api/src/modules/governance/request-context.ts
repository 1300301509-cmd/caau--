import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestScope {
  requestId: string;
  traceId?: string;
  actorId?: string;
  token?: string;
  sessionId?: string;
  taskId?: string;
  failureCategory?: string;
  usage?: {
    input: number;
    output: number;
    cached: number | null;
    providerRequestId: string | null;
  };
}
export const requestScope = new AsyncLocalStorage<RequestScope>();
export const requestId = () =>
  requestScope.getStore()?.requestId ?? randomUUID();
export function failureResult(status?: number) {
  return status === 401 || status === 403
    ? 'DENIED'
    : status === 409
      ? 'CONFLICT'
      : status && status < 500
        ? 'INVALID'
        : 'FAILED';
}
export function redact(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [已遮蔽]')
    .replace(/\bsk-[A-Za-z0-9._-]+/g, '[密钥已遮蔽]')
    .replace(
      /((?:api[_-]?key|password|secret|access[_-]?token|密码|密钥)\s*[=:：]\s*)[^\s,;，；]+/gi,
      '$1[已遮蔽]',
    );
}
