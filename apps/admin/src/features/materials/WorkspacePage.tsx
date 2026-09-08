import { useRef, useState } from 'react';
import { Alert, Button, Card, Modal, Tag, Typography } from 'antd';
import { ApiError, createApiClient } from '@caau/api-client';
import { createFetchTransport } from '@caau/api-client/fetch';
import { AssignmentForm } from './AssignmentForm';
import { RequirementsEditor } from './RequirementsEditor';
import {
  roleNames,
  type Directory,
  type Event,
  type Identity,
  type Task,
} from './types';

const client = createApiClient(
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000',
  createFetchTransport(),
);
const emptyDirectory: Directory = { users: [], organizations: [], members: [] };
export function WorkspacePage() {
  const [token, setToken] = useState('');
  const [identity, setIdentity] = useState<Identity>();
  const [directory, setDirectory] = useState<Directory>(emptyDirectory);
  const [events, setEvents] = useState<Event[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [eventId, setEventId] = useState('');
  const [selected, setSelected] = useState<Task>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string }>();
  const [publishConfirm, setPublishConfirm] = useState(false);
  const manager =
    identity?.roles.includes('EVENT_MANAGER') &&
    !identity.roles.includes('ORGANIZER');
  const administrator = identity?.roles.includes('SYSTEM_ADMIN');
  async function run(work: () => Promise<void>, success?: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice(undefined);
    try {
      await work();
      if (success) setNotice({ error: false, text: success });
    } catch (error) {
      setNotice({
        error: true,
        text:
          error instanceof ApiError
            ? ({
                400: '配置不完整或格式不正确，请检查字段。',
                401: '会话已失效，请重新导入本地会话。',
                403: '当前身份无权访问或操作此资源。',
                409: '任务已变更或已发布受保护，请刷新后确认。',
                503: '服务或审计不可用，操作未确认成功，请刷新核实后重试。',
              }[error.status] ?? error.message)
            : '操作失败，请检查本地会话文件或网络后重试。',
      });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function refresh(session = token, user = identity) {
    const [newEvents, newTasks, newDirectory] = await Promise.all([
      client.request('listEvents', { token: session }),
      client.request('listMaterialTasks', { token: session }),
      user?.roles.some((r) => r === 'EVENT_MANAGER' || r === 'SYSTEM_ADMIN') &&
      !user.roles.includes('ORGANIZER')
        ? client.request('getWorkspaceDirectory', { token: session })
        : Promise.resolve(emptyDirectory),
    ]);
    setEvents(newEvents);
    setTasks(newTasks);
    setDirectory(newDirectory);
  }
  async function loadTask(id: string) {
    setSelected(
      await client.request('getMaterialTask', { token, path: { id } }),
    );
  }
  function clear() {
    setToken('');
    setIdentity(undefined);
    setDirectory(emptyDirectory);
    setTasks([]);
    setEvents([]);
    setSelected(undefined);
    setEventId('');
  }
  const person = (memberId: string) => {
    const m = directory.members.find((x) => x.id === memberId);
    return (
      directory.users.find((u) => u.id === m?.userId)?.displayName ??
      '当前任务指派人员'
    );
  };
  return (
    <main className="workspace">
      <header className="workspace-header">
        <div>
          <Typography.Text>CAAU · 总部工作台</Typography.Text>
          <Typography.Title level={1}>赛事与材料任务</Typography.Title>
          <p>创建赛事，明确责任，发布可追溯的材料要求。</p>
        </div>
        <a href="/">工程连接检查</a>
      </header>
      <Alert
        type="info"
        showIcon
        title="本地测试身份 · 非微信登录"
        description="本段仅创建、指派和发布任务；材料上传、提交与审核尚未开放。会话仅保存在当前页面内存。"
      />
      <Card
        title={
          identity
            ? `${identity.displayName} · ${identity.roles.map((r) => roleNames[r]).join(' / ')}`
            : '导入本地会话'
        }
      >
        <div className="actions">
          <label>
            本地会话 JSON 文件
            <input
              type="file"
              accept="application/json,.json"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                void run(async () => {
                  clear();
                  if (file.size > 4096) throw new Error('Invalid session file');
                  const data: unknown = JSON.parse(await file.text());
                  if (
                    !data ||
                    typeof data !== 'object' ||
                    !('token' in data) ||
                    typeof data.token !== 'string' ||
                    !/^[A-Za-z0-9_-]{43}$/.test(data.token)
                  )
                    throw new Error('Invalid session');
                  const user = await client.request('getWorkspaceIdentity', {
                    token: data.token,
                  });
                  await refresh(data.token, user);
                  setToken(data.token);
                  setIdentity(user);
                }, '本地身份已载入');
              }}
            />
          </label>
          {identity && (
            <>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await refresh();
                    if (selected) await loadTask(selected.id);
                  }, '已刷新当前权限与数据')
                }
              >
                刷新数据
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    try {
                      await client.request('logout', { token });
                    } finally {
                      clear();
                    }
                  }, '本地会话已退出')
                }
              >
                退出会话
              </Button>
            </>
          )}
        </div>
      </Card>
      <div aria-live="polite">
        {notice && (
          <Alert
            type={notice.error ? 'error' : 'success'}
            showIcon
            title={notice.text}
          />
        )}
      </div>
      {administrator && (
        <Card title="账号与组织登记">
          <p>
            系统管理员仅管理身份，不自动获得赛事资料。登记后使用本地身份工具为测试用户发放会话。
          </p>
          <div className="form-grid">
            <form
              className="workflow-form"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const displayName = String(new FormData(form).get('name'));
                void run(async () => {
                  await client.request('createInternalUser', {
                    token,
                    body: { displayName },
                  });
                  await refresh();
                  form.reset();
                }, '内部用户已创建');
              }}
            >
              <label>
                用户姓名
                <input required maxLength={80} name="name" />
              </label>
              <Button aria-label="登记用户" htmlType="submit" loading={busy}>
                登记用户
              </Button>
            </form>
            <form
              className="workflow-form"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const name = String(new FormData(form).get('name'));
                void run(async () => {
                  await client.request('createOrganization', {
                    token,
                    body: { name },
                  });
                  await refresh();
                  form.reset();
                }, '组织已创建');
              }}
            >
              <label>
                组织名称
                <input required maxLength={120} name="name" />
              </label>
              <Button aria-label="登记组织" htmlType="submit" loading={busy}>
                登记组织
              </Button>
            </form>
          </div>
          <form
            className="workflow-form"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void run(async () => {
                await client.request('createOrganizationMember', {
                  token,
                  body: {
                    userId: String(d.get('user')),
                    organizationId: String(d.get('org')),
                    role: String(d.get('role')) as
                      | 'EVENT_MANAGER'
                      | 'ORGANIZER'
                      | 'REVIEWER'
                      | 'SYSTEM_ADMIN',
                  },
                });
                await refresh();
              }, '成员角色已登记');
            }}
          >
            <div className="form-grid">
              <label>
                成员用户
                <select aria-label="成员用户" name="user" required>
                  <option value="">请选择用户</option>
                  {directory.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}（{u.id}）
                    </option>
                  ))}
                </select>
              </label>
              <label>
                所属组织
                <select aria-label="所属组织" name="org" required>
                  <option value="">请选择组织</option>
                  {directory.organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                成员角色
                <select aria-label="成员角色" name="role" required>
                  <option value="">请选择角色</option>
                  {Object.entries(roleNames).map(([role, name]) => (
                    <option key={role} value={role}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Button aria-label="登记成员角色" htmlType="submit" loading={busy}>
              登记成员角色
            </Button>
          </form>
        </Card>
      )}
      {manager && (
        <Card title="1 · 创建赛事">
          <form
            className="workflow-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const d = new FormData(form);
              void run(async () => {
                const created = await client.request('createEvent', {
                  token,
                  body: {
                    name: String(d.get('name')),
                    description: String(d.get('description')),
                  },
                });
                setEventId(created.id);
                setSelected(undefined);
                await refresh();
                form.reset();
              }, '赛事已创建，可以指派材料任务');
            }}
          >
            <label>
              赛事名称
              <input required name="name" maxLength={120} />
            </label>
            <label>
              赛事说明
              <textarea required name="description" maxLength={2000} />
            </label>
            <Button
              aria-label="创建赛事"
              type="primary"
              htmlType="submit"
              loading={busy}
            >
              创建赛事
            </Button>
          </form>
        </Card>
      )}
      {identity && (
        <Card title="赛事列表">
          <label>
            当前赛事
            <select
              aria-label="当前赛事"
              value={eventId}
              disabled={busy}
              onChange={(e) => {
                setEventId(e.target.value);
                setSelected(undefined);
              }}
            >
              <option value="">请选择赛事</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </label>
          {events.length === 0 && (
            <p>
              暂无当前身份可见的赛事。承办方仅可见已发布且指派给自己的任务所属赛事。
            </p>
          )}
          {events.find((e) => e.id === eventId)?.description && (
            <p>{events.find((e) => e.id === eventId)?.description}</p>
          )}
        </Card>
      )}
      {manager && eventId && (
        <Card title="2 · 指派并创建任务草案">
          <AssignmentForm
            key={eventId}
            directory={directory}
            busy={busy}
            submit={(values) =>
              void run(async () => {
                const task = await client.request('createMaterialTask', {
                  token,
                  body: { ...values, eventId },
                });
                setSelected(task);
                await refresh();
              }, '任务草案已创建，请配置材料要求后发布')
            }
          />
        </Card>
      )}
      {identity && eventId && (
        <Card title="材料任务">
          <div className="task-list">
            {tasks
              .filter((t) => t.eventId === eventId)
              .map((task) => (
                <div key={task.id} className="task-row">
                  <div>
                    <strong>{task.title}</strong>{' '}
                    <Tag
                      color={task.state === 'PUBLISHED' ? 'green' : 'default'}
                    >
                      {task.state === 'PUBLISHED' ? '已发布' : '总部草案'}
                    </Tag>
                    <p>
                      修订 {task.revision}
                      {task.requirementVersion
                        ? ` · 要求 V${task.requirementVersion}`
                        : ' · 尚未发布要求'}
                    </p>
                  </div>
                  <Button
                    disabled={busy}
                    onClick={() => void run(() => loadTask(task.id))}
                  >
                    查看 {task.title}
                  </Button>
                </div>
              ))}
            {!tasks.some((t) => t.eventId === eventId) && <p>暂无可见任务。</p>}
          </div>
        </Card>
      )}
      {selected && (
        <Card title={`任务详情 · ${selected.title}`}>
          <p>
            {selected.state === 'PUBLISHED'
              ? `已发布 · 要求 V${selected.requirementVersion} · ${new Date(selected.publishedAt!).toLocaleString()}`
              : `总部草案 · 修订 ${selected.revision} · 承办方暂不可见`}
          </p>
          {directory.members.length > 0 && (
            <p>
              承办机构：
              {
                directory.organizations.find(
                  (o) => o.id === selected.organizationId,
                )?.name
              }{' '}
              · 经办人：{person(selected.handlerMemberId)} · 审核员：
              {person(selected.reviewerMemberId)}
            </p>
          )}
          {selected.state === 'DRAFT' && manager ? (
            <>
              <details>
                <summary>调整发布前指派</summary>
                <AssignmentForm
                  key={`${selected.id}:${selected.revision}`}
                  task={selected}
                  directory={directory}
                  busy={busy}
                  submit={({ title: _title, ...assignment }) =>
                    void run(async () => {
                      setSelected(
                        await client.request('assignMaterialTask', {
                          token,
                          path: { id: selected.id },
                          body: {
                            ...assignment,
                            expectedRevision: selected.revision,
                          },
                        }),
                      );
                      await refresh();
                    }, '发布前指派已更新并保留历史')
                  }
                />
              </details>
              <Typography.Title level={3}>3 · 配置材料要求</Typography.Title>
              <RequirementsEditor
                key={`${selected.id}:${selected.revision}`}
                task={selected}
                busy={busy}
                save={(requirements) =>
                  void run(async () => {
                    setSelected(
                      await client.request('configureMaterialTask', {
                        token,
                        path: { id: selected.id },
                        body: {
                          expectedRevision: selected.revision,
                          requirements,
                        },
                      }),
                    );
                    await refresh();
                  }, '材料要求已保存，核对后可发布')
                }
              />
              <div className="publish-panel">
                <h3>4 · 发布任务</h3>
                <p>
                  发布后指定承办方可读取
                  V1。本段暂不支持发布后改要求或换人；上传、提交和审核尚未开放。
                </p>
                <Button
                  type="primary"
                  disabled={busy || !selected.requirements}
                  onClick={() => setPublishConfirm(true)}
                >
                  发布任务
                </Button>
              </div>
            </>
          ) : (
            <>
              <Alert
                type="success"
                title="已发布要求受保护"
                description="以下为本任务发布快照；不提供修改提交内容或上传入口。"
              />
              <p>
                任务截止：
                {selected.requirements &&
                  new Date(selected.requirements.deadline).toLocaleString()}
                （截止后的提交规则待业务确认）
              </p>
              {selected.requirements?.materials.map((m) => (
                <section className="requirement-read" key={m.id}>
                  <h3>
                    {m.title} · {m.required ? '必交' : '选交'}
                  </h3>
                  <p>说明：{m.instructions}</p>
                  <p>
                    模板版本：{m.templateVersion} · 格式：{m.formats.join(', ')}{' '}
                    · 上限：{m.maxBytes} 字节
                  </p>
                  <p>截止：{new Date(m.deadline).toLocaleString()}</p>
                  <p>示例或标准：{m.acceptanceStandard}</p>
                </section>
              ))}
            </>
          )}
        </Card>
      )}
      <Modal
        title="确认发布材料任务"
        open={publishConfirm}
        confirmLoading={busy}
        okText="确认发布"
        cancelText="返回核对"
        onCancel={() => {
          if (!busy) setPublishConfirm(false);
        }}
        onOk={() =>
          void run(async () => {
            if (!selected) return;
            setSelected(
              await client.request('publishMaterialTask', {
                token,
                path: { id: selected.id },
                body: { expectedRevision: selected.revision },
              }),
            );
            setPublishConfirm(false);
            await refresh();
          }, '任务已发布，要求 V1 已固定')
        }
      >
        <p>
          请确认承办机构、经办人、审核员和所有材料要求。发布后指定人员将可查询任务。
        </p>
      </Modal>
    </main>
  );
}
