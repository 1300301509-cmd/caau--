import { useEffect, useState } from 'react';
import { Alert, Button, Card, Tag } from 'antd';
import { type components } from '@caau/api-client';
import { client } from '../materials/client';
import { EventManagementPanel } from './EventManagementPanel';
import { useAuth } from '../auth/AuthContext';
import './event.css';

type S = components['schemas'];
const tabSessionKey = 'caau.local-test-session';

export function EventPage() {
  const auth = useAuth();
  const [choices, setChoices] = useState<S['LocalIdentityChoiceDto'][]>([]);
  const [identityKey, setIdentityKey] = useState('');
  const [identity, setIdentity] = useState<S['WorkspaceIdentityDto']>();
  const [token, setToken] = useState('');
  const [events, setEvents] = useState<S['EventViewDto'][]>([]);
  const [selectedId, setSelectedId] = useState(
    () => new URLSearchParams(location.search).get('event') ?? '',
  );
  const [entryState, setEntryState] = useState<
    'loading' | 'enabled' | 'formal' | 'disabled' | 'unavailable'
  >(auth.mode === 'formal' ? 'formal' : 'loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const clear = () => {
    sessionStorage.removeItem(tabSessionKey);
    setToken('');
    setIdentity(undefined);
    setEvents([]);
    setSelectedId('');
  };
  const load = async (session: string) => {
    const [nextIdentity, nextEvents] = await Promise.all([
      client.request('getWorkspaceIdentity', { token: session }),
      client.request('listEvents', { token: session }),
    ]);
    if (
      auth.mode === 'local' &&
      sessionStorage.getItem(tabSessionKey) !== session
    )
      return;
    setToken(session);
    setIdentity(nextIdentity);
    setEvents(nextEvents);
    setSelectedId((current) =>
      nextEvents.some((event) => event.id === current)
        ? current
        : (nextEvents[0]?.id ?? ''),
    );
  };
  useEffect(() => {
    let active = true;
    if (auth.mode === 'formal') {
      setEntryState('formal');
      setBusy(true);
      void load('')
        .catch(() => setError('赛事信息暂时无法读取，请稍后重试。'))
        .finally(() => setBusy(false));
      return () => {
        active = false;
      };
    }
    void client
      .request('listLocalTestIdentities')
      .then(async (nextChoices) => {
        if (!active) return;
        setChoices(nextChoices);
        setIdentityKey(nextChoices[0]?.key ?? '');
        setEntryState('enabled');
        const session = sessionStorage.getItem(tabSessionKey);
        if (!session) return;
        setBusy(true);
        try {
          await load(session);
        } catch {
          if (active) {
            clear();
            setError('测试会话已失效，请重新选择身份进入。');
          }
        } finally {
          if (active) setBusy(false);
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;
        clear();
        setEntryState(
          reason instanceof Error && 'status' in reason && reason.status === 503
            ? 'disabled'
            : 'unavailable',
        );
      });
    return () => {
      active = false;
    };
  }, [auth.mode]);

  const manager =
    identity?.roles.includes('EVENT_MANAGER') &&
    !identity.roles.includes('ORGANIZER');
  return (
    <div className="event-page">
      {entryState === 'loading' && <Card loading title="本地测试身份" />}
      {entryState === 'disabled' && (
        <Alert
          type="info"
          showIcon
          title="本地测试身份入口未启用"
          description="请在本地测试模式启用后刷新页面。"
        />
      )}
      {entryState === 'unavailable' && (
        <Alert
          type="warning"
          showIcon
          title="暂时无法连接本地 API"
          description="确认 API 服务运行后刷新页面重试。"
        />
      )}
      {entryState === 'formal' && error && (
        <Alert type="error" showIcon title={error} role="alert" />
      )}
      {entryState === 'enabled' && (
        <Card
          title={identity ? identity.displayName : '选择本地测试身份'}
          extra={<Tag color="gold">仅限本地测试</Tag>}
          className="event-identity-card"
        >
          <p className="muted">
            由后端签发并校验测试会话；身份保存在当前标签页，刷新后可恢复。
          </p>
          <div className="event-identity-entry">
            <label>
              测试身份
              <select
                value={identityKey}
                disabled={busy}
                onChange={(event) => setIdentityKey(event.currentTarget.value)}
              >
                {choices.map((choice) => (
                  <option key={choice.key} value={choice.key}>
                    {choice.displayName} · {choice.organizationName}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="primary"
              loading={busy}
              disabled={!identityKey}
              onClick={() => {
                setBusy(true);
                setError('');
                clear();
                void client
                  .request('createLocalTestSession', {
                    body: {
                      identity:
                        identityKey as S['LocalSessionRequestDto']['identity'],
                    },
                  })
                  .then(async (session) => {
                    sessionStorage.setItem(tabSessionKey, session.token);
                    await load(session.token);
                  })
                  .catch(() => {
                    clear();
                    setError(
                      '无法进入该身份，请确认本地 API、数据库和身份状态后重试。',
                    );
                  })
                  .finally(() => setBusy(false));
              }}
            >
              进入
            </Button>
            {identity && (
              <Button disabled={busy} onClick={clear}>
                退出
              </Button>
            )}
          </div>
          {error && <Alert type="error" showIcon title={error} role="alert" />}
        </Card>
      )}
      {identity && !manager && (
        <Alert
          type="error"
          showIcon
          title="当前身份无赛事管理权限"
          description="赛事创建和管理仅向总部赛事管理员开放。请退出并选择总部赛事管理员。"
          role="alert"
        />
      )}
      {identity && manager && (
        <EventManagementPanel
          events={events}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            history.replaceState(null, '', `/events?event=${id}`);
          }}
          onCreate={async (input) => {
            const session = auth.mode === 'formal' ? '' : token;
            const created = await client.request('createEvent', {
              token: session,
              body: input,
            });
            if (
              auth.mode === 'local' &&
              sessionStorage.getItem(tabSessionKey) !== session
            )
              throw new Error('Identity changed');
            setEvents((current) => [
              created,
              ...current.filter((event) => event.id !== created.id),
            ]);
            setSelectedId(created.id);
            history.replaceState(null, '', `/events?event=${created.id}`);
          }}
        />
      )}
    </div>
  );
}
