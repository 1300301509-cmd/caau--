import { useState } from 'react';
import { Button, Image, ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { ApiError, type components } from '@caau/api-client';
import { resolveEventId } from '../../features/materials/event-context';
import {
  clearSession,
  client,
  session,
} from '../../features/materials/session';
import logo from '../../assets/caau-logo.jpg';

type S = components['schemas'];

export default function Home() {
  const [events, setEvents] = useState<S['EventViewDto'][]>([]);
  const [selectedEventId, setSelectedEventId] = useState(session.eventId);
  const [eventExpanded, setEventExpanded] = useState(false);
  const [eventStatus, setEventStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [eventError, setEventError] = useState('');
  const currentEvent =
    events.find((event) => event.id === selectedEventId) ?? events[0];

  async function loadEventContext() {
    const token = session.token;
    if (!token) return;
    setEventStatus('loading');
    setEventError('');
    setEventExpanded(false);
    try {
      const eventRows = await client.request('listEvents', { token });
      if (token !== session.token) return;
      session.eventId = resolveEventId(eventRows, session.eventId);
      setSelectedEventId(session.eventId);
      setEvents(eventRows);
      setEventStatus('ready');
    } catch (cause) {
      if (token !== session.token) return;
      if (cause instanceof ApiError && cause.status === 401) {
        clearSession();
        void Taro.reLaunch({ url: '/pages/login/index' });
        return;
      }
      setEvents([]);
      setEventStatus('error');
      setEventError('赛事读取失败，请检查网络后重试');
    }
  }

  useDidShow(() => {
    if (!session.token) {
      void Taro.reLaunch({ url: '/pages/login/index' });
      return;
    }
    setEventExpanded(false);
    void loadEventContext();
  });
  if (!session.token) return <View className="page" />;

  return (
    <View className="home-layout">
      <View className="home-brand-zone" ariaLabel="产品品牌">
        <View className="home-brand-logo-frame">
          <Image
            className="home-brand-logo"
            src={logo}
            mode="aspectFit"
            ariaLabel="CAAU 产品 Logo"
          />
        </View>
        <View className="home-brand-label">
          <Text className="home-brand-title">赛事协作平台</Text>
          <Text className="home-brand-subtitle">CAAU · 承办工作台</Text>
        </View>
      </View>
      <View className="home-modules-zone" ariaLabel="主要模块区域">
        <View className="home-context-row">
          <View className="event-switcher">
            <Button
              className={`event-context-bar ${eventExpanded ? 'expanded' : ''}`}
              ariaLabel={
                eventStatus === 'error'
                  ? '赛事读取失败，点击重试'
                  : `${currentEvent?.name ?? '暂无可办理赛事'}，点击${eventExpanded ? '收起' : '展开'}赛事列表`
              }
              onClick={() => {
                if (eventStatus === 'error') {
                  void loadEventContext();
                  return;
                }
                if (events.length) setEventExpanded((value) => !value);
              }}
            >
              <Text
                className={`event-context-name ${eventStatus === 'error' ? 'error-text' : ''}`}
              >
                {eventStatus === 'loading'
                  ? '正在读取…'
                  : eventStatus === 'error'
                    ? eventError
                    : (currentEvent?.name ?? '暂无可办理赛事')}
              </Text>
              <View
                className={`event-context-chevron ${eventExpanded ? 'expanded' : ''}`}
              />
            </Button>
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
        <View className="home-module-heading">
          <Text>主要模块</Text>
        </View>
        <View className="home-module-grid">
          <Button
            className="home-module-item"
            ariaLabel="我要办赛"
            onClick={() =>
              void Taro.navigateTo({ url: '/pages/hosting-hub/index' })
            }
          >
            <View className="home-module-icon">
              <View className="home-module-document">
                <View className="home-module-line" />
                <View className="home-module-line short" />
                <View className="home-module-check" />
              </View>
            </View>
            <Text className="home-module-name">我要办赛</Text>
          </Button>
          <Button
            className="home-module-item"
            disabled={eventStatus !== 'ready' || !currentEvent}
            ariaLabel="人员管理"
            onClick={() =>
              currentEvent &&
              void Taro.navigateTo({
                url: `/pages/staff/index?event=${encodeURIComponent(currentEvent.id)}`,
              })
            }
          >
            <View className="home-module-icon">
              <Text>人员</Text>
            </View>
            <Text className="home-module-name">人员管理</Text>
          </Button>
        </View>
      </View>
    </View>
  );
}
