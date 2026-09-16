import { useEffect, useRef, useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow } from '@tarojs/taro';
import {
  ApiError,
  executionStatus,
  workflowError,
  type components,
} from '@caau/api-client';
import { clearSession, client, session, subscribeSession } from './session';
import { materialStateLabel } from '../individuals/platform';

type S = components['schemas'];
type Row = { task: S['TaskViewDto']; execution?: S['ExecutionViewDto'] };

export function TaskList({
  mode = 'submit',
}: {
  mode?: 'submit' | 'progress';
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [materials, setMaterials] = useState<S['IndividualViewDto'][]>([]);
  const [events, setEvents] = useState<S['EventViewDto'][]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'syncing' | 'online' | 'offline'
  >('idle');
  const [lastSync, setLastSync] = useState('');
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const foreground = useRef(false);
  const running = useRef(false);
  const failures = useRef(0);

  function stop() {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
  }
  async function load() {
    if (!session.token || !foreground.current || running.current) return;
    running.current = true;
    const epoch = generation.current;
    const token = session.token;
    setStatus('syncing');
    try {
      const [tasks, eventRows, snapshot] = await Promise.all([
        client.request('listMaterialTasks', { token }),
        client.request('listEvents', { token }),
        client.request('getIndividualSnapshot', {
          token,
          query: { offset: 0, limit: 50 },
        }),
      ]);
      const data = await Promise.all(
        tasks
          .filter((task) => task.state === 'PUBLISHED')
          .map(async (task) => ({
            task,
            ...(task.individualChannel
              ? {}
              : {
                  execution: await client.request('getTaskExecution', {
                    token,
                    path: { id: task.id },
                  }),
                }),
          })),
      );
      if (
        epoch !== generation.current ||
        token !== session.token ||
        !foreground.current
      )
        return;
      failures.current = 0;
      setRows(data);
      setEvents(eventRows);
      setMaterials(snapshot.items);
      setLastSync(snapshot.serverTime);
      setError('');
      setStatus('online');
    } catch (cause) {
      if (epoch !== generation.current || token !== session.token) return;
      failures.current++;
      setStatus('offline');
      if (cause instanceof ApiError && cause.status === 401) {
        stop();
        setRows([]);
        setEvents([]);
        setMaterials([]);
        clearSession();
        setError('会话已失效，受保护内容已清除，请重新载入测试身份。');
      } else if (cause instanceof ApiError && cause.status === 403) {
        setRows([]);
        setEvents([]);
        setMaterials([]);
        setError('访问权限已变化，原列表已清除，正在重新核对。');
      } else setError(`${workflowError(cause)}；恢复网络后自动重试。`);
    } finally {
      running.current = false;
      if (session.token && foreground.current)
        timer.current = setTimeout(
          () => void load(),
          failures.current
            ? Math.min(30000, 2000 * 2 ** Math.min(failures.current, 4))
            : 2000,
        );
    }
  }
  function clearProtected() {
    stop();
    setRows([]);
    setEvents([]);
    setMaterials([]);
    setError('');
    setLastSync('');
    setStatus('idle');
  }
  function show() {
    foreground.current = true;
    stop();
    if (!session.token) {
      clearProtected();
      return;
    }
    void load();
  }
  useDidShow(show);
  useDidHide(() => {
    foreground.current = false;
    stop();
    setStatus(session.token ? 'idle' : 'idle');
  });
  useEffect(() => {
    const changed: Taro.onNetworkStatusChange.Callback = (result) => {
      if (!result.isConnected) {
        stop();
        setStatus('offline');
        setError('网络已断开，保留当前列表；恢复后自动核对。');
      } else if (foreground.current) show();
    };
    const unsubscribe = subscribeSession(() => {
      clearProtected();
      if (session.token && foreground.current) void load();
    });
    Taro.onNetworkStatusChange(changed);
    return () => {
      foreground.current = false;
      stop();
      unsubscribe();
      Taro.offNetworkStatusChange(changed);
    };
  }, []);

  const visibleRows = rows.filter(
    ({ task }) => !selected || task.eventId === selected,
  );
  const visibleMaterials = materials.filter((material) => {
    const task = rows.find((item) => item.task.id === material.taskId)?.task;
    return (
      !!task?.individualChannel && (!selected || task.eventId === selected)
    );
  });
  return (
    <View className="page">
      <View className="page-top-actions">
        <Text className="eyebrow">CAAU · 承办方</Text>
        <Button
          className="text-button compact-button"
          onClick={() => void Taro.reLaunch({ url: '/pages/home/index' })}
        >
          返回首页
        </Button>
      </View>
      <Text className="title">
        {mode === 'progress' ? '审核进度' : '材料提交'}
      </Text>
      <Text className="description">
        {mode === 'progress'
          ? '查看当前承办范围内的材料状态、退回原因和版本历史；不包含总部审批操作。'
          : '先选择赛事，再进入有权办理的任务，新增或继续提交材料。'}
      </Text>
      {!session.token ? (
        <View className="card">
          <Text>尚未载入本地测试身份（非微信登录）</Text>
          <Button
            onClick={() =>
              void Taro.navigateTo({ url: '/pages/profile/index' })
            }
          >
            载入本地测试身份
          </Button>
        </View>
      ) : (
        <>
          <View className={`sync-card sync-${status}`}>
            <Text>
              {status === 'online'
                ? '自动同步已连接'
                : status === 'offline'
                  ? '同步中断'
                  : status === 'syncing'
                    ? '正在核对'
                    : '返回前台后核对'}
            </Text>
            {lastSync && (
              <Text className="description">
                最近核对：{new Date(lastSync).toLocaleString()}
              </Text>
            )}
          </View>
          <Button disabled={status === 'syncing'} onClick={show}>
            立即核对
          </Button>
          {error && <Text className="error">{error}</Text>}
          <View className="card event-filter">
            <Text className="subtitle">选择赛事</Text>
            <Button onClick={() => setSelected('')}>
              {selected ? '查看全部赛事' : '当前：全部赛事'}
            </Button>
            {events.map((event) => (
              <Button key={event.id} onClick={() => setSelected(event.id)}>
                {selected === event.id ? '当前：' : ''}
                {event.name}
              </Button>
            ))}
            {!events.length && status === 'online' && (
              <Text className="description">当前没有可选择的赛事。</Text>
            )}
          </View>
          {status === 'syncing' && !rows.length && (
            <View className="card">
              <Text>正在加载赛事和材料任务…</Text>
            </View>
          )}
          {mode === 'submit' && !visibleRows.length && status === 'online' && (
            <View className="card">
              <Text>当前范围暂无可见任务。</Text>
            </View>
          )}
          {mode === 'submit' &&
            visibleRows.map(({ task, execution }) => (
              <View className="card" key={task.id}>
                <Text className="subtitle">{task.title}</Text>
                <Text className="description">
                  {events.find((event) => event.id === task.eventId)?.name}
                </Text>
                <Text className="status">
                  {task.individualChannel
                    ? '单份材料通道'
                    : executionStatus(execution)}
                </Text>
                {execution && (
                  <Text>
                    截止：{new Date(execution.deadlines.task).toLocaleString()}
                  </Text>
                )}
                <Button
                  type="primary"
                  onClick={() =>
                    void Taro.navigateTo({
                      url: `/pages/task/index?id=${task.id}`,
                    })
                  }
                >
                  {task.individualChannel ? '查看并新增材料' : '查看旧整包任务'}
                </Button>
              </View>
            ))}
          {mode === 'progress' &&
            !visibleMaterials.length &&
            status === 'online' && (
              <View className="card">
                <Text>当前范围暂无材料进度记录。</Text>
              </View>
            )}
          {mode === 'progress' && !!visibleMaterials.length && (
            <Text className="title">材料记录</Text>
          )}
          {mode === 'progress' &&
            visibleMaterials.map((material) => {
              const task = rows.find(
                (item) => item.task.id === material.taskId,
              )?.task;
              const title =
                material.draft?.title ??
                material.submission?.content.title ??
                '未命名材料';
              return (
                <View className="card" key={material.id}>
                  <Text className="subtitle">{title}</Text>
                  <Text
                    className={`state state-${material.state.toLowerCase()}`}
                  >
                    {materialStateLabel(material.state)} · V
                    {material.submission?.version ?? 0}
                  </Text>
                  <Text className="description">{task?.title}</Text>
                  {material.lastAction && (
                    <Text className="description">
                      最近更新：{material.lastAction.actorName} ·{' '}
                      {new Date(
                        material.lastAction.occurredAt,
                      ).toLocaleString()}
                    </Text>
                  )}
                  {material.lastAction?.reason && (
                    <Text className="warning">
                      退回原因：{material.lastAction.reason}
                    </Text>
                  )}
                  <Button
                    onClick={() =>
                      void Taro.navigateTo({
                        url: `/pages/task/index?id=${material.taskId}&material=${material.id}`,
                      })
                    }
                  >
                    查看进度与版本历史
                  </Button>
                </View>
              );
            })}
        </>
      )}
    </View>
  );
}
