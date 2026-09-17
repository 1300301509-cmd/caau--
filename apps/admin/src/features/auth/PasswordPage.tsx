import { useState } from 'react';
import { Alert, Button, Card, Form, Input } from 'antd';
import { ApiError } from '@caau/api-client';
import { client, setCsrfToken } from '../materials/client';
import { useAuth } from './AuthContext';

export function PasswordPage() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  return (
    <Card className="password-settings" title="修改登录密码">
      <p>修改成功后，其他设备和当前旧会话会立即失效；本设备将切换到新会话。</p>
      {error && <Alert type="error" showIcon message={error} />}
      {done && (
        <Alert type="success" showIcon message="密码已修改，安全会话已更新。" />
      )}
      <Form
        layout="vertical"
        requiredMark={false}
        onFinish={async (values: {
          currentPassword: string;
          newPassword: string;
          confirmation: string;
        }) => {
          if (values.newPassword !== values.confirmation) {
            setError('两次输入的新密码不一致。');
            return;
          }
          setBusy(true);
          setError('');
          setDone(false);
          try {
            const session = await client.request('changePassword', {
              body: {
                currentPassword: values.currentPassword,
                newPassword: values.newPassword,
              },
            });
            setCsrfToken(session.csrfToken);
            await auth.refresh();
            setDone(true);
          } catch (reason) {
            setError(
              reason instanceof ApiError && reason.status === 401
                ? '当前密码不正确。'
                : '密码修改失败，请稍后重试。',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <Form.Item
          label="当前密码"
          name="currentPassword"
          rules={[{ required: true, message: '请输入当前密码' }]}
        >
          <Input.Password autoComplete="current-password" maxLength={128} />
        </Form.Item>
        <Form.Item
          label="新密码"
          name="newPassword"
          extra="至少12个字符，且不能与当前密码相同。"
          rules={[{ required: true }, { min: 12, message: '至少12个字符' }]}
        >
          <Input.Password autoComplete="new-password" maxLength={128} />
        </Form.Item>
        <Form.Item
          label="确认新密码"
          name="confirmation"
          rules={[{ required: true, message: '请再次输入新密码' }]}
        >
          <Input.Password autoComplete="new-password" maxLength={128} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={busy}>
          保存新密码
        </Button>
      </Form>
    </Card>
  );
}
