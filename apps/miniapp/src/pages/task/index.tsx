import { useRef, useState } from 'react';
import { withAgentEntry } from '../../features/agent/AgentEntry';
import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useRouter } from '@tarojs/taro';
import { ApiError, workflowError } from '@caau/api-client';
import { IndividualTaskPage } from '../../features/individuals/IndividualTaskPage';
import { LegacyTaskPage } from '../../features/materials/LegacyTaskPage';
import {
  clearSession,
  client,
  session,
} from '../../features/materials/session';

function TaskPage() {
  const id = useRouter().params.id ?? '';
  const [individual, setIndividual] = useState<boolean>();
  const [error, setError] = useState('');
  const current = useRef<{
    id: string;
    token: string;
    epoch: number;
    individual: boolean;
  }>();
  const requestVersion = useRef(0);
  const routeId = useRef(id);
  const visible = useRef(false);
  routeId.current = id;
  async function load() {
    if (!session.token || !id) {
      current.current = undefined;
      setIndividual(undefined);
      return;
    }
    const token = session.token;
    const epoch = session.epoch;
    const version = ++requestVersion.current;
    const sameTask =
      current.current?.id === id &&
      current.current.token === token &&
      current.current.epoch === epoch;
    setError('');
    if (!sameTask) setIndividual(undefined);
    try {
      const task = await client.request('getMaterialTask', {
        token,
        path: { id },
      });
      if (
        !visible.current ||
        version !== requestVersion.current ||
        token !== session.token ||
        epoch !== session.epoch ||
        id !== routeId.current
      )
        return;
      current.current = {
        id,
        token,
        epoch,
        individual: task.individualChannel,
      };
      if (!sameTask || individual !== task.individualChannel)
        setIndividual(task.individualChannel);
    } catch (cause) {
      if (
        !visible.current ||
        version !== requestVersion.current ||
        token !== session.token ||
        epoch !== session.epoch ||
        id !== routeId.current
      )
        return;
      if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
        current.current = undefined;
        setIndividual(undefined);
        if (cause.status === 401) clearSession();
      }
      setError(workflowError(cause));
    }
  }
  useDidShow(() => {
    visible.current = true;
    if (!session.token) {
      void Taro.reLaunch({ url: '/pages/login/index' });
      return;
    }
    void load();
  });
  useDidHide(() => {
    visible.current = false;
    requestVersion.current += 1;
  });
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
            onClick={() => void Taro.reLaunch({ url: '/pages/login/index' })}
          >
            前往登录
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
export default withAgentEntry(TaskPage);
