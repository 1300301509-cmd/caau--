import { useEffect, useState } from 'react';
import { Text, View } from '@tarojs/components';
import { ApiError } from '@caau/api-client';
import { client, session as login } from '../materials/session';
import { Action, Field } from '../competition/shared';
import type { S } from '../competition/model';

type Memory = S['AgentMemoryViewDto'];

export function MemorySettings() {
  const token = login.token;
  const [items, setItems] = useState<Memory[]>([]);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    if (token)
      void client
        .request('listAgentMemories', { token })
        .then((rows) => {
          if (alive) setItems(rows);
        })
        .catch(() => {
          if (alive) setError('记忆暂时无法读取。');
        });
    return () => {
      alive = false;
    };
  }, [token]);

  async function add() {
    if (!token || !content.trim() || busy) return;
    const epoch = login.epoch;
    setBusy(true);
    setError('');
    try {
      const next = await client.request('createAgentMemory', {
        token,
        body: { content: content.trim() },
      });
      if (epoch !== login.epoch) return;
      setItems((old) => [next, ...old.filter((item) => item.id !== next.id)]);
      setContent('');
    } catch (cause) {
      if (epoch === login.epoch)
        setError(
          cause instanceof ApiError && cause.status === 409
            ? '最多保存 30 条，请先删除旧记忆。'
            : '保存失败，请检查内容或登录状态。',
        );
    } finally {
      if (epoch === login.epoch) setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!token || busy) return;
    const epoch = login.epoch;
    setBusy(true);
    setError('');
    try {
      await client.request('deleteAgentMemory', {
        token,
        path: { memoryId: id },
      });
      if (epoch === login.epoch)
        setItems((old) => old.filter((item) => item.id !== id));
    } catch {
      if (epoch === login.epoch) setError('删除失败，请刷新后重试。');
    } finally {
      if (epoch === login.epoch) setBusy(false);
    }
  }

  return (
    <View className="agent-memory-settings" aria-label="长期记忆">
      <Text className="subtitle">长期记忆 · 个人偏好</Text>
      <Text className="competition-note">
        跨对话用于回答和方案讨论，不会自动变成赛事规则、排赛条件或执行权限。请勿填写密钥或私密资料。
      </Text>
      <Field
        label="新增长期记忆"
        value={content}
        max={300}
        disabled={busy}
        onChange={setContent}
      />
      <Action disabled={busy || !content.trim()} onClick={() => void add()}>
        保存记忆
      </Action>
      {!!error && <Text className="competition-error">{error}</Text>}
      {items.length ? (
        items.map((item) => (
          <View className="agent-memory-item" key={item.id}>
            <Text>{item.content}</Text>
            <Action disabled={busy} onClick={() => void remove(item.id)}>
              删除
            </Action>
          </View>
        ))
      ) : (
        <Text className="competition-note">还没有保存长期记忆。</Text>
      )}
    </View>
  );
}
