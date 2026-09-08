import { useRef, useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import {
  executionStatus,
  workflowError,
  type components,
} from '@caau/api-client';
import { client, session } from './session';
type S = components['schemas'];
export function TaskList({ eventsMode = false }: { eventsMode?: boolean }) {
  const [rows, setRows] = useState<
      { task: S['TaskViewDto']; execution: S['ExecutionViewDto'] }[]
    >([]),
    [events, setEvents] = useState<S['EventViewDto'][]>([]),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function load() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setRows([]);
    try {
      if (!session.token) {
        setEvents([]);
        return;
      }
      const token = session.token;
      const [tasks, events] = await Promise.all([
        client.request('listMaterialTasks', { token }),
        client.request('listEvents', { token }),
      ]);
      const data = await Promise.all(
        tasks
          .filter((t) => t.state === 'PUBLISHED')
          .map(async (task) => ({
            task,
            execution: await client.request('getTaskExecution', {
              token,
              path: { id: task.id },
            }),
          })),
      );
      if (token === session.token) {
        setRows(data);
        setEvents(events);
      }
    } catch (e) {
      setError(workflowError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useDidShow(() => {
    void load();
  });
  const filtered = rows.filter((r) =>
    eventsMode
      ? !selected || r.task.eventId === selected
      : r.execution.state === 'EDITING',
  );
  return (
    <View className="page">
      <Text className="eyebrow">CAAU · 承办工作空间</Text>
      <Text className="title">{eventsMode ? '赛事' : '待办'}</Text>
      <Text className="description">
        {eventsMode
          ? '查看赛事下的任务、提交与审核记录。'
          : '先保存，再提交。退回后在新草稿中修改。'}
      </Text>
      {!session.token ? (
        <View className="card">
          <Text>尚未载入本地测试身份（非微信登录）</Text>
          <Button
            onClick={() => void Taro.switchTab({ url: '/pages/profile/index' })}
          >
            前往我的
          </Button>
        </View>
      ) : (
        <>
          <Button disabled={busy} loading={busy} onClick={() => void load()}>
            刷新任务
          </Button>
          {error && <Text className="error">{error}</Text>}
          {eventsMode && (
            <View className="card">
              <Button onClick={() => setSelected('')}>全部赛事</Button>
              {events.map((e) => (
                <Button key={e.id} onClick={() => setSelected(e.id)}>
                  {selected === e.id ? '当前：' : ''}
                  {e.name}
                </Button>
              ))}
            </View>
          )}
          {!busy && !filtered.length && (
            <View className="card">
              <Text>
                暂无可见{eventsMode ? '任务' : '待办'}
                ，已提交材料可在赛事中查看。
              </Text>
            </View>
          )}
          {filtered.map(({ task, execution }) => (
            <View className="card" key={task.id}>
              <Text className="subtitle">{task.title}</Text>
              <Text className="status">{executionStatus(execution)}</Text>
              <Text className="description">
                {events.find((e) => e.id === task.eventId)?.name}
              </Text>
              <Text>
                截止：{new Date(execution.deadlines.task).toLocaleString()}
              </Text>
              {Date.now() >= Date.parse(execution.deadlines.task) &&
                execution.state === 'EDITING' && (
                  <Text className="warning">
                    已逾期 · 可保存，须总部延期后提交
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
                查看任务
              </Button>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
