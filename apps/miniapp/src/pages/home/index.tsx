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
const materialApproval = 'material-approval';
const hostingApplication = 'hosting-application';

export default function Home() {
  const [identity, setIdentity] = useState(session.identity?.displayName ?? '');
  const [selected, setSelected] = useState(materialApproval);
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
    setIdentity(session.identity?.displayName ?? '');
    setEventExpanded(false);
    void loadEventContext();
  });
  if (!session.token) return <View className="page" />;

  return (
    <View className="page home-page">
      <View className="home-welcome">
        <View className="home-welcome-copy">
          <Text className="home-kicker">CAAU · 赛事协作</Text>
          <Text className="home-greeting">把热爱，有序展开。</Text>
          <Text className="home-welcome-note">
            你好，{identity || '赛事伙伴'}
          </Text>
        </View>
        <View className="home-logo-slot">
          <Image
            className="home-logo"
            src={logo}
            mode="aspectFit"
            ariaLabel="CAAU 标志"
          />
        </View>
      </View>
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
      <View className="home-section">
        <View className="home-section-heading">
          <Text className="home-section-title">我的工作台</Text>
          <Text className="home-section-caption">从这里开始办理</Text>
        </View>
        <View className="business-grid">
          <Button
            className={`business-tile material-tile ${selected === materialApproval ? 'selected' : ''}`}
            ariaLabel={`我要办赛${selected === materialApproval ? '，当前选中' : ''}`}
            onClick={() => setSelected(materialApproval)}
          >
            <View className="business-icon application-business-icon">
              <View className="application-icon-line" />
              <View className="application-icon-line short" />
              <View className="application-icon-mark" />
            </View>
            <Text className="business-title">我要办赛</Text>
            <Text className="business-description">备齐资料 · 统一审核</Text>
            <Text className="business-selection">
              {selected === materialApproval ? '当前板块' : '选择板块'}
            </Text>
          </Button>
          <Button
            className={`business-tile hosting-tile ${selected === hostingApplication ? 'selected' : ''}`}
            ariaLabel={`赛事承办申请${selected === hostingApplication ? '，当前选中' : ''}`}
            onClick={() => setSelected(hostingApplication)}
          >
            <View className="business-icon application-business-icon">
              <View className="application-icon-line" />
              <View className="application-icon-line short" />
              <View className="application-icon-mark" />
            </View>
            <Text className="business-title">承办申请</Text>
            <Text className="business-description">发起申请 · 筹备赛事</Text>
            <Text className="business-selection">
              {selected === hostingApplication ? '当前板块' : '选择板块'}
            </Text>
          </Button>
        </View>
      </View>

      {selected === materialApproval && (
        <View className="home-section home-submodules">
          <Text className="home-section-title">办赛材料</Text>
          <Text className="description">
            {currentEvent
              ? `办理${currentEvent.name}的材料业务`
              : '当前身份暂无可办理赛事'}
          </Text>
          <View className="submodule-grid">
            <Button
              className="submodule-card"
              disabled={!currentEvent}
              onClick={() =>
                void Taro.navigateTo({ url: '/pages/event-materials/index' })
              }
            >
              <Text className="submodule-index">01</Text>
              <View className="submodule-copy">
                <Text className="submodule-title">办赛材料</Text>
                <Text className="submodule-description">
                  营业执照、场地照片、银行账户等7项必填
                </Text>
              </View>
            </Button>
            <Button
              className="submodule-card"
              disabled={!currentEvent}
              onClick={() =>
                void Taro.navigateTo({ url: '/pages/event-materials/index' })
              }
            >
              <Text className="submodule-index mint">02</Text>
              <View className="submodule-copy">
                <Text className="submodule-title">审核进度</Text>
                <Text className="submodule-description">
                  查看整套材料审核状态、补充要求与历史
                </Text>
              </View>
            </Button>
          </View>
        </View>
      )}

      {selected === hostingApplication && (
        <View className="home-section home-submodules">
          <Text className="home-section-title">赛事承办申请</Text>
          <Text className="description">
            无需先选择赛事；查看本机构申请，建立草稿并跟进总部审核。
          </Text>
          <View className="submodule-grid hosting-home-grid">
            <Button
              className="submodule-card"
              onClick={() =>
                void Taro.navigateTo({ url: '/pages/hosting/index' })
              }
            >
              <Text className="submodule-index mint">01</Text>
              <View className="submodule-copy">
                <Text className="submodule-title">申请办理</Text>
                <Text className="submodule-description">
                  新建申请、上传资料、提交补充并查看获批结果
                </Text>
              </View>
            </Button>
          </View>
        </View>
      )}

      <View className="home-account">
        <Text className="home-account-name">{identity}</Text>
        <Button
          className="text-button compact-button"
          onClick={() => void Taro.switchTab({ url: '/pages/profile/index' })}
        >
          切换测试身份
        </Button>
      </View>
    </View>
  );
}
