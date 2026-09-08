import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Modal } from 'antd';
import {
  executionStatus,
  workflowError,
  type components,
} from '@caau/api-client';
import { client } from './client';
import type { Task, Directory } from './types';
import { VersionHistory } from './VersionHistory';
type S = components['schemas'];
export function ReviewPanel({
  task,
  token,
  manager,
  reviewer,
  directory,
  changed,
}: {
  task: Task;
  token: string;
  manager: boolean;
  reviewer: boolean;
  directory: Directory;
  changed: () => Promise<void>;
}) {
  const [execution, setExecution] = useState<S['ExecutionViewDto']>();
  const [versions, setVersions] = useState<S['SubmissionViewDto'][]>([]);
  const [history, setHistory] = useState<S['DeadlineHistoryDto'][]>([]);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(false);
  const lock = useRef(false);
  const [action, setAction] = useState<
    'PASS' | 'RETURN' | 'EXTEND' | 'HANDOVER' | 'CLOSE'
  >();
  const [issues, setIssues] = useState<S['IssueDto'][]>([]),
    [reason, setReason] = useState(''),
    [deadline, setDeadline] = useState(''),
    [member, setMember] = useState('');
  async function refresh() {
    const tokenPath = { token, path: { id: task.id } };
    const [e, v, h] = await Promise.all([
      client.request('getTaskExecution', tokenPath),
      client.request('listSubmissionVersions', tokenPath),
      client.request('listDeadlineExtensions', tokenPath),
    ]);
    setExecution(e);
    setVersions(v);
    setHistory(h);
  }
  async function run(work: () => Promise<void>, success?: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice('');
    try {
      await work();
      setError(false);
      if (success) setNotice(success);
    } catch (e) {
      setError(true);
      setNotice(workflowError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    void run(refresh);
  }, [task.id, token]); // Commands always reauthorize on server.
  const current = versions.find((v) => v.id === execution?.currentSubmissionId);
  const members = directory.members.filter(
    (m) =>
      m.role === 'ORGANIZER' &&
      m.organizationId === task.organizationId &&
      m.id !== task.handlerMemberId,
  );
  async function commit() {
    if (!action || !execution) return;
    const path = { id: task.id },
      expectedRevision = execution.revision;
    if (action === 'PASS' || action === 'RETURN') {
      if (!current) return;
      await client.request('reviewMaterialPackage', {
        token,
        path,
        body: {
          submissionId: current.id,
          decision: action,
          issues: action === 'PASS' ? [] : issues,
        },
      });
    }
    if (action === 'EXTEND')
      await client.request('extendTaskDeadline', {
        token,
        path,
        body: {
          expectedRevision,
          newDeadline: new Date(deadline).toISOString(),
          reason,
        },
      });
    if (action === 'HANDOVER')
      await client.request('handoverTaskHandler', {
        token,
        path,
        body: { expectedRevision, handlerMemberId: member },
      });
    if (action === 'CLOSE')
      await client.request('closeMaterialTask', {
        token,
        path,
        body: { expectedRevision, reason },
      });
    setAction(undefined);
    setIssues([]);
    await refresh();
    await changed();
  }
  const valid =
    action === 'RETURN'
      ? issues.length > 0 &&
        issues.every((i) => i.reason.trim() && i.instruction.trim())
      : action === 'EXTEND'
        ? !!deadline && !!reason.trim()
        : action === 'CLOSE'
          ? !!reason.trim()
          : action === 'HANDOVER'
            ? !!member
            : true;
  const labels = {
    PASS: '整包通过',
    RETURN: '整包退回',
    EXTEND: '延期',
    HANDOVER: '同机构交接',
    CLOSE: '关闭任务',
  };
  return (
    <section aria-label="总部材料执行">
      <Card title="办理进度与总部操作">
        <p>
          当前状态：{executionStatus(execution)} · 当前提交{' '}
          {current ? `V${current.version}` : '无'}
        </p>
        <p>
          有效截止：
          {execution && new Date(execution.deadlines.task).toLocaleString()}
        </p>
        <div aria-live="polite">
          {notice && (
            <Alert type={error ? 'error' : 'success'} title={notice} />
          )}
        </div>
        <div className="actions">
          <Button
            disabled={busy}
            onClick={() => void run(refresh, '已核对最新状态')}
          >
            刷新办理进度
          </Button>
          {reviewer && execution?.state === 'SUBMITTED' && (
            <>
              <Button
                type="primary"
                disabled={busy}
                onClick={() => setAction('PASS')}
              >
                整包通过
              </Button>
              <Button
                danger
                disabled={busy}
                onClick={() => setAction('RETURN')}
              >
                整包退回
              </Button>
            </>
          )}
          {manager && execution?.state !== 'CLOSED' && (
            <>
              {execution?.state !== 'APPROVED' && (
                <Button
                  aria-label="延期"
                  disabled={busy}
                  onClick={() => setAction('EXTEND')}
                >
                  延期
                </Button>
              )}
              <Button disabled={busy} onClick={() => setAction('HANDOVER')}>
                同机构交接
              </Button>
              <Button danger disabled={busy} onClick={() => setAction('CLOSE')}>
                关闭任务
              </Button>
            </>
          )}
        </div>
        {history.length > 0 && (
          <details>
            <summary>延期历史（{history.length}）</summary>
            {history.map((h) => (
              <p key={h.id}>
                {new Date(h.occurredAt).toLocaleString()} · {h.actorId} ·{' '}
                {h.reason}
                <br />
                {h.previous.task} → {h.next.task}
              </p>
            ))}
          </details>
        )}
      </Card>
      <VersionHistory
        token={token}
        versions={versions}
        requirements={task.requirements}
      />
      <Modal
        className="workflow-modal"
        title={action ? `确认${labels[action]}` : ''}
        open={!!action}
        confirmLoading={busy}
        okText="确认执行"
        cancelText="返回核对"
        okButtonProps={{ disabled: !valid }}
        onCancel={() => {
          if (!busy) setAction(undefined);
        }}
        onOk={() => void run(commit, '操作已完成，历史已保留')}
      >
        <p>
          任务：{task.title} · 当前提交 {current ? `V${current.version}` : '无'}
          。请核对后执行，不修改原提交与审核记录。
        </p>
        {action === 'PASS' && <p>通过后材料冻结，不再允许修改或重交。</p>}
        {action === 'RETURN' && (
          <>
            <p>
              整包退回将生成新草稿；选择问题材料并填写原因和修改要求。不会自动延期。
            </p>
            {task.requirements?.materials.map((m) => {
              const issue = issues.find((i) => i.materialId === m.id);
              return (
                <fieldset key={m.id} disabled={busy}>
                  <legend>
                    <label>
                      <input
                        type="checkbox"
                        checked={!!issue}
                        onChange={(e) =>
                          setIssues((old) =>
                            e.target.checked
                              ? [
                                  ...old,
                                  {
                                    materialId: m.id,
                                    reason: '',
                                    instruction: '',
                                  },
                                ]
                              : old.filter((i) => i.materialId !== m.id),
                          )
                        }
                      />
                      {m.title}
                    </label>
                  </legend>
                  {issue && (
                    <>
                      {(['reason', 'instruction'] as const).map((key) => (
                        <label key={key}>
                          {key === 'reason' ? '退回原因' : '修改要求'} ·{' '}
                          {m.title}
                          <textarea
                            aria-label={`${key === 'reason' ? '退回原因' : '修改要求'} · ${m.title}`}
                            maxLength={2000}
                            value={issue[key]}
                            onChange={(e) =>
                              setIssues((old) =>
                                old.map((i) =>
                                  i.materialId === m.id
                                    ? { ...i, [key]: e.target.value }
                                    : i,
                                ),
                              )
                            }
                          />
                        </label>
                      ))}
                    </>
                  )}
                </fieldset>
              );
            })}
          </>
        )}
        {(action === 'EXTEND' || action === 'CLOSE') && (
          <label>
            操作原因
            <textarea
              aria-label="操作原因"
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
        {action === 'EXTEND' && (
          <label>
            新截止时间
            <input
              aria-label="新截止时间"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
            <p>
              当前 {execution?.deadlines.task}
              ；新截止必须晚于任务与全部材料旧截止及服务器时间。
            </p>
          </label>
        )}
        {action === 'HANDOVER' && (
          <>
            <p>
              只限同机构。新经办人继承材料和历史，旧经办人立即失去访问权。未完成上传须重传。
            </p>
            <label>
              新经办人
              <select
                aria-label="新经办人"
                value={member}
                onChange={(e) => setMember(e.target.value)}
              >
                <option value="">请选择</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {directory.users.find((u) => u.id === m.userId)
                      ?.displayName ?? m.id}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {action === 'CLOSE' && (
          <p>
            关闭后禁止编辑、提交和审核。更换机构须另建任务，不复制旧机构材料。
          </p>
        )}
        {error && notice && <Alert type="error" title={notice} />}
      </Modal>
    </section>
  );
}
export function ReviewQueue({
  tasks,
  token,
  open,
}: {
  tasks: Task[];
  token: string;
  open: (id: string) => void;
}) {
  const [queue, setQueue] = useState<Task[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    void Promise.all(
      tasks
        .filter((t) => t.state === 'PUBLISHED')
        .map(async (t) => ({
          task: t,
          execution: await client.request('getTaskExecution', {
            token,
            path: { id: t.id },
          }),
        })),
    )
      .then((rows) => {
        if (live) {
          setQueue(
            rows
              .filter((r) => r.execution.state === 'SUBMITTED')
              .map((r) => r.task),
          );
          setError('');
        }
      })
      .catch((e) => {
        if (live) setError(workflowError(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [tasks, token]);
  return (
    <Card title="待审核列表">
      {loading ? (
        <p>正在读取队列…</p>
      ) : error ? (
        <Alert type="error" title={error} />
      ) : queue.length ? (
        queue.map((t) => (
          <div className="task-row" key={t.id}>
            <strong>{t.title}</strong>
            <Button onClick={() => open(t.id)}>审核 {t.title}</Button>
          </div>
        ))
      ) : (
        <p>暂无待审核材料。处理后可刷新数据核对队列。</p>
      )}
    </Card>
  );
}
