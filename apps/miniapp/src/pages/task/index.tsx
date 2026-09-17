import { useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { ApiError, workflowError } from '@caau/api-client';
import { IndividualTaskPage } from '../../features/individuals/IndividualTaskPage';
import { LegacyTaskPage } from '../../features/materials/LegacyTaskPage';
import {
  clearSession,
  client,
  session,
} from '../../features/materials/session';

export default function TaskPage() {
  const id = useRouter().params.id ?? '';
  const [individual, setIndividual] = useState<boolean>();
  const [error, setError] = useState('');
  async function load() {
    if (!session.token || !id) {
      setIndividual(undefined);
      return;
    }
    const token = session.token;
    setError('');
    setIndividual(undefined);
    try {
      const task = await client.request('getMaterialTask', {
        token,
        path: { id },
      });
      if (token === session.token) setIndividual(task.individualChannel);
    } catch (cause) {
      if (token !== session.token) return;
      if (cause instanceof ApiError && cause.status === 401) clearSession();
      setError(workflowError(cause));
    }
  }
  useDidShow(() => void load());
  if (individual === true) return <IndividualTaskPage />;
  if (individual === false) return <LegacyTaskPage />;
  return (
    <View className="page">
      <Text className="eyebrow">CAAU · 材料任务</Text>
      <Text className="title">{error ? '任务无法打开' : '正在核对任务'}</Text>
      <View className="card">
        <Text className={error ? 'error' : 'description'}>
          {error || '正在重新验证会话和任务权限…'}
        </Text>
        {!session.token && (
          <Button
            onClick={() => void Taro.switchTab({ url: '/pages/profile/index' })}
          >
            载入本地测试身份
          </Button>
        )}
        {session.token && error && (
          <Button onClick={() => void load()}>重新加载任务</Button>
        )}
        <Button
          onClick={() => void Taro.reLaunch({ url: '/pages/home/index' })}
        >
          返回首页
        </Button>
      </View>
    </View>
  );
}
