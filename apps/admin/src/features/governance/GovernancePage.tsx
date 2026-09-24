import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
} from 'antd';
import { ApiError, type components } from '@caau/api-client';
import { useAuth } from '../auth/AuthContext';
import { AccountManagementPage } from '../auth/AccountManagementPage';
import { client } from '../materials/client';
import './governance.css';

type S = components['schemas'];
type Row = S['GovernanceRowDto'];
type Page = S['GovernancePageDto'];
type Metric = S['GovernanceFieldDto'];
const sections = [
  ['overview', '平台总览'],
  ['accounts', '账号与权限'],
  ['sessions', '登录会话'],
  ['audit', '操作审计'],
  ['usage', 'Token用量'],
  ['usage-summary', '每日用量汇总'],
  ['quotas', '额度策略'],
  ['prices', '价格版本'],
  ['bills', '成本核对'],
  ['dialogues', '对话审查'],
  ['agent-runs', 'AI执行记录'],
  ['business', '业务与存储'],
  ['business-records', '业务进展明细'],
  ['files', '文件登记明细'],
  ['alerts', '告警处置'],
  ['system', '技术与运维'],
];
const labels: Record<string, string> = {
  REPLAYED: '原结果回放',
  SUCCESS: '成功',
  FAILED: '失败',
  DENIED: '拒绝',
  CONFLICT: '冲突',
  ACTIVE: '启用',
  DISABLED: '停用',
  VALID: '有效',
  RESERVED: '待完成/核对',
  FIRING: '故障持续',
  RECOVERED: '已恢复',
  PAUSED: 'AI已暂停',
  ENABLED: '额度已启用',
  UNLIMITED: '不限额',
  REVIEW_REQUIRED: '查看须登记',
  UNCLASSIFIED: '历史未分类',
  ALLOWED_LEGACY: '历史允许',
};
const err = (e: unknown) =>
  e instanceof ApiError
    ? e.status === 403
      ? '当前账号没有平台治理权限'
      : e.status === 409
        ? '数据版本已变化，请刷新后重试'
        : e.status === 400
          ? '输入格式或范围不正确，请核对后重试'
          : `请求失败（${e.status}），请稍后重试`
    : '连接失败，请检查服务状态';
export function GovernancePage() {
  const auth = useAuth();
  const allowed = !!auth.identity?.roles.includes('HEADQUARTERS_SUPER_ADMIN');
  const token =
    auth.mode === 'local'
      ? (sessionStorage.getItem('caau.local-test-session') ?? '')
      : undefined;
  const initial = new URLSearchParams(location.search);
  const [tab, setTab] = useState(initial.get('tab') ?? 'overview');
  const [actor, setActor] = useState(initial.get('actor') ?? '');
  const [action, setAction] = useState('');
  const [model, setModel] = useState('');
  const [organization, setOrganization] = useState('');
  const [request, setRequest] = useState('');
  const [resource, setResource] = useState(initial.get('resource') ?? '');
  const [event, setEvent] = useState(initial.get('event') ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [phase, setPhase] = useState('');
  const [modelMode, setModelMode] = useState('');
  const [page, setPage] = useState<Page>();
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState<Row>();
  const [account, setAccount] = useState<Metric[]>();
  const [review, setReview] = useState<Page>();
  const [reviewReason, setReviewReason] = useState('');
  const [policyAction, setPolicyAction] = useState('schedule.read');
  const [policyResource, setPolicyResource] = useState('');
  const [explanation, setExplanation] = useState<Metric[]>();
  const [edit, setEdit] = useState<{ kind: string; row?: Row }>();
  const [form] = Form.useForm();
  const epoch = useRef(0);
  const query = {
    ...(actor ? { actorId: actor } : {}),
    ...(action ? { action } : {}),
    ...(model ? { model } : {}),
    ...(organization ? { organizationId: organization } : {}),
    ...(request ? { requestId: request } : {}),
    ...(resource ? { resourceId: resource } : {}),
    ...(event ? { eventId: event } : {}),
    ...(from ? { from: `${from}T00:00:00+08:00` } : {}),
    ...(to ? { to: `${to}T23:59:59.999+08:00` } : {}),
    ...(phase ? { phase } : {}),
    ...(modelMode ? { mode: modelMode } : {}),
  };
  const queryRef = useRef(query);
  queryRef.current = query;
  const load = useCallback(
    async (cursor?: string) => {
      if (!allowed) return;
      const query = queryRef.current;
      const serial = ++epoch.current;
      setBusy(true);
      setError('');
      try {
        if (['overview', 'business', 'system'].includes(tab)) {
          const r = await client.request('getGovernanceOverview', {
            token,
            query,
          });
          if (serial === epoch.current) {
            setMetrics(r.metrics);
            setPage(undefined);
          }
        } else {
          const [r, m] = await Promise.all([
            client.request('listGovernanceRecords', {
              token,
              path: { kind: tab },
              query: { ...query, ...(cursor ? { cursor } : {}) },
            }),
            client.request('getGovernanceOverview', { token, query }),
          ]);
          if (serial === epoch.current) {
            setPage(r);
            setMetrics(m.metrics);
          }
        }
      } catch (e) {
        if (serial === epoch.current) {
          setError(err(e));
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
            setDetail(undefined);
            setReview(undefined);
            setAccount(undefined);
            setEdit(undefined);
          }
          setPage(undefined);
          setMetrics([]);
        }
      } finally {
        if (serial === epoch.current) setBusy(false);
      }
      // Filters are applied explicitly with the query button.
    },
    [allowed, tab, token, request, resource],
  );
  useEffect(() => {
    setDetail(undefined);
    setReview(undefined);
    setAccount(undefined);
    setExplanation(undefined);
    void load();
    return () => {
      epoch.current++;
    };
  }, [load]);
  const refresh = () => load();
  const open = (kind: string, r?: Row) => {
    form.resetFields();
    form.setFieldsValue({
      scope: 'ACCOUNT',
      subjectId: r?.actorId ?? actor,
      enabled: false,
      paused: false,
      expectedRevision: 0,
      currency: 'CNY',
      effectiveAt: new Date().toISOString(),
      ownerId: '',
      reason: '',
      note: '',
    });
    if (kind === 'quota' && r) {
      const f = Object.fromEntries(r.fields.map((v) => [v.label, v.value]));
      form.setFieldsValue({
        scope: f['范围'],
        subjectId: f['对象'],
        enabled: f['启用'] === 'true',
        paused: f['暂停'] === 'true',
        expectedRevision: Number(f.revision),
        dailyTokens: f['日额度'] === '无限制' ? null : Number(f['日额度']),
        monthlyTokens: f['月额度'] === '无限制' ? null : Number(f['月额度']),
      });
    }
    setEdit({ kind, row: r });
  };
  const submit = async () => {
    let v: Record<string, unknown>;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    setBusy(true);
    setError('');
    try {
      let result: S['GovernanceResultDto'] | undefined;
      const id = edit?.row?.id ?? '';
      if (edit?.kind === 'quota')
        result = await client.request('setAiUsageQuota', {
          token,
          body: {
            scope: String(v.scope) as 'ACCOUNT' | 'ORGANIZATION',
            subjectId: String(v.subjectId),
            enabled: !!v.enabled,
            paused: !!v.paused,
            dailyTokens: v.dailyTokens == null ? null : Number(v.dailyTokens),
            monthlyTokens:
              v.monthlyTokens == null ? null : Number(v.monthlyTokens),
            expectedRevision: Number(v.expectedRevision),
            reason: String(v.reason),
          },
        });
      if (edit?.kind === 'price')
        result = await client.request('createAiModelPrice', {
          token,
          body: {
            provider: String(v.provider),
            model: String(v.model),
            currency: String(v.currency),
            inputMicrosPerMillion: String(v.inputMicrosPerMillion),
            outputMicrosPerMillion: String(v.outputMicrosPerMillion),
            cachedMicrosPerMillion: v.cachedMicrosPerMillion
              ? String(v.cachedMicrosPerMillion)
              : null,
            effectiveAt: String(v.effectiveAt),
            reason: String(v.reason),
          },
        });
      if (edit?.kind === 'bill')
        result = await client.request('createAiSupplierBill', {
          token,
          body: {
            provider: String(v.provider),
            currency: String(v.currency),
            from: String(v.from),
            to: String(v.to),
            amountMicros: String(v.amountMicros),
            note: String(v.note),
          },
        });
      if (edit?.kind === 'assignment')
        result = await client.request('setAiCostAssignment', {
          token,
          path: { id: edit.row?.actorId ?? actor },
          body: {
            organizationId: v.organizationId ? String(v.organizationId) : null,
            reason: String(v.reason),
          },
        });
      if (edit?.kind === 'resolve')
        result = await client.request('resolveAiUsage', {
          token,
          path: { id },
          body: {
            inputTokens: Number(v.inputTokens),
            outputTokens: Number(v.outputTokens),
            reason: String(v.reason),
          },
        });
      if (edit?.kind === 'revoke')
        result = await client.request('revokeGovernanceSessions', {
          token,
          path: { id: edit.row?.actorId ?? actor },
          body: {
            reason: String(v.reason),
            ...(tab === 'sessions' ? { sessionId: id } : {}),
          },
        });
      if (edit?.kind === 'alert')
        result = await client.request('acknowledgeGovernanceAlert', {
          token,
          path: { id },
          body: {
            note: String(v.note),
            ownerId: v.ownerId ? String(v.ownerId) : null,
          },
        });
      if (edit?.kind === 'review') {
        const r = await client.request('reviewGovernanceDialogue', {
          token,
          path: { id },
          body: { reason: String(v.reason) },
        });
        setReview(r);
        setReviewReason(String(v.reason));
        setDetail(edit.row);
      }
      if (result) setNotice(result.message);
      setEdit(undefined);
      if (edit?.kind !== 'review') await load();
    } catch (e) {
      setError(err(e));
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setDetail(undefined);
        setReview(undefined);
        setAccount(undefined);
        setEdit(undefined);
      }
    } finally {
      setBusy(false);
    }
  };
  const inspect = async (r: Row) => {
    setDetail(r);
    setAccount(undefined);
    setReview(undefined);
    if (tab === 'accounts') {
      try {
        const result = await client.request('getGovernanceAccount', {
          token,
          path: { id: r.id },
        });
        setAccount(result.metrics);
      } catch (e) {
        setError(err(e));
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setDetail(undefined);
          setReview(undefined);
          setAccount(undefined);
          setEdit(undefined);
        }
      }
    }
  };
  const field = (
    name: string,
    label: string,
    required = true,
    numeric = false,
  ) => (
    <Form.Item
      key={name}
      name={name}
      label={label}
      rules={required ? [{ required: true, message: `请填写${label}` }] : []}
    >
      {numeric ? (
        <InputNumber min={0} precision={0} style={{ width: '100%' }} />
      ) : (
        <Input />
      )}
    </Form.Item>
  );
  if (!allowed)
    return <Alert type="warning" title="平台治理中心仅向总部超级管理员开放" />;
  return (
    <section className="governance-page">
      <header className="governance-header">
        <div>
          <span className="governance-eyebrow">PLATFORM GOVERNANCE</span>
          <h1>平台治理与监控</h1>
          <p>账号、业务、AI用量与系统运行，一个入口查看和追踪。</p>
        </div>
        <Button onClick={() => void load()} loading={busy}>
          刷新数据
        </Button>
      </header>
      {error && <Alert type="error" showIcon title={error} />}{' '}
      {notice && (
        <Alert
          type="success"
          showIcon
          closable
          title={notice}
          onClose={() => setNotice('')}
        />
      )}
      <Tabs
        activeKey={tab}
        onChange={(k) => {
          setTab(k);
          setAction('');
          setModel('');
          setOrganization('');
          setRequest('');
          setResource('');
          setEvent('');
          setPhase('');
          setModelMode('');
          history.replaceState(
            null,
            '',
            `/governance?tab=${k}${actor ? `&actor=${encodeURIComponent(actor)}` : ''}`,
          );
        }}
        items={sections.map(([key, label]) => ({ key: key!, label }))}
      />
      {tab === 'accounts' && (
        <details className="governance-panel">
          <summary>创建账号、停用、密码与业务授权管理</summary>
          <AccountManagementPage />
        </details>
      )}
      {!['overview', 'business', 'system'].includes(tab) && (
        <section
          className="governance-panel governance-toolbar"
          aria-label="筛选记录"
        >
          <label>
            账号ID
            <Input
              value={actor}
              onChange={(e) => setActor(e.target.value.trim())}
              allowClear
            />
          </label>
          {['audit', 'agent-runs', 'business-records', 'files'].includes(
            tab,
          ) && (
            <>
              <label>
                动作前缀
                <Input
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                />
              </label>
              <label>
                赛事ID
                <Input
                  value={event}
                  allowClear
                  onChange={(e) => setEvent(e.target.value.trim())}
                />
              </label>
              <label>
                资源ID
                <Input
                  value={resource}
                  allowClear
                  onChange={(e) => setResource(e.target.value.trim())}
                />
              </label>
            </>
          )}
          {['audit', 'usage', 'usage-summary', 'alerts', 'bills'].includes(
            tab,
          ) && (
            <>
              <label>
                开始日期（北京时间）
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                结束日期（北京时间）
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
            </>
          )}
          {['usage', 'usage-summary'].includes(tab) && (
            <>
              <label>
                调用场景
                <Input
                  value={phase}
                  placeholder="如 route / chat"
                  onChange={(e) => setPhase(e.target.value.trim())}
                />
              </label>
              <label>
                调用模式
                <Select
                  aria-label="调用模式"
                  value={modelMode}
                  onChange={setModelMode}
                  options={[
                    { value: '', label: '全部模式' },
                    { value: 'QWEN', label: '真实千问' },
                    { value: 'SIMULATED', label: '模拟调用' },
                  ]}
                />
              </label>
            </>
          )}
          {['audit', 'agent-runs', 'usage'].includes(tab) && (
            <label>
              请求编号
              <Input
                value={request}
                allowClear
                onChange={(e) => setRequest(e.target.value.trim())}
              />
            </label>
          )}
          {['usage', 'usage-summary'].includes(tab) && (
            <>
              <label>
                模型
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </label>
              <label>
                费用机构ID
                <Input
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                />
              </label>
            </>
          )}
          <Button onClick={() => void refresh()} disabled={busy}>
            查询
          </Button>
          <span className="governance-muted">
            用量与审计查询最近90天；聊天保留全部现存历史
          </span>
        </section>
      )}
      <Space wrap className="governance-actions">
        {tab === 'quotas' && (
          <Button type="primary" onClick={() => open('quota')}>
            配置额度 / 暂停AI
          </Button>
        )}
        {tab === 'agent-runs' && (
          <Alert
            type="info"
            title="记录可追溯的业务执行步骤和结果；详细模型调用耗时见 Token 用量。此处不展示模型内部思维。"
          />
        )}
        {tab === 'prices' && (
          <Button type="primary" onClick={() => open('price')}>
            新增价格版本
          </Button>
        )}
        {tab === 'bills' && (
          <Button type="primary" onClick={() => open('bill')}>
            录入供应商账单
          </Button>
        )}
        {tab === 'audit' && (
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await client.request('exportGovernanceAudit', {
                  token,
                  body: query,
                });
                const url = URL.createObjectURL(
                  new Blob([r.csv], { type: 'text/csv;charset=utf-8' }),
                );
                const a = document.createElement('a');
                a.href = url;
                a.download = 'caau-audit.csv';
                a.click();
                URL.revokeObjectURL(url);
                setNotice(`已导出${r.count}条脱敏记录`);
              } catch (e) {
                setError(err(e));
                if (
                  e instanceof ApiError &&
                  (e.status === 401 || e.status === 403)
                ) {
                  setDetail(undefined);
                  setReview(undefined);
                  setAccount(undefined);
                  setEdit(undefined);
                }
              } finally {
                setBusy(false);
              }
            }}
          >
            导出当前筛选（最多一万条）
          </Button>
        )}
      </Space>
      {busy && !page ? (
        <Spin tip="正在查询受控记录">
          <div style={{ minHeight: 160 }} />
        </Spin>
      ) : null}
      {['overview', 'business', 'system', 'usage'].includes(tab) && (
        <section className="governance-metrics" aria-label="平台指标">
          {metrics
            .filter((m) =>
              tab === 'usage'
                ? /Token|调用/.test(m.label)
                : tab === 'business'
                  ? /状态|上传|字节|口径|赛事|等待|分布/.test(m.label)
                  : tab === 'system'
                    ? /技术|微信|更新/.test(m.label)
                    : true,
            )
            .map((m) => (
              <article className="governance-metric" key={m.label}>
                <span>{m.label}</span>
                <strong>{m.value}</strong>
              </article>
            ))}
        </section>
      )}
      {tab === 'system' && (
        <section className="governance-panel">
          <h2>技术工作台与保留策略</h2>
          <p>
            审计及用量90天 · 运行日志30天 ·
            调用链7天。原聊天和业务版本沿用原有保存规则。
          </p>
          <p>
            技术看板需配置受控反向代理；服务器、备份和通知的运行证据以独立监控为准。
          </p>
          <Button href="/ops/grafana/" target="_blank" rel="noreferrer">
            打开受控 Grafana
          </Button>
        </section>
      )}
      {page && (
        <section className="governance-panel">
          <Table<Row>
            rowKey="id"
            dataSource={page.items}
            loading={busy}
            pagination={false}
            scroll={{ x: 760 }}
            locale={{ emptyText: <Empty description="当前范围暂无记录" /> }}
            columns={[
              {
                title: '记录',
                dataIndex: 'title',
                render: (_, r) => (
                  <Button type="link" onClick={() => void inspect(r)}>
                    {r.title}
                  </Button>
                ),
              },
              {
                title: '状态',
                dataIndex: 'status',
                render: (s: string) => <Tag>{labels[s] ?? s}</Tag>,
              },
              {
                title: '时间',
                dataIndex: 'at',
                render: (s: string) =>
                  s
                    ? new Date(s).toLocaleString('zh-CN', {
                        timeZone: 'Asia/Shanghai',
                      })
                    : '—',
              },
              {
                title: '操作',
                render: (_, r) => (
                  <Space wrap>
                    <Button onClick={() => void inspect(r)}>详情</Button>
                    {tab === 'quotas' && (
                      <Button onClick={() => open('quota', r)}>调整额度</Button>
                    )}
                    {tab === 'accounts' && (
                      <>
                        <Button onClick={() => open('assignment', r)}>
                          费用归属
                        </Button>
                        <Button danger onClick={() => open('revoke', r)}>
                          全部下线
                        </Button>
                      </>
                    )}
                    {tab === 'sessions' && (
                      <Button danger onClick={() => open('revoke', r)}>
                        撤销会话
                      </Button>
                    )}
                    {tab === 'dialogues' && (
                      <Button onClick={() => open('review', r)}>
                        审查对话
                      </Button>
                    )}
                    {tab === 'usage' &&
                      r.fields.some(
                        (f) =>
                          f.label === '用量状态' &&
                          ['UNKNOWN', 'PENDING'].includes(f.value),
                      ) && (
                        <Button onClick={() => open('resolve', r)}>
                          核对用量
                        </Button>
                      )}
                    {tab === 'alerts' && (
                      <Button onClick={() => open('alert', r)}>登记处置</Button>
                    )}
                  </Space>
                ),
              },
            ]}
          />
          <footer className="governance-pagination">
            <span>更新时间 {new Date(page.asOf).toLocaleString('zh-CN')}</span>
            <Button
              disabled={!page.nextCursor || busy}
              onClick={() => void load(page.nextCursor ?? undefined)}
            >
              下一页
            </Button>
          </footer>
        </section>
      )}
      <Drawer
        width={680}
        title={detail?.title ?? '详情'}
        open={!!detail}
        onClose={() => {
          setDetail(undefined);
          setReview(undefined);
          setAccount(undefined);
        }}
        destroyOnHidden
      >
        {detail && (
          <>
            <Descriptions
              column={1}
              items={[
                { key: 'id', label: '记录ID', children: detail.id },
                ...detail.fields.map((f, i) => ({
                  key: String(i),
                  label: f.label,
                  children: (
                    <span
                      style={{
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {f.value}
                    </span>
                  ),
                })),
              ]}
            />
            {detail.actorId && (
              <Space wrap>
                <Button
                  onClick={() => {
                    setActor(detail.actorId!);
                    setTab('audit');
                    setDetail(undefined);
                  }}
                >
                  查看账号审计
                </Button>
                <Button
                  onClick={() => {
                    setActor(detail.actorId!);
                    setTab('usage');
                    setDetail(undefined);
                  }}
                >
                  查看账号用量
                </Button>
              </Space>
            )}
            {detail.requestId && (
              <Button
                onClick={() => {
                  setRequest(detail.requestId!);
                  setTab('audit');
                  setDetail(undefined);
                }}
              >
                查看同请求操作
              </Button>
            )}
            {detail.resourceId && (
              <Button
                onClick={() => {
                  setResource(detail.resourceId!);
                  setActor('');
                  setRequest('');
                  setAction('');
                  setTab('audit');
                  setDetail(undefined);
                }}
              >
                查看同资源操作
              </Button>
            )}
          </>
        )}
        {account && (
          <Descriptions
            column={1}
            title="账号全景"
            items={account.map((f) => ({
              key: f.label,
              label: f.label,
              children: (
                <span style={{ whiteSpace: 'pre-wrap' }}>{f.value}</span>
              ),
            }))}
          />
        )}
        {account && detail && (
          <section className="governance-panel">
            <h3>核对具体资源权限</h3>
            <p>
              赛程/赛事动作填写赛事ID；材料动作填写任务ID。结果来自实际权限策略。
            </p>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Select
                aria-label="核对权限动作"
                value={policyAction}
                onChange={setPolicyAction}
                style={{ width: '100%' }}
                options={[
                  'schedule.read',
                  'schedule.draft.adjust',
                  'schedule.publish',
                  'event.operations',
                  'task.read',
                  'file.download',
                  'content.write',
                  'review',
                ].map((v) => ({ value: v, label: v }))}
              />
              <Input
                aria-label="权限资源ID"
                placeholder="赛事或任务ID"
                value={policyResource}
                onChange={(e) => setPolicyResource(e.target.value.trim())}
              />
              <Button
                disabled={!policyResource || busy}
                onClick={async () => {
                  setBusy(true);
                  setExplanation(undefined);
                  try {
                    const r = await client.request(
                      'explainGovernancePermission',
                      {
                        token,
                        path: { id: detail.id },
                        query: {
                          action: policyAction,
                          resourceId: policyResource,
                        },
                      },
                    );
                    setExplanation(r.metrics);
                  } catch (e) {
                    setError(err(e));
                    setDetail(undefined);
                    setAccount(undefined);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                核对权限
              </Button>
            </Space>
            {explanation && (
              <Descriptions
                column={1}
                items={explanation.map((f) => ({
                  key: f.label,
                  label: f.label,
                  children: f.value,
                }))}
              />
            )}
          </section>
        )}
        {review && (
          <section aria-label="对话审查正文">
            <Alert
              type="info"
              title="本次正文访问已记录；历史关联审计可能已过期"
            />
            {review.items.map((r) => (
              <article className="governance-turn" key={r.id}>
                <strong>{r.title}</strong>
                <small>{r.at}</small>
                <p>{r.fields.find((f) => f.label === '正文')?.value}</p>
              </article>
            ))}
            {review.nextCursor && (
              <Button
                onClick={async () => {
                  try {
                    const r = await client.request('reviewGovernanceDialogue', {
                      token,
                      path: { id: detail!.id },
                      body: {
                        reason: reviewReason,
                        cursor: review.nextCursor!,
                      },
                    });
                    setReview({ ...r, items: [...review.items, ...r.items] });
                  } catch (e) {
                    setReview(undefined);
                    setError(err(e));
                    if (
                      e instanceof ApiError &&
                      (e.status === 401 || e.status === 403)
                    ) {
                      setDetail(undefined);
                      setReview(undefined);
                      setAccount(undefined);
                      setEdit(undefined);
                    }
                  }
                }}
              >
                加载后续消息
              </Button>
            )}
          </section>
        )}
      </Drawer>
      <Modal
        title={
          {
            quota: '配置AI额度',
            price: '新增价格版本',
            bill: '录入账单',
            assignment: '指定费用归属',
            resolve: '人工核对Token用量',
            revoke: '确认撤销登录会话',
            review: '登记对话审查原因',
            alert: '登记告警处置',
          }[edit?.kind ?? '']
        }
        open={!!edit}
        onCancel={() => setEdit(undefined)}
        onOk={() => void submit()}
        confirmLoading={busy}
        okText="确认"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" preserve={false}>
          {edit?.kind === 'quota' && (
            <>
              <Form.Item name="scope" label="额度范围">
                <Select
                  options={[
                    { value: 'ACCOUNT', label: '账号' },
                    { value: 'ORGANIZATION', label: '机构' },
                  ]}
                />
              </Form.Item>
              {field('subjectId', '对象ID')}
              {field('expectedRevision', '当前版本（首次为0）', true, true)}
              <Form.Item
                name="enabled"
                label="启用额度"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
              <Form.Item name="paused" label="暂停AI" valuePropName="checked">
                <Switch />
              </Form.Item>
              {field('dailyTokens', '每日Token（空为不限）', false, true)}
              {field('monthlyTokens', '每月Token（空为不限）', false, true)}
              <p>预占包括输入估算和最大输出；在途或迟报可能导致超额。</p>
            </>
          )}
          {edit?.kind === 'price' && (
            <>
              {field('provider', '供应商主机名')}
              {field('model', '模型')}
              {field('currency', '币种，如CNY')}
              {field('inputMicrosPerMillion', '每百万输入Token价格（微货币）')}
              {field('outputMicrosPerMillion', '每百万输出Token价格（微货币）')}
              {field(
                'cachedMicrosPerMillion',
                '每百万缓存Token价格（微货币，可空）',
                false,
              )}
              {field('effectiveAt', '生效时间（ISO格式）')}
              <p>1元 = 1000000微元；新价格不改历史估算。</p>
            </>
          )}
          {edit?.kind === 'bill' && (
            <>
              {field('provider', '供应商主机名')}
              {field('currency', '币种')}
              {field('from', '账期开始（ISO格式，含）')}
              {field('to', '账期结束（ISO格式，不含）')}
              {field('amountMicros', '账单金额（微货币）')}
              {field('note', '账单来源及说明')}
            </>
          )}
          {edit?.kind === 'assignment' &&
            field('organizationId', '费用机构ID（留空只归属账号）', false)}
          {edit?.kind === 'resolve' && (
            <>
              {field('inputTokens', '已核实输入Token', true, true)}
              {field('outputTokens', '已核实输出Token', true, true)}
              <p>
                仅填写已取得的供应商证据，不以零替代未知。未完成调用须等待三分钟。
              </p>
            </>
          )}
          {edit?.kind === 'alert' && (
            <>
              {field('ownerId', '负责人账号ID', false)}
              {field('note', '处置备注')}
              <p>确认收到不会把仍在持续的故障标记为恢复。</p>
            </>
          )}
          {!['alert', 'bill'].includes(edit?.kind ?? '') &&
            field('reason', '操作原因')}
        </Form>
      </Modal>
    </section>
  );
}
