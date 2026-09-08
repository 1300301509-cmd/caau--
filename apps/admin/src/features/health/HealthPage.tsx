import { useState } from 'react';
import { Alert, Button, Card, Space, Typography } from 'antd';
import { getHealth, getReadiness } from './api';

const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000';

export function HealthPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string }>();

  async function checkConnection(database = false) {
    setLoading(true);
    setResult(undefined);
    try {
      if (database) await getReadiness(baseUrl);
      else await getHealth(baseUrl);
      setResult({
        ok: true,
        message: database
          ? '数据库连接就绪（不代表业务表已迁移）'
          : '已连接 caau-api，服务状态正常',
      });
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : '请求失败',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="health-page">
      <Card>
        <Space orientation="vertical" size="large">
          <Typography.Title level={1}>CAAU 工程连接检查</Typography.Title>
          <Typography.Paragraph>
            存活与数据库连接分别检查，不代表业务功能或小程序真机验收通过。
          </Typography.Paragraph>
          <Typography.Text code>{baseUrl}/api/v1/health</Typography.Text>
          <Button
            type="primary"
            loading={loading}
            onClick={() => void checkConnection()}
          >
            检查后端连接
          </Button>
          <Button disabled={loading} onClick={() => void checkConnection(true)}>
            检查数据库就绪
          </Button>
          <div aria-live="polite">
            {result && (
              <Alert
                type={result.ok ? 'success' : 'error'}
                title={result.message}
                showIcon
              />
            )}
          </div>
        </Space>
      </Card>
    </main>
  );
}
