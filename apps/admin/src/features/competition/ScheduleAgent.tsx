import { useEffect, useState } from 'react';
import { Alert, Button, Input, Tag } from 'antd';
import { ApiError, type components } from '@caau/api-client';
import { client } from '../materials/client';
import { useAuth } from '../auth/AuthContext';

type Session = components['schemas']['AgentSessionViewDto'];
type Reply = components['schemas']['AgentReplyDto'];
type Candidate = components['schemas']['AgentCandidateDto'];
type ModelStatus = components['schemas']['AgentModelStatusDto'];
type AdjustmentResult =
  components['schemas']['AgentScheduleAdjustmentResultDto'];

function localTime(value: string) {
  return new Date(Date.parse(value) + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ');
}

export function ScheduleAgent({
  eventId,
  onDraftSaved,
}: {
  eventId: string;
  onDraftSaved?: () => void | Promise<void>;
}) {
  const auth = useAuth();
  const token =
    auth.mode === 'local'
      ? (sessionStorage.getItem('caau.local-test-session') ?? '')
      : '';
  const [session, setSession] = useState<Session>();
  const [reply, setReply] = useState<Reply>();
  const [input, setInput] = useState('');
  const [lastMessage, setLastMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelStatus>();
  const [modelStatusLoading, setModelStatusLoading] = useState(false);
  const [result, setResult] = useState<AdjustmentResult>();
  const [error, setError] = useState('');
  const isSuperAdmin = auth.identity?.roles.includes(
    'HEADQUARTERS_SUPER_ADMIN',
  );

  useEffect(() => {
    let alive = true;
    setSession(undefined);
    setReply(undefined);
    setResult(undefined);
    setError('');
    if (!eventId) return;
    setLoading(true);
    void client
      .request('listAgentSessions', { token })
      .then(async (sessions) => {
        const current = sessions.find(
          (item) => item.currentEventId === eventId,
        );
        return (
          current ??
          client.request('createAgentSession', {
            token,
            body: { currentEventId: eventId },
          })
        );
      })
      .then((value) => {
        if (alive) setSession(value);
      })
      .catch((cause) => {
        if (alive)
          setError(
            cause instanceof ApiError && cause.status === 403
              ? '当前账号无权恢复该智能体会话。'
              : '智能体暂时不可用，赛程页面其他功能不受影响。',
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [eventId, token, auth.identity?.id]);

  useEffect(() => {
    let alive = true;
    setModelStatus(undefined);
    if (!isSuperAdmin) return;
    void client
      .request('getAgentModelStatus', { token })
      .then((value) => {
        if (alive) setModelStatus(value);
      })
      .catch(() => {
        if (alive) setModelStatus(undefined);
      });
    return () => {
      alive = false;
    };
  }, [isSuperAdmin, token, auth.identity?.id]);

  async function testModelConnection() {
    setModelStatusLoading(true);
    try {
      setModelStatus(
        await client.request('testAgentModelConnection', { token }),
      );
    } catch {
      setError('模型连接测试未完成；未返回任何凭据信息。');
    } finally {
      setModelStatusLoading(false);
    }
  }

  async function send(candidate?: Candidate) {
    if (!session || (!input.trim() && !lastMessage)) return;
    const message = input.trim() || lastMessage;
    setLoading(true);
    setError('');
    setResult(undefined);
    try {
      const activeTask = reply?.task ?? session.task;
      const shouldContinue =
        !!reply ||
        activeTask?.step === 'LOCATE_EVENT' ||
        activeTask?.step === 'LOCATE_MATCH' ||
        activeTask?.step === 'WAITING_PARAMETERS';
      const next = await client.request('sendAgentMessage', {
        token,
        path: { sessionId: session.id },
        body: {
          message,
          eventId,
          ...(candidate ? { matchId: candidate.id } : {}),
          ...(activeTask && shouldContinue
            ? { taskId: activeTask.id }
            : activeTask
              ? { newTask: true }
              : {}),
        },
      });
      setReply(next);
      setLastMessage(message);
      setInput('');
      setSession(
        await client.request('getAgentSession', {
          token,
          path: { sessionId: session.id },
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 403
          ? '权限已变化，不能继续读取旧会话。'
          : cause instanceof ApiError && cause.status === 503
            ? '模型或智能体服务暂时不可用，未修改赛程。'
            : '未能生成预览，请检查描述后重试。',
      );
    } finally {
      setLoading(false);
    }
  }

  async function reloadSession() {
    if (!session) return;
    setSession(
      await client.request('getAgentSession', {
        token,
        path: { sessionId: session.id },
      }),
    );
  }

  async function confirmAdjustment() {
    const confirmation =
      reply?.task?.confirmation ?? session?.task?.confirmation;
    if (!confirmation || confirmation.state !== 'PENDING') return;
    setLoading(true);
    setError('');
    try {
      const executed = await client.request('confirmAgentScheduleAdjustment', {
        token,
        path: { ticketId: confirmation.id },
        body: {
          eventId: confirmation.eventId,
          matchId: confirmation.matchId,
          parameterHash: confirmation.parameterHash,
        },
      });
      setResult(executed);
      setReply(undefined);
      await reloadSession();
      await onDraftSaved?.();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 403
          ? '当前账号没有保存赛程草稿的权限，未执行调整。'
          : cause instanceof ApiError && cause.status === 409
            ? '确认已失效或赛程版本已变化，请重新生成预览。'
            : '保存草稿未完成；系统不会自动重复修改，请重试确认。',
      );
    } finally {
      setLoading(false);
    }
  }

  async function cancelAdjustment() {
    const confirmation =
      reply?.task?.confirmation ?? session?.task?.confirmation;
    if (!confirmation || confirmation.state !== 'PENDING') return;
    setLoading(true);
    setError('');
    try {
      await client.request('cancelAgentScheduleAdjustment', {
        token,
        path: { ticketId: confirmation.id },
      });
      setReply(undefined);
      await reloadSession();
    } catch {
      setError('取消未完成，请刷新后核对确认状态。');
    } finally {
      setLoading(false);
    }
  }

  const task = reply?.task ?? session?.task;
  const preview = task?.preview;
  const confirmation = task?.confirmation;
  const canDraftAdjust = auth.identity?.roles.some((role) =>
    ['HEADQUARTERS_SUPER_ADMIN', 'EVENT_MANAGER', 'ORGANIZER'].includes(role),
  );
  return (
    <section className="schedule-agent" aria-labelledby="schedule-agent-title">
      <div className="schedule-agent-heading">
        <div>
          <span className="competition-kicker">AI ASSISTANT</span>
          <h3 id="schedule-agent-title">赛程调整助手</h3>
          <p>先生成确定性预览，经人工确认后只保存草稿；智能体不会发布赛程。</p>
        </div>
        <Tag color="blue">预览 → 确认 → 草稿</Tag>
      </div>
      {error && <Alert type="warning" showIcon title={error} />}
      {isSuperAdmin && modelStatus && (
        <div className="schedule-agent-model-status">
          <div>
            <strong>模型状态</strong>
            <span>
              {modelStatus.mode} · {modelStatus.modelName} ·{' '}
              {modelStatus.baseUrlHost ?? '无外部主机'}
            </span>
            <small>
              凭据：{modelStatus.credentialsConfigured ? '已配置' : '未配置'}；
              最近测试：{modelStatus.lastConnectionTest.message}
              {modelStatus.lastConnectionTest.testedAt
                ? `（${localTime(modelStatus.lastConnectionTest.testedAt)}）`
                : ''}
            </small>
          </div>
          <Button
            size="small"
            loading={modelStatusLoading}
            onClick={() => void testModelConnection()}
          >
            测试模型连接
          </Button>
        </div>
      )}
      <div className="schedule-agent-compose">
        <label htmlFor="schedule-agent-input">调整要求</label>
        <Input.TextArea
          id="schedule-agent-input"
          value={input}
          rows={2}
          maxLength={2000}
          disabled={loading || !session}
          placeholder="例如：把周六第二场比赛改到周日十点"
          onChange={(event) => setInput(event.target.value)}
          onPressEnter={(event) => {
            if (!event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <Button
          type="primary"
          loading={loading}
          disabled={!session || !input.trim()}
          onClick={() => void send()}
        >
          生成调整预览
        </Button>
      </div>
      {!!reply?.candidates.length && (
        <div
          className="schedule-agent-candidates"
          role="group"
          aria-label="请选择比赛"
        >
          <strong>{reply.message}</strong>
          {reply.candidates.map((candidate) => (
            <Button
              key={candidate.id}
              onClick={() => void send(candidate)}
              disabled={loading}
            >
              {candidate.label}
              {candidate.detail ? ` · ${candidate.detail}` : ''}
            </Button>
          ))}
        </div>
      )}
      {result && (
        <Alert
          type={result.issues.length ? 'warning' : 'success'}
          showIcon
          title={`草稿已保存 · V${result.revision}`}
          description={
            <div className="schedule-agent-result-details">
              <span>状态：{result.status}</span>
              <span>赛事：{result.eventId}</span>
              <span>比赛：{result.matchId}</span>
              <span>命令：{result.commandId}</span>
              <span>{result.replayed ? '持久回执回放' : '首次执行回执'}</span>
              <span>
                {result.issues.length
                  ? `${result.issues.length} 项确定性冲突，发布前需处理`
                  : '未发现确定性冲突'}
              </span>
            </div>
          }
        />
      )}
      {preview && (
        <article className="schedule-agent-preview" aria-live="polite">
          <header>
            <div>
              <strong>
                {preview.before.homeLabel} vs {preview.before.awayLabel}
              </strong>
              <span>基线版本 V{preview.baselineRevision}</span>
            </div>
            <Tag color={preview.issues.length ? 'orange' : 'green'}>
              {preview.issues.length
                ? `${preview.issues.length} 项冲突`
                : '未发现冲突'}
            </Tag>
          </header>
          <div className="schedule-agent-diff">
            <div>
              <span>修改前</span>
              <strong>{localTime(preview.before.startAt)}</strong>
              <small>{preview.before.venue}</small>
            </div>
            <div>
              <span>修改后</span>
              <strong>{localTime(preview.after.startAt)}</strong>
              <small>{preview.after.venue}</small>
            </div>
          </div>
          {!!preview.issues.length && (
            <ul>
              {preview.issues.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>{issue.message}</li>
              ))}
            </ul>
          )}
          <p>
            此操作尚未保存。预览有效至 {localTime(preview.expiresAt)}
            ；版本变化或过期后必须重新预览。
          </p>
          {confirmation && (
            <div className="schedule-agent-confirmation">
              <dl>
                <div>
                  <dt>执行人</dt>
                  <dd>{confirmation.actorDisplayName}</dd>
                </div>
                <div>
                  <dt>赛事</dt>
                  <dd>{confirmation.eventName}</dd>
                </div>
                <div>
                  <dt>比赛</dt>
                  <dd>
                    {confirmation.parameterSummary.homeLabel} vs{' '}
                    {confirmation.parameterSummary.awayLabel}
                  </dd>
                </div>
                <div>
                  <dt>命令</dt>
                  <dd>
                    schedule.draft.adjust@{confirmation.toolVersion} · 预期 V
                    {confirmation.expectedRevision}
                  </dd>
                </div>
                <div>
                  <dt>调整</dt>
                  <dd>
                    {localTime(confirmation.parameterSummary.afterStartAt)} ·{' '}
                    {confirmation.parameterSummary.afterVenue}
                  </dd>
                </div>
                <div>
                  <dt>到期</dt>
                  <dd>{localTime(confirmation.expiresAt)}</dd>
                </div>
              </dl>
              {confirmation.state === 'PENDING' && (
                <div className="schedule-agent-confirm-actions">
                  <Button
                    type="primary"
                    loading={loading}
                    disabled={!canDraftAdjust}
                    onClick={() => void confirmAdjustment()}
                  >
                    确认保存草稿
                  </Button>
                  <Button
                    disabled={loading}
                    onClick={() => void cancelAdjustment()}
                  >
                    取消
                  </Button>
                  {!canDraftAdjust && <small>当前身份仅可读取预览。</small>}
                </div>
              )}
            </div>
          )}
        </article>
      )}
    </section>
  );
}
