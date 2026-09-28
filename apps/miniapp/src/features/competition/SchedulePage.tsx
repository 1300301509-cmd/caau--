import { useRef, useState } from 'react';
import {
  Button,
  Image,
  Picker,
  ScrollView,
  Text,
  View,
} from '@tarojs/components';
import Taro from '@tarojs/taro';
import { ApiError } from '@caau/api-client';
import { client, newKey } from '../materials/session';
import {
  Action,
  Field,
  confirm,
  saved,
  useCompetition,
  useVisibleAutoRefresh,
} from './shared';
import { bj, inWeek, monday, shift, scheduleDay, type S } from './model';
import logo from '../../assets/caau-logo.jpg';
import calendarIcon from '../../assets/home/calendar.svg';
import backIcon from '../../assets/competition/team-back.svg';
import pinIcon from '../../assets/competition/team-pin.svg';
import adjustIcon from '../../assets/competition/schedule-adjust.svg';
import chevronIcon from '../../assets/competition/schedule-chevron.svg';
import warningIcon from '../../assets/competition/schedule-warning.svg';
import './schedule.css';
type Schedule = S['ScheduleViewDto'];
type Match = Schedule['matches'][number];
type Generate = S['GenerateScheduleDto'];
type Adjust = S['AdjustScheduleMatchDto'];
type Pending =
  | { kind: 'generate'; body: Generate }
  | { kind: 'adjust'; id: string; body: Adjust }
  | { kind: 'publish'; body: S['PublishScheduleDto'] };
const config = (): S['ScheduleConfigDto'] => ({
  teamIds: [],
  venues: [],
  startDate: bj(Date.now()).slice(0, 10),
  endDate: bj(Date.now()).slice(0, 10),
  dailyStart: '09:00',
  dailyEnd: '18:00',
  durationMinutes: 40,
  bufferMinutes: 10,
  minRestMinutes: 60,
});
const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
function headerTop() {
  try {
    const status = Taro.getWindowInfo().statusBarHeight ?? 24;
    const menu = Taro.getMenuButtonBoundingClientRect();
    return Math.max(status + 28, menu.bottom + 8);
  } catch {
    return 64;
  }
}
function dateParts(date: string) {
  return date.split('-').map(Number);
}
function weekLabel(start: string) {
  const end = shift(start, 6);
  const [year, month, day] = dateParts(start);
  const [endYear, endMonth, endDay] = dateParts(end);
  if (year !== endYear)
    return `${year}年${month}月${day}日—${endYear}年${endMonth}月${endDay}日`;
  if (month !== endMonth)
    return `${year}年${month}月${day}日—${endMonth}月${endDay}日`;
  return `${year}年${month}月${day}日—${endDay}日`;
}
function shortDate(date: string) {
  const [, month, day] = dateParts(date);
  return `${month}月${day}日`;
}
export default function SchedulePage() {
  const [data, setData] = useState<Schedule>(),
    [teams, setTeams] = useState<S['TeamViewDto'][]>([]);
  const [divisions, setDivisions] = useState<S['EventDivisionViewDto'][]>([]);
  const [selectedDivision, setSelectedDivision] = useState('ALL');
  const [week, setWeek] = useState(monday(bj(Date.now()).slice(0, 10)));
  const [selectedDay, setSelectedDay] = useState('');
  const [issuesOpen, setIssuesOpen] = useState(true);
  const [generate, setGenerate] = useState<{
    format: Generate['format'];
    config: S['ScheduleConfigDto'];
    venues: string;
  }>();
  const [adjust, setAdjust] = useState<{
    id: string;
    revision: number;
    date: string;
    time: string;
    venue: string;
  }>();
  const pending = useRef<Pending>(),
    [frozen, setFrozen] = useState(false);
  const ctx = useCompetition(
    () => {
      setData(undefined);
      setTeams([]);
      setDivisions([]);
      setSelectedDivision('ALL');
      setWeek(monday(bj(Date.now()).slice(0, 10)));
      setSelectedDay('');
      setIssuesOpen(true);
      setGenerate(undefined);
      setAdjust(undefined);
      pending.current = undefined;
      setFrozen(false);
    },
    !!generate || !!adjust || frozen,
  );
  function accept(next: Schedule) {
    setData(next);
    setGenerate(undefined);
    setAdjust(undefined);
    pending.current = undefined;
    setFrozen(false);
    saved();
  }
  async function load() {
    await (data ? ctx.read : ctx.run)(async (token, valid) => {
      const [s, t, d] = await Promise.all([
        client.request('getEventSchedule', {
          token,
          path: { eventId: ctx.eventId },
        }),
        client.request('listEventTeams', {
          token,
          path: { eventId: ctx.eventId },
        }),
        client
          .request('listEventDivisions', {
            token,
            path: { eventId: ctx.eventId },
          })
          .catch((cause) => {
            if (cause instanceof ApiError && cause.status === 403) return [];
            throw cause;
          }),
      ]);
      if (valid()) {
        setData(s);
        setTeams(t);
        setDivisions(d);
        ctx.setError('');
        const first = s.matches.find((m) => m.startAt);
        if (!data && first) setWeek(monday(bj(first.startAt).slice(0, 10)));
      }
    });
  }
  useVisibleAutoRefresh(load, !generate && !adjust && !frozen);
  async function send(kind: Pending['kind']) {
    await ctx.run(async (token, valid) => {
      if (!pending.current) {
        if (kind === 'generate' && generate) {
          const cfg = {
            ...generate.config,
            venues: generate.venues
              .split(/[\n,，]/)
              .map((v) => v.trim())
              .filter(Boolean),
          };
          if (cfg.teamIds.length < 2 || !cfg.venues.length)
            throw new Error('请至少选择两支球队和一个比赛场地');
          for (const division of divisions.filter((item) => item.active)) {
            const count = teams.filter(
              (team) =>
                team.active &&
                team.divisionId === division.id &&
                cfg.teamIds.includes(team.id),
            ).length;
            if (count === 1)
              throw new Error(
                `${division.name}至少需要两支球队，或取消该组唯一已选球队`,
              );
          }
          if (
            !(await confirm(
              '生成候选赛程',
              data?.exists
                ? '将生成新版本，当前已发布赛程也会变为草稿，旧场次人员不会自动复制。是否继续？'
                : '按当前条件生成候选赛程？',
            )) ||
            !valid()
          )
            return;
          const commandId = await newKey();
          if (!valid()) return;
          pending.current = {
            kind,
            body: { commandId, format: generate.format, config: cfg },
          };
        } else if (kind === 'adjust' && adjust) {
          const stamp = `${adjust.date}T${adjust.time}:00+08:00`;
          if (!Number.isFinite(Date.parse(stamp)) || !adjust.venue.trim())
            throw new Error('请填写有效的北京时间和场地');
          if (
            data?.status === 'PUBLISHED' &&
            (!(await confirm(
              '调整已发布赛程',
              '调整会生成新草稿，需再次发布。当前场次人员安排不会自动复制到新版本。',
            )) ||
              !valid())
          )
            return;
          const commandId = await newKey();
          if (!valid()) return;
          pending.current = {
            kind,
            id: adjust.id,
            body: {
              commandId,
              expectedRevision: adjust.revision,
              startAt: stamp,
              venue: adjust.venue,
            },
          };
        } else if (kind === 'publish' && data) {
          if (
            !(await confirm(
              '发布赛程',
              `发布当前 V${data.revision}，共 ${data.matches.length} 场比赛？`,
            )) ||
            !valid()
          )
            return;
          const commandId = await newKey();
          if (!valid()) return;
          pending.current = {
            kind,
            body: { commandId, expectedRevision: data.revision },
          };
        }
        setFrozen(!!pending.current);
      }
      const p = pending.current;
      if (!p) return;
      const next =
        p.kind === 'generate'
          ? await client.request('generateEventSchedule', {
              token,
              path: { eventId: ctx.eventId },
              body: p.body,
            })
          : p.kind === 'adjust'
            ? await client.request('adjustEventScheduleMatch', {
                token,
                path: { eventId: ctx.eventId, matchId: p.id },
                body: p.body,
              })
            : await client.request('publishEventSchedule', {
                token,
                path: { eventId: ctx.eventId },
                body: p.body,
              });
      if (valid()) accept(next);
    });
  }
  async function cancel() {
    if (
      await confirm(
        '退出编辑',
        frozen
          ? '操作结果尚未确认，退出后刷新核对当前赛程，避免重复生成。'
          : '放弃当前输入？',
      )
    ) {
      setGenerate(undefined);
      setAdjust(undefined);
      pending.current = undefined;
      setFrozen(false);
      void load();
    }
  }
  const divisionName = (id: string | null, label = '') =>
    id
      ? label ||
        divisions.find((division) => division.id === id)?.name ||
        '历史组别'
      : '待归组（历史）';
  const visibleMatches =
    data?.matches.filter(
      (match) =>
        selectedDivision === 'ALL' ||
        (match.divisionId ?? 'LEGACY') === selectedDivision,
    ) ?? [];
  const weekMatches = visibleMatches.filter((m) => inWeek(m.startAt, week));
  const activeDay =
    selectedDay >= week && selectedDay <= shift(week, 6) ? selectedDay : '';
  const shown = weekMatches.filter(
    (m) => !activeDay || bj(m.startAt).slice(0, 10) === activeDay,
  );
  const displayMatches = scheduleDay(visibleMatches, week, activeDay);
  const scheduledMatches = displayMatches
    .filter((match) => !!match.startAt)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  const pendingMatches = displayMatches.filter((match) => !match.startAt);
  function changeWeek(days: number) {
    setWeek(shift(week, days));
    if (activeDay) setSelectedDay(shift(activeDay, days));
  }
  function openGenerate() {
    if (!data || ctx.busy || frozen) return;
    const cfg = data.exists ? data.config : config();
    setGenerate({
      format: data.format ?? 'ROUND_ROBIN',
      config: {
        ...cfg,
        teamIds: cfg.teamIds.filter((id) =>
          teams.some(
            (team) =>
              team.id === id &&
              team.active &&
              divisions.some(
                (division) =>
                  division.id === team.divisionId && division.active,
              ),
          ),
        ),
        venues: [...cfg.venues],
      },
      venues: cfg.venues.join('，'),
    });
  }
  function renderMatch(match: Match) {
    if (!data) return null;
    const start = match.startAt ? bj(match.startAt) : '';
    const matchDate = start.slice(0, 10);
    return (
      <View className="schedule-match-card" key={match.id}>
        <View className="schedule-match-time">
          <Text className="schedule-match-clock">
            {start ? start.slice(11, 16) : '待安排'}
          </Text>
          <Text className="schedule-match-round">
            {start && !activeDay ? shortDate(matchDate) : `第${match.round}轮`}
          </Text>
          {start && !activeDay && (
            <Text className="schedule-match-round">第{match.round}轮</Text>
          )}
        </View>
        <View className="schedule-match-teams">
          <View className="schedule-team-line">
            <Text className="schedule-team-mark schedule-team-home" aria-hidden>
              {match.homeLabel.trim().slice(0, 1) || '主'}
            </Text>
            <Text className="schedule-team-name">{match.homeLabel}</Text>
          </View>
          <Text className="schedule-match-versus">VS</Text>
          <View className="schedule-team-line">
            <Text className="schedule-team-mark schedule-team-away" aria-hidden>
              {match.awayLabel.trim().slice(0, 1) || '客'}
            </Text>
            <Text className="schedule-team-name">{match.awayLabel}</Text>
          </View>
        </View>
        <View className="schedule-match-meta">
          <View className="schedule-match-meta-line">
            <Image src={pinIcon} mode="aspectFit" aria-hidden />
            <Text>{match.venue || '场地待安排'}</Text>
          </View>
          <Text className="schedule-match-division">
            {divisionName(match.divisionId, match.divisionLabel)}
          </Text>
        </View>
        <Button
          className="schedule-match-adjust"
          disabled={ctx.busy || frozen}
          ariaLabel={`调整${match.homeLabel}对${match.awayLabel}的比赛`}
          onClick={() => {
            const date = start || `${week}T09:00`;
            setAdjust({
              id: match.id,
              revision: data.revision,
              date: date.slice(0, 10),
              time: date.slice(11, 16),
              venue: match.venue,
            });
          }}
        >
          调整
        </Button>
      </View>
    );
  }
  const inputDate = (
    label: string,
    value: string,
    onChange: (v: string) => void,
  ) => (
    <View>
      <Text className="competition-line">{label}</Text>
      <Picker
        mode="date"
        value={value}
        disabled={ctx.busy || frozen}
        onChange={(e) => onChange(e.detail.value)}
      >
        <Text>{value}</Text>
      </Picker>
    </View>
  );
  const inputTime = (
    label: string,
    value: string,
    onChange: (v: string) => void,
  ) => (
    <View>
      <Text className="competition-line">{label}</Text>
      <Picker
        mode="time"
        value={value}
        disabled={ctx.busy || frozen}
        onChange={(e) => onChange(e.detail.value)}
      >
        <Text>{value}</Text>
      </Picker>
    </View>
  );
  return (
    <View className="page competition-mobile schedule-page">
      <View
        className="schedule-header"
        style={{ paddingTop: `${headerTop()}px` }}
      >
        <Button
          className="schedule-back"
          ariaLabel="返回我的比赛"
          onClick={() => void Taro.navigateBack()}
        >
          <Image src={backIcon} mode="aspectFit" />
        </Button>
        <View className="schedule-brand" aria-hidden>
          <Image src={logo} mode="aspectFit" />
        </View>
        <View className="schedule-header-copy">
          <Text className="schedule-header-title">赛程编排</Text>
          <Text className="schedule-header-caption">让每一场比赛更有价值</Text>
        </View>
        <Button
          className="schedule-header-action"
          disabled={ctx.busy || (!data && !generate && !adjust)}
          onClick={() => (generate || adjust ? void cancel() : openGenerate())}
        >
          {!generate && !adjust && (
            <Image src={adjustIcon} mode="aspectFit" aria-hidden />
          )}
          {generate || adjust ? '返回赛程' : '编排条件'}
        </Button>
      </View>
      <View className="schedule-content">
        {ctx.error && (
          <View className="competition-error" role="alert">
            <Text>{ctx.error}</Text>
            {!generate && !adjust && !frozen && (
              <Button disabled={ctx.busy} onClick={() => void load()}>
                重新加载
              </Button>
            )}
          </View>
        )}
        {ctx.busy && (
          <View className="competition-loading" role="status">
            正在更新，请稍候…
          </View>
        )}
        {frozen && (
          <View className="card schedule-frozen">
            <Text>请求结果待核对，重试沿用原命令，不重复执行。</Text>
            <Action
              disabled={ctx.busy}
              onClick={() => void send(pending.current!.kind)}
            >
              重试原操作
            </Action>
            <Action disabled={ctx.busy} onClick={() => void cancel()}>
              取消并核对当前赛程
            </Action>
          </View>
        )}
        {generate ? (
          <View className="card schedule-form">
            <Text className="subtitle">编排条件</Text>
            <Picker
              disabled={ctx.busy || frozen}
              range={['单循环', '单败淘汰']}
              onChange={(e) =>
                setGenerate({
                  ...generate,
                  format:
                    Number(e.detail.value) === 0
                      ? 'ROUND_ROBIN'
                      : 'SINGLE_ELIMINATION',
                })
              }
            >
              <Text>
                比赛方式：
                {generate.format === 'ROUND_ROBIN' ? '单循环' : '单败淘汰'}
              </Text>
            </Picker>
            <Text className="competition-line">
              按竞赛组别选择球队（每组至少两支）
            </Text>
            {divisions
              .filter((division) => division.active)
              .map((division) => (
                <View key={division.id}>
                  <Text className="subtitle">{division.name}</Text>
                  {teams
                    .filter(
                      (team) => team.active && team.divisionId === division.id,
                    )
                    .map((t) => (
                      <Button
                        key={t.id}
                        disabled={ctx.busy || frozen}
                        className={
                          generate.config.teamIds.includes(t.id)
                            ? 'selected'
                            : ''
                        }
                        onClick={() =>
                          setGenerate({
                            ...generate,
                            config: {
                              ...generate.config,
                              teamIds: generate.config.teamIds.includes(t.id)
                                ? generate.config.teamIds.filter(
                                    (id) => id !== t.id,
                                  )
                                : [...generate.config.teamIds, t.id],
                            },
                          })
                        }
                      >
                        {generate.config.teamIds.includes(t.id)
                          ? '已选 · '
                          : ''}
                        {t.profile.name}
                      </Button>
                    ))}
                </View>
              ))}
            {teams.some(
              (team) =>
                team.active &&
                !divisions.some(
                  (division) =>
                    division.active && division.id === team.divisionId,
                ),
            ) && (
              <Text className="competition-note">
                有球队待归组或所属组别已停用，请先在球队管理中处理。
              </Text>
            )}
            <Field
              label="比赛场地（多个以逗号分隔）"
              max={2000}
              value={generate.venues}
              disabled={ctx.busy || frozen}
              onChange={(v) => setGenerate({ ...generate, venues: v })}
            />
            {(['startDate', 'endDate'] as const).map((key, i) => (
              <View key={key}>
                {inputDate(
                  i ? '结束日期' : '开始日期',
                  generate.config[key],
                  (v) =>
                    setGenerate({
                      ...generate,
                      config: { ...generate.config, [key]: v },
                    }),
                )}
              </View>
            ))}
            {(['dailyStart', 'dailyEnd'] as const).map((key, i) => (
              <View key={key}>
                {inputTime(
                  i ? '每天结束' : '每天开始',
                  generate.config[key],
                  (v) =>
                    setGenerate({
                      ...generate,
                      config: { ...generate.config, [key]: v },
                    }),
                )}
              </View>
            ))}
            {(
              [
                ['durationMinutes', '每场分钟'],
                ['bufferMinutes', '换场缓冲分钟'],
                ['minRestMinutes', '最短休息分钟'],
              ] as const
            ).map(([key, label]) => (
              <Field
                key={key}
                label={label}
                type="number"
                value={String(generate.config[key])}
                disabled={ctx.busy || frozen}
                onChange={(v) =>
                  setGenerate({
                    ...generate,
                    config: { ...generate.config, [key]: Number(v) },
                  })
                }
              />
            ))}
            <Action
              primary
              disabled={ctx.busy || frozen}
              onClick={() => void send('generate')}
            >
              生成候选赛程
            </Action>
            <Action disabled={ctx.busy} onClick={() => void cancel()}>
              取消
            </Action>
          </View>
        ) : adjust ? (
          <View className="card schedule-form">
            <Text className="subtitle">调整比赛</Text>
            {inputDate('比赛日期', adjust.date, (v) =>
              setAdjust({ ...adjust, date: v }),
            )}
            {inputTime('开赛时间', adjust.time, (v) =>
              setAdjust({ ...adjust, time: v }),
            )}
            <Field
              label="场地"
              value={adjust.venue}
              disabled={ctx.busy || frozen}
              onChange={(v) => setAdjust({ ...adjust, venue: v })}
            />
            <Action
              primary
              disabled={ctx.busy || frozen}
              onClick={() => void send('adjust')}
            >
              保存调整
            </Action>
            <Action disabled={ctx.busy} onClick={() => void cancel()}>
              取消
            </Action>
          </View>
        ) : (
          <View className="schedule-overview">
            {data?.exists ? (
              <>
                <View className="schedule-status-row">
                  <Text className="schedule-version">
                    {data.status === 'PUBLISHED' ? '已发布' : '草稿'} · V
                    {data.revision}
                  </Text>
                  <Text className="schedule-timezone">
                    北京时间 · 共 {data.matches.length} 场
                  </Text>
                </View>
                <View className="schedule-week-panel">
                  <View className="schedule-week-main">
                    <Button
                      className="schedule-week-nav"
                      ariaLabel="上一周"
                      onClick={() => changeWeek(-7)}
                    >
                      <Image
                        className="schedule-chevron-left"
                        src={chevronIcon}
                        mode="aspectFit"
                        aria-hidden
                      />
                      上一周
                    </Button>
                    <Picker
                      className="schedule-week-picker"
                      mode="date"
                      value={week}
                      onChange={(e) => {
                        setWeek(monday(e.detail.value));
                        setSelectedDay(e.detail.value);
                      }}
                    >
                      <View className="schedule-week-picker-inner">
                        <Text>{weekLabel(week)}</Text>
                        <Image
                          className="schedule-chevron-down"
                          src={chevronIcon}
                          mode="aspectFit"
                          aria-hidden
                        />
                      </View>
                    </Picker>
                    <Button
                      className="schedule-week-nav"
                      ariaLabel="下一周"
                      onClick={() => changeWeek(7)}
                    >
                      下一周
                      <Image src={chevronIcon} mode="aspectFit" aria-hidden />
                    </Button>
                  </View>
                  <Button
                    className="schedule-today"
                    onClick={() => {
                      const today = bj(Date.now()).slice(0, 10);
                      setWeek(monday(today));
                      setSelectedDay(today);
                    }}
                  >
                    <Image src={calendarIcon} mode="aspectFit" aria-hidden />
                    回到本周
                  </Button>
                </View>
                <ScrollView
                  scrollX
                  showScrollbar={false}
                  className="schedule-day-scroll"
                >
                  <View className="schedule-day-strip">
                    {weekdays.map((label, index) => {
                      const date = shift(week, index);
                      const count = weekMatches.filter(
                        (m) => bj(m.startAt).slice(0, 10) === date,
                      ).length;
                      return (
                        <Button
                          key={date}
                          className={`schedule-day${activeDay === date ? ' is-active' : ''}`}
                          ariaLabel={`${date}，${count}场，${activeDay === date ? '再次点击查看全周' : '查看当天'}`}
                          onClick={() =>
                            setSelectedDay(activeDay === date ? '' : date)
                          }
                        >
                          <Text className="schedule-day-weekday">{label}</Text>
                          <Text className="schedule-day-date">
                            {Number(date.slice(5, 7))}/
                            {Number(date.slice(8, 10))}
                          </Text>
                          <Text className="schedule-day-count">{count}场</Text>
                        </Button>
                      );
                    })}
                  </View>
                </ScrollView>
                {data.issues.length > 0 && (
                  <View className="schedule-conflicts" role="alert">
                    <Button
                      className="schedule-conflict-toggle"
                      ariaLabel={`存在${data.issues.length}项冲突，${issuesOpen ? '收起' : '展开'}详情`}
                      onClick={() => setIssuesOpen(!issuesOpen)}
                    >
                      <Image src={warningIcon} mode="aspectFit" aria-hidden />
                      <Text>
                        存在 {data.issues.length} 项冲突，处理后才能发布
                      </Text>
                      <Image
                        className={
                          issuesOpen
                            ? 'schedule-chevron-up'
                            : 'schedule-chevron-down'
                        }
                        src={chevronIcon}
                        mode="aspectFit"
                        aria-hidden
                      />
                    </Button>
                    {issuesOpen && (
                      <View className="schedule-conflict-list">
                        {data.issues.map((issue, index) => (
                          <Text key={index} className="schedule-conflict-item">
                            {issue.message}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                )}
                <View className="schedule-list-toolbar">
                  <View className="schedule-list-heading">
                    <Text className="schedule-list-date">
                      {activeDay ? shortDate(activeDay) : '本周赛程'}
                    </Text>
                    {activeDay && (
                      <Text className="schedule-list-weekday">
                        {weekdays.find(
                          (_, index) => shift(week, index) === activeDay,
                        )}
                      </Text>
                    )}
                    <Text className="schedule-list-count">
                      共 {shown.length} 场比赛
                    </Text>
                  </View>
                  <Picker
                    className="schedule-division-picker"
                    range={[
                      '全部组别',
                      ...divisions.map((division) => division.name),
                      '待归组（历史）',
                    ]}
                    value={
                      selectedDivision === 'ALL'
                        ? 0
                        : selectedDivision === 'LEGACY'
                          ? divisions.length + 1
                          : Math.max(
                              0,
                              divisions.findIndex(
                                (division) => division.id === selectedDivision,
                              ) + 1,
                            )
                    }
                    onChange={(e) => {
                      const index = Number(e.detail.value);
                      setSelectedDivision(
                        index === 0
                          ? 'ALL'
                          : index === divisions.length + 1
                            ? 'LEGACY'
                            : (divisions[index - 1]?.id ?? 'ALL'),
                      );
                    }}
                  >
                    <View className="schedule-division-value">
                      <Text>
                        {selectedDivision === 'ALL'
                          ? '全部组别'
                          : selectedDivision === 'LEGACY'
                            ? '待归组（历史）'
                            : divisionName(selectedDivision)}
                      </Text>
                      <Image
                        className="schedule-chevron-down"
                        src={chevronIcon}
                        mode="aspectFit"
                        aria-hidden
                      />
                    </View>
                  </Picker>
                </View>
                {scheduledMatches.map(renderMatch)}
                {!scheduledMatches.length && (
                  <View className="schedule-empty-day">
                    {activeDay ? '当天' : '本周'}
                    暂无已安排比赛，可切换日期查看。
                  </View>
                )}
                {pendingMatches.length > 0 && (
                  <View className="schedule-pending-section">
                    <Text className="schedule-pending-heading">
                      待安排 · {pendingMatches.length} 场
                    </Text>
                    {pendingMatches.map(renderMatch)}
                  </View>
                )}
              </>
            ) : (
              data && (
                <View className="schedule-empty-schedule">
                  <Image src={calendarIcon} mode="aspectFit" aria-hidden />
                  <Text className="schedule-empty-title">还没有赛程</Text>
                  <Text>
                    先录入参赛球队和竞赛组别，再填写编排条件生成赛程。
                  </Text>
                </View>
              )
            )}
            <View className="schedule-footer">
              <Button
                className="schedule-regenerate"
                disabled={ctx.busy || !data || frozen}
                onClick={openGenerate}
              >
                {data?.exists ? '重新生成' : '开始编排'}
              </Button>
              <Button
                className="schedule-publish"
                disabled={
                  ctx.busy ||
                  frozen ||
                  !data?.exists ||
                  Boolean(data?.issues.length) ||
                  data?.status === 'PUBLISHED'
                }
                onClick={() => void send('publish')}
              >
                {data?.status === 'PUBLISHED' ? '当前版本已发布' : '发布赛程'}
              </Button>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
