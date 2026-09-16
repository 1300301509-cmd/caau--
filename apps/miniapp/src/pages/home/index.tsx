import { useState } from 'react';
import { Button, Image, Picker, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { ApiError, type components } from '@caau/api-client';
import {
  eventScopedPageUrl,
  resolveEventId,
} from '../../features/materials/event-context';
import {
  clearSession,
  client,
  session,
} from '../../features/materials/session';
import banner from '../../assets/event-banner-placeholder.png';
import approvalIcon from '../../assets/material-approval.png';

type S = components['schemas'];
const materialApproval = 'material-approval';

export default function Home() {
  const [identity, setIdentity] = useState(session.identity?.displayName ?? '');
  const [selected, setSelected] = useState(materialApproval);
  const [events, setEvents] = useState<S['EventViewDto'][]>([]);
  const [tasks, setTasks] = useState<S['TaskViewDto'][]>([]);
  const [selectedEventId, setSelectedEventId] = useState(session.eventId);
  const [eventStatus, setEventStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [eventError, setEventError] = useState('');
  const currentEvent =
    events.find((event) => event.id === selectedEventId) ?? events[0];
  const currentIndex = Math.max(
    0,
    events.findIndex((event) => event.id === currentEvent?.id),
  );
  const currentTaskCount = tasks.filter(
    (task) => task.state === 'PUBLISHED' && task.eventId === currentEvent?.id,
  ).length;

  async function loadEventContext() {
    const token = session.token;
    if (!token) return;
    setEventStatus('loading');
    setEventError('');
    try {
      const [eventRows, taskRows] = await Promise.all([
        client.request('listEvents', { token }),
        client.request('listMaterialTasks', { token }),
      ]);
      if (token !== session.token) return;
      session.eventId = resolveEventId(eventRows, session.eventId);
      setSelectedEventId(session.eventId);
      setEvents(eventRows);
      setTasks(taskRows);
      setEventStatus('ready');
    } catch (cause) {
      if (token !== session.token) return;
      if (cause instanceof ApiError && cause.status === 401) {
        clearSession();
        void Taro.redirectTo({ url: '/pages/profile/index' });
        return;
      }
      setEvents([]);
      setTasks([]);
      setEventStatus('error');
      setEventError('赛事读取失败，请检查网络后重试');
    }
  }

  useDidShow(() => {
    if (!session.token) {
      void Taro.redirectTo({ url: '/pages/profile/index' });
      return;
    }
    setIdentity(session.identity?.displayName ?? '');
    void loadEventContext();
  });
  if (!session.token) return <View className="page" />;

  const openModule = (page: 'materials' | 'progress') => {
    if (!currentEvent) return;
    session.eventId = currentEvent.id;
    void Taro.navigateTo({
      url: eventScopedPageUrl(page, currentEvent.id),
    });
  };

  return (
    <View className="page home-page">
      <View className="home-hero">
        <Image
          className="home-banner"
          src={banner}
          mode="aspectFill"
          ariaLabel="可替换的赛事主题占位横幅"
        />
        <View className="event-context-bar">
          <View className="event-context-copy">
            <Text className="event-context-label">当前赛事</Text>
            <Text className="event-context-name">
              {eventStatus === 'loading'
                ? '正在读取…'
                : (currentEvent?.name ?? '暂无可办理赛事')}
            </Text>
            {currentEvent && (
              <Text className="event-context-meta">
                {currentTaskCount} 个材料任务
              </Text>
            )}
            {eventStatus === 'error' && (
              <Text className="event-context-error">{eventError}</Text>
            )}
          </View>
          {events.length > 0 ? (
            <Picker
              mode="selector"
              range={events.map((event) => event.name)}
              value={currentIndex}
              onChange={(event) => {
                const next = events[Number(event.detail.value)];
                if (!next) return;
                session.eventId = next.id;
                setSelectedEventId(next.id);
              }}
            >
              <View
                className="event-context-switch"
                ariaRole="button"
                ariaLabel={`切换赛事，当前为${currentEvent?.name ?? ''}`}
              >
                切换
              </View>
            </Picker>
          ) : eventStatus === 'error' ? (
            <Button
              className="event-context-switch event-context-retry"
              onClick={() => void loadEventContext()}
            >
              重试
            </Button>
          ) : null}
        </View>
      </View>

      <View className="home-section">
        <Text className="home-section-title">业务板块</Text>
        <View className="business-grid">
          <Button
            className={`business-tile ${selected === materialApproval ? 'selected' : ''}`}
            ariaLabel="材料审批，当前选中"
            onClick={() => setSelected(materialApproval)}
          >
            <Image
              className="business-icon"
              src={approvalIcon}
              mode="aspectFit"
              ariaLabel=""
            />
            <Text>材料审批</Text>
          </Button>
        </View>
      </View>

      {selected === materialApproval && (
        <View className="home-section home-submodules">
          <Text className="home-section-title">材料审批</Text>
          <Text className="description">
            {currentEvent
              ? `办理${currentEvent.name}的材料业务`
              : '当前身份暂无可办理赛事'}
          </Text>
          <View className="submodule-grid">
            <Button
              className="submodule-card"
              disabled={!currentEvent}
              onClick={() => openModule('materials')}
            >
              <Text className="submodule-title">材料提交</Text>
              <Text className="submodule-description">
                查看任务，新增或继续提交材料
              </Text>
            </Button>
            <Button
              className="submodule-card"
              disabled={!currentEvent}
              onClick={() => openModule('progress')}
            >
              <Text className="submodule-title">审核进度</Text>
              <Text className="submodule-description">
                查看材料状态、退回原因与版本历史
              </Text>
            </Button>
          </View>
        </View>
      )}

      <View className="home-account">
        <Text className="home-account-name">{identity}</Text>
        <Button
          className="text-button compact-button"
          onClick={() => void Taro.navigateTo({ url: '/pages/profile/index' })}
        >
          切换测试身份
        </Button>
      </View>
    </View>
  );
}
