import { useRef, useState } from 'react';
import { Button, Picker, Text, View } from '@tarojs/components';
import { client, newKey } from '../materials/session';
import {
  Action,
  Field,
  Shell,
  confirm,
  saved,
  useCompetition,
  useVisibleAutoRefresh,
} from './shared';
import { bj, inWeek, monday, shift, scheduleDay, type S } from './model';
type Schedule = S['ScheduleViewDto'];
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
export default function SchedulePage() {
  const [data, setData] = useState<Schedule>(),
    [teams, setTeams] = useState<S['TeamViewDto'][]>([]);
  const [week, setWeek] = useState(monday(bj(Date.now()).slice(0, 10)));
  const [selectedDay, setSelectedDay] = useState('');
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
      const [s, t] = await Promise.all([
        client.request('getEventSchedule', {
          token,
          path: { eventId: ctx.eventId },
        }),
        client.request('listEventTeams', {
          token,
          path: { eventId: ctx.eventId },
        }),
      ]);
      if (valid()) {
        setData(s);
        setTeams(t);
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
  const weekMatches =
    data?.matches.filter((m) => inWeek(m.startAt, week)) ?? [];
  const activeDay =
    selectedDay >= week && selectedDay <= shift(week, 6) ? selectedDay : '';
  const shown = weekMatches.filter(
    (m) => !activeDay || bj(m.startAt).slice(0, 10) === activeDay,
  );
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
    <Shell
      title="赛程编排"
      ctx={ctx}
      retry={!generate && !adjust && !frozen ? () => void load() : undefined}
    >
      <Text className="competition-note">
        比赛时间均为北京时间；处理全部冲突后可发布赛程。
      </Text>
      {frozen && (
        <View className="card">
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
        <View className="card">
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
          <Text className="competition-line">参赛球队（至少两支）</Text>
          {teams
            .filter((t) => t.active)
            .map((t) => (
              <Button
                key={t.id}
                disabled={ctx.busy || frozen}
                className={
                  generate.config.teamIds.includes(t.id) ? 'selected' : ''
                }
                onClick={() =>
                  setGenerate({
                    ...generate,
                    config: {
                      ...generate.config,
                      teamIds: generate.config.teamIds.includes(t.id)
                        ? generate.config.teamIds.filter((id) => id !== t.id)
                        : [...generate.config.teamIds, t.id],
                    },
                  })
                }
              >
                {generate.config.teamIds.includes(t.id) ? '已选 · ' : ''}
                {t.profile.name}
              </Button>
            ))}
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
        <View className="card">
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
        <View>
          <View className="competition-row">
            <Action
              disabled={ctx.busy || !data || frozen}
              onClick={() => {
                const cfg = data?.exists ? data.config : config();
                setGenerate({
                  format: data?.format ?? 'ROUND_ROBIN',
                  config: {
                    ...cfg,
                    teamIds: [...cfg.teamIds],
                    venues: [...cfg.venues],
                  },
                  venues: cfg.venues.join('，'),
                });
              }}
            >
              编排条件
            </Action>
          </View>
          {data?.exists ? (
            <View>
              <Text className="subtitle">
                {data.status === 'PUBLISHED' ? '已发布' : '草稿'} · V
                {data.revision} · {data.matches.length} 场
              </Text>
              {data.issues.length > 0 && (
                <View className="competition-error">
                  <Text>存在 {data.issues.length} 项冲突，处理后才能发布</Text>
                  {data.issues.map((i, n) => (
                    <Text className="competition-line" key={n}>
                      {i.message}
                    </Text>
                  ))}
                </View>
              )}
              <View className="competition-row">
                <Action onClick={() => setWeek(shift(week, -7))}>上一周</Action>
                <Action
                  onClick={() => setWeek(monday(bj(Date.now()).slice(0, 10)))}
                >
                  本周
                </Action>
                <Action onClick={() => setWeek(shift(week, 7))}>下一周</Action>
              </View>
              <Picker
                mode="date"
                value={week}
                onChange={(e) => setWeek(monday(e.detail.value))}
              >
                <Text>
                  {week} 至 {shift(week, 6)}
                </Text>
              </Picker>
              <View className="competition-day-strip">
                {['一', '二', '三', '四', '五', '六', '日'].map(
                  (label, index) => {
                    const date = shift(week, index);
                    const count = weekMatches.filter(
                      (m) => bj(m.startAt).slice(0, 10) === date,
                    ).length;
                    return (
                      <Button
                        key={date}
                        className={activeDay === date ? 'selected' : ''}
                        ariaLabel={`${date}，${count}场，${activeDay === date ? '再次点击查看全周' : '查看当天'}`}
                        onClick={() =>
                          setSelectedDay(activeDay === date ? '' : date)
                        }
                      >
                        <Text>{label}</Text>
                        <Text className="competition-day-number">
                          {date.slice(8)}
                        </Text>
                        <Text className="competition-day-count">{count}场</Text>
                      </Button>
                    );
                  },
                )}
              </View>
              <Text className="competition-note">
                {activeDay
                  ? `${activeDay} · 点击已选日期返回全周`
                  : '全周赛程 · 点击日期查看当天'}
              </Text>
              {scheduleDay(data.matches, week, activeDay).map((m) => (
                <View className="card match-schedule-card" key={m.id}>
                  <Text className="competition-note">
                    {m.startAt ? bj(m.startAt).replace('T', ' ') : '待安排'} ·
                    第 {m.round} 轮
                  </Text>
                  <View className="competition-match-teams">
                    <Text>{m.homeLabel}</Text>
                    <Text className="competition-versus">VS</Text>
                    <Text>{m.awayLabel}</Text>
                  </View>
                  <Text className="competition-line">
                    {m.venue || '场地待安排'}
                  </Text>
                  <Action
                    disabled={ctx.busy || frozen}
                    onClick={() => {
                      const date = m.startAt ? bj(m.startAt) : `${week}T09:00`;
                      setAdjust({
                        id: m.id,
                        revision: data.revision,
                        date: date.slice(0, 10),
                        time: date.slice(11, 16),
                        venue: m.venue,
                      });
                    }}
                  >
                    调整比赛
                  </Action>
                </View>
              ))}
              {!shown.length && (
                <Text className="competition-note">
                  {activeDay ? '当天' : '本周'}
                  暂无已安排比赛；待安排场次仍显示在上方。
                </Text>
              )}
              <Action
                primary
                disabled={
                  ctx.busy ||
                  frozen ||
                  data.issues.length > 0 ||
                  data.status === 'PUBLISHED'
                }
                onClick={() => void send('publish')}
              >
                {data.status === 'PUBLISHED' ? '当前版本已发布' : '发布赛程'}
              </Action>
            </View>
          ) : (
            data && (
              <View className="competition-empty">
                暂无赛程，请先录入球队并填写编排条件。
              </View>
            )
          )}
        </View>
      )}
    </Shell>
  );
}
