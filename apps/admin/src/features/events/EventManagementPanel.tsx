import { useState } from 'react';
import { Alert, Button, Card, Modal, Tag } from 'antd';
import { ApiError, type components } from '@caau/api-client';

type EventView = components['schemas']['EventViewDto'];

export function EventManagementPanel({
  events,
  selectedId,
  onSelect,
  onCreate,
}: {
  events: EventView[];
  selectedId: string;
  onSelect: (id: string) => void;
  onCreate: (input: { name: string; description: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = events.find((event) => event.id === selectedId) ?? events[0];
  const close = () => {
    if (busy) return;
    setOpen(false);
    setError('');
  };
  return (
    <Card
      title="赛事管理"
      className="event-management-panel"
      extra={
        <Button type="primary" onClick={() => setOpen(true)}>
          创建赛事
        </Button>
      }
    >
      <p className="muted">
        当前仅支持赛事名称和说明。赛事级承办方尚未实现，访问授权不会显示为承办指派。
      </p>
      <div className="event-management-layout">
        <section aria-label="我管理的赛事" className="event-management-list">
          <h2>我管理的赛事</h2>
          {events.map((event) => (
            <button
              type="button"
              key={event.id}
              className={selected?.id === event.id ? 'selected' : ''}
              aria-pressed={selected?.id === event.id}
              onClick={() => onSelect(event.id)}
            >
              <strong>{event.name}</strong>
              <span>
                创建于{' '}
                {new Date(event.createdAt).toLocaleString('zh-CN', {
                  hour12: false,
                })}
              </span>
            </button>
          ))}
          {!events.length && (
            <div className="event-management-empty">
              <p>当前没有可管理的赛事。</p>
              <Button type="primary" onClick={() => setOpen(true)}>
                创建第一个赛事
              </Button>
            </div>
          )}
        </section>
        <section aria-label="赛事详情" className="event-management-detail">
          {selected ? (
            <>
              <div className="event-detail-title">
                <div>
                  <Tag color="blue">当前可管理</Tag>
                  <h2>{selected.name}</h2>
                </div>
                <a href={`/events?event=${selected.id}`}>打开赛事详情链接</a>
              </div>
              <dl>
                <div>
                  <dt>赛事说明</dt>
                  <dd>{selected.description}</dd>
                </div>
                <div>
                  <dt>创建时间</dt>
                  <dd>
                    <time dateTime={selected.createdAt}>
                      {new Date(selected.createdAt).toLocaleString('zh-CN', {
                        hour12: false,
                      })}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>赛事 ID</dt>
                  <dd>{selected.id}</dd>
                </div>
              </dl>
              <Alert
                type="info"
                showIcon
                title="承办方指派暂缓"
                description="当前没有赛事级承办关系。本页不会把 ORGANIZER 访问授权或材料任务经办指派显示为赛事承办方。"
              />
            </>
          ) : (
            <p>创建或选择赛事后在此查看详情。</p>
          )}
        </section>
      </div>
      <Modal
        title="创建赛事"
        open={open}
        onCancel={close}
        footer={null}
        destroyOnHidden
      >
        <form
          className="event-create-form"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setError('');
            void onCreate({ name, description })
              .then(() => {
                setOpen(false);
                setName('');
                setDescription('');
              })
              .catch((reason: unknown) => {
                setError(
                  reason instanceof ApiError
                    ? ({
                        400: '请填写有效的赛事名称和说明。',
                        401: '测试会话已失效，请重新进入身份后再试。',
                        403: '当前身份无权创建赛事。',
                        503: '服务暂不可用，请稍后重试。',
                      }[reason.status] ?? '创建失败，请重试。')
                    : '创建失败，请检查网络后重试。',
                );
              })
              .finally(() => setBusy(false));
          }}
        >
          {error && <Alert type="error" showIcon title={error} role="alert" />}
          <label htmlFor="event-name">赛事名称</label>
          <input
            id="event-name"
            required
            maxLength={120}
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <small>当前支持字段，最多120字。</small>
          <label htmlFor="event-description">赛事说明</label>
          <textarea
            id="event-description"
            required
            maxLength={2000}
            value={description}
            disabled={busy}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
          <small>当前支持字段，最多2000字。</small>
          <div className="actions">
            <Button onClick={close} disabled={busy}>
              取消
            </Button>
            <Button type="primary" htmlType="submit" loading={busy}>
              确认创建
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
