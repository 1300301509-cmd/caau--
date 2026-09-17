import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Modal, Spin, Tag } from 'antd';
import { ApiError, type components } from '@caau/api-client';
import { client } from '../materials/client';
import './hosting.css';

type S = components['schemas'];
type Detail = S['HostingApplicationDetailDto'];
type Submission = S['HostingSubmissionViewDto'];
type Status = Detail['status'];
type ReviewAction = 'supplement' | 'reject';
type FormSnapshot = {
  eventName?: string;
  startDate?: string;
  endDate?: string;
  location?: {
    administrativeArea?: {
      province?: string;
      city?: string;
      district?: string | null;
    };
    detailedAddress?: string;
    venueName?: string;
  };
  eventExperienceIntroduction?: string;
};
type FieldChange = {
  field?: string;
  status?: string;
  before?: unknown;
  after?: unknown;
};
type AttachmentFile = {
  id?: string;
  originalName?: string;
  extension?: string;
  expectedBytes?: number;
  sha256?: string;
};
type AttachmentChange = {
  requirementCode?: string;
  action?: string;
  files?: AttachmentFile[];
  removed?: AttachmentFile[];
  added?: AttachmentFile[];
};

const sessionKey = 'caau.local-test-session';
const statuses: Array<{ value: Status; label: string; color: string }> = [
  { value: 'PENDING_REVIEW', label: '待审核', color: 'blue' },
  { value: 'IN_REVIEW', label: '审核中', color: 'purple' },
  { value: 'NEEDS_SUPPLEMENT', label: '待补充', color: 'orange' },
  { value: 'APPROVED', label: '已通过', color: 'green' },
  { value: 'REJECTED', label: '已驳回', color: 'red' },
];
const statusMap = Object.fromEntries(
  statuses.map((item) => [item.value, item]),
);
const requirementNames: Record<string, string> = {
  BUSINESS_LICENSE: '营业执照',
  VENUE_PHOTO: '现场照片',
  OTHER_DOCUMENT: '其他附件',
};
const actionNames: Record<string, string> = {
  CREATE: '创建申请',
  SAVE: '保存草稿',
  UPLOAD_CONFIRM: '确认附件',
  UPLOAD_REMOVE: '移除附件',
  SUBMIT: '提交申请',
  START_REVIEW: '开始审核',
  REQUEST_SUPPLEMENT: '要求补充',
  REJECT: '驳回',
  APPROVE: '通过',
};
const fieldNames: Record<string, string> = {
  eventName: '赛事名称',
  startDate: '开始日期',
  endDate: '结束日期',
  'location.administrativeArea.province': '省份',
  'location.administrativeArea.city': '城市',
  'location.administrativeArea.district': '区县',
  'location.detailedAddress': '详细地址',
  'location.venueName': '场馆名称',
  eventExperienceIntroduction: '办赛经验简介',
};
const when = (value: string) =>
  new Date(value).toLocaleString('zh-CN', { hour12: false });
const size = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;
const text = (value: unknown) =>
  value === null || value === undefined || value === ''
    ? '未填写'
    : String(value);
const formOf = (submission?: Submission) =>
  (submission?.form ?? {}) as FormSnapshot;

export function HostingReviewPage() {
  const [choices, setChoices] = useState<S['LocalIdentityChoiceDto'][]>([]);
  const [identityKey, setIdentityKey] = useState('');
  const [identity, setIdentity] = useState<S['WorkspaceIdentityDto']>();
  const [token, setToken] = useState('');
  const [entryState, setEntryState] = useState<
    'loading' | 'enabled' | 'disabled' | 'unavailable'
  >('loading');
  const [details, setDetails] = useState<Detail[]>([]);
  const [selectedId, setSelectedId] = useState(
    () => new URLSearchParams(location.search).get('application') ?? '',
  );
  const [filter, setFilter] = useState<Status>('PENDING_REVIEW');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [reviewAction, setReviewAction] = useState<ReviewAction>();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const epoch = useRef(0);
  const activeToken = useRef('');

  const clearProtected = useCallback(() => {
    epoch.current += 1;
    activeToken.current = '';
    sessionStorage.removeItem(sessionKey);
    setToken('');
    setIdentity(undefined);
    setDetails([]);
    setSelectedId('');
  }, []);

  const load = useCallback(
    async (session: string, initial = false) => {
      const requestEpoch = ++epoch.current;
      if (initial) setLoading(true);
      try {
        const [nextIdentity, items] = await Promise.all([
          client.request('getWorkspaceIdentity', { token: session }),
          client.request('HostingController_list', { token: session }),
        ]);
        const reviewItems = nextIdentity.canReviewHostingApplications
          ? items.filter((item) => item.canReview)
          : [];
        const nextDetails = await Promise.all(
          reviewItems
            .filter((item) => item.status !== 'DRAFT')
            .map((item) =>
              client.request('HostingController_detail', {
                token: session,
                path: { id: item.id },
              }),
            ),
        );
        if (requestEpoch !== epoch.current || activeToken.current !== session)
          return;
        setIdentity(nextIdentity);
        setToken(session);
        setDetails(nextDetails);
        setError(
          nextIdentity.canReviewHostingApplications
            ? ''
            : '当前身份没有承办申请审核权限，请切换到有权总部审核人员。',
        );
        setSelectedId((current) =>
          nextDetails.some((item) => item.id === current)
            ? current
            : (nextDetails.find((item) => item.status === filter)?.id ??
              nextDetails[0]?.id ??
              ''),
        );
      } catch (reasonValue) {
        if (requestEpoch !== epoch.current || activeToken.current !== session)
          return;
        if (
          reasonValue instanceof ApiError &&
          (reasonValue.status === 401 || reasonValue.status === 403)
        ) {
          clearProtected();
          setError(
            reasonValue.status === 403
              ? '当前身份没有承办申请审核权限，或权限已被撤销。'
              : '测试会话已失效，请重新选择身份。',
          );
        } else
          setError(
            '承办申请暂时无法更新，请稍后重试。正在填写的审核意见已保留。',
          );
      } finally {
        if (requestEpoch === epoch.current) setLoading(false);
      }
    },
    [clearProtected, filter],
  );

  useEffect(() => {
    let mounted = true;
    void client
      .request('listLocalTestIdentities')
      .then(async (next) => {
        if (!mounted) return;
        setChoices(next);
        setIdentityKey(next[0]?.key ?? '');
        setEntryState('enabled');
        const saved = sessionStorage.getItem(sessionKey);
        if (saved) {
          activeToken.current = saved;
          await load(saved, true);
        }
      })
      .catch((reasonValue: unknown) => {
        if (!mounted) return;
        setEntryState(
          reasonValue instanceof ApiError && reasonValue.status === 503
            ? 'disabled'
            : 'unavailable',
        );
      });
    return () => {
      mounted = false;
      epoch.current += 1;
    };
  }, [load]);

  useEffect(() => {
    if (!token) return;
    const timer = window.setInterval(() => void load(token), 5000);
    return () => window.clearInterval(timer);
  }, [load, token]);

  const filtered = useMemo(
    () => details.filter((item) => item.status === filter),
    [details, filter],
  );
  const selected = details.find((item) => item.id === selectedId);
  const currentSubmission =
    selected?.submissions.find(
      (item) => item.id === selected.currentSubmissionId,
    ) ?? selected?.submissions.at(-1);
  const currentForm = formOf(currentSubmission);
  const selfReview =
    !!identity &&
    !!selected?.submissions.some((item) => item.submittedBy === identity.id);

  const select = (id: string) => {
    setSelectedId(id);
    setResult('');
    setError('');
    history.replaceState(null, '', `/hosting-applications?application=${id}`);
  };
  const runCommand = async (
    operation: 'HostingController_startReview' | 'HostingController_approve',
    success: string,
  ) => {
    if (!selected?.currentSubmissionId) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      await client.request(operation, {
        token,
        path: { id: selected.id },
        body: {
          submissionId: selected.currentSubmissionId,
          expectedRevision: selected.revision,
          key: crypto.randomUUID(),
        },
      });
      setResult(success);
      await load(token);
    } catch (reasonValue) {
      if (reasonValue instanceof ApiError && reasonValue.status === 409) {
        await load(token);
        setError('申请已由其他审核员更新，已加载最新结果。');
      } else if (
        reasonValue instanceof ApiError &&
        (reasonValue.status === 401 || reasonValue.status === 403)
      ) {
        clearProtected();
        setError('当前会话已失效或审核权限已撤销。');
      } else setError('操作未确认成功，请重试。');
    } finally {
      setBusy(false);
    }
  };
  const submitReason = async () => {
    if (!selected?.currentSubmissionId || !reviewAction) return;
    if (!reason.trim()) {
      setReasonError(
        reviewAction === 'reject' ? '请填写驳回原因。' : '请填写具体补充要求。',
      );
      return;
    }
    setBusy(true);
    setReasonError('');
    setError('');
    setResult('');
    const operation =
      reviewAction === 'reject'
        ? 'HostingController_reject'
        : 'HostingController_supplement';
    try {
      await client.request(operation, {
        token,
        path: { id: selected.id },
        body: {
          submissionId: selected.currentSubmissionId,
          expectedRevision: selected.revision,
          key: crypto.randomUUID(),
          reason: reason.trim(),
        },
      });
      setResult(
        reviewAction === 'reject'
          ? '申请已驳回，未创建赛事。'
          : '补充要求已发送，等待承办方提交新版本。',
      );
      setReviewAction(undefined);
      setReason('');
      await load(token);
    } catch (reasonValue) {
      if (reasonValue instanceof ApiError && reasonValue.status === 409) {
        setReasonError(
          '申请已由其他审核员更新。您的意见已保留，请核对最新状态后处理。',
        );
        await load(token);
      } else if (
        reasonValue instanceof ApiError &&
        (reasonValue.status === 401 || reasonValue.status === 403)
      ) {
        clearProtected();
        setReasonError('当前会话已失效或审核权限已撤销；意见已保留。');
      } else setReasonError('操作未确认成功，意见已保留，请重试。');
    } finally {
      setBusy(false);
    }
  };
  const download = async (attachment: S['HostingUploadViewDto']) => {
    setError('');
    try {
      const bytes = await client.request('HostingController_download', {
        token,
        path: { id: attachment.id },
      });
      const url = URL.createObjectURL(
        new Blob([bytes], { type: 'application/octet-stream' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.originalName;
      link.click();
      setResult(`附件已下载：${attachment.originalName}`);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reasonValue) {
      if (
        reasonValue instanceof ApiError &&
        (reasonValue.status === 401 || reasonValue.status === 403)
      )
        clearProtected();
      setError('附件下载失败，请确认当前权限后重试。');
    }
  };

  return (
    <div className="hosting-workspace">
      {entryState === 'loading' && <Card loading title="本地测试身份" />}
      {entryState === 'disabled' && (
        <Alert type="info" showIcon title="本地测试身份入口未启用" />
      )}
      {entryState === 'unavailable' && (
        <Alert type="warning" showIcon title="暂时无法连接本地 API" />
      )}
      {entryState === 'enabled' && (
        <Card
          className="hosting-identity"
          title={identity ? identity.displayName : '选择本地测试身份'}
          extra={<Tag color="gold">仅限本地测试</Tag>}
        >
          <p className="muted">
            请选择已取得承办申请审核权限的总部人员。身份保存在当前标签页。
          </p>
          <div className="hosting-identity-controls">
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
              disabled={!identityKey || busy}
              onClick={() => {
                setBusy(true);
                setError('');
                clearProtected();
                void client
                  .request('createLocalTestSession', {
                    body: {
                      identity:
                        identityKey as S['LocalSessionRequestDto']['identity'],
                    },
                  })
                  .then(async (session) => {
                    sessionStorage.setItem(sessionKey, session.token);
                    activeToken.current = session.token;
                    await load(session.token, true);
                  })
                  .catch(() =>
                    setError('无法进入该身份，请确认本地服务和权限准备。'),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              进入
            </Button>
            {identity && (
              <Button disabled={busy} onClick={clearProtected}>
                退出
              </Button>
            )}
          </div>
        </Card>
      )}
      {error && (
        <Alert
          className="hosting-alert"
          type="error"
          showIcon
          title={error}
          role="alert"
          action={
            token ? (
              <Button size="small" onClick={() => void load(token, true)}>
                重试
              </Button>
            ) : undefined
          }
        />
      )}
      {result && (
        <Alert
          className="hosting-alert"
          type="success"
          showIcon
          title={result}
          closable
          onClose={() => setResult('')}
        />
      )}
      {identity?.canReviewHostingApplications && (
        <>
          <Card
            className="hosting-queue"
            title="承办申请队列"
            extra={<span className="muted">共 {details.length} 项</span>}
          >
            <div
              className="hosting-status-tabs"
              role="group"
              aria-label="申请状态筛选"
            >
              {statuses.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  className={filter === item.value ? 'active' : ''}
                  aria-pressed={filter === item.value}
                  onClick={() => {
                    setFilter(item.value);
                    const first = details.find(
                      (detail) => detail.status === item.value,
                    );
                    if (first) select(first.id);
                  }}
                >
                  {item.label}
                  <span>
                    {
                      details.filter((detail) => detail.status === item.value)
                        .length
                    }
                  </span>
                </button>
              ))}
            </div>
            {loading && !details.length ? (
              <div className="hosting-loading">
                <Spin />
                <span>正在读取申请</span>
              </div>
            ) : (
              <div className="hosting-list">
                {filtered.map((item) => {
                  const submission =
                    item.submissions.find(
                      (value) => value.id === item.currentSubmissionId,
                    ) ?? item.submissions.at(-1);
                  const form = formOf(submission);
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`hosting-list-row ${selectedId === item.id ? 'selected' : ''}`}
                      aria-pressed={selectedId === item.id}
                      onClick={() => select(item.id)}
                    >
                      <span>
                        <strong>{form.eventName ?? '未命名赛事'}</strong>
                        <small>{item.applicantOrganizationName}</small>
                      </span>
                      <span>
                        <small>赛事日期</small>
                        {text(form.startDate)} — {text(form.endDate)}
                      </span>
                      <span>
                        <small>提交时间</small>
                        {submission ? when(submission.submittedAt) : '尚未提交'}
                      </span>
                      <Tag color={statusMap[item.status]?.color}>
                        {statusMap[item.status]?.label ?? item.status}
                      </Tag>
                    </button>
                  );
                })}
                {!filtered.length && (
                  <p className="hosting-empty">当前筛选下暂无申请。</p>
                )}
              </div>
            )}
          </Card>
          {selected && currentSubmission && (
            <div className="hosting-detail-grid">
              <main className="hosting-detail-main">
                <Card
                  title={
                    <div className="hosting-card-title">
                      <span>申请详情</span>
                      <Tag color={statusMap[selected.status]?.color}>
                        {statusMap[selected.status]?.label}
                      </Tag>
                    </div>
                  }
                >
                  <div className="hosting-summary">
                    <div>
                      <span>赛事名称</span>
                      <strong>{text(currentForm.eventName)}</strong>
                    </div>
                    <div>
                      <span>申请机构</span>
                      <strong>{selected.applicantOrganizationName}</strong>
                    </div>
                    <div>
                      <span>赛事日期</span>
                      <strong>
                        {text(currentForm.startDate)} 至{' '}
                        {text(currentForm.endDate)}
                      </strong>
                    </div>
                    <div>
                      <span>当前版本</span>
                      <strong>V{currentSubmission.version}</strong>
                    </div>
                  </div>
                  <section className="hosting-section">
                    <h3>赛事地点</h3>
                    <dl className="hosting-definition">
                      <div>
                        <dt>省 / 市 / 区县</dt>
                        <dd>
                          {[
                            currentForm.location?.administrativeArea?.province,
                            currentForm.location?.administrativeArea?.city,
                            currentForm.location?.administrativeArea?.district,
                          ]
                            .filter(Boolean)
                            .join(' / ') || '未填写'}
                        </dd>
                      </div>
                      <div>
                        <dt>详细地址</dt>
                        <dd>{text(currentForm.location?.detailedAddress)}</dd>
                      </div>
                      <div>
                        <dt>场馆名称</dt>
                        <dd>{text(currentForm.location?.venueName)}</dd>
                      </div>
                    </dl>
                  </section>
                  <section className="hosting-section">
                    <h3>办赛经验简介</h3>
                    <p className="hosting-long-text">
                      {text(currentForm.eventExperienceIntroduction)}
                    </p>
                  </section>
                  <section className="hosting-section">
                    <h3>申请资料</h3>
                    {Object.keys(requirementNames).map((code) => {
                      const files = currentSubmission.attachments.filter(
                        (file) => file.requirementCode === code,
                      );
                      return (
                        <div className="hosting-file-group" key={code}>
                          <div>
                            <strong>{requirementNames[code]}</strong>
                            <span>
                              {files.length
                                ? `${files.length} 个文件`
                                : code === 'OTHER_DOCUMENT'
                                  ? '未提交（选交）'
                                  : '未提交'}
                            </span>
                          </div>
                          {files.map((file) => (
                            <div className="hosting-file" key={file.id}>
                              <span>
                                <strong>{file.originalName}</strong>
                                <small>
                                  {file.extension.toUpperCase()} ·{' '}
                                  {size(file.expectedBytes)}
                                </small>
                              </span>
                              <Button
                                data-testid={`hosting-download-${file.id}`}
                                onClick={() => void download(file)}
                              >
                                下载
                              </Button>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </section>
                </Card>
                <Card title="提交版本与相邻版本对比">
                  <div className="hosting-version-tabs">
                    {selected.submissions.map((submission) => (
                      <a
                        key={submission.id}
                        href={`#submission-${submission.id}`}
                      >
                        V{submission.version} · {when(submission.submittedAt)}
                      </a>
                    ))}
                  </div>
                  {selected.diffs.length ? (
                    selected.diffs.map((diff, index) => (
                      <section
                        className="hosting-diff"
                        key={diff.toSubmissionId}
                      >
                        <h3>
                          V{index + 1} → V{index + 2}
                        </h3>
                        <div className="hosting-change-list">
                          {(diff.fieldChanges as FieldChange[])
                            .filter((change) => change.status === 'CHANGED')
                            .map((change) => (
                              <div key={change.field}>
                                <strong>
                                  {fieldNames[change.field ?? ''] ??
                                    change.field}
                                </strong>
                                <span>
                                  <del>{text(change.before)}</del>
                                  <b aria-hidden="true">→</b>
                                  <ins>{text(change.after)}</ins>
                                </span>
                              </div>
                            ))}
                        </div>
                        <div className="hosting-attachment-changes">
                          {(diff.attachmentChanges as AttachmentChange[])
                            .filter((change) => change.action !== 'UNCHANGED')
                            .map((change) => (
                              <div key={change.requirementCode}>
                                <strong>
                                  {requirementNames[
                                    change.requirementCode ?? ''
                                  ] ?? change.requirementCode}
                                </strong>
                                <span>
                                  {change.action === 'REPLACED'
                                    ? '替换'
                                    : change.action === 'ADDED'
                                      ? '新增'
                                      : '移除'}
                                  ：
                                  {[
                                    ...(change.files ?? []),
                                    ...(change.removed ?? []),
                                    ...(change.added ?? []),
                                  ]
                                    .map((file) => file.originalName)
                                    .join('、')}
                                </span>
                              </div>
                            ))}
                        </div>
                      </section>
                    ))
                  ) : (
                    <p className="muted">当前只有 V1，暂无相邻版本变化。</p>
                  )}
                </Card>
                <Card title="审核历史">
                  <ol className="hosting-history">
                    {selected.actions.map((action) => (
                      <li key={action.id}>
                        <span
                          className="hosting-history-dot"
                          aria-hidden="true"
                        />
                        <div>
                          <strong>
                            {actionNames[action.action] ?? action.action}
                          </strong>
                          <span>
                            {statusMap[action.fromState as Status]?.label ??
                              action.fromState}{' '}
                            →{' '}
                            {statusMap[action.toState as Status]?.label ??
                              action.toState}
                          </span>
                          <small>
                            操作人 {action.actorId} ·{' '}
                            <time dateTime={action.occurredAt}>
                              {when(action.occurredAt)}
                            </time>
                          </small>
                          {typeof action.detail === 'object' &&
                            action.detail &&
                            'reason' in action.detail && (
                              <p>
                                {text(
                                  (action.detail as { reason?: unknown })
                                    .reason,
                                )}
                              </p>
                            )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </Card>
              </main>
              <aside className="hosting-review-panel">
                <Card title="审核操作">
                  {selfReview && (
                    <Alert
                      type="warning"
                      showIcon
                      title="您提交过此申请，不能参与审核"
                    />
                  )}
                  {!selfReview && selected.status === 'PENDING_REVIEW' && (
                    <>
                      <p>
                        打开详情不会改变状态。明确开始后，其他有权审核员仍可接续处理。
                      </p>
                      <Button
                        data-testid="hosting-start-review"
                        type="primary"
                        block
                        loading={busy}
                        onClick={() =>
                          Modal.confirm({
                            title: '开始审核当前版本？',
                            content: `将记录您开始审核 V${currentSubmission.version}，但不会独占申请。`,
                            okText: '开始审核',
                            cancelText: '取消',
                            onOk: () =>
                              runCommand(
                                'HostingController_startReview',
                                '已开始审核，其他有权审核员仍可接续。',
                              ),
                          })
                        }
                      >
                        开始审核
                      </Button>
                    </>
                  )}
                  {!selfReview && selected.status === 'IN_REVIEW' && (
                    <>
                      <p>
                        结论将固定到 V{currentSubmission.version}
                        。通过会原子创建唯一筹备赛事；补充和驳回均不会创建赛事。
                      </p>
                      <div className="hosting-review-actions">
                        <Button
                          data-testid="hosting-request-supplement"
                          onClick={() => {
                            setReviewAction('supplement');
                            setReasonError('');
                          }}
                        >
                          要求补充
                        </Button>
                        <Button
                          data-testid="hosting-reject"
                          danger
                          onClick={() => {
                            setReviewAction('reject');
                            setReasonError('');
                          }}
                        >
                          驳回
                        </Button>
                        <Button
                          data-testid="hosting-approve"
                          type="primary"
                          loading={busy}
                          onClick={() =>
                            Modal.confirm({
                              title: '确认通过申请？',
                              content:
                                '通过后将创建唯一正式赛事、申请来源和承办机构关系，不能在本页撤销。',
                              okText: '确认通过',
                              cancelText: '取消',
                              onOk: () =>
                                runCommand(
                                  'HostingController_approve',
                                  '申请已通过，唯一筹备赛事已创建。',
                                ),
                            })
                          }
                        >
                          通过
                        </Button>
                      </div>
                    </>
                  )}
                  {selected.status === 'NEEDS_SUPPLEMENT' && (
                    <Alert
                      type="info"
                      showIcon
                      title="已要求承办方补充"
                      description="等待承办方在同一申请提交下一版本。"
                    />
                  )}
                  {selected.status === 'REJECTED' && (
                    <Alert
                      type="error"
                      showIcon
                      title="申请已驳回"
                      description="该申请只读保留，且未创建赛事。"
                    />
                  )}
                  {selected.status === 'APPROVED' && (
                    <div className="hosting-approved">
                      <Tag color="green">原子获批完成</Tag>
                      <h3>正式赛事已创建</h3>
                      <dl>
                        <div>
                          <dt>赛事</dt>
                          <dd>{currentForm.eventName}</dd>
                        </div>
                        <div>
                          <dt>承办机构</dt>
                          <dd>{selected.applicantOrganizationName}</dd>
                        </div>
                        <div>
                          <dt>申请来源</dt>
                          <dd>本申请 · V{currentSubmission.version}</dd>
                        </div>
                      </dl>
                      {selected.approvedEventId && (
                        <Button
                          type="primary"
                          href={`/events?event=${selected.approvedEventId}`}
                        >
                          进入正式赛事
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              </aside>
            </div>
          )}
        </>
      )}
      <Modal
        className="hosting-reason-modal"
        title={reviewAction === 'reject' ? '驳回申请' : '要求补充材料'}
        open={!!reviewAction}
        onCancel={() => !busy && setReviewAction(undefined)}
        footer={null}
        destroyOnHidden={false}
      >
        <p>
          {reviewAction === 'reject'
            ? '驳回后当前申请终止，且不会创建赛事。'
            : '说明需要补充或修改的内容；承办方将沿用本申请提交 Vn+1。'}
        </p>
        {reasonError && (
          <Alert type="error" showIcon title={reasonError} role="alert" />
        )}
        <label htmlFor="hosting-review-reason">
          {reviewAction === 'reject' ? '驳回原因' : '补充要求'}
          <textarea
            id="hosting-review-reason"
            maxLength={2000}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            disabled={busy}
          />
        </label>
        <div className="hosting-modal-actions">
          <Button disabled={busy} onClick={() => setReviewAction(undefined)}>
            取消
          </Button>
          <Button
            type={reviewAction === 'reject' ? 'default' : 'primary'}
            danger={reviewAction === 'reject'}
            loading={busy}
            onClick={() => void submitReason()}
          >
            确认{reviewAction === 'reject' ? '驳回' : '发送'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
