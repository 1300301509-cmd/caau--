import { useEffect, useRef, useState } from 'react';
import { Input, Text, View } from '@tarojs/components';
import { ApiError } from '@caau/api-client';
import { client } from '../materials/session';
import { Action } from '../competition/shared';
import { bj, type S } from '../competition/model';

type Planning = S['AgentPlanningRequestViewDto'];
type Schedule = S['ScheduleViewDto'];
type Config = S['ScheduleConfigDto'];
type Candidate = S['AgentScheduleCandidateViewDto'];
export function CandidateCard({
  planning,
  schedule,
  token,
  onAccessError,
}: {
  planning: Planning;
  schedule?: Schedule;
  token: string;
  onAccessError: (cause: unknown) => void;
}) {
  const access = useRef(onAccessError);
  access.current = onAccessError;
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [config, setConfig] = useState<Partial<Config>>({});
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [fixed, setFixed] = useState<string[]>([]);
  const [ack, setAck] = useState(false);
  const [source, setSource] = useState<'EVENT_SCHEDULE' | 'EXPLICIT'>(
    'EXPLICIT',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const period = planning.conditions.find(
      (item) => item.kind === 'DATE_RANGE',
    );
    const from = period?.from;
    const to = period?.to;
    const sameDates =
      schedule?.exists &&
      schedule.config.startDate === from &&
      schedule.config.endDate === to;
    setCandidate(null);
    setError('');
    setTeams([]);
    setFixed([]);
    setAck(false);
    setConfig({
      ...(schedule?.exists ? schedule.config : {}),
      ...(from && to ? { startDate: from, endDate: to } : {}),
    });
    setSource(sameDates ? 'EVENT_SCHEDULE' : 'EXPLICIT');
    if (planning.status === 'CONFIRMED') {
      void client
        .request('getLatestAgentScheduleCandidate', {
          token,
          path: { planningId: planning.id },
        })
        .then((result) => {
          if (live) setCandidate(result);
        })
        .catch((cause) => {
          if (live) {
            setCandidate(null);
            if (cause instanceof ApiError && [401, 403].includes(cause.status))
              access.current(cause);
            else if (!(cause instanceof ApiError && cause.status === 404))
              setError('恢复候选失败，请刷新核对。');
          }
        });
      void client
        .request('listEventTeams', {
          token,
          path: { eventId: planning.eventId },
        })
        .then((items) => {
          if (live) {
            setTeams(
              items
                .filter((item) => item.active)
                .map((item) => ({ id: item.id, name: item.profile.name })),
            );
            if (
              period?.scheduleGoal &&
              planning.conditions.some((item) => item.kind === 'FORMAT')
            )
              setConfig((current) => ({
                ...current,
                teamIds: items
                  .filter((item) => item.active)
                  .map((item) => item.id),
              }));
          }
        })
        .catch((cause) => {
          if (live) {
            if (cause instanceof ApiError && [401, 403].includes(cause.status))
              access.current(cause);
            else setError('无法读取参赛球队。');
          }
        });
    }
    return () => {
      live = false;
    };
  }, [
    planning.id,
    planning.revision,
    planning.status,
    schedule?.revision,
    token,
  ]);
  if (planning.status !== 'CONFIRMED') return null;
  const update = (key: keyof Config, value: string) => {
    setSource('EXPLICIT');
    setConfig((current) => ({
      ...current,
      [key]:
        key === 'venues'
          ? value
              .split('、')
              .map((s) => s.trim())
              .filter(Boolean)
          : ['durationMinutes', 'bufferMinutes', 'minRestMinutes'].includes(key)
            ? value
              ? Number(value)
              : undefined
            : value,
    }));
  };
  const fields = [
    ['startDate', '起始日期 YYYY-MM-DD'],
    ['endDate', '结束日期 YYYY-MM-DD'],
    ['dailyStart', '每日开始 HH:mm'],
    ['dailyEnd', '每日结束 HH:mm'],
    ['venues', '场地（顿号分隔）'],
    ['durationMinutes', '每场分钟'],
    ['bufferMinutes', '场地缓冲分钟'],
    ['minRestMinutes', '最短休息分钟'],
  ] as const;
  const complete =
    teams.length >= 2 &&
    config.startDate &&
    config.endDate &&
    config.dailyStart &&
    config.dailyEnd &&
    config.venues?.length &&
    config.durationMinutes !== undefined &&
    config.bufferMinutes !== undefined &&
    config.minRestMinutes !== undefined;
  const generate = async () => {
    if (!complete || busy || (schedule?.exists && !ack)) return;
    setBusy(true);
    setError('');
    try {
      const result = await client.request('previewAgentScheduleCandidate', {
        token,
        path: { planningId: planning.id },
        body: {
          expectedRevision: planning.revision,
          baselineRevision: schedule?.revision ?? 0,
          format: 'ROUND_ROBIN',
          configSource: source,
          fixedMatchIds: fixed,
          config: {
            ...config,
            teamIds: teams.map((item) => item.id),
          } as Config,
        },
      });
      setCandidate(result);
    } catch (cause) {
      setCandidate(null);
      if (cause instanceof ApiError && [401, 403].includes(cause.status))
        access.current(cause);
      else
        setError(
          cause instanceof ApiError && cause.status === 409
            ? '需求、基础赛程或保护范围已变化，请刷新后核对。'
            : '候选未生成；请检查全部配置和硬条件。',
        );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View className="agent-planning-card" aria-label="整套候选赛程预览">
      <Text className="subtitle">单循环整套候选 · 仅预览</Text>
      <Text className="competition-note">
        已确认需求 V{planning.revision} · 基础赛程 V{schedule?.revision ?? 0} ·
        配置来源：
        {source === 'EVENT_SCHEDULE'
          ? '当前赛程'
          : '本次逐项核对/修改（未改字段可能预填自现有配置）'}
        。不支持淘汰赛候选或自动填充业务缺省。
      </Text>
      {planning.conditions.some((item) => item.scheduleGoal) && (
        <Text className="competition-note">
          已带入确认的日期与全部当前参赛球队。请核对每日时段、场地、比赛时长、缓冲及休息时间；缺项需补齐后计算。
        </Text>
      )}
      {schedule?.exists && (
        <Action
          disabled={busy}
          onClick={() => {
            setConfig(schedule.config);
            setSource('EVENT_SCHEDULE');
          }}
        >
          明确沿用当前赛程配置
        </Action>
      )}
      {fields.map(([key, label]) => (
        <View className="agent-candidate-field" key={key}>
          <Text>{label}</Text>
          <Input
            aria-label={label}
            value={
              key === 'venues'
                ? (config.venues?.join('、') ?? '')
                : String(config[key] ?? '')
            }
            onInput={(e) => update(key, e.detail.value)}
          />
        </View>
      ))}
      <Text className="competition-note">
        当前全部有效参赛球队（不可增删）：
        {teams.length ? teams.map((item) => item.name).join('、') : '加载中'}
      </Text>
      {schedule?.exists && (
        <View>
          <Text>逐场点选必须固定的现有比赛（可明确选择空集合）：</Text>
          {schedule.matches
            .filter((match) => !!match.startAt)
            .map((match) => (
              <Action
                key={match.id}
                disabled={busy}
                onClick={() =>
                  setFixed((ids) =>
                    ids.includes(match.id)
                      ? ids.filter((id) => id !== match.id)
                      : [...ids, match.id],
                  )
                }
              >
                {fixed.includes(match.id) ? '已固定 · ' : '可移动 · '}
                {match.homeLabel} vs {match.awayLabel} · {bj(match.startAt)} ·{' '}
                {match.venue}
              </Action>
            ))}
          <Action disabled={busy} onClick={() => setAck((value) => !value)}>
            {ack ? '已核对固定范围（点按撤销）' : '点按确认固定范围/无固定比赛'}
          </Action>
        </View>
      )}
      <Action
        primary
        disabled={!complete || busy || (!!schedule?.exists && !ack)}
        onClick={() => void generate()}
      >
        仅计算候选，不保存赛程
      </Action>
      {error && (
        <View role="alert" className="competition-error">
          <Text>{error}</Text>
        </View>
      )}
      {candidate && (
        <View role="status">
          <Text className="subtitle">
            候选预览，尚未保存 · {candidate.status}
          </Text>
          <Text className="competition-note">
            {candidate.warning} · 已探索 {candidate.explored} 节点 · 固定场次{' '}
            {candidate.fixedMatchIds.length}
          </Text>
          {candidate.issues.map((issue, index) => (
            <Text key={index} className="competition-error">
              {issue.code}：{issue.message}
            </Text>
          ))}
          {candidate.preferences.map((pref) => (
            <Text key={pref.conditionId} className="competition-note">
              偏好{' '}
              {
                planning.conditions.find((item) => item.id === pref.conditionId)
                  ?.teamLabel
              }{' '}
              · {pref.status}：{pref.reason}
            </Text>
          ))}
          {candidate.status === 'FOUND' && (
            <>
              <Text className="competition-line">
                共 {candidate.matches.length} 场，调整{' '}
                {candidate.changes.length} 场；按北京时间：
              </Text>
              {[...candidate.matches]
                .sort((a, b) => a.startAt.localeCompare(b.startAt))
                .map((match) => {
                  const changed = candidate.changes.find(
                    (item) => item.matchId === match.id,
                  );
                  return (
                    <View className="agent-planning-condition" key={match.id}>
                      <Text>
                        {match.homeLabel} vs {match.awayLabel}
                      </Text>
                      <Text>
                        {bj(match.startAt)} · {match.venue}
                      </Text>
                      <Text className="competition-note">
                        {changed
                          ? `原安排：${changed.beforeStartAt ? bj(changed.beforeStartAt) : '无'} · ${changed.beforeVenue || '无'}`
                          : '未变化'}
                      </Text>
                    </View>
                  );
                })}
            </>
          )}
        </View>
      )}
    </View>
  );
}
