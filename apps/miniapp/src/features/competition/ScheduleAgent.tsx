import { useEffect, useRef, useState } from 'react';
import { Text, View } from '@tarojs/components';
import { useDidShow } from '@tarojs/taro';
import { ApiError } from '@caau/api-client';
import {
  clearSession,
  client,
  session as login,
  subscribeSession,
} from '../materials/session';
import { Action, Field } from './shared';
import { bj, type S } from './model';

type AgentSession = S['AgentSessionViewDto'];
type Reply = S['AgentReplyDto'];
type Receipt = S['AgentScheduleAdjustmentResultDto'];
type Candidate = S['AgentCandidateDto'];

const pendingLabel: Record<string, string> = {
  sourceMatchId: '请描述或选择具体比赛',
  sourceWeekday: '请说明原比赛在哪一天',
  sourceOrdinal: '请说明原比赛是当天第几场',
  targetWeekday: '请说明调整到星期几',
  targetDate: '请说明目标日期',
  targetTime: '请说明调整后的北京时间',
};

export function ScheduleAgent({
  eventId,
  schedule,
  onSaved,
  onDenied,
  denied,
}: {
  eventId: string;
  schedule?: S['ScheduleViewDto'];
  onSaved: () => Promise<void>;
  onDenied: () => void;
  denied: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState<AgentSession>();
  const [reply, setReply] = useState<Reply>();
  const [receipt, setReceipt] = useState<Receipt>();
  const [input, setInput] = useState('');
  const [lastMessage, setLastMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const event = useRef(eventId);
  event.current = eventId;
  const reset = () => {
    setCurrent(undefined);
    setReply(undefined);
    setReceipt(undefined);
    setInput('');
    setLastMessage('');
    setError('');
    setBlocked(false);
  };
  useEffect(() => {
    alive.current = true;
    const stop = subscribeSession(() => {
      reset();
      setVisible(false);
    });
    return () => {
      alive.current = false;
      stop();
    };
  }, []);
  useEffect(() => {
    reset();
    setVisible(false);
  }, [eventId]);
  useEffect(() => {
    if (denied) {
      reset();
      setVisible(false);
    }
  }, [denied]);
  const authorized = (token: string, epoch: number, selected: string) =>
    alive.current &&
    event.current === selected &&
    login.token === token &&
    login.epoch === epoch;

  function failure(
    cause: unknown,
    token: string,
    epoch: number,
    selected: string,
  ) {
    if (!authorized(token, epoch, selected)) return;
    if (cause instanceof ApiError && cause.status === 401) {
      clearSession();
    } else if (cause instanceof ApiError && cause.status === 403) {
      reset();
      onDenied();
      setError('当前账号已无权读取该赛事或任务，请返回首页重新选择。');
    } else if (cause instanceof ApiError && cause.status === 409) {
      setReply(undefined);
      setBlocked(true);
      setError('赛程版本或预览已变化，请刷新赛程并重新生成预览。');
      void onSaved();
    } else if (cause instanceof ApiError && cause.status === 503) {
      setError('模型或智能体服务暂时不可用，未修改赛程。请稍后重试。');
    } else {
      setError('结果尚未确认。请先核对执行回执，再使用原票据重试。');
    }
  }
  async function operate(
    work: (token: string, valid: () => boolean) => Promise<void>,
  ) {
    if (lock.current || !login.token || !eventId) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const token = login.token;
    const epoch = login.epoch;
    const selected = eventId;
    const valid = () => authorized(token, epoch, selected);
    try {
      await work(token, valid);
    } catch (cause) {
      failure(cause, token, epoch, selected);
    } finally {
      lock.current = false;
      if (valid()) setBusy(false);
    }
  }
  async function restore(token: string, valid: () => boolean) {
    const sessions = await client.request('listAgentSessions', { token });
    if (!valid()) return;
    const forEvent = sessions.filter((item) => item.currentEventId === eventId);
    const selected =
      forEvent.find((item) => item.lastExecution?.result.eventId === eventId) ??
      forEvent[0];
    const latest =
      selected ??
      (await client.request('createAgentSession', {
        token,
        body: { currentEventId: eventId },
      }));
    if (!valid()) return;
    setCurrent(latest);
    setReply(undefined);
    setReceipt(undefined);
    setBlocked(false);
    setLastMessage(
      latest.turns.find((turn) => turn.role === 'USER')?.content ?? '',
    );
  }
  useDidShow(() => {
    if (!denied) void operate(restore);
  });
  async function open() {
    if (visible) {
      setVisible(false);
      return;
    }
    setVisible(true);
    await operate(restore);
  }
  async function refresh() {
    await operate(async (token, valid) => {
      await restore(token, valid);
      if (valid()) await onSaved();
    });
  }
  async function send(candidate?: Candidate) {
    const message = input.trim() || (candidate ? lastMessage : '');
    if (!current || !message) return;
    await operate(async (token, valid) => {
      const active = reply?.task ?? current.task;
      const continuing =
        !!candidate ||
        !!reply ||
        ['LOCATE_EVENT', 'LOCATE_MATCH', 'WAITING_PARAMETERS'].includes(
          active?.step ?? '',
        );
      const next = await client.request('sendAgentMessage', {
        token,
        path: { sessionId: current.id },
        body: {
          message,
          eventId,
          ...(candidate ? { matchId: candidate.id } : {}),
          ...(active && continuing
            ? { taskId: active.id }
            : active
              ? { newTask: true }
              : {}),
        },
      });
      if (!valid()) return;
      const latest = await client.request('getAgentSession', {
        token,
        path: { sessionId: current.id },
      });
      if (!valid()) return;
      setReply(next);
      setCurrent(latest);
      setReceipt(undefined);
      setBlocked(false);
      setLastMessage(message);
      setInput('');
      if (next.status === 'STALE')
        setError('预览已过期或版本已变化，请刷新赛程后重新预览。');
    });
  }
  const task = reply?.task ?? current?.task;
  const preview = task?.preview;
  const ticket = task?.confirmation;
  const execution = receipt ?? current?.lastExecution?.result;
  const expired = !!ticket && Date.parse(ticket.expiresAt) <= Date.now();
  const staleRevision =
    !!ticket &&
    !!schedule?.exists &&
    schedule.revision !== ticket.expectedRevision;
  async function confirmDraft() {
    if (!ticket || ticket.state !== 'PENDING' || blocked || staleRevision)
      return;
    if (Date.parse(ticket.expiresAt) <= Date.now()) {
      setBlocked(true);
      setError('确认已过期，请刷新赛程并重新生成预览。');
      return;
    }
    await operate(async (token, valid) => {
      try {
        const result = await client.request('confirmAgentScheduleAdjustment', {
          token,
          path: { ticketId: ticket.id },
          body: {
            eventId: ticket.eventId,
            matchId: ticket.matchId,
            parameterHash: ticket.parameterHash,
          },
        });
        if (!valid()) return;
        setReceipt(result);
        setReply(undefined);
        const latest = await client.request('getAgentSession', {
          token,
          path: { sessionId: current!.id },
        });
        if (valid()) {
          setCurrent(latest);
          await onSaved();
        }
      } catch (cause) {
        if (
          !(cause instanceof ApiError && [401, 403, 409].includes(cause.status))
        ) {
          try {
            const latest = await client.request('getAgentSession', {
              token,
              path: { sessionId: current!.id },
            });
            if (!valid()) return;
            setCurrent(latest);
            if (latest.lastExecution?.result.ticketId === ticket.id) {
              setReply(undefined);
              setReceipt(latest.lastExecution.result);
              await onSaved();
              return;
            }
          } catch (recoveryError) {
            if (
              recoveryError instanceof ApiError &&
              [401, 403].includes(recoveryError.status)
            )
              throw recoveryError;
          }
        }
        throw cause;
      }
    });
  }
  async function cancelTicket() {
    if (!ticket || ticket.state !== 'PENDING') return;
    await operate(async (token, valid) => {
      await client.request('cancelAgentScheduleAdjustment', {
        token,
        path: { ticketId: ticket.id },
      });
      if (!valid()) return;
      const latest = await client.request('getAgentSession', {
        token,
        path: { sessionId: current!.id },
      });
      if (valid()) {
        setReply(undefined);
        setCurrent(latest);
      }
    });
  }
  return (
    <View className="card competition-agent">
      <Text className="subtitle">赛程调整助手</Text>
      <Text className="competition-note">
        自然语言只生成单场改期预览；人工确认后保存草稿，不会发布赛程。
      </Text>
      {!visible && current?.lastExecution && (
        <Text className="competition-line">
          上次执行 · 草稿 V{current.lastExecution.result.revision}
          ，打开助手查看持久回执
        </Text>
      )}
      <Action disabled={busy || denied} onClick={() => void open()}>
        {visible ? '收起助手' : '打开赛程助手'}
      </Action>
      {visible && (
        <View>
          {error && (
            <View className="competition-error" role="alert">
              {error}
            </View>
          )}
          {busy && (
            <View className="competition-note" role="status">
              正在处理，请稍候…
            </View>
          )}
          <Action disabled={busy} onClick={() => void refresh()}>
            刷新任务与回执
          </Action>
          {execution?.eventId === eventId && (
            <View className="competition-agent-receipt">
              <Text className="subtitle">
                该命令当时执行 · 草稿 V{execution.revision}
              </Text>
              <Text className="competition-line">
                命令：{execution.commandId}
              </Text>
              {current?.lastExecution?.result.commandId ===
                execution.commandId && (
                <Text className="competition-line">
                  执行于：
                  {bj(current.lastExecution.executedAt).replace('T', ' ')}
                </Text>
              )}
              <Text className="competition-line">
                执行时状态：{execution.status} · {execution.issues.length}{' '}
                项冲突
              </Text>
              <Text className="competition-line">
                赛程当前状态：
                {schedule && schedule.revision >= execution.revision
                  ? `${schedule.status} · V${schedule.revision}`
                  : '待刷新'}
                （以当前赛程为准）
              </Text>
              {!receipt && (
                <Text className="competition-note">持久执行回执（恢复）</Text>
              )}
            </View>
          )}
          {current && (
            <View>
              <Field
                label="调整要求"
                max={2000}
                value={input}
                disabled={busy}
                onChange={setInput}
              />
              <Text className="competition-note">
                例如：把周六第二场移到周日 → 上午十点 →
                再晚半小时。场地保持原值。
              </Text>
              <Action
                primary
                disabled={busy || !input.trim()}
                onClick={() => void send()}
              >
                生成调整预览
              </Action>
              {task?.step === 'WAITING_PARAMETERS' && (
                <Text className="competition-line">
                  待补充：
                  {task.pendingFields
                    .map((field) => pendingLabel[field] ?? '请补充调整条件')
                    .join('、')}
                </Text>
              )}
              {task?.step === 'LOCATE_MATCH' && !reply?.candidates.length && (
                <Text className="competition-line">
                  请重新发送上次描述以恢复候选场次。
                </Text>
              )}
              {!!reply?.candidates.length && (
                <View>
                  <Text className="competition-line">
                    {reply.message} · 请选择比赛
                  </Text>
                  {reply.candidates.map((choice) => (
                    <Action
                      key={choice.id}
                      disabled={busy}
                      onClick={() => void send(choice)}
                    >
                      {choice.label}
                      {choice.detail ? ` · ${choice.detail}` : ''}
                    </Action>
                  ))}
                </View>
              )}
              {reply?.message && !reply.candidates.length && !preview && (
                <Text className="competition-line">{reply.message}</Text>
              )}
              {['STALE', 'CANCELLED'].includes(task?.step ?? '') && (
                <Text className="competition-line">
                  当前预览已失效；请刷新赛程并重新描述调整。
                </Text>
              )}
              {preview && (
                <View className="competition-agent-preview">
                  <Text className="subtitle">
                    修改前后 · 基线 V{preview.baselineRevision}
                  </Text>
                  <Text className="competition-line">
                    {preview.before.homeLabel} vs {preview.before.awayLabel}
                  </Text>
                  <Text className="competition-line">
                    修改前：
                    {preview.before.startAt
                      ? bj(preview.before.startAt).replace('T', ' ')
                      : '待安排'}{' '}
                    · {preview.before.venue}
                  </Text>
                  <Text className="competition-line">
                    修改后：{bj(preview.after.startAt).replace('T', ' ')} ·{' '}
                    {preview.after.venue}
                  </Text>
                  <Text className="competition-line">
                    确定性冲突：{preview.issues.length} 项
                  </Text>
                  {preview.issues.map((issue, index) => (
                    <Text className="competition-line" key={index}>
                      {issue.message}
                    </Text>
                  ))}
                  <Text className="competition-note">
                    尚未保存 · 有效至 {bj(preview.expiresAt).replace('T', ' ')}
                    ；过期或版本变化须重新预览。
                  </Text>
                  {ticket?.state === 'PENDING' && (
                    <View>
                      <Text className="competition-line">
                        执行人：{ticket.actorDisplayName} · 预期 V
                        {ticket.expectedRevision}
                      </Text>
                      <Text className="competition-line">
                        赛事：{ticket.eventName} · 工具：schedule.draft.adjust@
                        {ticket.toolVersion}
                      </Text>
                      {expired || staleRevision || blocked ? (
                        <Text className="competition-error">
                          {expired ? '确认已过期' : '赛程版本或确认状态已变化'}
                          ，请刷新并重新预览。
                        </Text>
                      ) : (
                        <Action
                          primary
                          disabled={busy}
                          onClick={() => void confirmDraft()}
                        >
                          确认保存草稿
                        </Action>
                      )}
                      <Action
                        disabled={busy}
                        onClick={() => void cancelTicket()}
                      >
                        取消本次确认
                      </Action>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
