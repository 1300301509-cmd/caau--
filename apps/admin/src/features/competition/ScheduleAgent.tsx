import { useEffect, useState } from 'react';
import { Alert, Button, Input, Tag } from 'antd';
import { ApiError, type components } from '@caau/api-client';
import { client } from '../materials/client';
import { useAuth } from '../auth/AuthContext';

type Session = components['schemas']['AgentSessionViewDto'];
type Reply = components['schemas']['AgentReplyDto'];
type Candidate = components['schemas']['AgentCandidateDto'];
type ModelStatus = components['schemas']['AgentModelStatusDto'];

function localTime(value: string) {
  return new Date(Date.parse(value) + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ');
}

export function ScheduleAgent({ eventId }: { eventId: string }) {
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
  const [error, setError] = useState('');
  const isSuperAdmin = auth.identity?.roles.includes(
    'HEADQUARTERS_SUPER_ADMIN',
  );

  useEffect(() => {
    let alive = true;
    setSession(undefined);
    setReply(undefined);
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

  const preview = reply?.task?.preview ?? session?.task?.preview;
  return (
    <section className="schedule-agent" aria-labelledby="schedule-agent-title">
      <div className="schedule-agent-heading">
        <div>
          <span className="competition-kicker">AI ASSISTANT</span>
          <h3 id="schedule-agent-title">赛程调整预览</h3>
          <p>用自然语言定位比赛并检查调整结果；本入口不会保存或发布赛程。</p>
        </div>
        <Tag color="blue">智能体生成 · 仅预览</Tag>
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
        </article>
      )}
    </section>
  );
}
