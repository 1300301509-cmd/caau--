import { useState } from 'react';
import { Button, Image, Picker, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { client, session } from '../materials/session';
import { useCompetition } from './shared';
import { bj, upcomingMatches, type S } from './model';
import teamsIcon from '../../assets/competition/teams.svg';
import scheduleIcon from '../../assets/competition/schedule.svg';
import suppliesIcon from '../../assets/competition/supplies.svg';
import situationIcon from '../../assets/competition/situation.svg';
import staffIcon from '../../assets/competition/staff.svg';
import './workspace.css';

const entries = [
  {
    page: 'competition-teams',
    title: '球队管理',
    note: '参赛球队与档案',
    icon: teamsIcon,
  },
  {
    page: 'competition-schedule',
    title: '赛程编排',
    note: '编排、调整与发布',
    icon: scheduleIcon,
  },
  {
    page: 'competition-supplies',
    title: '物料管理',
    note: '清单与准备进度',
    icon: suppliesIcon,
  },
  {
    page: 'competition-situation',
    title: '赛事情况',
    note: '场次与参赛名单',
    icon: situationIcon,
  },
  {
    page: 'staff',
    title: '人员管理',
    note: '工作人员与单场安排',
    icon: staffIcon,
  },
];
type Overview = {
  events: S['CompetitionEventViewDto'][];
  schedule: S['ScheduleViewDto'];
  teams: number;
  staff: number;
  supplies: S['EventSupplyItemViewDto'][];
};

export default function CompetitionHub() {
  const [data, setData] = useState<Overview>();
  const ctx = useCompetition(() => setData(undefined));
  const { eventId } = ctx;
  const event = data?.events.find((e) => e.id === eventId);
  function load() {
    return ctx.run(async (token, valid) => {
      setData(undefined);
      const events = await client.request('listCompetitionEvents', { token });
      if (!valid()) return;
      const resolvedEventId =
        events.find((item) => item.id === eventId)?.id ?? events[0]?.id ?? '';
      if (!resolvedEventId) {
        session.eventId = '';
        setData(undefined);
        ctx.setError('当前账号暂无可管理的赛事，请先完成赛事获批与承办指派。');
        return;
      }
      if (resolvedEventId !== eventId) {
        session.eventId = resolvedEventId;
        void Taro.redirectTo({
          url: `/pages/competition-hub/index?event=${encodeURIComponent(resolvedEventId)}`,
        });
        return;
      }
      const [schedule, teams, staff, supplies] = await Promise.all([
        client.request('getEventSchedule', { token, path: { eventId } }),
        client.request('listEventTeams', { token, path: { eventId } }),
        client.request('listEventStaff', { token, path: { eventId } }),
        client.request('listEventSupplies', { token, path: { eventId } }),
      ]);
      if (valid())
        setData({
          events,
          schedule,
          teams: teams.filter((t) => t.active).length,
          staff: staff.filter((s) => s.active).length,
          supplies,
        });
    });
  }
  useDidShow(() => {
    if (session.token) void load();
  });
  const go = (page: string) =>
    void Taro.navigateTo({
      url: `/pages/${page}/index?event=${encodeURIComponent(eventId)}`,
    });
  const next = upcomingMatches(data?.schedule.matches ?? [], Date.now());
  const unready =
    data?.supplies.filter((s) => s.status !== 'READY').length ?? 0;
  return (
    <View className="match-workspace">
      <View className="workspace-heading">
        <Text className="workspace-title">我的比赛</Text>
        <Button
          className="workspace-refresh"
          disabled={ctx.busy}
          onClick={() => void load()}
        >
          {ctx.busy ? '更新中' : '刷新'}
        </Button>
      </View>
      <View className="event-banner">
        <Text className="event-banner-label">当前赛事</Text>
        <Text className="event-banner-name">
          {event?.name ?? (ctx.busy ? '正在读取赛事…' : '赛事暂不可用')}
        </Text>
        <View className="event-banner-bottom">
          <Text>
            {data
              ? data.schedule.status === 'PUBLISHED'
                ? '赛程已发布'
                : data.schedule.exists
                  ? '赛程待发布'
                  : '尚未编排赛程'
              : '读取后可查看比赛进展'}
          </Text>
          {data && (
            <Picker
              range={data.events.map((e) => e.name)}
              value={data.events.findIndex((e) => e.id === eventId)}
              onChange={(e) => {
                const id = data.events[Number(e.detail.value)]?.id;
                if (id && id !== eventId) {
                  session.eventId = id;
                  void Taro.redirectTo({
                    url: `/pages/competition-hub/index?event=${encodeURIComponent(id)}`,
                  });
                }
              }}
            >
              <View className="event-switch" ariaLabel="切换赛事">
                切换赛事
              </View>
            </Picker>
          )}
        </View>
      </View>
      {ctx.error && (
        <View className="workspace-error" role="alert">
          <Text>{ctx.error}</Text>
          <Button onClick={() => void load()}>重新加载</Button>
          <Button
            onClick={() => void Taro.switchTab({ url: '/pages/home/index' })}
          >
            返回首页选择赛事
          </Button>
        </View>
      )}
      {!eventId && (
        <Button
          onClick={() => void Taro.switchTab({ url: '/pages/home/index' })}
        >
          返回首页选择赛事
        </Button>
      )}
      <View className="workspace-metrics">
        {[
          ['参赛球队', data?.teams, 'competition-teams'],
          ['比赛场次', data?.schedule.matches.length, 'competition-schedule'],
          ['工作人员', data?.staff, 'staff'],
        ].map(([label, count, page]) => (
          <Button
            key={String(label)}
            disabled={!data}
            onClick={() => go(String(page))}
          >
            <Text className="metric-value">{count ?? '—'}</Text>
            <Text className="metric-label">{label}</Text>
          </Button>
        ))}
      </View>
      <Text className="workspace-section-title">比赛管理</Text>
      <View className="workspace-modules">
        {entries.map((item) => (
          <Button
            key={item.page}
            className="workspace-module"
            disabled={!data}
            onClick={() => go(item.page)}
          >
            <View className="module-icon">
              <Image src={item.icon} mode="aspectFit" />
            </View>
            <Text className="module-title">{item.title}</Text>
            <Text className="module-note">{item.note}</Text>
          </Button>
        ))}
      </View>
      {data && (
        <>
          {(data.schedule.issues.length > 0 || unready > 0) && (
            <View className="workspace-attention">
              <Text className="workspace-section-title">需要关注</Text>
              {data.schedule.issues.length > 0 && (
                <Button onClick={() => go('competition-schedule')}>
                  <Text>赛程有 {data.schedule.issues.length} 项冲突</Text>
                  <Text className="attention-link">去处理</Text>
                </Button>
              )}
              {unready > 0 && (
                <Button onClick={() => go('competition-supplies')}>
                  <Text>{unready} 项物料尚未就绪</Text>
                  <Text className="attention-link">查看清单</Text>
                </Button>
              )}
            </View>
          )}
          <View className="workspace-section-heading">
            <Text className="workspace-section-title">近期赛程</Text>
            <Button onClick={() => go('competition-schedule')}>查看全部</Button>
          </View>
          {data.schedule.status !== 'PUBLISHED' && data.schedule.exists && (
            <Text className="workspace-caption">
              以下为候选赛程，发布后用于正式执行。
            </Text>
          )}
          {next.length ? (
            <View className="upcoming-list">
              {next.map((m) => (
                <Button
                  className="upcoming-match"
                  key={m.id}
                  onClick={() =>
                    void Taro.navigateTo({
                      url: `/pages/competition-situation/index?event=${encodeURIComponent(eventId)}&match=${encodeURIComponent(m.id)}`,
                    })
                  }
                >
                  <View className="match-clock">
                    <Text>{bj(m.startAt).slice(11)}</Text>
                    <Text className="match-date">
                      {bj(m.startAt).slice(5, 10).replace('-', '/')}
                    </Text>
                  </View>
                  <View className="match-versus">
                    <Text>{m.homeLabel}</Text>
                    <Text>{m.awayLabel}</Text>
                    <Text className="match-place">
                      第 {m.round} 轮 · {m.venue || '场地待安排'}
                    </Text>
                  </View>
                  <Text className="match-vs">VS</Text>
                </Button>
              ))}
            </View>
          ) : (
            <View className="workspace-empty">
              <Text>
                {data.schedule.exists ? '暂无即将开始的比赛' : '还没有编排赛程'}
              </Text>
              <Text className="workspace-caption">
                {data.schedule.exists
                  ? '可在赛程编排中查看全部场次与待安排比赛。'
                  : '先录入参赛球队，再设置时间和场地。'}
              </Text>
              <Button
                onClick={() =>
                  go(
                    data.teams < 2
                      ? 'competition-teams'
                      : 'competition-schedule',
                  )
                }
              >
                {data.teams < 2 ? '管理参赛球队' : '查看赛程编排'}
              </Button>
            </View>
          )}
        </>
      )}
    </View>
  );
}
