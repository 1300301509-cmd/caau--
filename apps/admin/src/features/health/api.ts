export async function getHealth(
  baseUrl: string,
  request: typeof fetch = fetch,
) {
  const response = await request(
    `${baseUrl.replace(/\/$/, '')}/api/v1/health`,
    {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    },
  );
  if (!response.ok) throw new Error(`健康接口返回 HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (
    typeof data !== 'object' ||
    data === null ||
    !('status' in data) ||
    data.status !== 'ok' ||
    !('service' in data) ||
    data.service !== 'caau-api'
  ) {
    throw new Error('健康接口响应格式不符合约定');
  }
  return data;
}
