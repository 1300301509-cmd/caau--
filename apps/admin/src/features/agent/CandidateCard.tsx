import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Select, Tag } from 'antd';
import { ApiError, type components } from '@caau/api-client';
import { client } from '../materials/client';

type S = components['schemas'];
type Planning = S['AgentPlanningRequestViewDto'];
type Config = S['ScheduleConfigDto'];
type Candidate = S['AgentScheduleCandidateViewDto'];
type SaveTicket = S['AgentCandidateSaveTicketDto'];
type Schedule = S['ScheduleViewDto'];

function confirmedConfig(planning: Planning, schedule?: Schedule) {
  const period = planning.conditions.find((item) => item.kind === 'DATE_RANGE');
  const requested = planning.conditions.find(
    (item) => item.kind === 'SCHEDULE_CONFIG',
  );
  const values: Partial<Config> = {
    ...(schedule?.exists ? schedule.config : {}),
    ...(period?.from ? { startDate: period.from } : {}),
    ...(period?.to ? { endDate: period.to } : {}),
    ...(requested?.dailyStart ? { dailyStart: requested.dailyStart } : {}),
    ...(requested?.dailyEnd ? { dailyEnd: requested.dailyEnd } : {}),
    ...(requested?.venues ? { venues: requested.venues } : {}),
    ...(requested?.durationMinutes !== undefined
      ? { durationMinutes: requested.durationMinutes }
      : {}),
    ...(requested?.bufferMinutes !== undefined
      ? { bufferMinutes: requested.bufferMinutes }
      : {}),
    ...(requested?.minRestMinutes !== undefined
      ? { minRestMinutes: requested.minRestMinutes }
      : {}),
  };
  const matchesBaseline =
    !!schedule?.exists &&
    schedule.config.startDate === period?.from &&
    schedule.config.endDate === period?.to &&
    (!requested ||
      (schedule.config.dailyStart === requested.dailyStart &&
        schedule.config.dailyEnd === requested.dailyEnd &&
        JSON.stringify(schedule.config.venues) ===
          JSON.stringify(requested.venues) &&
        schedule.config.durationMinutes === requested.durationMinutes &&
        schedule.config.bufferMinutes === requested.bufferMinutes &&
        schedule.config.minRestMinutes === requested.minRestMinutes));
  return { values, matchesBaseline };
}

const display = (instant: string) =>
  instant
    ? new Date(Date.parse(instant) + 28800000)
        .toISOString()
        .slice(0, 16)
        .replace('T', ' ')
    : '原无安排';
export function CandidateCard({
  planning,
  schedule,
  token,
  onAccessError,
  onSaved,
}: {
  planning: Planning;
  schedule?: Schedule;
  token: string;
  onAccessError: (cause: unknown) => void;
  onSaved: () => Promise<void>;
}) {
  const accessError = useRef(onAccessError);
  accessError.current = onAccessError;
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [ticket, setTicket] = useState<SaveTicket | null>(null);
  const [config, setConfig] = useState<Partial<Config>>({});
  const [teams, setTeams] = useState<
    { id: string; name: string; active: boolean }[]
  >([]);
  const [source, setSource] = useState<'EVENT_SCHEDULE' | 'EXPLICIT'>(
    'EXPLICIT',
  );
  const [fixed, setFixed] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const period = planning.conditions.find(
      (item) => item.kind === 'DATE_RANGE',
    );
    const prefill = confirmedConfig(planning, schedule);
    setCandidate(null);
    setTicket(null);
    setConfig(prefill.values);
    setSource(prefill.matchesBaseline ? 'EVENT_SCHEDULE' : 'EXPLICIT');
    setFixed([]);
    setAcknowledged(false);
    setTeams([]);
    setError('');
    if (planning.status === 'CONFIRMED') {
      void client
        .request('getLatestAgentScheduleCandidate', {
          token,
          path: { planningId: planning.id },
        })
        .then((item) => {
          if (live) setCandidate(item);
        })
        .catch((cause) => {
          if (live) {
            setCandidate(null);
            if (cause instanceof ApiError && [401, 403].includes(cause.status))
              accessError.current(cause);
            else if (!(cause instanceof ApiError && cause.status === 404))
              setError('恢复候选失败，请重新检查权限和版本。');
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
                .map((item) => ({
                  id: item.id,
                  name: item.profile.name,
                  active: item.active,
                })),
            );
            if (
              period?.scheduleGoal &&
              planning.conditions.some((item) => item.kind === 'FORMAT')
            ) {
              const teamIds = items
                .filter((item) => item.active)
                .map((item) => item.id);
              setConfig((current) => ({
                ...current,
                teamIds,
              }));
              if (
                prefill.matchesBaseline &&
                JSON.stringify(schedule?.config.teamIds) !==
                  JSON.stringify(teamIds)
              )
                setSource('EXPLICIT');
            }
          }
        })
        .catch((cause) => {
          if (live) {
            if (cause instanceof ApiError && [401, 403].includes(cause.status))
              accessError.current(cause);
            else setError('无法读取当前赛事参赛名单。');
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
  useEffect(() => {
    if (!candidate) return;
    let live = true;
    void client
      .request('getLatestAgentCandidateDraftSaveTicket', {
        token,
        path: { planningId: planning.id, candidateId: candidate.id },
      })
      .then((next) => {
        if (live) setTicket(next);
      })
      .catch((cause) => {
        if (!live) return;
        if (cause instanceof ApiError && [401, 403].includes(cause.status))
          accessError.current(cause);
        else if (!(cause instanceof ApiError && cause.status === 404))
          setError('恢复草稿确认状态失败。');
      });
    return () => {
      live = false;
    };
  }, [candidate?.id, planning.id, token]);
  if (planning.status !== 'CONFIRMED') return null;
  const baselineMatchesRequirements =
    confirmedConfig(planning, schedule).matchesBaseline &&
    (!teams.length ||
      JSON.stringify(schedule?.config.teamIds) ===
        JSON.stringify(
          teams.filter((team) => team.active).map((team) => team.id),
        ));
  // The server remains authoritative after refresh or a lost confirmation response.
  const restoreTicket = async (item: Candidate) => {
    try {
      const next = await client.request(
        'getLatestAgentCandidateDraftSaveTicket',
        {
          token,
          path: { planningId: planning.id, candidateId: item.id },
        },
      );
      setTicket(next);
      return next;
    } catch (cause) {
      if (cause instanceof ApiError && [401, 403].includes(cause.status))
        onAccessError(cause);
      else if (!(cause instanceof ApiError && cause.status === 404))
        setError('无法恢复草稿确认状态，请刷新后核对。');
    }
  };
  const saveAction = async (action: 'prepare' | 'confirm' | 'cancel') => {
    if (!candidate || busy) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'prepare') {
        const next = await client.request('prepareAgentCandidateDraftSave', {
          token,
          path: { planningId: planning.id, candidateId: candidate.id },
          body: {
            expectedPlanningRevision: candidate.planningRevision,
            expectedBaselineRevision: candidate.baselineRevision,
          },
        });
        setTicket(next);
      } else if (ticket && action === 'confirm') {
        await client.request('confirmAgentCandidateDraftSave', {
          token,
          path: { ticketId: ticket.id },
          body: {
            candidateId: ticket.candidateId,
            candidateHash: ticket.candidateHash,
          },
        });
        await restoreTicket(candidate);
        await onSaved();
      } else if (ticket) {
        await client.request('cancelAgentCandidateDraftSave', {
          token,
          path: { ticketId: ticket.id },
        });
        await restoreTicket(candidate);
      }
    } catch (cause) {
      if (cause instanceof ApiError && [401, 403].includes(cause.status))
        onAccessError(cause);
      else {
        setError(
          cause instanceof ApiError && cause.status === 409
            ? '需求、候选或赛程已变化，请刷新后重新核对。'
            : '操作结果尚未确认；请刷新或重试，系统会恢复原回执。',
        );
        const recovered = await restoreTicket(candidate);
        if (recovered?.receipt) {
          setError('');
          await onSaved();
        }
      }
    } finally {
      setBusy(false);
    }
  };
  const change = (field: keyof Config, value: string) => {
    setSource('EXPLICIT');
    setConfig((current) => ({
      ...current,
      [field]: ['durationMinutes', 'bufferMinutes', 'minRestMinutes'].includes(
        field,
      )
        ? value
          ? Number(value)
          : undefined
        : field === 'venues'
          ? value
              .split('、')
              .map((s) => s.trim())
              .filter(Boolean)
          : value,
    }));
  };
  const usable =
    !!config.teamIds?.length &&
    !!config.venues?.length &&
    !!config.startDate &&
    !!config.endDate &&
    !!config.dailyStart &&
    !!config.dailyEnd &&
    config.durationMinutes !== undefined &&
    config.bufferMinutes !== undefined &&
    config.minRestMinutes !== undefined;
  const generate = async () => {
    if (!usable || !teams.length || (schedule?.exists && !acknowledged) || busy)
      return;
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
          config: config as Config,
          fixedMatchIds: fixed,
        },
      });
      setCandidate(result);
      setTicket(null);
    } catch (cause) {
      setCandidate(null);
      if (cause instanceof ApiError && [401, 403].includes(cause.status))
        onAccessError(cause);
      else
        setError(
          cause instanceof ApiError && cause.status === 409
            ? '需求、配置、比赛保护范围或基础赛程已变化；请刷新并核对条件。'
            : '无法生成候选：请核对所有配置、条件与受保护场次。',
        );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="agent-candidate" aria-label="整套候选赛程预览">
      <h3>整套候选赛程</h3>
      <p>
        单循环：每两队交手一次；不支持淘汰赛候选。必须显式核对全部输入，配置没有业务默认值。
      </p>
      {planning.conditions.some((item) => item.scheduleGoal) && (
        <p>
          已从确认需求带入日期、每日比赛时间、场地、单场时长及全部当前参赛球队。请核对换场缓冲和同队休息时间；缺少的参数须填写后才能计算。
        </p>
      )}
      <p>
        已确认需求 V{planning.confirmedRevision} · 当前赛程{' '}
        {schedule?.exists
          ? `V${schedule.revision}（${schedule.status}）`
          : '不存在（基线 V0）'}
        ；来源：
        {source === 'EVENT_SCHEDULE'
          ? '现有赛事赛程配置'
          : '已确认需求和本次逐项核对（未改字段可能预填自现有配置）'}
      </p>
      <label>
        配置来源{' '}
        <Select
          aria-label="配置来源"
          value={source}
          options={[
            ...(baselineMatchesRequirements
              ? [
                  {
                    value: 'EVENT_SCHEDULE',
                    label: '沿用当前赛程配置',
                  },
                ]
              : []),
            { value: 'EXPLICIT', label: '逐项核对/填写全部配置' },
          ]}
          onChange={(v) => {
            setSource(v);
            if (v === 'EVENT_SCHEDULE' && schedule?.exists)
              setConfig(schedule.config);
          }}
        />
      </label>
      {(
        [
          'startDate',
          'endDate',
          'dailyStart',
          'dailyEnd',
          'durationMinutes',
          'bufferMinutes',
          'minRestMinutes',
          'venues',
        ] as const
      ).map((key) => (
        <label key={key} className="agent-candidate-field">
          {
            {
              startDate: '起始日期 YYYY-MM-DD',
              endDate: '结束日期 YYYY-MM-DD',
              dailyStart: '每天开始 HH:mm',
              dailyEnd: '每天结束 HH:mm',
              durationMinutes: '每场分钟',
              bufferMinutes: '场地缓冲分钟',
              minRestMinutes: '球队最短休息分钟',
              venues: '场地（顿号分隔）',
            }[key]
          }
          <Input
            value={
              key === 'venues'
                ? (config.venues?.join('、') ?? '')
                : String(config[key] ?? '')
            }
            onChange={(e) => change(key, e.target.value)}
          />
        </label>
      ))}
      <label className="agent-candidate-field">
        全部当前参赛球队（不可静默增删）
        <Select
          mode="multiple"
          aria-label="全部参赛球队"
          value={config.teamIds ?? []}
          options={teams.map((team) => ({ value: team.id, label: team.name }))}
          onChange={(ids) => {
            setSource('EXPLICIT');
            setConfig((current) => ({ ...current, teamIds: ids }));
          }}
        />
      </label>
      {schedule?.exists && (
        <>
          <label className="agent-candidate-field">
            固定不移动的现有场次（可为空，必须明确选择）
            <Select
              mode="multiple"
              aria-label="固定场次"
              value={fixed}
              options={schedule.matches
                .filter((match) => !!match.startAt)
                .map((match) => ({
                  value: match.id,
                  label: `${match.homeLabel} vs ${match.awayLabel} · ${display(match.startAt)}`,
                }))}
              onChange={setFixed}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />{' '}
            我已核对固定范围；已开始/已完成、已发布或有人员安排的比赛不能擅自重新安排。
          </label>
        </>
      )}
      <Button
        loading={busy}
        disabled={
          !usable || !teams.length || (schedule?.exists && !acknowledged)
        }
        onClick={() => void generate()}
      >
        仅生成候选预览，不保存赛程
      </Button>
      {error && <Alert type="error" title={error} />}
      {candidate && (
        <article aria-live="polite">
          <h4>
            {ticket?.receipt ? '候选执行回执' : '候选预览，尚未保存'}{' '}
            <Tag color={candidate.status === 'FOUND' ? 'green' : 'orange'}>
              {candidate.status}
            </Tag>
          </h4>
          <p>
            {candidate.warning} · 需求 V{candidate.planningRevision} · 基础 V
            {candidate.baselineRevision} · 已探索 {candidate.explored} 节点
          </p>
          {candidate.issues.map((issue, index) => (
            <Alert
              key={index}
              type="warning"
              title={`${issue.code}：${issue.message}`}
            />
          ))}
          {candidate.preferences.map((preference) => (
            <p key={preference.conditionId}>
              偏好{' '}
              {planning.conditions.find(
                (item) => item.id === preference.conditionId,
              )?.teamLabel ?? preference.conditionId}
              ：{preference.status} · {preference.reason}
            </p>
          ))}
          {candidate.status === 'FOUND' && (
            <>
              <p>
                共 {candidate.matches.length} 场；新旧时间/场地变更{' '}
                {candidate.changes.length} 场。
              </p>
              <div className="agent-candidate-scroll">
                <table>
                  <caption>按北京时间排列的候选周赛程及原安排</caption>
                  <thead>
                    <tr>
                      <th>比赛</th>
                      <th>候选时间/场地</th>
                      <th>原时间/场地</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...candidate.matches]
                      .sort((a, b) => a.startAt.localeCompare(b.startAt))
                      .map((match) => {
                        const diff = candidate.changes.find(
                          (item) => item.matchId === match.id,
                        );
                        return (
                          <tr key={match.id}>
                            <td>
                              {match.homeLabel} vs {match.awayLabel}
                            </td>
                            <td>
                              {display(match.startAt)} · {match.venue}
                            </td>
                            <td>
                              {diff
                                ? `${display(diff.beforeStartAt)} · ${diff.beforeVenue || '原无安排'}`
                                : '未变化'}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {candidate.canSave &&
            (!ticket ||
              ticket.state === 'CANCELLED' ||
              (ticket.state === 'PENDING' && !ticket.canConfirm)) && (
              <Button
                disabled={busy}
                onClick={() => void saveAction('prepare')}
              >
                准备保存整套 DRAFT
              </Button>
            )}
          {ticket && (
            <section aria-label="候选草稿确认">
              <h4>整套候选草稿确认 · {ticket.state}</h4>
              <p>
                候选 {ticket.matchCount} 场 · 需求 V{ticket.planningRevision} ·
                基础赛程 V{ticket.baselineRevision} · 票据截至{' '}
                {display(ticket.expiresAt)}
              </p>
              {ticket.state === 'PENDING' && (
                <>
                  <p>
                    仅保存 DRAFT，不发布赛程。请核对上方全部场次后人工确认。
                  </p>
                  <Button
                    type="primary"
                    disabled={busy || !ticket.canConfirm}
                    onClick={() => void saveAction('confirm')}
                  >
                    确认保存为 DRAFT
                  </Button>{' '}
                  <Button
                    disabled={busy}
                    onClick={() => void saveAction('cancel')}
                  >
                    取消
                  </Button>
                </>
              )}
              {ticket.receipt && (
                <p>
                  当时执行 DRAFT V{ticket.receipt.revision} ·{' '}
                  {ticket.receipt.matchCount} 场 · 命令{' '}
                  {ticket.receipt.commandId}。赛程当前状态：
                  {schedule?.exists
                    ? `${schedule.status} V${schedule.revision}`
                    : '待刷新'}
                  。
                </p>
              )}
            </section>
          )}
        </article>
      )}
    </section>
  );
}
