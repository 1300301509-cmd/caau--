import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, Button, Card, Form, Input, Spin } from 'antd';
import { ApiError, type components } from '@caau/api-client';
import { client, setCsrfToken } from '../materials/client';
import './auth.css';

type S = components['schemas'];
type Session = S['AuthenticationSessionDto'];
type Identity = S['WorkspaceIdentityDto'];
type Mode = 'checking' | 'formal' | 'local' | 'signed-out' | 'unavailable';
type AuthValue = {
  mode: Mode;
  session?: Session;
  identity?: Identity;
  expire: () => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | undefined>(undefined);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is required');
  return value;
}

function Login({ onSuccess }: { onSuccess: (session: Session) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async (values: { loginName: string; password: string }) => {
    setBusy(true);
    setMessage('');
    try {
      const session = await client.request('passwordLogin', { body: values });
      setCsrfToken(session.csrfToken);
      onSuccess(session);
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.status === 429
          ? '尝试次数过多，请稍后再试。'
          : error instanceof ApiError && error.status === 401
            ? '账号或密码错误。'
            : '暂时无法登录，请检查网络后重试。',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page">
      <section className="auth-brand-panel" aria-label="CAAU赛事协作平台">
        <div className="auth-brand-mark">CAAU</div>
        <p>中国大学生篮球联赛赛事协作平台</p>
        <h1>
          让每一场赛事，
          <br />
          从有序协作开始。
        </h1>
        <div className="auth-court" aria-hidden="true">
          <span />
          <i />
        </div>
      </section>
      <Card className="auth-card" bordered={false}>
        <p className="auth-kicker">HEADQUARTERS WORKSPACE</p>
        <h2>登录总部工作台</h2>
        <p className="auth-intro">
          使用管理员分配的正式账号登录。密码不会保存在浏览器中。
        </p>
        {message && <Alert type="error" showIcon message={message} />}
        <Form layout="vertical" requiredMark={false} onFinish={submit}>
          <Form.Item
            label="登录账号"
            name="loginName"
            rules={[{ required: true, message: '请输入登录账号' }]}
          >
            <Input autoComplete="username" autoFocus maxLength={64} />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password autoComplete="current-password" maxLength={128} />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={busy}
            data-testid="formal-login-submit"
          >
            登录
          </Button>
        </Form>
        <p className="auth-security-note">
          会话使用受保护的 HttpOnly Cookie；请勿在共享设备上保持登录。
        </p>
      </Card>
    </main>
  );
}

function ForcedPasswordChange({
  session,
  onChanged,
}: {
  session: Session;
  onChanged: (session: Session) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async (values: {
    currentPassword: string;
    newPassword: string;
    confirmation: string;
  }) => {
    if (values.newPassword !== values.confirmation) {
      setMessage('两次输入的新密码不一致。');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const changed = await client.request('changePassword', {
        body: {
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        },
      });
      setCsrfToken(changed.csrfToken);
      onChanged(changed);
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.status === 401
          ? '当前密码不正确。'
          : '密码修改失败，请稍后重试。',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page auth-change-page">
      <Card className="auth-card" bordered={false}>
        <p className="auth-kicker">FIRST SIGN-IN</p>
        <h1>设置你的新密码</h1>
        <p className="auth-intro">
          {session.displayName}
          ，首次登录或管理员重置后必须先更换临时密码，才能访问业务数据。
        </p>
        {message && <Alert type="error" showIcon message={message} />}
        <Form layout="vertical" requiredMark={false} onFinish={submit}>
          <Form.Item
            label="当前临时密码"
            name="currentPassword"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password autoComplete="current-password" maxLength={128} />
          </Form.Item>
          <Form.Item
            label="新密码"
            name="newPassword"
            extra="至少12个字符；建议使用独立的长密码。"
            rules={[{ required: true, min: 12, message: '新密码至少12个字符' }]}
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
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={busy}
            data-testid="forced-password-submit"
          >
            保存新密码并继续
          </Button>
        </Form>
      </Card>
    </main>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>('checking');
  const [session, setSession] = useState<Session>();
  const [identity, setIdentity] = useState<Identity>();
  const modeRef = useRef<Mode>('checking');
  modeRef.current = mode;
  const expire = useCallback(() => {
    setCsrfToken('');
    setSession(undefined);
    setIdentity(undefined);
    setMode('signed-out');
  }, []);
  const accept = useCallback(
    async (next: Session) => {
      setCsrfToken(next.csrfToken);
      setSession(next);
      setMode('formal');
      if (!next.mustChangePassword) {
        try {
          setIdentity(await client.request('getWorkspaceIdentity'));
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) expire();
          else setIdentity(undefined);
        }
      } else setIdentity(undefined);
    },
    [expire],
  );
  const refresh = useCallback(async () => {
    const next = await client.request('getAuthenticationSession');
    await accept(next);
  }, [accept]);
  useEffect(() => {
    let active = true;
    void client
      .request('getAuthenticationSession')
      .then(async (next) => {
        if (active) await accept(next);
      })
      .catch(async (error: unknown) => {
        if (!active) return;
        if (!(error instanceof ApiError) || error.status !== 401) {
          setMode('unavailable');
          return;
        }
        try {
          const authenticationMode = await client.request(
            'getAuthenticationMode',
          );
          if (!active) return;
          if (!authenticationMode.localIdentityEnabled) {
            setMode('signed-out');
            return;
          }
          await client.request('listLocalTestIdentities');
          if (active) setMode('local');
        } catch {
          if (active) setMode('unavailable');
        }
      });
    return () => {
      active = false;
    };
  }, [accept]);
  useEffect(() => {
    const invalid = () => {
      if (modeRef.current === 'formal') expire();
    };
    window.addEventListener('caau:unauthorized', invalid);
    return () => window.removeEventListener('caau:unauthorized', invalid);
  }, [expire]);
  const logout = useCallback(async () => {
    try {
      await client.request('passwordLogout');
    } finally {
      expire();
    }
  }, [expire]);
  const value = useMemo(
    () => ({ mode, session, identity, expire, refresh, logout }),
    [mode, session, identity, expire, refresh, logout],
  );

  if (location.pathname === '/system/health') return <>{children}</>;
  if (mode === 'checking')
    return (
      <div className="auth-loading">
        <Spin size="large" />
        <span>正在恢复安全会话…</span>
      </div>
    );
  if (mode === 'unavailable')
    return (
      <main className="auth-page auth-message">
        <Alert
          type="warning"
          showIcon
          message="暂时无法连接总部服务"
          description="请确认网络和API服务后刷新页面。"
          action={<Button onClick={() => location.reload()}>重新连接</Button>}
        />
      </main>
    );
  if (mode === 'signed-out')
    return <Login onSuccess={(next) => void accept(next)} />;
  if (mode === 'formal' && session?.mustChangePassword)
    return (
      <ForcedPasswordChange
        session={session}
        onChanged={(next) => void accept(next)}
      />
    );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
