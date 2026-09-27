import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Image,
  Picker,
  Text,
  Textarea,
  View,
} from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { AgentStreamInterruptedError, ApiError } from '@caau/api-client';
import {
  clearSession,
  client,
  streamAgentMessage,
  session as login,
  subscribeSession,
} from '../materials/session';
import { Action } from '../competition/shared';
import { bj, type S } from '../competition/model';
import { CandidateCard } from './CandidateCard';
import { MemorySettings } from './MemorySettings';
import assistantIcon from '../../assets/caau-assistant.svg';
import sendIcon from '../../assets/agent-send.svg';
import './agent.css';

type AgentSession = S['AgentSessionViewDto'];
type Reply = S['AgentReplyDto'];
type Receipt = S['AgentScheduleAdjustmentResultDto'];
type Candidate = S['AgentCandidateDto'];
type Planning = S['AgentPlanningRequestViewDto'];

const assistantSkills = [
  {
    title: '赛程查询',
    description: '查看有权赛事的赛程和场次详情。',
    note: '只读查询',
    prompt: '帮我查看当前赛事的赛程',
  },
  {
    title: '排程规划',
    description: '整理时间、球队和对阵要求，生成独立候选预览。',
    note: '需求确认后预览',
    prompt: '我想规划赛程，请帮我梳理需要提供哪些信息',
  },
  {
    title: '单场改期',
    description: '定位比赛并预览调整；保存草稿须由本人确认。',
    note: '预览后人工确认',
    prompt: '我想调整一场比赛的时间',
  },
] as const;

function PlanningCard({
  planning,
  busy,
  blocked,
  onConfirm,
}: {
  planning: Planning;
  busy: boolean;
  blocked: boolean;
  onConfirm: () => void;
}) {
  const canConfirm =
    planning.status === 'COLLECTING' &&
    planning.conditions.length > 0 &&
    !planning.pending.length &&
    !planning.issues.length &&
    !blocked;
  return (
    <View className="agent-planning-card" aria-label="排程需求单">
      <Text className="subtitle">
        排程需求单 · V{planning.revision} ·{' '}
        {planning.status === 'CONFIRMED'
          ? '已确认'
          : planning.status === 'STALE'
            ? '原确认已失效'
            : '待确认'}
      </Text>
      <Text className="competition-line">
        赛事：{planning.eventName} · 与单场改期无关
      </Text>
      {planning.conditions.map((item) => (
        <View className="agent-planning-condition" key={item.id}>
          <Text>
            {item.kind === 'DATE_RANGE'
              ? `赛事日期 ${item.from ?? '待明确'} 至 ${item.to ?? '待明确'}${item.durationDays ? `（共 ${item.durationDays} 天）` : ''}${item.dateSource === 'EVENT_PROFILE' ? '，起点来自赛事资料' : item.dateSource === 'EVENT_SCHEDULE' ? '，起点来自当前赛程配置' : ''}`
              : item.kind === 'FORMAT'
                ? '单循环：每两支参赛球队各交手一次'
                : item.kind === 'DAYPART_CAPACITY'
                  ? `${{ MORNING: '上午', AFTERNOON: '下午', EVENING: '晚上' }[item.daypart ?? 'MORNING']} ${item.startTime ?? '时间待补'}—${item.endTime ?? '时间待补'}，${item.capacityScope === 'VENUE' ? '每个场地' : item.capacityScope === 'EVENT' ? '整个赛事' : '统计范围待补'}每天最多 ${item.maxMatchesPerDay ?? '待补'} 场`
                  : item.kind === 'TEAM_WINDOW'
                    ? `${item.teamLabel}：${item.availability === 'ONLY' ? '只在' : item.availability === 'BLOCK' ? '不在' : '可在'} ${item.dates?.join('、')} ${item.startTime}—${item.endTime} 安排`
                    : `${item.teamLabel} 与 ${item.opponentLabel}：${item.matchup === 'PREFER' ? '倾向相遇' : '尽量避免相遇'}（不新增比赛）`}
          </Text>
          <Text className="competition-note">
            {item.priority === 'MUST' ? '必须满足' : '尽量满足'} ·{' '}
            {item.confirmation === 'CONFIRMED' ? '已确认' : '待确认'} · 来源对话{' '}
            {item.sourceTurnIds.map((id) => id.slice(0, 8)).join('、')}
          </Text>
          {item.sourceTurnIds.map((id) => (
            <Text key={id} className="competition-note">
              原话：
              {planning.sourceTurns.find((turn) => turn.id === id)?.content ??
                '请刷新会话查看'}
            </Text>
          ))}
        </View>
      ))}
      {new Set(
        planning.conditions
          .filter((item) => item.kind === 'DAYPART_CAPACITY')
          .map((item) => item.daypart),
      ).size === 3 && (
        <Text className="competition-note">
          已设置三个时段：候选比赛仅排在这些明确时段内，空档不会安排。
        </Text>
      )}
      {planning.status === 'STALE' && (
        <Text className="competition-error">
          参赛记录已停用，原确认失效；请移除条件后重新确认。
        </Text>
      )}
      {planning.pending.map((pending) => (
        <Text className="competition-note" key={pending}>
          待补：{pending}
        </Text>
      ))}
      {planning.issues.map((issue, index) => (
        <Text className="competition-error" key={index}>
          条件矛盾：{issue}
        </Text>
      ))}
      <Text className="competition-note">
        仅确认需求，不生成或覆盖赛程、不产生执行票据。修改会撤销此前确认。
      </Text>
      {canConfirm && (
        <Action primary disabled={busy} onClick={onConfirm}>
          仅确认需求（不生成赛程）
        </Action>
      )}
      {planning.status === 'CONFIRMED' && (
        <Text className="competition-line">
          已确认 V{planning.confirmedRevision}；赛程仍未生成。
        </Text>
      )}
    </View>
  );
}

const pendingLabel: Record<string, string> = {
  sourceMatchId: '请描述或选择具体比赛',
  sourceWeekday: '请说明原比赛在哪一天',
  sourceOrdinal: '请说明原比赛是当天第几场',
  targetWeekday: '请说明调整到星期几',
  targetDate: '请说明目标日期',
  targetTime: '请说明调整后的北京时间',
};

let volatile:
  | {
      token: string;
      epoch: number;
      current?: AgentSession;
      reply?: Reply;
      receipt?: Receipt;
      input: string;
      lastMessage: string;
      selectedEvent: string;
    }
  | undefined;

export function AgentPage() {
  const pageEventId = useRouter().params.event ?? '';
  const cached =
    volatile?.token === login.token && volatile.epoch === login.epoch
      ? volatile
      : undefined;
  const [current, setCurrent] = useState<AgentSession | undefined>(
    cached?.current,
  );
  const [reply, setReply] = useState<Reply | undefined>(cached?.reply);
  const [receipt, setReceipt] = useState<Receipt | undefined>(cached?.receipt);
  const [input, setInput] = useState(cached?.input ?? '');
  const [lastMessage, setLastMessage] = useState(cached?.lastMessage ?? '');
  const [selectedEvent, setSelectedEvent] = useState(
    cached?.selectedEvent ?? pageEventId,
  );
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [schedule, setSchedule] = useState<S['ScheduleViewDto']>();
  const [forceNew, setForceNew] = useState(false);
  const eventId =
    current?.task?.eventId ??
    current?.planningRequest?.eventId ??
    selectedEvent;
  const [busy, setBusy] = useState(!!cached?.current);
  const [streamingUser, setStreamingUser] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const lock = useRef(false);
  const activeStream = useRef<{ abort(): void } | null>(null);
  const serial = useRef(0);
  const alive = useRef(true);
  const event = useRef(eventId);
  event.current = eventId;
  useEffect(() => {
    if (login.token)
      volatile = {
        token: login.token,
        epoch: login.epoch,
        current,
        reply,
        receipt,
        input,
        lastMessage,
        selectedEvent,
      };
  }, [current, reply, receipt, input, lastMessage, selectedEvent]);
  async function onSaved() {
    if (!eventId || !login.token) return;
    const token = login.token,
      epoch = login.epoch,
      id = eventId;
    try {
      const next = await client.request('getEventSchedule', {
        token,
        path: { eventId: id },
      });
      if (
        alive.current &&
        login.token === token &&
        login.epoch === epoch &&
        event.current === id
      )
        setSchedule(next);
    } catch (cause) {
      if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
        volatile = undefined;
        reset();
        setError('赛事权限已变化，请重新登录或选择。');
      }
    }
  }
  const reset = () => {
    activeStream.current?.abort();
    activeStream.current = null;
    setCurrent(undefined);
    setReply(undefined);
    setReceipt(undefined);
    setInput('');
    setLastMessage('');
    setError('');
    setNotice('');
    setBlocked(false);
    setSessions([]);
    setSkillsOpen(false);
    setOptionsOpen(false);
    serial.current++;
    lock.current = false;
    setBusy(false);
    setStreamingUser('');
    setStreamingText('');
    volatile = undefined;
  };
  useEffect(() => {
    alive.current = true;
    const stop = subscribeSession(() => reset());
    return () => {
      alive.current = false;
      stop();
    };
  }, []);
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
      setError('当前账号已无权读取该赛事或任务，请返回首页重新选择。');
    } else if (cause instanceof ApiError && cause.status === 409) {
      setReply(undefined);
      setBlocked(true);
      setError(
        '需求版本或赛程预览已变化，请刷新会话后重新核对，不得使用旧确认。',
      );
      void onSaved();
    } else if (cause instanceof ApiError && cause.status === 502) {
      setError(
        '回答超过单次 4000 字上限，本轮未保存；请缩小问题范围或分段提问。',
      );
    } else if (cause instanceof ApiError && cause.status === 429) {
      setError('AI额度不足或已暂停，请联系管理员；输入已保留。');
    } else if (cause instanceof ApiError && cause.status === 503) {
      setError('模型或智能体服务暂时不可用，未修改赛程。请稍后重试。');
    } else if (cause instanceof AgentStreamInterruptedError) {
      setError('连接中断，请刷新会话核对本轮是否已保存；输入已保留。');
    } else {
      setError('结果尚未确认。请先核对执行回执，再使用原票据重试。');
    }
  }
  async function operate(
    work: (token: string, valid: () => boolean) => Promise<void>,
  ) {
    if (lock.current || !login.token) return;
    lock.current = true;
    const operation = ++serial.current;
    setBusy(true);
    setError('');
    setNotice('');
    const token = login.token;
    const epoch = login.epoch;
    const selected = eventId;
    const valid = () =>
      serial.current === operation && authorized(token, epoch, selected);
    try {
      await work(token, valid);
    } catch (cause) {
      failure(cause, token, epoch, selected);
    } finally {
      if (serial.current === operation) {
        lock.current = false;
        if (alive.current && login.token === token && login.epoch === epoch)
          setBusy(false);
      }
    }
  }
  async function restore(token: string, valid: () => boolean) {
    const sessions = await client.request('listAgentSessions', { token });
    if (!valid()) return;
    setSessions(sessions);
    const selected =
      sessions.find((item) => item.id === current?.id) ?? sessions[0];
    const latest =
      selected ??
      (await client.request('createAgentSession', {
        token,
        body: pageEventId ? { currentEventId: pageEventId } : {},
      }));
    if (!valid()) return;
    setCurrent(latest);
    // The server snapshot, not an in-memory reply, owns the active preview.
    setReply(undefined);
    setReceipt(undefined);
    setBlocked(false);
    setSessions((items) =>
      items.some((item) => item.id === latest.id) ? items : [latest, ...items],
    );
    setSelectedEvent(
      latest.task?.eventId ??
        latest.planningRequest?.eventId ??
        latest.currentEventId ??
        pageEventId,
    );
    if (latest.id !== current?.id) {
      setReply(undefined);
      setReceipt(undefined);
      setInput('');
      setBlocked(false);
    }
    setLastMessage(
      [...latest.turns].reverse().find((turn) => turn.role === 'USER')
        ?.content ?? '',
    );
  }
  useDidShow(() => {
    void Taro.setNavigationBarTitle({ title: 'CAAU 智能助手' });
    void operate(restore);
    if (login.token) {
      const token = login.token,
        epoch = login.epoch;
      void client
        .request('listEvents', { token })
        .then((items) => {
          if (alive.current && login.token === token && login.epoch === epoch)
            setEvents(items);
        })
        .catch(() => {
          if (alive.current && login.token === token && login.epoch === epoch)
            setEvents([]);
        });
    }
  });
  useEffect(() => {
    void onSaved();
  }, [eventId, login.token, login.epoch]);
  async function switchEvent(id: string) {
    if (id === eventId) return;
    await operate(async (token, valid) => {
      const latest = await client.request('createAgentSession', {
        token,
        body: { currentEventId: id },
      });
      if (!valid()) return;
      setCurrent(latest);
      setSessions((items) => [latest, ...items]);
      setSelectedEvent(id);
      setReply(undefined);
      setReceipt(undefined);
      setInput('');
      setLastMessage(
        [...latest.turns].reverse().find((turn) => turn.role === 'USER')
          ?.content ?? '',
      );
      setBlocked(false);
      setForceNew(
        ![
          'LOCATE_EVENT',
          'LOCATE_MATCH',
          'WAITING_PARAMETERS',
          'PREVIEW_READY',
        ].includes(latest.task?.step ?? ''),
      );
      setBusy(false);
    });
  }
  async function refresh() {
    await operate(async (token, valid) => {
      await restore(token, valid);
      if (valid()) await onSaved();
    });
  }
  async function newConversation() {
    await operate(async (token, valid) => {
      const latest = await client.request('createAgentSession', {
        token,
        body: eventId ? { currentEventId: eventId } : {},
      });
      if (!valid()) return;
      setCurrent(latest);
      setSessions((items) => [latest, ...items]);
      setSelectedEvent(eventId);
      setReply(undefined);
      setReceipt(undefined);
      setInput('');
      setLastMessage('');
      setForceNew(false);
      setBlocked(false);
      setError('已建立新对话；旧任务及确认只留在历史对话。');
    });
  }
  async function selectHistory(id: string) {
    if (id === current?.id) return;
    await operate(async (token, valid) => {
      const latest = await client.request('getAgentSession', {
        token,
        path: { sessionId: id },
      });
      if (!valid()) return;
      setCurrent(latest);
      setSelectedEvent(
        latest.task?.eventId ??
          latest.planningRequest?.eventId ??
          latest.currentEventId ??
          '',
      );
      setReply(undefined);
      setReceipt(undefined);
      setInput('');
      setForceNew(false);
      setBlocked(false);
      setLastMessage(
        [...latest.turns].reverse().find((turn) => turn.role === 'USER')
          ?.content ?? '',
      );
      setBusy(false);
    });
  }
  async function send(candidate?: Candidate) {
    const message = input.trim() || (candidate ? lastMessage : '');
    if (!current || !message || lock.current) return;
    const requestControl = { abort: () => {} };
    activeStream.current = requestControl;
    setStreamingUser(message);
    setStreamingText('');
    await operate(async (token, valid) => {
      const active = reply ? reply.task : current.task;
      const next = await streamAgentMessage(
        current.id,
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
          ...((reply?.planningRequest ?? current.planningRequest)
            ? {
                planningId: (reply?.planningRequest ?? current.planningRequest)!
                  .id,
                planningRevision: (reply?.planningRequest ??
                  current.planningRequest)!.revision,
              }
            : {}),
          ...(active && !forceNew
            ? { taskId: active.id }
            : forceNew
              ? { newTask: true }
              : {}),
        },
        token,
        (text) => {
          if (valid()) setStreamingText((old) => old + text);
        },
        (task) => {
          requestControl.abort = () => task.abort();
          if (activeStream.current !== requestControl) task.abort();
        },
      );
      if (!valid()) return;
      const latest = await client.request('getAgentSession', {
        token,
        path: { sessionId: current.id },
      });
      if (!valid()) return;
      setReply(next);
      setCurrent(latest);
      if (next.execution) {
        setReceipt(next.execution);
        await onSaved();
      }
      if (next.task?.eventId) setSelectedEvent(next.task.eventId);
      else if (next.planningRequest?.eventId)
        setSelectedEvent(next.planningRequest.eventId);
      setForceNew(false);
      if (!next.execution) setReceipt(undefined);
      setBlocked(false);
      setLastMessage(message);
      setInput('');
      if (next.status === 'STALE')
        setError('预览已过期或版本已变化，请刷新赛程后重新预览。');
    });
    if (activeStream.current === requestControl) activeStream.current = null;
    setStreamingUser('');
    setStreamingText('');
  }
  async function saveSuggestedMemory() {
    const suggested = reply?.suggestedMemory;
    if (!suggested) return;
    await operate(async (token, valid) => {
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
  const task = forceNew ? undefined : reply ? reply.task : current?.task;
  const planning = reply?.planningRequest ?? current?.planningRequest;
  const preview = task?.preview;
  const ticket = task?.confirmation;
  const execution = receipt ?? current?.lastExecution?.result;
  const expired = !!ticket && Date.parse(ticket.expiresAt) <= Date.now();
  const staleRevision =
    !!ticket &&
    !!schedule?.exists &&
    schedule.revision !== ticket.expectedRevision;
  async function confirmPlanning() {
    if (!current || !planning || planning.status !== 'COLLECTING' || blocked)
      return;
    await operate(async (token, valid) => {
      await client.request('confirmAgentPlanningRequest', {
        token,
        path: { planningId: planning.id },
        body: { expectedRevision: planning.revision },
      });
      const latest = await client.request('getAgentSession', {
        token,
        path: { sessionId: current.id },
      });
      if (!valid()) return;
      setCurrent(latest);
      setReply(undefined);
      setNotice(`需求 V${planning.revision} 已人工确认；未生成或保存赛程。`);
    });
  }
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
    <View className="competition-mobile agent-panel">
      <View className="card competition-agent">
        <View className="agent-mobile-tabs" aria-label="智能助手页面">
          <Button
            className={skillsOpen ? '' : 'selected'}
            ariaLabel="对话"
            onClick={() => setSkillsOpen(false)}
          >
            对话
          </Button>
          <Button
            className={skillsOpen ? 'selected' : ''}
            ariaLabel="技能库"
            onClick={() => {
              setOptionsOpen(false);
              setSkillsOpen(true);
            }}
          >
            技能库
          </Button>
        </View>
        {skillsOpen ? (
          <View className="agent-skill-library" aria-label="技能库">
            <Text className="agent-skill-heading">当前已接入的能力</Text>
            <Text className="agent-skill-intro">
              选择后只会填入提问，你仍需发送消息。查询和调整以当前账号权限及后端校验为准。
            </Text>
            {assistantSkills.map((skill) => (
              <Button
                key={skill.title}
                className="agent-skill-card"
                ariaLabel={`填入${skill.title}提问`}
                onClick={() => {
                  setInput(skill.prompt);
                  setSkillsOpen(false);
                }}
              >
                <View className="agent-skill-card-top">
                  <Text className="agent-skill-title">{skill.title}</Text>
                  <Text className="agent-skill-note">{skill.note}</Text>
                </View>
                <Text className="agent-skill-description">
                  {skill.description}
                </Text>
              </Button>
            ))}
            <Text className="agent-skill-future">
              新能力接入并完成权限校验后，会继续加入这里。
            </Text>
          </View>
        ) : (
          <>
            <View className="agent-mobile-toolbar">
              <Picker
                disabled={busy || !sessions.length}
                mode="selector"
                range={sessions.map((item) => ({
                  id: item.id,
                  label: `${events.find((entry) => entry.id === (item.planningRequest?.eventId ?? item.task?.eventId ?? item.currentEventId))?.name ?? '自由对话'} · ${item.planningRequest ? `需求 V${item.planningRequest.revision}` : (item.task?.goal?.slice(0, 22) ?? item.turns.find((turn) => turn.role === 'USER')?.content.slice(0, 22) ?? '新对话')}`,
                }))}
                rangeKey="label"
                value={Math.max(
                  0,
                  sessions.findIndex((item) => item.id === current?.id),
                )}
                onChange={(e) => {
                  const id = sessions[Number(e.detail.value)]?.id;
                  if (id) void selectHistory(id);
                }}
              >
                <View className="agent-mobile-history" role="button">
                  <Text>历史对话 · {sessions.length}</Text>
                  <Text className="agent-mobile-chevron" aria-hidden="true">
                    ⌄
                  </Text>
                </View>
              </Picker>
              <Button
                className="agent-mobile-toolbar-action"
                disabled={busy || !current}
                onClick={() => void newConversation()}
              >
                新对话
              </Button>
              <Button
                className="agent-mobile-toolbar-action"
                ariaLabel={optionsOpen ? '收起对话设置' : '打开对话设置'}
                onClick={() => setOptionsOpen((value) => !value)}
              >
                {optionsOpen ? '收起设置' : '对话设置'}
              </Button>
            </View>
            {pageEventId && eventId && pageEventId !== eventId && (
              <Text className="agent-mobile-warning">
                当前对话关联赛事与浏览页面不同。切换赛事请打开设置。
              </Text>
            )}
            {optionsOpen && (
              <View className="agent-mobile-options">
                <MemorySettings key={login.epoch} />
                <Text className="agent-context-label">
                  浏览页面：
                  {pageEventId
                    ? (events.find((item) => item.id === pageEventId)?.name ??
                      '赛事加载中')
                    : '无赛事上下文'}
                </Text>
                <Text className="agent-context-label">
                  任务对象：
                  {eventId
                    ? (events.find((item) => item.id === eventId)?.name ??
                      '赛事加载中')
                    : '尚未选择赛事'}
                </Text>
                {pageEventId && eventId && pageEventId !== eventId && (
                  <Text className="competition-note">
                    当前任务与浏览赛事不同；不会自动切换。
                  </Text>
                )}
                <Picker
                  disabled={busy}
                  mode="selector"
                  range={events}
                  rangeKey="name"
                  onChange={(e) => {
                    const id = events[Number(e.detail.value)]?.id;
                    if (id) void switchEvent(id);
                  }}
                >
                  <View className="competition-line" role="button">
                    切换对话赛事（需明确选择）
                  </View>
                </Picker>
                <Action disabled={busy} onClick={() => void refresh()}>
                  刷新任务与回执
                </Action>
              </View>
            )}
            <View className="agent-message-list" aria-label="对话记录">
              {!current?.turns.length && !busy && (
                <View className="agent-mobile-welcome">
                  <Text className="agent-welcome-title">
                    你好，有什么可以帮你？
                  </Text>
                  <Text className="agent-welcome-description">
                    聊聊想法，也让赛事工作更轻松。
                  </Text>
                  <View
                    className="agent-mobile-shortcuts"
                    aria-label="快捷提问"
                  >
                    <Button
                      className="agent-mobile-shortcut"
                      onClick={() => setInput(assistantSkills[0].prompt)}
                    >
                      <Text className="agent-shortcut-mark" aria-hidden="true">
                        赛
                      </Text>
                      <View>
                        <Text className="agent-shortcut-title">赛程查询</Text>
                        <Text className="agent-shortcut-note">
                          查比赛安排，了解场次详情
                        </Text>
                      </View>
                    </Button>
                    <Button
                      className="agent-mobile-shortcut agent-mobile-shortcut-plan"
                      onClick={() => setInput(assistantSkills[1].prompt)}
                    >
                      <Text className="agent-shortcut-mark" aria-hidden="true">
                        排
                      </Text>
                      <View>
                        <Text className="agent-shortcut-title">排程规划</Text>
                        <Text className="agent-shortcut-note">
                          整理球队时间与对阵要求
                        </Text>
                      </View>
                    </Button>
                  </View>
                  <Text className="agent-suggestion-heading">你可能想问</Text>
                  <View className="agent-mobile-suggestions">
                    {[
                      '你能帮我做些什么？',
                      '单循环和淘汰赛有什么区别？',
                      '我想调整一场比赛的时间',
                      '帮我整理一份赛事筹备清单',
                    ].map((suggestion) => (
                      <Button
                        key={suggestion}
                        className="agent-mobile-suggestion"
                        onClick={() => setInput(suggestion)}
                      >
                        <Text>{suggestion}</Text>
                        <Text
                          className="agent-suggestion-arrow"
                          aria-hidden="true"
                        >
                          ›
                        </Text>
                      </Button>
                    ))}
                  </View>
                </View>
              )}
              {(current?.turns ?? []).map((turn) => (
                <View
                  key={turn.id}
                  className={`agent-message ${turn.role === 'USER' ? 'agent-message-user' : 'agent-message-assistant'}`}
                >
                  {turn.role === 'ASSISTANT' && (
                    <View className="agent-message-avatar" aria-hidden="true">
                      <Image src={assistantIcon} mode="aspectFit" />
                    </View>
                  )}
                  <View className="agent-message-bubble">
                    {turn.role === 'ASSISTANT' && (
                      <Text className="agent-message-name">CAAU 智能助手</Text>
                    )}
                    <Text>{turn.content}</Text>
                  </View>
                </View>
              ))}
              {streamingUser && (
                <>
                  <View className="agent-message agent-message-user">
                    <View className="agent-message-bubble">
                      <Text>{streamingUser}</Text>
                    </View>
                  </View>
                  <View className="agent-message agent-message-assistant">
                    <View className="agent-message-avatar" aria-hidden="true">
                      <Image src={assistantIcon} mode="aspectFit" />
                    </View>
                    <View className="agent-message-bubble">
                      <Text className="agent-message-name">CAAU 智能助手</Text>
                      <Text>{streamingText || '正在理解你的问题…'}</Text>
                    </View>
                  </View>
                </>
              )}
            </View>
            {error && (
              <View className="competition-error" role="alert">
                {error}
              </View>
            )}
            {notice && (
              <View className="competition-line" role="status">
                <Text>{notice}</Text>
              </View>
            )}
            {busy && !streamingUser && (
              <View className="competition-note" role="status">
                正在处理，请稍候…
              </View>
            )}
            {execution && (
              <View className="competition-agent-receipt">
                <Action onClick={() => setReceiptOpen((value) => !value)}>
                  草稿 V{execution.revision} 已保存 ·{' '}
                  {receiptOpen ? '收起回执' : '查看回执'}
                </Action>
                {receiptOpen && (
                  <View className="agent-receipt-details">
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
                      <Text className="competition-note">
                        持久执行回执（恢复）
                      </Text>
                    )}
                  </View>
                )}
              </View>
            )}
            {current && (
              <View className="agent-mobile-workflow">
                {task?.step === 'WAITING_PARAMETERS' && (
                  <Text className="competition-line">
                    待补充：
                    {task.pendingFields
                      .map((field) => pendingLabel[field] ?? '请补充调整条件')
                      .join('、')}
                  </Text>
                )}
                {task?.step === 'LOCATE_EVENT' && !reply?.candidates.length && (
                  <Text className="competition-line">
                    请描述赛事或从有权赛事中明确选择；候选项刷新后须重新发送描述。
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
                      {reply.message} ·{' '}
                      {reply.status === 'NEED_EVENT'
                        ? '请选择赛事'
                        : reply.status === 'NEED_TEAM'
                          ? '请选择赛事参赛球队'
                          : '请选择比赛'}
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
                {reply?.message &&
                  !reply.candidates.length &&
                  !preview &&
                  reply.message !==
                    [...(current?.turns ?? [])]
                      .reverse()
                      .find((turn) => turn.role === 'ASSISTANT')?.content && (
                    <Text
                      className={`competition-line${['QUERY', 'PLAN', 'NEED_TEAM'].includes(reply.status) ? ' agent-query-answer' : ''}`}
                    >
                      {reply.message}
                    </Text>
                  )}
                {reply?.suggestedMemory && (
                  <Action
                    disabled={busy}
                    onClick={() => void saveSuggestedMemory()}
                  >
                    保存这条记忆
                  </Action>
                )}
                {planning && (
                  <PlanningCard
                    planning={planning}
                    busy={busy}
                    blocked={blocked}
                    onConfirm={() => void confirmPlanning()}
                  />
                )}
                {planning?.status === 'CONFIRMED' && !blocked && (
                  <CandidateCard
                    planning={planning}
                    schedule={schedule}
                    token={login.token}
                    onSaved={onSaved}
                    onAccessError={(cause) => {
                      if (cause instanceof ApiError && cause.status === 401)
                        clearSession();
                      else {
                        reset();
                        setError('当前账号已无权读取候选赛程。');
                      }
                    }}
                  />
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
                      尚未保存 · 有效至{' '}
                      {bj(preview.expiresAt).replace('T', ' ')}
                      ；过期或版本变化须重新预览。修改条件后旧预览立即失效。
                    </Text>
                    {ticket?.state === 'PENDING' &&
                      !expired &&
                      !staleRevision &&
                      !blocked && (
                        <Text className="competition-line">
                          核对这份预览后，在本对话回复“确认执行”即可保存一个
                          DRAFT；普通聊天不会执行。
                        </Text>
                      )}
                    {ticket?.state === 'PENDING' && (
                      <View>
                        <Text className="competition-line">
                          执行人：{ticket.actorDisplayName} · 预期 V
                          {ticket.expectedRevision}
                        </Text>
                        <Text className="competition-line">
                          赛事：{ticket.eventName} ·
                          工具：schedule.draft.adjust@
                          {ticket.toolVersion}
                        </Text>
                        {expired || staleRevision || blocked ? (
                          <Text className="competition-error">
                            {expired
                              ? '确认已过期'
                              : '赛程版本或确认状态已变化'}
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
            {current && (
              <View className="agent-mobile-composer">
                <Text className="agent-composer-context">
                  {eventId
                    ? (events.find((item) => item.id === eventId)?.name ??
                      '赛事对话')
                    : '自由对话'}
                </Text>
                <View className="agent-mobile-input-box">
                  <Textarea
                    ariaLabel="对话消息"
                    value={input}
                    maxlength={2000}
                    disabled={busy}
                    placeholder={
                      ticket?.state === 'PENDING'
                        ? '核对预览后回复“确认执行”，或继续修改条件'
                        : '请随时提出问题，我会帮你一起解决'
                    }
                    onInput={(e) => setInput(e.detail.value)}
                  />
                  <Button
                    className="agent-mobile-send"
                    ariaLabel="发送消息"
                    disabled={busy || !input.trim()}
                    onClick={() => void send()}
                  >
                    <Image src={sendIcon} mode="aspectFit" aria-hidden="true" />
                    <Text className="agent-visually-hidden">发送消息</Text>
                  </Button>
                </View>
                <Text className="agent-mobile-footer-note">
                  回答由 AI 生成，请核对重要信息
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}
