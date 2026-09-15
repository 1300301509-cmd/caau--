import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { Alert, Button, Card, Modal, Tag } from 'antd';
import {
  IndividualWorkspace,
  type IndividualSyncStatus,
  type components,
} from '@caau/api-client';
import { client } from '../materials/client';
import './individual.css';
type S = components['schemas'];
const states: Record<string, string> = {
  DRAFT: '待提交',
  PENDING_REVIEW: '待审核',
  IN_REVIEW: '审核中',
  RETURNED: '退回修改',
  APPROVED: '审核通过',
};
const colors: Record<string, string> = {
  DRAFT: 'default',
  PENDING_REVIEW: 'blue',
  IN_REVIEW: 'purple',
  RETURNED: 'orange',
  APPROVED: 'green',
};
const actions: Record<string, string> = {
  CREATE: '新增材料',
  SAVE: '保存草稿',
  SUBMIT: '正式提交',
  START: '开始审核',
  APPROVE: '审核通过',
  RETURN: '退回修改',
};
const ops: Record<string, string> = {
  createIndividualMaterial: '新增材料',
  submitIndividualMaterial: '正式提交',
  startIndividualReview: '开始审核',
  approveIndividualMaterial: '审核通过',
  returnIndividualMaterial: '退回修改',
};
const statuses: Record<IndividualSyncStatus, string> = {
  idle: '等待选择身份',
  syncing: '正在核对权限和状态',
  online: '自动同步已连接',
  offline: '同步中断',
  paused: '页面已暂停同步',
  unauthorized: '会话已失效',
};
const when = (t: string) =>
  new Date(t).toLocaleString('zh-CN', { hour12: false });
const tabSessionKey = 'caau.local-test-session';
function Person({
  actorId,
  actorName,
  time,
}: {
  actorId: string;
  actorName: string;
  time: string;
}) {
  return (
    <span>
      <strong>{actorName}</strong> · <time dateTime={time}>{when(time)}</time>
      <br />
      <small className="muted">身份 ID：{actorId}</small>
    </span>
  );
}
function Attachment({
  id,
  model,
  label,
  legacy = false,
  bound = true,
}: {
  id: string;
  model: IndividualWorkspace;
  label: string;
  legacy?: boolean;
  bound?: boolean;
}) {
  return (
    <div className="attachment-row">
      <span className="muted">
        附件 {id.slice(0, 8)}
        {!bound ? ' · 待保存绑定' : ''}
      </span>
      <Button
        aria-label={label}
        disabled={model.value.status !== 'online' || !bound || model.value.busy}
        onClick={() =>
          void model.download(id, legacy).then((file) => {
            if (!file) return;
            const url = URL.createObjectURL(
              new Blob([file.bytes], { type: 'application/octet-stream' }),
            );
            const link = document.createElement('a');
            link.href = url;
            link.download = file.name;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          })
        }
      >
        {label}
      </Button>
    </div>
  );
}
export function IndividualPage() {
  const model = useMemo(
    () => new IndividualWorkspace(client, () => crypto.randomUUID()),
    [],
  );
  const subscribe = useCallback(
    (listener: () => void) => model.subscribe(listener),
    [model],
  );
  const s = useSyncExternalStore(subscribe, () => model.value);
  const [identityChoices, setIdentityChoices] = useState<
    S['LocalIdentityChoiceDto'][]
  >([]);
  const [identityKey, setIdentityKey] = useState('');
  const [entryState, setEntryState] = useState<
    'loading' | 'enabled' | 'disabled' | 'unavailable'
  >('loading');
  const [entryBusy, setEntryBusy] = useState(false);
  const [entryError, setEntryError] = useState('');
  const openDeepLink = useCallback(() => {
    const q = new URLSearchParams(location.search);
    if (model.value.identity && q.has('material'))
      model.select(q.get('material')!);
    if (model.value.identity && q.has('legacy'))
      model.openLegacy(q.get('legacy')!);
  }, [model]);
  useEffect(() => {
    let active = true;
    void client
      .request('listLocalTestIdentities')
      .then(async (choices) => {
        if (!active) return;
        setIdentityChoices(choices);
        setIdentityKey(choices[0]?.key ?? '');
        setEntryState('enabled');
        const token = sessionStorage.getItem(tabSessionKey);
        if (!token) return;
        setEntryBusy(true);
        await model.login(token);
        if (!active) return;
        if (model.value.identity) openDeepLink();
        else sessionStorage.removeItem(tabSessionKey);
        setEntryBusy(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        sessionStorage.removeItem(tabSessionKey);
        setEntryState(
          error instanceof Error && 'status' in error && error.status === 503
            ? 'disabled'
            : 'unavailable',
        );
      });
    return () => {
      active = false;
    };
  }, [model, openDeepLink]);
  useEffect(() => {
    if (s.status === 'unauthorized') sessionStorage.removeItem(tabSessionKey);
  }, [s.status]);
  useEffect(() => {
    const visibility = () =>
      model.setForeground(document.visibilityState === 'visible');
    const online = () => model.wake();
    const offline = () => model.networkOffline();
    const unload = (e: BeforeUnloadEvent) => {
      if (model.value.dirty || model.value.pending) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('beforeunload', unload);
    visibility();
    return () => {
      model.dispose();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('beforeunload', unload);
    };
  }, [model]);
  const organizer = s.identity?.roles.includes('ORGANIZER');
  const reviewer = s.identity?.roles.includes('REVIEWER') && !organizer;
  const [organizationQuery, setOrganizationQuery] = useState('');
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const allOrganizations = useMemo(() => {
    const grouped = new Map<
      string,
      { id: string; name: string; tasks: S['TaskViewDto'][] }
    >();
    for (const task of s.tasks) {
      if (!task.individualChannel || task.state !== 'PUBLISHED') continue;
      const organization = grouped.get(task.organizationId) ?? {
        id: task.organizationId,
        name: task.organizationName,
        tasks: [],
      };
      organization.tasks.push(task);
      grouped.set(task.organizationId, organization);
    }
    return [...grouped.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'zh-CN'),
    );
  }, [s.tasks]);
  const organizations = useMemo(
    () =>
      allOrganizations.filter((organization) =>
        organization.name
          .toLocaleLowerCase('zh-CN')
          .includes(organizationQuery.trim().toLocaleLowerCase('zh-CN')),
      ),
    [allOrganizations, organizationQuery],
  );
  const selectedOrganization = allOrganizations.find(
    (organization) => organization.id === selectedOrganizationId,
  );
  useEffect(() => {
    setOrganizationQuery('');
    setSelectedOrganizationId('');
  }, [s.identity?.id]);
  useEffect(() => {
    if (selectedOrganizationId || !s.selected) return;
    const task = s.tasks.find((item) => item.id === s.selected?.taskId);
    if (task) setSelectedOrganizationId(task.organizationId);
  }, [s.selected, s.tasks, selectedOrganizationId]);
  const selected = s.selected;
  const editable =
    organizer &&
    selected &&
    !selected.closed &&
    ['DRAFT', 'RETURNED'].includes(selected.state);
  const blocked = s.status !== 'online' || s.busy || !!s.pending;
  const leave = (work: () => void) => {
    if (
      (s.dirty || s.pending) &&
      !window.confirm(
        '离开当前材料将放弃本页未保存输入或未确认命令。是否继续？',
      )
    )
      return;
    work();
  };
  const title = (m: S['IndividualViewDto']) =>
    m.draft?.title ?? m.submission?.content.title ?? '材料';
  return (
    <div className="workspace individual-workspace">
      {entryState === 'loading' && (
        <Card title="本地测试身份">
          <p role="status">正在确认本地测试模式…</p>
        </Card>
      )}
      {entryState === 'disabled' && (
        <Alert
          type="info"
          showIcon
          title="本地测试身份入口未启用"
          description="仅当后端以本地测试身份模式运行时显示身份选择入口。"
        />
      )}
      {entryState === 'unavailable' && (
        <Alert
          type="warning"
          showIcon
          title="暂时无法确认本地测试模式"
          description="请确认本地 API 正在运行后刷新页面重试。"
        />
      )}
      {entryState === 'enabled' && (
        <Card
          className="local-identity-card"
          title={
            s.identity
              ? `${s.identity.displayName} · ${organizer ? '承办方' : reviewer ? '总部审核员' : '总部管理'}`
              : '本地测试身份'
          }
          extra={<Tag color="gold">仅限本地测试</Tag>}
        >
          <p className="muted">
            选择后由后端签发并验证测试会话。身份只保存在当前标签页，刷新可恢复；不同标签页互不覆盖。
          </p>
          <div className="local-identity-entry">
            <label>
              选择测试身份
              <select
                value={identityKey}
                disabled={entryBusy || s.busy}
                onChange={(event) => setIdentityKey(event.currentTarget.value)}
              >
                {identityChoices.map((choice) => (
                  <option key={choice.key} value={choice.key}>
                    {choice.displayName} · {choice.organizationName}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="primary"
              data-testid="local-identity-enter"
              loading={entryBusy}
              disabled={!identityKey || s.busy}
              onClick={() => {
                if (
                  (s.dirty || s.pending) &&
                  !window.confirm(
                    '切换身份将清除当前页面数据和未保存输入，是否继续？',
                  )
                )
                  return;
                setEntryBusy(true);
                setEntryError('');
                sessionStorage.removeItem(tabSessionKey);
                model.logout();
                void client
                  .request('createLocalTestSession', {
                    body: {
                      identity:
                        identityKey as S['LocalSessionRequestDto']['identity'],
                    },
                  })
                  .then(async (session) => {
                    await model.login(session.token);
                    if (!model.value.identity)
                      throw new Error('Session validation failed');
                    sessionStorage.setItem(tabSessionKey, session.token);
                    openDeepLink();
                  })
                  .catch(() => {
                    sessionStorage.removeItem(tabSessionKey);
                    setEntryError(
                      '无法进入该测试身份。请确认本地 API、数据库和身份状态后重试。',
                    );
                  })
                  .finally(() => setEntryBusy(false));
              }}
            >
              进入
            </Button>
            {s.identity && (
              <Button
                onClick={() =>
                  leave(() => {
                    sessionStorage.removeItem(tabSessionKey);
                    model.logout();
                  })
                }
              >
                退出并清除内容
              </Button>
            )}
          </div>
          {entryError && (
            <Alert type="error" showIcon title={entryError} role="alert" />
          )}
        </Card>
      )}
      <div
        className={`sync-status ${s.status === 'offline' ? 'sync-error' : ''}`}
        data-testid="sync-status"
      >
        <span role="status" aria-live="polite">
          {statuses[s.status]}
        </span>
        <span className="muted">
          {s.lastSync ? ` · 最近核对 ${when(s.lastSync)}` : ''} · 前台约 2
          秒自动核对
        </span>
      </div>
      {s.notice && (
        <Alert
          type={s.error ? 'warning' : 'success'}
          showIcon
          title={s.notice}
        />
      )}
      {s.identity && (
        <div key={s.protectionEpoch}>
          <Card className="contractor-directory">
            <div className="contractor-directory-heading">
              <div>
                <h2>承办方列表</h2>
                <p>
                  当前身份可访问 {allOrganizations.length} 个承办方 ·{' '}
                  {allOrganizations.reduce(
                    (total, organization) => total + organization.tasks.length,
                    0,
                  )}{' '}
                  个单份材料任务
                </p>
              </div>
              <label className="contractor-search">
                <span>搜索承办方</span>
                <input
                  type="search"
                  value={organizationQuery}
                  placeholder="输入承办方名称"
                  onChange={(event) =>
                    setOrganizationQuery(event.currentTarget.value)
                  }
                />
              </label>
            </div>
            <div className="contractor-list">
              {organizations.map((organization) => (
                <article
                  className={`contractor-row${
                    selectedOrganizationId === organization.id
                      ? ' selected'
                      : ''
                  }`}
                  key={organization.id}
                >
                  <div
                    className="contractor-logo-placeholder"
                    role="img"
                    aria-label={`${organization.name} Logo 占位`}
                  >
                    {organization.name.trim().slice(0, 1).toUpperCase() || '承'}
                  </div>
                  <div className="contractor-summary">
                    <div className="contractor-name-line">
                      <strong>{organization.name}</strong>
                      <Tag>Logo 待提供</Tag>
                    </div>
                    <span>
                      {organization.tasks.length} 个当前有权访问的资料任务
                    </span>
                  </div>
                  <Button
                    type={
                      selectedOrganizationId === organization.id
                        ? 'primary'
                        : 'link'
                    }
                    disabled={s.busy || !!s.pending}
                    onClick={() =>
                      leave(() => {
                        setSelectedOrganizationId(organization.id);
                        model.query({
                          taskId: organization.tasks[0]?.id ?? '',
                          offset: 0,
                        });
                        setTimeout(
                          () =>
                            document
                              .getElementById('materials-workspace')
                              ?.scrollIntoView({ block: 'start' }),
                          0,
                        );
                      })
                    }
                  >
                    {selectedOrganizationId === organization.id
                      ? '已选择'
                      : '查看资料'}
                  </Button>
                </article>
              ))}
              {organizations.length === 0 && (
                <p className="contractor-empty">
                  {organizationQuery
                    ? '没有匹配的承办方。'
                    : '当前身份暂无可访问的承办方资料任务。'}
                </p>
              )}
            </div>
          </Card>
          <div className="selected-contractor-context">
            <div>
              <span>当前资料范围</span>
              <strong>
                {selectedOrganizationId
                  ? (selectedOrganization?.name ??
                    '已选承办方（当前无可访问任务）')
                  : '全部有权承办方'}
              </strong>
            </div>
            {selectedOrganizationId && (
              <Button
                onClick={() => {
                  setSelectedOrganizationId('');
                  model.query({ taskId: '', offset: 0 });
                }}
              >
                返回全部承办方
              </Button>
            )}
          </div>
          <div id="materials-workspace" className="individual-layout">
            <section aria-label={reviewer ? '共享审核队列' : '我的材料列表'}>
              <Card title={reviewer ? '共享审核队列' : '办赛材料列表'}>
                <div className="workflow-form">
                  <label>
                    办理任务
                    <select
                      aria-label="办理任务"
                      value={s.taskId}
                      disabled={s.busy || !!s.pending}
                      onChange={(e) => {
                        const taskId = e.target.value;
                        if (s.creating)
                          leave(() => {
                            model.select('');
                            model.query({ taskId, offset: 0 });
                          });
                        else model.query({ taskId, offset: 0 });
                      }}
                    >
                      <option value="">全部有权任务</option>
                      {s.tasks
                        .filter(
                          (t) =>
                            t.individualChannel &&
                            t.state === 'PUBLISHED' &&
                            (!selectedOrganizationId ||
                              t.organizationId === selectedOrganizationId),
                        )
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    材料状态筛选
                    <select
                      aria-label="材料状态筛选"
                      value={s.filter}
                      disabled={s.busy || !!s.pending}
                      onChange={(e) =>
                        model.query({ filter: e.target.value, offset: 0 })
                      }
                    >
                      <option value="">
                        {reviewer ? '待审核 / 审核中' : '全部状态'}
                      </option>
                      {Object.entries(states)
                        .filter(([k]) => !reviewer || k !== 'DRAFT')
                        .map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                    </select>
                  </label>
                  {organizer && (
                    <Button
                      type="primary"
                      disabled={blocked || !s.taskId}
                      onClick={() => leave(() => model.beginCreate())}
                    >
                      自由新增材料
                    </Button>
                  )}
                  {organizer && !s.taskId && (
                    <small className="muted">
                      请先选择已发布的办理任务，再自由新增材料。
                    </small>
                  )}
                </div>
                <p>
                  {s.total} 份材料 · 第 {Math.floor(s.offset / s.limit) + 1} 页
                </p>
                <div className="individual-list">
                  {s.rows.map((m) => (
                    <article
                      key={m.id}
                      className={
                        s.selectedId === m.id
                          ? 'individual-row selected'
                          : 'individual-row'
                      }
                      data-material-id={m.id}
                    >
                      <div>
                        <strong>{title(m)}</strong>
                        <p>
                          <Tag color={colors[m.state]}>{states[m.state]}</Tag>V
                          {m.submission?.version ?? 0}
                        </p>
                        <small className="muted">
                          {s.tasks.find((t) => t.id === m.taskId)?.title}
                        </small>
                      </div>
                      <Button
                        aria-label={`查看材料 ${title(m)}`}
                        disabled={s.busy || !!s.pending}
                        onClick={() => leave(() => model.select(m.id))}
                      >
                        查看材料
                      </Button>
                    </article>
                  ))}
                  {!s.rows.length && (
                    <p>当前页暂无材料。在线时新提交会自动出现。</p>
                  )}
                </div>
                <div className="actions">
                  <Button
                    aria-label="材料上一页"
                    disabled={s.offset === 0 || s.busy || !!s.pending}
                    onClick={() =>
                      model.query({
                        offset: Math.max(0, s.offset - s.limit),
                      })
                    }
                  >
                    上一页
                  </Button>
                  <Button
                    aria-label="材料下一页"
                    disabled={
                      s.offset + s.limit >= s.total || s.busy || !!s.pending
                    }
                    onClick={() => model.query({ offset: s.offset + s.limit })}
                  >
                    下一页
                  </Button>
                </div>
              </Card>
              <Card title="旧整包只读历史" className="legacy-picker">
                <p>
                  保留原整包审核语义，不伪装成当时已逐份审核。访问范围仍按旧授权。
                </p>
                <label>
                  旧历史任务
                  <select
                    aria-label="旧历史任务"
                    value={s.legacyId}
                    disabled={s.busy || !!s.pending}
                    onChange={(e) =>
                      leave(() => model.openLegacy(e.target.value))
                    }
                  >
                    <option value="">选择历史任务</option>
                    {s.tasks
                      .filter((t) => t.state === 'PUBLISHED')
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                  </select>
                </label>
              </Card>
            </section>
            <section aria-label="材料详情" className="individual-detail">
              {!selected && !s.creating && !s.legacyId && (
                <Card>
                  <h2>选择一份材料</h2>
                  <p>
                    打开详情不会开始审核。请从列表选择材料，或选择任务后自由新增。
                  </p>
                </Card>
              )}
              {s.creating && (
                <Card title="自由新增材料">
                  <p>
                    新增只建立本份草稿，不影响其它材料。创建后可上传私有附件。
                  </p>
                  <form
                    className="workflow-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      model.ask('createIndividualMaterial');
                    }}
                  >
                    <label>
                      材料名称
                      <input
                        required
                        maxLength={160}
                        value={s.buffer.title}
                        disabled={blocked}
                        onChange={(e) => model.edit({ title: e.target.value })}
                      />
                    </label>
                    <label>
                      材料类别
                      <input
                        maxLength={120}
                        value={s.buffer.category}
                        disabled={blocked}
                        onChange={(e) =>
                          model.edit({ category: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      材料说明
                      <textarea
                        aria-label="材料说明"
                        maxLength={20000}
                        value={s.buffer.text}
                        disabled={blocked}
                        onChange={(e) => model.edit({ text: e.target.value })}
                      />
                    </label>
                    <Button type="primary" htmlType="submit" disabled={blocked}>
                      建立材料草稿
                    </Button>
                  </form>
                </Card>
              )}
              {selected && (
                <>
                  <Card title={title(selected)}>
                    <div className="actions">
                      <Tag color={colors[selected.state]}>
                        <span data-testid="material-state">
                          {states[selected.state]}
                        </span>
                      </Tag>
                      <strong data-testid="material-version">
                        V{selected.submission?.version ?? 0}
                      </strong>
                      <small>修订 {selected.revision}</small>
                    </div>
                    <p>
                      有效截止：{when(selected.deadline)}
                      {selected.closed ? ' · 任务已关闭，只能查看' : ''}
                    </p>
                    {selected.lastAction && (
                      <p>
                        最近操作：{actions[selected.lastAction.action]}
                        <br />
                        <Person
                          actorId={selected.lastAction.actorId}
                          actorName={selected.lastAction.actorName}
                          time={selected.lastAction.occurredAt}
                        />
                      </p>
                    )}
                    {selected.lastAction?.reason && (
                      <div className="review-issue">
                        <p>退回原因：{selected.lastAction.reason}</p>
                        <p>修改要求：{selected.lastAction.modification}</p>
                      </div>
                    )}
                    {reviewer && (
                      <div className="workflow-form">
                        {selected.state === 'IN_REVIEW' && (
                          <Alert
                            type="info"
                            title="共享审核：可以接续其他审核员的工作；结论将记录实际操作人。"
                          />
                        )}
                        <label>
                          退回原因
                          <textarea
                            aria-label="退回原因"
                            maxLength={2000}
                            value={s.reason}
                            onChange={(e) =>
                              model.opinion({ reason: e.target.value })
                            }
                            disabled={blocked}
                          />
                        </label>
                        <label>
                          修改要求
                          <textarea
                            aria-label="修改要求"
                            maxLength={2000}
                            value={s.modification}
                            onChange={(e) =>
                              model.opinion({
                                modification: e.target.value,
                              })
                            }
                            disabled={blocked}
                          />
                        </label>
                        <div className="actions">
                          <Button
                            disabled={
                              blocked ||
                              selected.closed ||
                              selected.state !== 'PENDING_REVIEW'
                            }
                            onClick={() => model.ask('startIndividualReview')}
                          >
                            开始审核
                          </Button>
                          <Button
                            type="primary"
                            disabled={
                              blocked ||
                              selected.closed ||
                              selected.state !== 'IN_REVIEW'
                            }
                            onClick={() =>
                              model.ask('approveIndividualMaterial')
                            }
                          >
                            审核通过
                          </Button>
                          <Button
                            danger
                            disabled={
                              blocked ||
                              selected.closed ||
                              selected.state !== 'IN_REVIEW'
                            }
                            onClick={() =>
                              model.ask('returnIndividualMaterial')
                            }
                          >
                            退回修改
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                  {organizer && (
                    <Card title="本地编辑区">
                      <p role="status">
                        {s.dirty
                          ? '有未保存输入 · 自动更新不会覆盖此处内容'
                          : '草稿已与服务器核对'}
                      </p>
                      {s.conflict && (
                        <div className="review-issue" role="alert">
                          <strong>
                            草稿或经办权限版本已变化，本地输入保留。
                          </strong>
                          <p>
                            服务器草稿：{selected.draft?.title} ·{' '}
                            {selected.draft?.text}
                          </p>
                          <div className="actions">
                            <Button
                              disabled={blocked || !editable}
                              onClick={() => model.reconcile(false)}
                            >
                              核对后保留输入
                            </Button>
                            <Button
                              disabled={blocked || !editable}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    '采用服务器草稿将替换本地未保存输入，继续？',
                                  )
                                )
                                  model.reconcile(true);
                              }}
                            >
                              采用服务器草稿
                            </Button>
                          </div>
                        </div>
                      )}
                      <div className="workflow-form">
                        <label>
                          材料名称
                          <input
                            required
                            maxLength={160}
                            value={s.buffer.title}
                            disabled={blocked || !editable}
                            onChange={(e) =>
                              model.edit({ title: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          材料类别
                          <input
                            maxLength={120}
                            value={s.buffer.category}
                            disabled={blocked || !editable}
                            onChange={(e) =>
                              model.edit({ category: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          材料说明
                          <textarea
                            aria-label="材料说明"
                            maxLength={20000}
                            value={s.buffer.text}
                            disabled={blocked || !editable}
                            onChange={(e) =>
                              model.edit({ text: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          上传私有附件
                          <input
                            type="file"
                            accept=".txt,.pdf,.png,.jpg,.jpeg"
                            disabled={blocked || !editable || s.conflict}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (!file) return;
                              if (file.size > 10 * 1024 * 1024) {
                                window.alert('文件不能超过 10 MiB。');
                                return;
                              }
                              void model.upload(file.name, () =>
                                file.arrayBuffer(),
                              );
                            }}
                          />
                        </label>
                        <small className="muted">
                          支持 txt/pdf/png/jpg/jpeg，最多10
                          MiB；上传核验成功后还需保存草稿绑定。
                        </small>
                        {s.buffer.fileIds.map((id, i) => (
                          <div key={id}>
                            <Attachment
                              id={id}
                              model={model}
                              label={`下载草稿附件 ${i + 1}`}
                              bound={!!selected.draft?.fileIds.includes(id)}
                            />
                            <Button
                              disabled={blocked || !editable}
                              onClick={() =>
                                model.edit({
                                  fileIds: s.buffer.fileIds.filter(
                                    (x) => x !== id,
                                  ),
                                })
                              }
                            >
                              移除附件 {i + 1}
                            </Button>
                          </div>
                        ))}
                        <div className="actions">
                          <Button
                            type="primary"
                            disabled={
                              blocked ||
                              !editable ||
                              s.conflict ||
                              !s.dirty ||
                              !s.buffer.title.trim()
                            }
                            onClick={() => void model.save()}
                          >
                            保存草稿
                          </Button>
                          <Button
                            disabled={
                              blocked || !editable || s.dirty || s.conflict
                            }
                            onClick={() =>
                              model.ask('submitIndividualMaterial')
                            }
                          >
                            单份提交
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )}
                  {selected.submission && (
                    <Card
                      title={`当前不可变提交 V${selected.submission.version}`}
                    >
                      <Person
                        actorId={selected.submission.actorId}
                        actorName={selected.submission.actorName}
                        time={selected.submission.occurredAt}
                      />
                      <p>
                        类别：
                        {selected.submission.content.category || '未分类'}
                      </p>
                      <p className="material-text">
                        {selected.submission.content.text}
                      </p>
                      {selected.submission.content.fileIds.map((id, i) => (
                        <Attachment
                          key={id}
                          id={id}
                          model={model}
                          label={`下载当前版本附件 ${i + 1}`}
                        />
                      ))}
                    </Card>
                  )}
                  {s.history && (
                    <Card title="逐步操作与版本历史">
                      <ol className="individual-timeline">
                        {s.history.actions.map((a) => (
                          <li key={a.id}>
                            <strong>
                              {actions[a.action]} · {states[a.fromState]} →{' '}
                              {states[a.toState]}
                            </strong>
                            <p>
                              <Person
                                actorId={a.actorId}
                                actorName={a.actorName}
                                time={a.occurredAt}
                              />
                            </p>
                            {a.content && (
                              <details>
                                <summary>
                                  当时草稿快照 · 修订 {a.revision}
                                </summary>
                                <p>
                                  {a.content.title} ·{' '}
                                  {a.content.category || '未分类'}
                                </p>
                                <p className="material-text">
                                  {a.content.text}
                                </p>
                                {a.content.fileIds.map((id, i) => (
                                  <Attachment
                                    key={id}
                                    id={id}
                                    model={model}
                                    label={`下载修订 ${a.revision} 草稿附件 ${i + 1}`}
                                  />
                                ))}
                              </details>
                            )}
                            {a.reason && (
                              <p>
                                原因：{a.reason}
                                <br />
                                修改要求：{a.modification}
                              </p>
                            )}
                          </li>
                        ))}
                      </ol>
                      {s.history.submissions.map((v) => (
                        <details key={v.id}>
                          <summary>
                            不可变提交 V{v.version} · {v.content.title}
                          </summary>
                          <Person
                            actorId={v.actorId}
                            actorName={v.actorName}
                            time={v.occurredAt}
                          />
                          <p>类别：{v.content.category || '未分类'}</p>
                          <p className="material-text">{v.content.text}</p>
                          {v.content.fileIds.map((id, i) => (
                            <Attachment
                              key={id}
                              id={id}
                              model={model}
                              label={`下载 V${v.version} 附件 ${i + 1}`}
                            />
                          ))}
                        </details>
                      ))}
                      <div className="actions">
                        <Button
                          disabled={s.historyOffset === 0 || s.busy}
                          onClick={() =>
                            model.historyPage(Math.max(0, s.historyOffset - 10))
                          }
                        >
                          历史上一页
                        </Button>
                        <span>
                          第 {Math.floor(s.historyOffset / 10) + 1} 页
                        </span>
                        <Button
                          disabled={
                            s.historyOffset + 10 >= s.history.total || s.busy
                          }
                          onClick={() =>
                            model.historyPage(s.historyOffset + 10)
                          }
                        >
                          历史下一页
                        </Button>
                      </div>
                    </Card>
                  )}
                </>
              )}
              {s.legacyId && s.legacyTask && (
                <Card title={`旧整包只读历史 · ${s.legacyTask.title}`}>
                  <p>原整包提交与审核记录，不提供修改或重新审核操作。</p>
                  {!s.legacyVersions.length && <p>该任务没有旧整包提交。</p>}
                  {[...s.legacyVersions].reverse().map((v) => (
                    <section className="requirement-read" key={v.id}>
                      <h3>
                        旧整包 V{v.version} ·{' '}
                        {v.review?.decision === 'PASS'
                          ? '整包已通过'
                          : v.review
                            ? '整包已退回'
                            : '旧整包待审核'}
                      </h3>
                      <Person
                        actorId={v.actorId}
                        actorName={v.actorName}
                        time={v.submittedAt}
                      />
                      {v.entries.map((entry) => (
                        <div key={entry.materialId}>
                          <p className="material-text">{entry.text}</p>
                          {entry.fileIds.map((id, i) => (
                            <Attachment
                              key={id}
                              id={id}
                              model={model}
                              legacy
                              label={`下载旧 V${v.version} 附件 ${i + 1}`}
                            />
                          ))}
                        </div>
                      ))}
                      {v.review && (
                        <div className="review-issue">
                          <Person
                            actorId={v.review.actorId}
                            actorName={v.review.actorName}
                            time={v.review.reviewedAt}
                          />
                          {v.review.issues.map((i) => (
                            <p key={i.materialId}>
                              退回原因：{i.reason}
                              <br />
                              修改要求：{i.instruction}
                            </p>
                          ))}
                        </div>
                      )}
                    </section>
                  ))}
                </Card>
              )}
            </section>
          </div>
          {s.pending && (
            <Alert
              type="warning"
              title="命令结果尚未确认，已保留原幂等键和载荷。请恢复连接后沿用原命令重试。"
              action={
                <Button
                  disabled={s.busy || s.status !== 'online'}
                  onClick={() => void model.commit()}
                >
                  沿用原命令重试
                </Button>
              }
            />
          )}
          <Modal
            title={`确认${s.confirm ? ops[s.confirm.op] : ''}`}
            open={!!s.confirm}
            onCancel={() => model.cancelConfirm()}
            footer={
              <div className="actions">
                <Button onClick={() => model.cancelConfirm()}>取消</Button>
                <Button
                  type="primary"
                  disabled={s.status !== 'online' || s.busy}
                  onClick={() => void model.commit()}
                >
                  确认操作
                </Button>
              </div>
            }
          >
            <p>
              仅操作此份材料。
              {s.confirm && 'id' in s.confirm
                ? `确认目标修订 ${s.confirm.body.expectedRevision}；期间收到新状态不会更换本次审核目标。`
                : '将建立独立材料草稿。'}
            </p>
            {s.confirm?.op === 'returnIndividualMaterial' && (
              <p>
                退回原因：{s.confirm.body.reason}
                <br />
                修改要求：{s.confirm.body.modification}
              </p>
            )}
          </Modal>
        </div>
      )}
    </div>
  );
}
