import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Select, Tag } from 'antd';
import {
  AgentStreamInterruptedError,
  ApiError,
  type components,
} from '@caau/api-client';
import { client, streamAgentMessage } from '../materials/client';
import { useAuth } from '../auth/AuthContext';
import { CandidateCard } from './CandidateCard';
import { AgentIcon } from './AgentIcon';
import { AgentUiIcon } from './AgentUiIcon';
import { MemorySettings } from './MemorySettings';

type S = components['schemas'];
type Session = S['AgentSessionViewDto'];
type Reply = S['AgentReplyDto'];
type Candidate = S['AgentCandidateDto'];
type Receipt = S['AgentScheduleAdjustmentResultDto'];
type Planning = S['AgentPlanningRequestViewDto'];
const localTime = (value: string) =>
  value
    ? new Date(Date.parse(value) + 8 * 3600000)
        .toISOString()
        .slice(0, 16)
        .replace('T', ' ')
    : '待安排';
const pendingLabel: Record<string, string> = {
  targetTime: '目标北京时间',
  targetDate: '目标日期',
  sourceMatchId: '具体比赛',
  eventId: '赛事',
};
const active = (step?: string) =>
  [
    'LOCATE_EVENT',
    'LOCATE_MATCH',
    'WAITING_PARAMETERS',
    'PREVIEW_READY',
  ].includes(step ?? '');

function PlanningCard({
  planning,
  loading,
  blocked,
  onConfirm,
}: {
  planning: Planning;
  loading: boolean;
  blocked: boolean;
  onConfirm: () => void;
}) {
  const canConfirm =
    planning.status === 'COLLECTING' &&
    !!planning.conditions.length &&
    !planning.pending.length &&
    !planning.issues.length &&
    !blocked;
  return (
    <section className="agent-planning" aria-label="排程需求单">
      <header>
        <strong>独立排程需求单 · V{planning.revision}</strong>
        <Tag color={planning.status === 'CONFIRMED' ? 'green' : 'blue'}>
          {planning.status === 'CONFIRMED'
            ? '已确认需求'
            : planning.status === 'STALE'
              ? '原确认已失效'
              : '待人工确认'}
        </Tag>
      </header>
      <p>赛事：{planning.eventName} · 类型：整周排程要求收集</p>
      <ol>
        {planning.conditions.map((condition) => (
          <li key={condition.id}>
            {condition.kind === 'DATE_RANGE'
              ? `赛事日期 ${condition.from ?? '待明确'} 至 ${condition.to ?? '待明确'}${condition.durationDays ? `（共 ${condition.durationDays} 天）` : ''}${condition.dateSource === 'EVENT_PROFILE' ? '，起点来自赛事资料' : condition.dateSource === 'EVENT_SCHEDULE' ? '，起点来自当前赛程配置' : ''}`
              : condition.kind === 'FORMAT'
                ? '单循环：每两支参赛球队各交手一次'
                : condition.kind === 'DAYPART_CAPACITY'
                  ? `${{ MORNING: '上午', AFTERNOON: '下午', EVENING: '晚上' }[condition.daypart ?? 'MORNING']} ${condition.startTime ?? '时间待补'}—${condition.endTime ?? '时间待补'}，${condition.capacityScope === 'VENUE' ? '每个场地' : condition.capacityScope === 'EVENT' ? '整个赛事' : '统计范围待补'}每天最多 ${condition.maxMatchesPerDay ?? '待补'} 场`
                  : condition.kind === 'TEAM_WINDOW'
                    ? `${condition.teamLabel}：${condition.availability === 'ONLY' ? '只在' : condition.availability === 'BLOCK' ? '不在' : '可在'} ${condition.dates?.join('、')} ${condition.startTime}—${condition.endTime} 安排`
                    : `${condition.teamLabel} 与 ${condition.opponentLabel}：${condition.matchup === 'PREFER' ? '倾向交手' : '尽量避免交手'}（不新增比赛）`}
            <small>
              {' '}
              · {condition.priority === 'MUST' ? '必须满足' : '尽量满足'} ·{' '}
              {condition.confirmation === 'CONFIRMED' ? '已确认' : '待确认'} ·
              来源对话{' '}
              {condition.sourceTurnIds.map((id) => id.slice(0, 8)).join('、')}
            </small>
            <details>
              <summary>查看原话来源</summary>
              {condition.sourceTurnIds.map((id) => (
                <p key={id}>
                  {planning.sourceTurns.find((turn) => turn.id === id)
                    ?.content ?? `来源对话 ${id.slice(0, 8)}（请刷新会话查看）`}
                </p>
              ))}
            </details>
          </li>
        ))}
      </ol>
      {new Set(
        planning.conditions
          .filter((item) => item.kind === 'DAYPART_CAPACITY')
          .map((item) => item.daypart),
      ).size === 3 && (
        <p>
          已设置上午、下午、晚上三个时段：候选比赛仅排在这些明确时段内，空档不会安排。
        </p>
      )}
      {planning.status === 'STALE' && (
        <Alert
          type="error"
          title="参赛记录已停用，原确认不再有效。请在对话中移除无效条件，重新人工确认。"
        />
      )}
      {planning.pending.map((item) => (
        <p key={item} role="status">
          待补：{item}
        </p>
      ))}
      {planning.issues.map((item, index) => (
        <Alert key={index} type="warning" title={item} />
      ))}
      <p>
        仅确认上述要求，不生成赛程、不修改已有比赛、不产生执行票据。后续修改将撤销这版确认。
      </p>
      {canConfirm && (
        <Button type="primary" loading={loading} onClick={onConfirm}>
          仅确认需求（不生成赛程）
        </Button>
      )}
      {planning.status === 'CONFIRMED' && (
        <p role="status">
          已确认 V{planning.confirmedRevision}；后续排程仍需独立流程。
        </p>
      )}
    </section>
  );
}

export function ScheduleCard({
  pageEventId,
  visible,
}: {
  pageEventId: string;
  visible: boolean;
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
  const [selectedEvent, setSelectedEvent] = useState('');
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [schedule, setSchedule] = useState<S['ScheduleViewDto']>();
  const [result, setResult] = useState<Receipt>();
  const [modelStatus, setModelStatus] = useState<S['AgentModelStatusDto']>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingUser, setStreamingUser] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [forceNew, setForceNew] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const activeStream = useRef<AbortController | null>(null);
  const thread = useRef<HTMLDivElement>(null);
  const messageEnd = useRef<HTMLDivElement>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const eventId =
    session?.task?.eventId ??
    session?.planningRequest?.eventId ??
    selectedEvent;
  const task = forceNew ? undefined : reply ? reply.task : session?.task;
  const planning = reply?.planningRequest ?? session?.planningRequest;
  const ticket = task?.confirmation;
  const preview = task?.preview;
  const execution = result ?? session?.lastExecution?.result;
  const isSuper = !!auth.identity?.roles.includes('HEADQUARTERS_SUPER_ADMIN');
  const turns = session?.turns ?? [];
  const latestAnswer = [...turns]
    .reverse()
    .find((turn) => turn.role === 'ASSISTANT');
  const showReply =
    !!reply?.message &&
    (reply.candidates.length > 0 || reply.message !== latestAnswer?.content);

  useEffect(() => {
    const pane = thread.current;
    if (!visible || !pane) return;
    if (!session?.turns.length) {
      pane.scrollTop = 0;
      return;
    }
    if (
      ['PREVIEW', 'PLAN', 'NEED_EVENT', 'NEED_MATCH', 'NEED_TEAM'].includes(
        reply?.status ?? '',
      ) ||
      result
    ) {
      pane.scrollTop = pane.scrollHeight;
    } else if (messageEnd.current) {
      pane.scrollTop +=
        messageEnd.current.getBoundingClientRect().bottom -
        pane.getBoundingClientRect().bottom +
        20;
    }
  }, [session?.id, session?.turns?.length, reply?.status, result, visible]);

  function clear() {
    activeStream.current?.abort();
    activeStream.current = null;
    generation.current++;
    setSession(undefined);
    setReply(undefined);
    setResult(undefined);
    setInput('');
    setLastMessage('');
    setSelectedEvent('');
    setSchedule(undefined);
    setSessions([]);
    setLoading(false);
    setStreamingUser('');
    setStreamingText('');
    setNotice('');
    setBlocked(true);
  }
  function issue(cause: unknown) {
    if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
      clear();
      setError('登录或赛事权限已变化，旧会话与确认卡片已清除。');
    } else if (cause instanceof ApiError && cause.status === 409) {
      setReply(undefined);
      setBlocked(true);
      setError(
        '需求版本或赛程预览已变化，请刷新会话后重新核对；不得沿用旧确认。',
      );
      void refreshSchedule(eventId);
    } else if (cause instanceof ApiError && cause.status === 502)
      setError(
        '回答超过单次 4000 字上限，本轮未保存；请缩小问题范围或分段提问。',
      );
    else if (cause instanceof ApiError && cause.status === 429)
      setError('AI额度不足或已暂停，请联系管理员；输入已保留。');
    else if (cause instanceof ApiError && cause.status === 503)
      setError('本次回复暂不可用，输入已保留，请稍后重试。');
    else if (cause instanceof AgentStreamInterruptedError)
      setError('连接中断，请刷新会话核对本轮是否已保存；输入已保留。');
    else setError('结果暂不确定，请刷新回执核对后重试原确认。');
  }
  async function run(work: (valid: () => boolean) => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setLoading(true);
    setError('');
    setNotice('');
    const epoch = generation.current;
    const valid = () => epoch === generation.current;
    try {
      await work(valid);
    } catch (cause) {
      if (valid()) issue(cause);
    } finally {
      lock.current = false;
      if (valid()) setLoading(false);
    }
  }
  async function refreshSchedule(id: string) {
    if (!id) {
      setSchedule(undefined);
      return;
    }
    const epoch = generation.current;
    try {
      const next = await client.request('getEventSchedule', {
        token,
        path: { eventId: id },
      });
      if (epoch === generation.current) setSchedule(next);
    } catch (cause) {
      if (epoch === generation.current) issue(cause);
    }
  }
  async function restore(valid: () => boolean) {
    const existing = sessionRef.current;
    if (existing) {
      const latest = await client.request('getAgentSession', {
        token,
        path: { sessionId: existing.id },
      });
      if (valid()) {
        setSession(latest);
        setBlocked(false);
      }
      return;
    }
    const list = await client.request('listAgentSessions', { token });
    if (!valid()) return;
    setSessions(list);
    const remembered = sessionStorage.getItem(
      `caau.agent.active.${auth.identity?.id ?? ''}`,
    );
    const chosen = list.find((item) => item.id === remembered) ?? list[0];
    const latest =
      chosen ??
      (await client.request('createAgentSession', {
        token,
        body: pageEventId ? { currentEventId: pageEventId } : {},
      }));
    if (!valid()) return;
    setSession(latest);
    setSessions((items) =>
      items.some((item) => item.id === latest.id) ? items : [latest, ...items],
    );
    setSelectedEvent(
      latest.task?.eventId ??
        latest.planningRequest?.eventId ??
        latest.currentEventId ??
        pageEventId,
    );
    setLastMessage(
      [...latest.turns].reverse().find((turn) => turn.role === 'USER')
        ?.content ?? '',
    );
  }
  useEffect(() => {
    if (session?.id && auth.identity?.id)
      sessionStorage.setItem(
        `caau.agent.active.${auth.identity.id}`,
        session.id,
      );
  }, [session?.id, auth.identity?.id]);
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void run(restore);
    void client
      .request('listEvents', { token })
      .then((rows) => {
        if (alive) setEvents(rows);
      })
      .catch(() => {
        if (alive) setEvents([]);
      });
    if (isSuper)
      void client
        .request('getAgentModelStatus', { token })
        .then((value) => {
          if (alive) setModelStatus(value);
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [visible, token, auth.identity?.id]);
  useEffect(() => {
    if (visible) void refreshSchedule(eventId);
  }, [eventId, visible, token]);

  async function switchEvent(id: string) {
    if (id === eventId) return;
    await run(async (valid) => {
      const next = await client.request('createAgentSession', {
        token,
        body: { currentEventId: id },
      });
      if (!valid()) return;
      setSession(next);
      setSessions((items) => [next, ...items]);
      setSelectedEvent(id);
      setReply(undefined);
      setResult(undefined);
      setBlocked(false);
      setInput('');
      setLastMessage(
        [...next.turns].reverse().find((turn) => turn.role === 'USER')
          ?.content ?? '',
      );
      setForceNew(!active(next.task?.step));
      setNotice('已切换赛事，并建立新的对话。');
    });
  }
  async function newConversation() {
    await run(async (valid) => {
      const next = await client.request('createAgentSession', {
        token,
        body: eventId ? { currentEventId: eventId } : {},
      });
      if (!valid()) return;
      setSession(next);
      setSessions((items) => [next, ...items]);
      setSelectedEvent(eventId);
      setReply(undefined);
      setResult(undefined);
      setInput('');
      setLastMessage('');
      setForceNew(false);
      setBlocked(false);
      setNotice('已建立新对话。');
    });
  }
  async function selectHistory(id: string) {
    if (id === session?.id) return;
    await run(async (valid) => {
      const next = await client.request('getAgentSession', {
        token,
        path: { sessionId: id },
      });
      if (!valid()) return;
      setSession(next);
      setSelectedEvent(
        next.task?.eventId ??
          next.planningRequest?.eventId ??
          next.currentEventId ??
          '',
      );
      setReply(undefined);
      setResult(undefined);
      setInput('');
      setForceNew(false);
      setBlocked(false);
      setLastMessage(
        [...next.turns].reverse().find((turn) => turn.role === 'USER')
          ?.content ?? '',
      );
    });
  }
  async function send(candidate?: Candidate) {
    const message = input.trim() || (candidate ? lastMessage : '');
    if (!session || !message || lock.current) return;
    const controller = new AbortController();
    activeStream.current = controller;
    setStreamingUser(message);
    setStreamingText('');
    await run(async (valid) => {
      const current = reply ? reply.task : session.task;
      const next = await streamAgentMessage(
        session.id,
        {
          message,
          ...(reply?.status === 'NEED_EVENT' && candidate
            ? { eventId: candidate.id }
            : eventId
              ? { eventId }
              : {}),
          ...(candidate && reply?.status === 'NEED_TEAM'
            ? { teamId: candidate.id }
            : candidate && reply?.status !== 'NEED_EVENT'
              ? { matchId: candidate.id }
              : {}),
          ...(planning
            ? { planningId: planning.id, planningRevision: planning.revision }
            : {}),
          ...(current && !forceNew
            ? { taskId: current.id }
            : forceNew
              ? { newTask: true }
              : {}),
        },
        token,
        (text) => {
          if (valid()) setStreamingText((old) => old + text);
        },
        controller.signal,
      );
      if (!valid()) return;
      const latest = await client.request('getAgentSession', {
        token,
        path: { sessionId: session.id },
      });
      if (!valid()) return;
      setSession(latest);
      setReply(next);
      setResult(undefined);
      setBlocked(false);
      setForceNew(false);
      setInput('');
      setLastMessage(message);
      if (next.task?.eventId) setSelectedEvent(next.task.eventId);
      else if (next.planningRequest?.eventId)
        setSelectedEvent(next.planningRequest.eventId);
      if (next.status === 'STALE') setError('预览已过期，请重新生成。');
    });
    if (activeStream.current === controller) activeStream.current = null;
    setStreamingUser('');
    setStreamingText('');
  }

  async function saveSuggestedMemory() {
    const suggested = reply?.suggestedMemory;
    if (!suggested) return;
    await run(async (valid) => {
      try {
        await client.request('createAgentMemory', {
          token,
          body: { content: suggested },
        });
        if (valid()) {
          setReply((old) => (old ? { ...old, suggestedMemory: null } : old));
          setNotice('已保存个人交流偏好，新对话也会使用；可在设置中删除。');
        }
      } catch {
        if (valid()) setError('记忆保存失败，请在设置中检查后重试。');
      }
    });
  }
  async function confirmPlanning() {
    if (!session || !planning || planning.status !== 'COLLECTING' || blocked)
      return;
    await run(async (valid) => {
      await client.request('confirmAgentPlanningRequest', {
        token,
        path: { planningId: planning.id },
        body: { expectedRevision: planning.revision },
      });
      const latest = await client.request('getAgentSession', {
        token,
        path: { sessionId: session.id },
      });
      if (!valid()) return;
      setSession(latest);
      setReply(undefined);
      setNotice(`排程需求 V${planning.revision} 已确认；未生成或保存赛程。`);
    });
  }
  async function confirm() {
    if (!session || !ticket || ticket.state !== 'PENDING') return;
    if (
      blocked ||
      Date.parse(ticket.expiresAt) <= Date.now() ||
      (!!schedule && schedule.revision !== ticket.expectedRevision)
    ) {
      setError('预览过期或赛程版本已变化，请重新预览。');
      return;
    }
    await run(async (valid) => {
      let executed: Receipt;
      try {
        executed = await client.request('confirmAgentScheduleAdjustment', {
          token,
          path: { ticketId: ticket.id },
          body: {
            eventId: ticket.eventId,
            matchId: ticket.matchId,
            parameterHash: ticket.parameterHash,
          },
        });
      } catch (cause) {
        if (cause instanceof ApiError && [401, 403, 409].includes(cause.status))
          throw cause;
        const latest = await client.request('getAgentSession', {
          token,
          path: { sessionId: session.id },
        });
        if (!valid()) return;
        setSession(latest);
        if (latest.lastExecution?.result.ticketId !== ticket.id) throw cause;
        executed = latest.lastExecution.result;
      }
      if (!valid()) return;
      setResult(executed);
      setReply(undefined);
      setSession(
        await client.request('getAgentSession', {
          token,
          path: { sessionId: session.id },
        }),
      );
      if (!valid()) return;
      await refreshSchedule(ticket.eventId);
      window.dispatchEvent(
        new CustomEvent('caau:schedule-changed', {
          detail: { eventId: ticket.eventId },
        }),
      );
    });
  }
  async function cancel() {
    if (!session || !ticket || ticket.state !== 'PENDING') return;
    await run(async (valid) => {
      await client.request('cancelAgentScheduleAdjustment', {
        token,
        path: { ticketId: ticket.id },
      });
      const latest = await client.request('getAgentSession', {
        token,
        path: { sessionId: session.id },
      });
      if (valid()) {
        setSession(latest);
        setReply(undefined);
      }
    });
  }
  return (
    <section className="schedule-agent" aria-labelledby="schedule-agent-title">
      <h3 id="schedule-agent-title" className="agent-visually-hidden">
        CAAU 智能助手对话
      </h3>
      <div className="agent-chat-toolbar">
        <Select
          aria-label="历史对话"
          placeholder="选择对话"
          value={session?.id}
          options={sessions.map((item) => ({
            value: item.id,
            label: `${events.find((event) => event.id === (item.planningRequest?.eventId ?? item.task?.eventId ?? item.currentEventId))?.name ?? '自由对话'} · ${item.planningRequest ? `需求 V${item.planningRequest.revision}` : (item.task?.goal?.slice(0, 24) ?? item.turns.find((turn) => turn.role === 'USER')?.content.slice(0, 24) ?? '新对话')}`,
          }))}
          onChange={(id) => void selectHistory(id)}
          className="agent-history-select"
        />
        <Button
          disabled={loading || !session}
          onClick={() => void newConversation()}
        >
          新对话
        </Button>
        <Button
          type="text"
          aria-expanded={optionsOpen}
          onClick={() => setOptionsOpen((value) => !value)}
        >
          {optionsOpen ? '收起设置' : '设置'}
        </Button>
      </div>
      {pageEventId && eventId && pageEventId !== eventId && (
        <p className="agent-context-warning" role="status">
          当前对话关联的赛事与浏览页面不同。切换赛事请打开设置。
        </p>
      )}
      {optionsOpen && (
        <div className="schedule-agent-context" id="agent-options">
          <MemorySettings key={auth.identity?.id ?? ''} token={token} />
          <span>
            浏览页面：
            {pageEventId
              ? (events.find((item) => item.id === pageEventId)?.name ??
                '赛事加载中')
              : '无赛事上下文'}
          </span>
          <p>
            任务对象：
            {eventId
              ? (events.find((item) => item.id === eventId)?.name ??
                '赛事加载中')
              : '尚未选择赛事'}
          </p>
          {pageEventId && eventId && pageEventId !== eventId && (
            <Alert
              type="info"
              title="当前任务与浏览页面赛事不同，不会自动切换。"
            />
          )}
          <Select
            aria-label="切换对话赛事"
            placeholder="选择有权赛事"
            value={eventId || undefined}
            options={events.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            onChange={(id) => void switchEvent(id)}
            style={{ width: '100%' }}
          />
          <Button
            disabled={loading || !session}
            onClick={() => void run(restore)}
          >
            刷新会话
          </Button>
          {isSuper && modelStatus && (
            <div className="schedule-agent-model-status">
              <div>
                <strong>模型状态</strong>
                <span>
                  {modelStatus.mode} · {modelStatus.modelName} ·{' '}
                  {modelStatus.baseUrlHost ?? '无外部主机'}
                </span>
                <small>
                  凭据：
                  {modelStatus.credentialsConfigured ? '已配置' : '未配置'}
                  ；最近测试：{modelStatus.lastConnectionTest.message}
                </small>
              </div>
              <Button
                size="small"
                onClick={() =>
                  void client
                    .request('testAgentModelConnection', { token })
                    .then(setModelStatus)
                    .catch(() => setError('模型连接测试未完成。'))
                }
              >
                测试模型连接
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="agent-chat-thread" ref={thread} aria-label="对话内容">
        {!turns.length && !loading && (
          <div className="agent-welcome">
            <div className="agent-welcome-intro">
              <h4>你好，有什么可以帮你？</h4>
              <p>聊聊想法，也让赛事工作更轻松。</p>
            </div>
            <div className="agent-shortcuts" aria-label="快捷提问">
              {[
                {
                  title: '赛程查询',
                  note: '查比赛安排，了解场次详情',
                  icon: 'calendar' as const,
                  prompt: '帮我查看当前赛事的赛程',
                },
                {
                  title: '排程规划',
                  note: '整理球队时间与对阵要求',
                  icon: 'plan' as const,
                  prompt: '我想规划赛程，请帮我梳理需要提供哪些信息',
                },
              ].map((item) => (
                <button
                  key={item.title}
                  type="button"
                  className={`agent-shortcut agent-shortcut-${item.icon}`}
                  onClick={() => {
                    setInput(item.prompt);
                    document.getElementById('schedule-agent-input')?.focus();
                  }}
                >
                  <AgentUiIcon name={item.icon} />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.note}</small>
                  </span>
                  <AgentUiIcon name="arrow" />
                </button>
              ))}
            </div>
            <div className="agent-welcome-suggestions" aria-label="示例问题">
              <p>你可能想问</p>
              <div className="agent-question-list">
                {[
                  '你能帮我做些什么？',
                  '单循环和淘汰赛有什么区别？',
                  '我想调整一场比赛的时间',
                  '帮我整理一份赛事筹备清单',
                ].map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      document.getElementById('schedule-agent-input')?.focus();
                    }}
                  >
                    <span>{suggestion}</span>
                    <AgentUiIcon name="arrow" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="schedule-agent-history" aria-label="对话记录">
          {turns.map((turn) => (
            <div
              key={turn.id}
              className={`agent-message agent-message-${turn.role.toLowerCase()}`}
            >
              {turn.role === 'ASSISTANT' && (
                <span className="agent-message-avatar" aria-hidden="true">
                  <AgentIcon />
                </span>
              )}
              <div
                className={`agent-message-body${turn.id === latestAnswer?.id && reply?.message === latestAnswer?.content && ['QUERY', 'PLAN', 'NEED_TEAM'].includes(reply?.status ?? '') ? ' schedule-agent-query-answer' : ''}`}
              >
                {turn.role === 'ASSISTANT' && <strong>CAAU 智能助手</strong>}
                <p>{turn.content}</p>
              </div>
            </div>
          ))}
          {streamingUser && (
            <>
              <div className="agent-message agent-message-user">
                <div className="agent-message-body">
                  <p>{streamingUser}</p>
                </div>
              </div>
              <div className="agent-message agent-message-assistant">
                <span className="agent-message-avatar" aria-hidden="true">
                  <AgentIcon />
                </span>
                <div className="agent-message-body" aria-live="polite">
                  <strong>CAAU 智能助手</strong>
                  <p>{streamingText || '正在理解你的问题…'}</p>
                </div>
              </div>
            </>
          )}
        </div>
        <div ref={messageEnd} aria-hidden="true" />
        {loading && !streamingUser && (
          <p className="agent-responding" role="status">
            智能助手正在回复…
          </p>
        )}
        {task?.step === 'WAITING_PARAMETERS' && (
          <p>
            待补充：
            {task.pendingFields
              .map((field) => pendingLabel[field] ?? field)
              .join('、')}
          </p>
        )}
        {task?.step === 'LOCATE_EVENT' && !reply?.candidates.length && (
          <p>请描述赛事或从有权赛事中明确选择；候选项刷新后须重新发送描述。</p>
        )}
        {task?.step === 'LOCATE_MATCH' && !reply?.candidates.length && (
          <p>请重新发送上次描述以恢复候选场次。</p>
        )}
        {showReply && (
          <p
            role="status"
            className={`agent-action-message ${
              ['QUERY', 'PLAN', 'NEED_TEAM'].includes(reply?.status ?? '')
                ? 'schedule-agent-query-answer'
                : ''
            }`}
          >
            {reply?.message}
          </p>
        )}
        {reply?.suggestedMemory && (
          <Button disabled={loading} onClick={() => void saveSuggestedMemory()}>
            保存这条记忆
          </Button>
        )}
        {!!reply?.candidates.length && (
          <div
            className="schedule-agent-candidates"
            role="group"
            aria-label={
              reply.status === 'NEED_EVENT'
                ? '请选择赛事'
                : reply.status === 'NEED_TEAM'
                  ? '请选择赛事参赛球队'
                  : '请选择比赛'
            }
          >
            {reply.candidates.map((candidate) => (
              <Button
                key={candidate.id}
                disabled={loading}
                onClick={() => void send(candidate)}
              >
                {candidate.label}
                {candidate.detail ? ` · ${candidate.detail}` : ''}
              </Button>
            ))}
          </div>
        )}
        {planning && (
          <details
            className="agent-workspace-section"
            key={`${planning.id}:${planning.revision}`}
            ref={(element) => {
              if (element && !element.dataset.agentInitialized) {
                element.open = planning.status === 'COLLECTING';
                element.dataset.agentInitialized = 'true';
              }
            }}
          >
            <summary>
              排程需求 · V{planning.revision} ·{' '}
              {planning.status === 'CONFIRMED' ? '已确认' : '待核对'}
            </summary>
            <PlanningCard
              planning={planning}
              loading={loading}
              blocked={blocked}
              onConfirm={() => void confirmPlanning()}
            />
            {planning.status === 'CONFIRMED' && !blocked && (
              <CandidateCard
                planning={planning}
                schedule={schedule}
                token={token}
                onAccessError={issue}
                onSaved={() => refreshSchedule(planning.eventId)}
              />
            )}
          </details>
        )}
        {execution && (
          <details className="agent-workspace-section agent-execution">
            <summary>
              草稿 V{execution.revision} 已保存
              {execution.issues.length > 0 &&
                ` · ${execution.issues.length} 项冲突`}
              <span>查看执行回执</span>
            </summary>
            <div className="schedule-agent-result-details">
              <span>
                执行回执：
                {session?.lastExecution?.executedAt
                  ? localTime(session.lastExecution.executedAt)
                  : '刚刚'}
              </span>
              <span>当时状态：{execution.status}</span>
              <span>赛事：{execution.eventId}</span>
              <span>比赛：{execution.matchId}</span>
              <span>命令：{execution.commandId}</span>
              <span>
                {result
                  ? result.replayed
                    ? '持久回执回放'
                    : '首次执行回执'
                  : '持久执行回执（恢复）'}
              </span>
              <span>执行时有 {execution.issues.length} 项确定性冲突</span>
              <span>
                赛程当前状态：{schedule?.status ?? '未读取'} · V
                {schedule?.revision ?? '—'}（以当前赛程为准）
              </span>
            </div>
          </details>
        )}
        {preview && (
          <details
            className="agent-workspace-section agent-preview-section"
            key={`${ticket?.id ?? task?.id}:${reply?.status ?? 'RESTORED'}`}
            ref={(element) => {
              if (element && !element.dataset.agentInitialized) {
                element.open = !reply || reply.status === 'PREVIEW';
                element.dataset.agentInitialized = 'true';
              }
            }}
          >
            <summary>
              单场改期预览 · {preview.before.homeLabel} vs{' '}
              {preview.before.awayLabel}
              {ticket?.state === 'PENDING' && ' · 待确认'}
            </summary>
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
              {preview.issues.map((issue, index) => (
                <p key={index}>{issue.message}</p>
              ))}
              <p>
                此操作尚未保存。预览有效至 {localTime(preview.expiresAt)}
                ；版本变化或过期后必须重新预览。
              </p>
              {ticket && (
                <div className="schedule-agent-confirmation">
                  <dl>
                    <div>
                      <dt>执行人</dt>
                      <dd>{ticket.actorDisplayName}</dd>
                    </div>
                    <div>
                      <dt>赛事</dt>
                      <dd>{ticket.eventName}</dd>
                    </div>
                    <div>
                      <dt>比赛</dt>
                      <dd>
                        {ticket.parameterSummary.homeLabel} vs{' '}
                        {ticket.parameterSummary.awayLabel}
                      </dd>
                    </div>
                    <div>
                      <dt>命令</dt>
                      <dd>
                        schedule.draft.adjust@{ticket.toolVersion} · 预期 V
                        {ticket.expectedRevision}
                      </dd>
                    </div>
                    <div>
                      <dt>调整</dt>
                      <dd>
                        {localTime(ticket.parameterSummary.afterStartAt)} ·{' '}
                        {ticket.parameterSummary.afterVenue}
                      </dd>
                    </div>
                  </dl>
                  {ticket.state === 'PENDING' && (
                    <div className="schedule-agent-confirm-actions">
                      {blocked ||
                      Date.parse(ticket.expiresAt) <= Date.now() ||
                      (!!schedule &&
                        schedule.revision !== ticket.expectedRevision) ? (
                        <Alert
                          type="warning"
                          title="确认过期或赛程版本已变化，请重新预览。"
                        />
                      ) : (
                        <Button
                          type="primary"
                          loading={loading}
                          onClick={() => void confirm()}
                        >
                          确认保存草稿
                        </Button>
                      )}
                      <Button disabled={loading} onClick={() => void cancel()}>
                        取消
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </article>
          </details>
        )}
      </div>
      {error && <Alert type="warning" showIcon title={error} />}
      {notice && <Alert type="success" showIcon title={notice} />}
      <div className="schedule-agent-compose">
        <div className="agent-composer-context">
          {eventId
            ? (events.find((event) => event.id === eventId)?.name ?? '赛事对话')
            : '自由对话'}
        </div>
        <div className="agent-input-box">
          <label
            htmlFor="schedule-agent-input"
            className="agent-visually-hidden"
          >
            对话消息
          </label>
          <Input.TextArea
            id="schedule-agent-input"
            value={input}
            autoSize={{ minRows: 2, maxRows: 5 }}
            maxLength={2000}
            disabled={loading || !session}
            placeholder="请随时提出问题，我会帮你一起解决"
            onChange={(event) => setInput(event.target.value)}
            onPressEnter={(event) => {
              if (!event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <div className="agent-composer-actions">
            <span>Enter 发送 · Shift + Enter 换行</span>
            <Button
              type="primary"
              loading={loading}
              disabled={!session || !input.trim()}
              onClick={() => void send()}
              aria-label="发送消息"
              title="发送消息"
            >
              <AgentUiIcon name="send" />
            </Button>
          </div>
        </div>
        <p className="agent-footer-note">回答由 AI 生成，请核对重要信息</p>
      </div>
    </section>
  );
}
