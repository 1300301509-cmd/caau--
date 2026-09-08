import Taro from '@tarojs/taro';
import {
  createApiClient,
  uuidFromBytes,
  type components,
} from '@caau/api-client';
import { createTaroTransport } from '@caau/api-client/taro';
export const client = createApiClient(
  __API_BASE_URL__,
  createTaroTransport((options) => Taro.request<unknown>(options)),
);
export const session: {
  token: string;
  identity?: components['schemas']['WorkspaceIdentityDto'];
} = { token: '' };
export async function newKey() {
  const result = await Taro.getRandomValues({ length: 16 });
  return uuidFromBytes(result.randomValues);
}
export function readBytes(filePath: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) =>
    Taro.getFileSystemManager().readFile({
      filePath,
      success: (r) =>
        typeof r.data === 'string'
          ? reject(new Error('Expected bytes'))
          : resolve(r.data),
      fail: reject,
    }),
  );
}
export async function importSession(value: string) {
  const token = value.trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid token');
  const identity = await client.request('getWorkspaceIdentity', { token });
  if (!identity.roles.includes('ORGANIZER'))
    throw new Error('请使用承办方本地测试身份');
  session.token = token;
  session.identity = identity;
}
