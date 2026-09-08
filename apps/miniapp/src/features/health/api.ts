export type HealthRequest = (options: {
  url: string;
  method: 'GET';
  timeout: number;
}) => Promise<{ statusCode: number; data: unknown }>;

export async function getHealth(baseUrl: string, request: HealthRequest) {
  const response = await request({
    url: `${baseUrl.replace(/\/$/, '')}/api/v1/health`,
    method: 'GET',
    timeout: 5000,
  });
  if (response.statusCode !== 200) {
    throw new Error(`健康接口返回 HTTP ${response.statusCode}`);
  }
  const data = response.data;
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
