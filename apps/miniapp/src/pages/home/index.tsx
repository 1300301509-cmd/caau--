import { useEffect, useRef, useState } from 'react';
import { Button, Image, ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow } from '@tarojs/taro';
import { ApiError, type components } from '@caau/api-client';
import { withAgentEntry } from '../../features/agent/AgentEntry';
import { resolveEventId } from '../../features/materials/event-context';
import {
  clearSession,
  client,
  session,
} from '../../features/materials/session';
import logo from '../../assets/caau-logo.jpg';
import applicationIcon from '../../assets/home/application.svg';
import courtIcon from '../../assets/home/court.svg';
import bellIcon from '../../assets/home/bell.svg';
import profileIcon from '../../assets/home/profile.svg';
import locationIcon from '../../assets/home/location.svg';
import calendarIcon from '../../assets/home/calendar.svg';
import suppliesIcon from '../../assets/competition/supplies.svg';
import './index.css';

type S = components['schemas'];
type Event = S['CompetitionEventViewDto'];
type Material = S['HostingApplicationListItemDto'];
type ReadState = 'loading' | 'ready' | 'unavailable' | 'not-authorized';
const AUTO_REFRESH_MS = 15_000;
type EventProfile = {
  startDate?: string;
  endDate?: string;
  location?: {
    venueName?: string;
    administrativeArea?: { city?: string };
  };
};

function headerTop() {
  try {
    const status = Taro.getWindowInfo().statusBarHeight ?? 24;
    const menu = Taro.getMenuButtonBoundingClientRect();
    return Math.max(status + 54, menu.bottom + 16);
  } catch {
    return 78;
  }
}

function dateRange(profile?: EventProfile) {
  const { startDate, endDate } = profile ?? {};
  if (
    !startDate ||
    !endDate ||
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
  )
    return '赛事日期待完善';
  const end =
    startDate.slice(0, 4) === endDate.slice(0, 4)
      ? endDate.slice(5).replace('-', '.')
      : endDate.replaceAll('-', '.');
  return `${startDate.replaceAll('-', '.')} - ${end}`;
}

function Home() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState(session.eventId);
  const [eventExpanded, setEventExpanded] = useState(false);
  const [eventStatus, setEventStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [eventProfile, setEventProfile] = useState<EventProfile>();
  const [eventProfileState, setEventProfileState] =
    useState<ReadState>('loading');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialsState, setMaterialsState] = useState<ReadState>('loading');
  const [suppliesCount, setSuppliesCount] = useState(0);
  const [suppliesState, setSuppliesState] = useState<ReadState>('loading');
  const [syncWarning, setSyncWarning] = useState(false);
  const pageEpoch = useRef(0);
  const eventEpoch = useRef(0);
  const active = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>();
  const currentEvent =
    events.find((event) => event.id === selectedEventId) ?? events[0];
  const materialNeeds = materials.filter(
    (item) =>
      item.materialEventId === currentEvent?.id &&
      item.status === 'NEEDS_SUPPLEMENT',
  ).length;
  const pendingCount = materialNeeds + suppliesCount;
  const pendingLoading =
    materialsState === 'loading' ||
    (currentEvent && suppliesState === 'loading');
  const pendingFailed =
    materialsState === 'unavailable' ||
    (currentEvent && suppliesState === 'unavailable');

  function isStale(token: string, epoch: number) {
    return token !== session.token || epoch !== pageEpoch.current;
  }
  function handleUnauthorized(cause: unknown) {
    if (cause instanceof ApiError && cause.status === 401) {
      clearSession();
      void Taro.reLaunch({ url: '/pages/login/index' });
      return true;
    }
    return false;
  }
  async function loadEventSummary(
    eventId: string,
    token: string,
    epoch: number,
    quiet = false,
  ) {
    const request = ++eventEpoch.current;
    if (!quiet) {
      setEventProfile(undefined);
      setEventProfileState(eventId ? 'loading' : 'ready');
      setSuppliesCount(0);
      setSuppliesState(eventId ? 'loading' : 'ready');
    }
    if (!eventId) return;
    const [detail, supplies] = await Promise.allSettled([
      client.request('getEvent', { token, path: { id: eventId } }),
      client.request('listEventSupplies', { token, path: { eventId } }),
    ]);
    if (
      isStale(token, epoch) ||
      request !== eventEpoch.current ||
      session.eventId !== eventId
    )
      return;
    if (detail.status === 'fulfilled') {
      setEventProfile((detail.value.profile ?? {}) as EventProfile);
      setEventProfileState('ready');
    } else if (handleUnauthorized(detail.reason)) return;
    else {
      if (detail.reason instanceof ApiError && detail.reason.status === 403)
        setEventProfile(undefined);
      setEventProfileState('unavailable');
    }
    if (supplies.status === 'fulfilled') {
      setSuppliesCount(
        supplies.value.filter((item) => item.status !== 'READY').length,
      );
      setSuppliesState('ready');
    } else if (!handleUnauthorized(supplies.reason)) {
      if (supplies.reason instanceof ApiError && supplies.reason.status === 403)
        setSuppliesCount(0);
      setSuppliesState(
        supplies.reason instanceof ApiError && supplies.reason.status === 403
          ? 'not-authorized'
          : 'unavailable',
      );
    }
  }
  async function loadHome(quiet = false) {
    const token = session.token;
    if (!token || !active.current) return;
    clearTimeout(refreshTimer.current);
    const epoch = ++pageEpoch.current;
    ++eventEpoch.current;
    if (!quiet) {
      setEventStatus('loading');
      setEvents([]);
      setEventProfile(undefined);
      setEventProfileState('loading');
      setSuppliesCount(0);
      setSuppliesState('loading');
      setMaterials([]);
      setMaterialsState('loading');
      setEventExpanded(false);
    }
    try {
      const [eventResult, materialResult] = await Promise.allSettled([
        client.request('listCompetitionEvents', { token }),
        client.request('HostingController_listMaterials', { token }),
      ]);
      if (isStale(token, epoch) || !active.current) return;
      if (eventResult.status === 'fulfilled') {
        const eventRows = eventResult.value;
        const previousEventId = session.eventId;
        session.eventId = resolveEventId(eventRows, session.eventId);
        setSelectedEventId(session.eventId);
        setEvents(eventRows);
        setEventStatus('ready');
        setSyncWarning(false);
        void loadEventSummary(
          session.eventId,
          token,
          epoch,
          quiet && previousEventId === session.eventId,
        );
      } else if (!handleUnauthorized(eventResult.reason)) {
        if (
          quiet &&
          !(
            eventResult.reason instanceof ApiError &&
            eventResult.reason.status === 403
          )
        )
          setSyncWarning(true);
        else {
          setEvents([]);
          setEventStatus('error');
          setEventProfile(undefined);
          setEventProfileState('unavailable');
          setSuppliesCount(0);
          setSuppliesState('unavailable');
        }
      }
      if (isStale(token, epoch)) return;
      if (materialResult.status === 'fulfilled') {
        setMaterials(materialResult.value);
        setMaterialsState('ready');
      } else if (!handleUnauthorized(materialResult.reason)) {
        if (
          quiet &&
          !(
            materialResult.reason instanceof ApiError &&
            materialResult.reason.status === 403
          )
        )
          setSyncWarning(true);
        else {
          setMaterials([]);
          setMaterialsState(
            materialResult.reason instanceof ApiError &&
              materialResult.reason.status === 403
              ? 'not-authorized'
              : 'unavailable',
          );
        }
      }
    } finally {
      if (active.current && !isStale(token, epoch))
        refreshTimer.current = setTimeout(
          () => void loadHome(true),
          AUTO_REFRESH_MS,
        );
    }
  }

  useDidShow(() => {
    if (!session.token) {
      void Taro.reLaunch({ url: '/pages/login/index' });
      return;
    }
    active.current = true;
    void loadHome();
  });
  useDidHide(() => {
    active.current = false;
    clearTimeout(refreshTimer.current);
    ++pageEpoch.current;
    ++eventEpoch.current;
    setEventExpanded(false);
  });
  useEffect(
    () => () => {
      active.current = false;
      clearTimeout(refreshTimer.current);
      ++pageEpoch.current;
      ++eventEpoch.current;
    },
    [],
  );
  if (!session.token) return <View className="home-v2" />;

  return (
    <View className="home-v2">
      <View
        className="home-v2-header"
        style={{ paddingTop: `${headerTop()}px` }}
      >
        <View className="home-v2-brand" ariaLabel="CAAU 赛事协作平台">
          <View className="home-v2-brand-mark">
            <Image src={logo} mode="aspectFit" />
          </View>
          <Text className="home-v2-brand-word">CAAU</Text>
          <View className="home-v2-brand-divider" />
          <Text className="home-v2-brand-name">赛事协作平台</Text>
        </View>
        <View className="home-v2-header-actions">
          <Button
            className="home-v2-icon-button"
            ariaLabel={
              pendingCount
                ? `查看待处理事项，共 ${pendingCount} 项`
                : '查看待处理事项'
            }
            onClick={() =>
              void Taro.pageScrollTo({
                selector: '#home-v2-pending',
                duration: 0,
              })
            }
          >
            <Image src={bellIcon} mode="aspectFit" />
            {pendingCount > 0 && <View className="home-v2-notice-dot" />}
          </Button>
          <Button
            className="home-v2-profile-button"
            ariaLabel="进入我的账户"
            onClick={() => void Taro.switchTab({ url: '/pages/profile/index' })}
          >
            <Image src={profileIcon} mode="aspectFit" />
          </Button>
        </View>
      </View>

      <View className="home-v2-body">
        {syncWarning && (
          <Text className="home-v2-pending-empty">
            自动同步暂不可用，恢复连接后会再次核对。
          </Text>
        )}
        <View className="home-v2-event-card">
          <View className="home-v2-event-pattern" />
          <View className="home-v2-event-copy">
            <Text className="home-v2-event-label">当前赛事</Text>
            <Text className="home-v2-event-name">
              {eventStatus === 'loading'
                ? '正在读取赛事…'
                : eventStatus === 'error'
                  ? '赛事暂时无法读取'
                  : (currentEvent?.name ?? '暂无可办理赛事')}
            </Text>
            {currentEvent && eventStatus === 'ready' && (
              <View className="home-v2-event-meta">
                <View className="home-v2-meta-item">
                  <Image src={locationIcon} mode="aspectFit" />
                  <Text>
                    {eventProfileState === 'loading'
                      ? '正在读取场地…'
                      : eventProfileState === 'unavailable'
                        ? '场地信息暂不可用'
                        : eventProfile?.location?.venueName ||
                          eventProfile?.location?.administrativeArea?.city ||
                          '场地待完善'}
                  </Text>
                </View>
                <View className="home-v2-meta-item">
                  <Image src={calendarIcon} mode="aspectFit" />
                  <Text>
                    {eventProfileState === 'loading'
                      ? '正在读取日期…'
                      : eventProfileState === 'unavailable'
                        ? '日期信息暂不可用'
                        : dateRange(eventProfile)}
                  </Text>
                </View>
              </View>
            )}
          </View>
          <Button
            className="home-v2-event-switch"
            disabled={
              eventStatus === 'loading' ||
              (eventStatus === 'ready' && events.length === 0)
            }
            ariaLabel={eventStatus === 'error' ? '重新读取赛事' : '切换赛事'}
            onClick={() => {
              if (eventStatus === 'error') void loadHome();
              else setEventExpanded(true);
            }}
          >
            <Text>{eventStatus === 'error' ? '重试' : '切换赛事'}</Text>
            <View className="home-v2-down-chevron" />
          </Button>
        </View>

        <View className="home-v2-section-heading">
          <Text>主要工作</Text>
          <View className="home-v2-heading-rule gold" />
        </View>
        <View className="home-v2-main-cards">
          <Button
            className="home-v2-main-card hosting"
            ariaLabel="我要办赛，申请、材料与办赛进度"
            onClick={() =>
              void Taro.navigateTo({ url: '/pages/hosting-hub/index' })
            }
          >
            <View className="home-v2-main-icon">
              <Image src={applicationIcon} mode="aspectFit" />
            </View>
            <View className="home-v2-main-copy">
              <Text className="home-v2-main-title">我要办赛</Text>
              <Text className="home-v2-main-note">申请、材料与办赛进度</Text>
            </View>
            <View className="home-v2-right-chevron" />
          </Button>
          <Button
            className="home-v2-main-card competition"
            disabled={eventStatus !== 'ready' || !currentEvent}
            ariaLabel="我的比赛，球队、赛程与现场执行"
            onClick={() =>
              currentEvent &&
              void Taro.navigateTo({
                url: `/pages/competition-hub/index?event=${encodeURIComponent(currentEvent.id)}`,
              })
            }
          >
            <View className="home-v2-main-icon">
              <Image src={courtIcon} mode="aspectFit" />
            </View>
            <View className="home-v2-main-copy">
              <Text className="home-v2-main-title">我的比赛</Text>
              <Text className="home-v2-main-note">球队、赛程与现场执行</Text>
            </View>
            <View className="home-v2-right-chevron" />
          </Button>
        </View>

        <View id="home-v2-pending" className="home-v2-section-heading pending">
          <Text>待处理</Text>
          <View className="home-v2-heading-rule sage" />
        </View>
        <View className="home-v2-pending-card">
          {materialNeeds > 0 && (
            <Button
              className="home-v2-pending-row"
              ariaLabel={`${materialNeeds} 项办赛材料待补充，前往材料提交`}
              onClick={() =>
                void Taro.navigateTo({ url: '/pages/event-materials/index' })
              }
            >
              <Image src={applicationIcon} mode="aspectFit" />
              <View className="home-v2-pending-copy">
                <Text className="home-v2-pending-title">
                  {materialNeeds > 1
                    ? `${materialNeeds} 项办赛材料待补充`
                    : '办赛材料待补充'}
                </Text>
                <Text className="home-v2-pending-note">请补充审核所需材料</Text>
              </View>
              <Text className="home-v2-pending-tag">待处理</Text>
              <View className="home-v2-right-chevron" />
            </Button>
          )}
          {suppliesCount > 0 && currentEvent && (
            <Button
              className="home-v2-pending-row"
              ariaLabel={`${suppliesCount} 项物料尚未就绪，前往物料管理`}
              onClick={() =>
                void Taro.navigateTo({
                  url: `/pages/competition-supplies/index?event=${encodeURIComponent(currentEvent.id)}`,
                })
              }
            >
              <Image src={suppliesIcon} mode="aspectFit" />
              <View className="home-v2-pending-copy">
                <Text className="home-v2-pending-title">
                  {suppliesCount} 项物料尚未就绪
                </Text>
                <Text className="home-v2-pending-note">请确认物料准备情况</Text>
              </View>
              <Text className="home-v2-pending-action">去处理</Text>
              <View className="home-v2-right-chevron" />
            </Button>
          )}
          {pendingLoading && pendingCount === 0 && (
            <Text className="home-v2-pending-empty">正在核对待处理事项…</Text>
          )}
          {!pendingLoading && pendingCount === 0 && !pendingFailed && (
            <Text className="home-v2-pending-empty">
              当前权限范围内暂无待处理事项
            </Text>
          )}
          {pendingFailed && (
            <Button
              className="home-v2-pending-retry"
              onClick={() => void loadHome()}
            >
              部分待办暂时无法读取，点击重试
            </Button>
          )}
        </View>
      </View>

      {eventExpanded && (
        <View
          className="event-modal-backdrop"
          onClick={() => setEventExpanded(false)}
          onTouchMove={(event) => event.stopPropagation()}
        >
          <View
            className="event-modal"
            ariaRole="dialog"
            ariaLabel="选择赛事"
            onClick={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
          >
            <View className="event-modal-heading">
              <Text className="event-modal-title">选择赛事</Text>
              <Button
                className="event-modal-close"
                ariaLabel="关闭赛事选择"
                onClick={() => setEventExpanded(false)}
              >
                关闭
              </Button>
            </View>
            <ScrollView className="event-modal-list" scrollY>
              {events.map((event) => {
                const isCurrent = event.id === currentEvent?.id;
                return (
                  <Button
                    key={event.id}
                    className={`event-context-option ${isCurrent ? 'selected' : ''}`}
                    ariaLabel={`${event.name}${isCurrent ? '，当前赛事' : ''}`}
                    onClick={() => {
                      session.eventId = event.id;
                      setSelectedEventId(event.id);
                      setEventExpanded(false);
                      void loadEventSummary(
                        event.id,
                        session.token,
                        pageEpoch.current,
                      );
                    }}
                  >
                    <Text className="event-option-name">{event.name}</Text>
                    {isCurrent && (
                      <Text className="event-option-current">当前</Text>
                    )}
                  </Button>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

export default withAgentEntry(Home);
