import { useRef, useState } from 'react';
import { withAgentEntry } from '../../features/agent/AgentEntry';
import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useRouter } from '@tarojs/taro';
import { ApiError, type components } from '@caau/api-client';
import {
  clearSession,
  client,
  session,
} from '../../features/materials/session';
import { useVisibleAutoRefresh } from '../../features/refresh/useVisibleAutoRefresh';

type S = components['schemas'];
type EventProfile = {
  eventName?: string;
  startDate?: string;
  endDate?: string;
  location?: {
    administrativeArea?: {
      province?: string;
      city?: string;
      district?: string | null;
    };
    detailedAddress?: string;
    venueName?: string;
  };
};

function EventInfo() {
  const router = useRouter();
  const id = router.params.id ?? '';
  const [event, setEvent] = useState<S['EventViewDto']>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const inflight = useRef(0);
  const visible = useRef(false);
  const generation = useRef(0);
  useDidShow(() => {
    visible.current = true;
  });
  useDidHide(() => {
    visible.current = false;
    generation.current += 1;
  });

  function load() {
    if (
      !visible.current ||
      (inflight.current !== 0 && inflight.current === generation.current)
    )
      return;
    const token = session.token;
    if (!token) {
      void Taro.reLaunch({ url: '/pages/login/index' });
      return;
    }
    const request = ++generation.current;
    inflight.current = request;
    const valid = () =>
      visible.current &&
      request === generation.current &&
      token === session.token;
    if (!event) setLoading(true);
    return client
      .request('getEvent', { token, path: { id } })
      .then((result) => {
        if (valid()) {
          setEvent(result);
          setError('');
        }
      })
      .catch((cause) => {
        if (!valid()) return;
        if (cause instanceof ApiError && cause.status === 401) {
          setEvent(undefined);
          clearSession();
          void Taro.reLaunch({ url: '/pages/login/index' });
        } else if (cause instanceof ApiError && cause.status === 403) {
          setEvent(undefined);
          setError('赛事基本信息查看权限已撤销。');
        } else setError('赛事基本信息暂时无法读取，请稍后重试。');
      })
      .finally(() => {
        if (inflight.current === request) inflight.current = 0;
        if (valid()) setLoading(false);
      });
  }
  useVisibleAutoRefresh(load);

  const profile = (event?.profile ?? {}) as EventProfile;
  const area = profile.location?.administrativeArea;
  return (
    <View className="page event-info-page">
      <View className="page-top-actions">
        <Text className="eyebrow">CAAU · 正式赛事</Text>
        <Button
          className="text-button compact-button"
          onClick={() => void Taro.navigateBack()}
        >
          返回申请
        </Button>
      </View>
      <Text className="title">赛事基本信息</Text>
      <Text className="description">
        由获批承办申请生成的只读信息；此权限不包含赛事修改、审核或材料任务办理。
      </Text>
      {loading && (
        <View className="card">
          <Text>正在核对查看权限…</Text>
        </View>
      )}
      {error && (
        <View className="error" role="alert">
          <Text>{error}</Text>
          <Button onClick={() => void load()}>重新加载</Button>
        </View>
      )}
      {event && (
        <View className="card hosting-readonly-form">
          <Text className="subtitle">{event.name}</Text>
          <View className="hosting-data-row">
            <Text>赛事状态</Text>
            <Text>
              {event.lifecycleState === 'PREPARING_INTERNAL'
                ? '内部筹备中'
                : '未标注'}
            </Text>
          </View>
          <View className="hosting-data-row">
            <Text>开始日期</Text>
            <Text>{profile.startDate || '未填写'}</Text>
          </View>
          <View className="hosting-data-row">
            <Text>结束日期</Text>
            <Text>{profile.endDate || '未填写'}</Text>
          </View>
          <View className="hosting-data-row">
            <Text>省市区</Text>
            <Text>
              {[area?.province, area?.city, area?.district]
                .filter(Boolean)
                .join(' / ') || '未填写'}
            </Text>
          </View>
          <View className="hosting-data-row">
            <Text>详细地址</Text>
            <Text>{profile.location?.detailedAddress || '未填写'}</Text>
          </View>
          <View className="hosting-data-row">
            <Text>场馆名称</Text>
            <Text>{profile.location?.venueName || '未填写'}</Text>
          </View>
          <Text className="description">赛事编号：{event.id}</Text>
        </View>
      )}
    </View>
  );
}
export default withAgentEntry(EventInfo);
