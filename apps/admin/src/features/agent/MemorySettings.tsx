import { useEffect, useState } from 'react';
import { Button, Input } from 'antd';
import { ApiError, type components } from '@caau/api-client';
import { client } from '../materials/client';

type Memory = components['schemas']['AgentMemoryViewDto'];

export function MemorySettings({ token }: { token: string }) {
  const [items, setItems] = useState<Memory[]>([]);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
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
    if (!content.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const next = await client.request('createAgentMemory', {
        token,
        body: { content: content.trim() },
      });
      setItems((old) => [next, ...old.filter((item) => item.id !== next.id)]);
      setContent('');
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 409
          ? '最多保存 30 条，请先删除旧记忆。'
          : '保存失败，请检查内容或登录状态。',
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await client.request('deleteAgentMemory', {
        token,
        path: { memoryId: id },
      });
      setItems((old) => old.filter((item) => item.id !== id));
    } catch {
      setError('删除失败，请刷新后重试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="agent-memory-settings" aria-label="长期记忆">
      <strong>长期记忆 · 个人偏好</strong>
      <p>
        可跨对话用于回答和方案讨论，不会自动变成赛事事实、排赛条件或执行权限。请勿填写密钥或私密资料。
      </p>
      <div className="agent-memory-compose">
        <Input
          aria-label="新增长期记忆"
          maxLength={300}
          value={content}
          placeholder="例如：回答我时请先给简短结论"
          onChange={(event) => setContent(event.target.value)}
        />
        <Button
          disabled={!content.trim()}
          loading={busy}
          onClick={() => void add()}
        >
          保存记忆
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <span>{item.content}</span>
              <Button
                size="small"
                disabled={busy}
                onClick={() => void remove(item.id)}
                aria-label={`删除记忆：${item.content}`}
              >
                删除
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p>还没有保存长期记忆。</p>
      )}
    </section>
  );
}
