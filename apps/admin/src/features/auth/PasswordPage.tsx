import { useState } from 'react';
import { Alert, Button, Card, Form, Input } from 'antd';
import { ApiError } from '@caau/api-client';
import { client, setCsrfToken } from '../materials/client';
import { useAuth } from './AuthContext';
import './accounts.css';

export function PasswordPage() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [bindingBusy, setBindingBusy] = useState(false);
  const [bindingError, setBindingError] = useState('');
  const [bindingToken, setBindingToken] = useState('');
  const [bindingExpiry, setBindingExpiry] = useState('');
  const organizer = auth.identity?.roles.includes('ORGANIZER');

  return (
    <div className="account-security-grid">
      <Card className="password-settings" title="修改登录密码">
        <p>
          修改成功后，其他设备和当前旧会话会立即失效；本设备将切换到新会话。
        </p>
        {error && <Alert type="error" showIcon message={error} />}
        {done && (
          <Alert
            type="success"
            showIcon
            message="密码已修改，安全会话已更新。"
          />
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
              setBindingToken('');
              setBindingExpiry('');
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

      {organizer && (
        <Card className="password-settings" title="绑定微信小程序">
          <p>
            生成一次性凭证后，在小程序登录页完成绑定。绑定后两端使用同一账号、机构权限和业务数据。
          </p>
          <Alert
            type="warning"
            showIcon
            message="凭证仅显示在当前页面，有效期10分钟；不要发送给无关人员。"
          />
          {bindingError && (
            <Alert type="error" showIcon message={bindingError} />
          )}
          {bindingToken && (
            <Form.Item
              label="一次性绑定凭证"
              extra={`有效至 ${new Date(bindingExpiry).toLocaleString('zh-CN')}`}
            >
              <Input.TextArea
                readOnly
                autoSize
                value={bindingToken}
                aria-label="一次性微信绑定凭证"
              />
            </Form.Item>
          )}
          <Button
            type="primary"
            loading={bindingBusy}
            onClick={() => {
              setBindingBusy(true);
              setBindingError('');
              setBindingToken('');
              void client
                .request('createWechatBindingIntent')
                .then((result) => {
                  setBindingToken(result.bindingToken);
                  setBindingExpiry(result.expiresAt);
                })
                .catch((reason: unknown) => {
                  setBindingError(
                    reason instanceof ApiError && reason.status === 409
                      ? '当前账号已经绑定微信，无需重复操作。'
                      : reason instanceof ApiError && reason.status === 503
                        ? '当前环境尚未配置微信小程序登录。'
                        : '暂时无法生成绑定凭证，请稍后重试。',
                  );
                })
                .finally(() => setBindingBusy(false));
            }}
          >
            {bindingToken ? '重新生成凭证' : '生成绑定凭证'}
          </Button>
        </Card>
      )}
    </div>
  );
}
