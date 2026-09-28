import { useState } from 'react';
import { Button, Image, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { client, session } from '../materials/session';
import { useCompetition, useVisibleAutoRefresh } from './shared';
import { bj, upcomingMatches, type S } from './model';
import logo from '../../assets/caau-logo.jpg';
import teamsIcon from '../../assets/competition/teams.svg';
import scheduleIcon from '../../assets/competition/schedule.svg';
import suppliesIcon from '../../assets/competition/supplies.svg';
import situationIcon from '../../assets/competition/situation.svg';
import staffIcon from '../../assets/competition/staff.svg';
import settingsIcon from '../../assets/competition/settings.svg';
import clockIcon from '../../assets/competition/clock.svg';
import './workspace.css';

const entries = [
  {
    page: 'competition-teams',
    title: '球队管理',
    note: '管理参赛球队',
    icon: teamsIcon,
  },
  {
    page: 'competition-schedule',
    title: '赛程编排',
    note: '安排比赛日程',
    icon: scheduleIcon,
  },
  {
    page: 'competition-supplies',
    title: '物料管理',
    note: '准备赛事物料',
    icon: suppliesIcon,
  },
  {
    page: 'competition-situation',
    title: '赛事情况',
    note: '查看赛事信息',
    icon: situationIcon,
  },
  {
    page: 'staff',
    title: '人员管理',
    note: '安排工作人员',
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

const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function weekday(date: string) {
  return weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

function headerTop() {
  try {
    const status = Taro.getWindowInfo().statusBarHeight ?? 24;
    const menu = Taro.getMenuButtonBoundingClientRect();
    return Math.max(status + 54, menu.bottom + 16);
  } catch {
    return 78;
  }
}

export default function CompetitionHub() {
  const [data, setData] = useState<Overview>();
  const [switchOpen, setSwitchOpen] = useState(false);
  const ctx = useCompetition(() => {
    setData(undefined);
    setSwitchOpen(false);
  });
  const { eventId } = ctx;
  const event = data?.events.find((e) => e.id === eventId);
  function load() {
    return (data ? ctx.read : ctx.run)(async (token, valid) => {
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
        setSwitchOpen(false);
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
      if (valid()) {
        setData({
          events,
          schedule,
          teams: teams.filter((t) => t.active).length,
          staff: staff.filter((s) => s.active).length,
          supplies,
        });
        ctx.setError('');
      }
    });
  }
  useVisibleAutoRefresh(load, !!session.token);
  const go = (page: string) =>
    void Taro.navigateTo({
      url: `/pages/${page}/index?event=${encodeURIComponent(eventId)}`,
    });
  const next = upcomingMatches(data?.schedule.matches ?? [], Date.now());
  const unready =
    data?.supplies.filter((s) => s.status !== 'READY').length ?? 0;
  const issues = data?.schedule.issues.length ?? 0;
  const metrics = [
    {
      label: '参赛球队',
      count: data?.teams,
      page: 'competition-teams',
      icon: teamsIcon,
    },
    {
      label: '比赛场次',
      count: data?.schedule.matches.length,
      page: 'competition-schedule',
      icon: scheduleIcon,
    },
    { label: '工作人员', count: data?.staff, page: 'staff', icon: staffIcon },
  ];
  return (
    <View className="match-workspace">
      <View
        className="workspace-top"
        style={{ paddingTop: `${headerTop()}px` }}
      >
        <Button
          className="workspace-brand"
          ariaLabel="返回首页"
          onClick={() => void Taro.switchTab({ url: '/pages/home/index' })}
        >
          <View className="workspace-brand-mark">
            <Image src={logo} mode="aspectFit" />
          </View>
          <View className="workspace-brand-copy">
            <Text className="workspace-brand-name">CAAU</Text>
            <Text className="workspace-brand-note">赛事协作平台</Text>
          </View>
        </Button>
        <Button
          className="workspace-settings"
          disabled={!data}
          ariaLabel="查看当前赛事基本信息"
          onClick={() =>
            void Taro.navigateTo({
              url: `/pages/event-info/index?id=${encodeURIComponent(eventId)}&from=competition`,
            })
          }
        >
          <Image src={settingsIcon} mode="aspectFit" />
        </Button>
      </View>
      <View className="workspace-content">
        <View className="event-banner">
          <View className="event-banner-pattern" />
          <View className="event-banner-head">
            <Text className="event-banner-label">当前赛事</Text>
            {data && (
              <Button
                className="event-switch"
                ariaLabel={switchOpen ? '收起赛事列表' : '切换赛事'}
                onClick={() => setSwitchOpen((open) => !open)}
              >
                <View className="event-switch-pill">
                  <Text>切换赛事</Text>
                  <View className="workspace-chevron light" />
                </View>
              </Button>
            )}
          </View>
          <Text className="event-banner-name">
            {event?.name ?? (ctx.busy ? '正在读取赛事…' : '赛事暂不可用')}
          </Text>
          <View className="event-banner-status">
            <Image src={clockIcon} mode="aspectFit" />
            <Text>
              {data
                ? data.schedule.status === 'PUBLISHED'
                  ? '赛程已发布'
                  : data.schedule.exists
                    ? '赛程待发布'
                    : '尚未编排赛程'
                : '读取后可查看比赛进展'}
            </Text>
          </View>
        </View>
        {switchOpen && data && (
          <View className="event-options">
            <Text className="event-options-title">选择可管理的赛事</Text>
            {data.events.map((item) => (
              <Button
                key={item.id}
                className="event-option"
                ariaLabel={`${item.name}${item.id === eventId ? '，当前赛事' : '，切换到此赛事'}`}
                onClick={() => {
                  setSwitchOpen(false);
                  if (item.id !== eventId) {
                    session.eventId = item.id;
                    void Taro.redirectTo({
                      url: `/pages/competition-hub/index?event=${encodeURIComponent(item.id)}`,
                    });
                  }
                }}
              >
                <Text>{item.name}</Text>
                <Text className="event-option-state">
                  {item.id === eventId ? '当前' : '选择'}
                </Text>
              </Button>
            ))}
          </View>
        )}
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
            className="workspace-back-home"
            onClick={() => void Taro.switchTab({ url: '/pages/home/index' })}
          >
            返回首页选择赛事
          </Button>
        )}
        <View className="workspace-metrics">
          {metrics.map((metric) => (
            <Button
              key={metric.label}
              disabled={!data}
              ariaLabel={`${metric.label} ${metric.count ?? '未读取'}，查看详情`}
              onClick={() => go(metric.page)}
            >
              <Text className="metric-label">{metric.label}</Text>
              <View className="metric-bottom">
                <Text className="metric-value">{metric.count ?? '—'}</Text>
                <Image src={metric.icon} mode="aspectFit" />
              </View>
            </Button>
          ))}
        </View>

        <View className="workspace-section-heading">
          <Text className="workspace-section-title">比赛管理</Text>
        </View>
        <View className="workspace-modules">
          {entries.map((item) => (
            <Button
              key={item.page}
              className="workspace-module"
              disabled={!data}
              ariaLabel={`${item.title}，${item.note}`}
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
            <View className="workspace-section-heading">
              <Text className="workspace-section-title">需要关注</Text>
            </View>
            <View className="workspace-attention">
              {issues > 0 && (
                <Button
                  ariaLabel={`赛程存在 ${issues} 项冲突，前往赛程编排`}
                  onClick={() => go('competition-schedule')}
                >
                  <View className="attention-icon warning">!</View>
                  <Text className="attention-title">
                    赛程存在 {issues} 项冲突
                  </Text>
                  <Text className="attention-action warning">去处理</Text>
                  <View className="workspace-chevron" />
                </Button>
              )}
              {unready > 0 && (
                <Button
                  ariaLabel={`${unready} 项物料尚未就绪，前往物料管理`}
                  onClick={() => go('competition-supplies')}
                >
                  <View className="attention-icon supplies">
                    <Image src={suppliesIcon} mode="aspectFit" />
                  </View>
                  <Text className="attention-title">
                    {unready} 项物料尚未就绪
                  </Text>
                  <Text className="attention-action">查看清单</Text>
                  <View className="workspace-chevron" />
                </Button>
              )}
              {issues === 0 && unready === 0 && (
                <Text className="workspace-attention-empty">
                  当前没有需要处理的赛程冲突或物料事项
                </Text>
              )}
            </View>

            <View className="workspace-section-heading upcoming">
              <Text className="workspace-section-title">近期赛程</Text>
              <Button onClick={() => go('competition-schedule')}>
                查看全部 <View className="workspace-chevron" />
              </Button>
            </View>
            {data.schedule.status !== 'PUBLISHED' && data.schedule.exists && (
              <Text className="workspace-caption">
                以下为未发布赛程，发布后用于正式执行。
              </Text>
            )}
            {next.length ? (
              <View className="upcoming-list">
                {next.map((m) => {
                  const local = bj(m.startAt);
                  const date = local.slice(0, 10);
                  return (
                    <Button
                      className="upcoming-match"
                      key={m.id}
                      ariaLabel={`${date} ${local.slice(11)}，${m.homeLabel} 对 ${m.awayLabel}，${m.divisionLabel || '组别未标注'}，第 ${m.round} 轮，${m.venue || '场地待安排'}`}
                      onClick={() =>
                        void Taro.navigateTo({
                          url: `/pages/competition-situation/index?event=${encodeURIComponent(eventId)}&match=${encodeURIComponent(m.id)}`,
                        })
                      }
                    >
                      <View className="match-when">
                        <Text className="match-time">{local.slice(11)}</Text>
                        <Text className="match-date">{date}</Text>
                        <Text className="match-weekday">{weekday(date)}</Text>
                      </View>
                      <View className="match-teams">
                        <Text className="match-team-name">{m.homeLabel}</Text>
                        <Text className="match-vs">VS</Text>
                        <Text className="match-team-name">{m.awayLabel}</Text>
                      </View>
                      <View className="match-details">
                        <Text>{m.divisionLabel || '组别未标注'}</Text>
                        <Text>第 {m.round} 轮</Text>
                        <Text>{m.venue || '场地待安排'}</Text>
                      </View>
                    </Button>
                  );
                })}
              </View>
            ) : (
              <View className="workspace-empty">
                <Text>
                  {data.schedule.exists
                    ? '暂无即将开始的比赛'
                    : '还没有编排赛程'}
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
    </View>
  );
}
