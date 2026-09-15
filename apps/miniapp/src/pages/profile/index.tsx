import { useEffect, useRef, useState } from 'react';
import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { workflowError, type components } from '@caau/api-client';
import {
  clearSession,
  client,
  importSession,
  session,
} from '../../features/materials/session';

type Choice = components['schemas']['LocalIdentityChoiceDto'];

export default function Profile() {
  const [name, setName] = useState(session.identity?.displayName ?? '');
  const [choices, setChoices] = useState<Choice[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [localToken, setLocalToken] = useState('');
  const [manual, setManual] = useState(false);
  const [fixedUnavailable, setFixedUnavailable] = useState(false);
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);

  useDidShow(() => setName(session.identity?.displayName ?? ''));
  useEffect(() => {
    let active = true;
    void client
      .request('listLocalTestIdentities')
      .then((rows) => {
        if (!active) return;
        setChoices(rows.filter((row) => row.role === 'ORGANIZER'));
        setFixedUnavailable(false);
      })
      .catch(() => {
        if (active) setFixedUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, []);

  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice('');
    setFailed(false);
    try {
      await work();
    } catch (error) {
      setFailed(true);
      setNotice(`${workflowError(error)} 请核对本地测试身份和网络后重试。`);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function confirmSwitch() {
    if (!name) return true;
    return (
      await Taro.showModal({
        title: '确认切换身份',
        content: '切换将清除当前会话和页面缓存；服务器已保存内容不受影响。',
      })
    ).confirm;
  }
  async function acceptToken(token: string) {
    const previousToken = session.token;
    await importSession(token);
    if (previousToken && previousToken !== session.token)
      void client.request('logout', { token: previousToken }).catch(() => {});
    setLocalToken('');
    setName(session.identity!.displayName);
    setNotice('本地测试身份已载入');
  }

  return (
    <View className="page identity-page">
      <View className="page-top-actions">
        <Text className="eyebrow">CAAU · 本地体验</Text>
        <Button
          className="text-button compact-button"
          onClick={() => void Taro.reLaunch({ url: '/pages/home/index' })}
        >
          返回首页
        </Button>
      </View>
      <Text className="title">本地测试身份</Text>
      <Text className="description">
        次要测试入口，不是微信登录。这里只列出当前环境提供的承办方身份，不默认选择任何一家。
      </Text>
      <View className="card">
        <Text className="subtitle">{name || '尚未载入身份'}</Text>
        <Text className="warning">仅限本地测试 · 非正式登录</Text>
        {!!choices.length && (
          <View className="identity-choices">
            <Text className="description">选择一个承办方测试身份：</Text>
            {choices.map((choice) => (
              <Button
                key={choice.key}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (!(await confirmSwitch())) return;
                    const issued = await client.request(
                      'createLocalTestSession',
                      { body: { identity: choice.key } },
                    );
                    await acceptToken(issued.token);
                  })
                }
              >
                {choice.displayName} · {choice.organizationName}
              </Button>
            ))}
          </View>
        )}
        {fixedUnavailable && (
          <Text className="description">
            固定身份入口未启用；如已通过本机工具签发短期测试令牌，可使用手动入口。
          </Text>
        )}
        <Button disabled={busy} onClick={() => setManual((value) => !value)}>
          {manual ? '收起手动令牌入口' : '使用手动测试令牌'}
        </Button>
        {manual && (
          <View className="manual-session">
            <Text>本地测试令牌（仅内存）</Text>
            <Input
              password
              ariaLabel="本地测试令牌（仅内存）"
              className="session-input"
              value={localToken}
              maxlength={43}
              disabled={busy}
              onInput={(event) => setLocalToken(event.detail.value)}
            />
            <Button
              disabled={busy || !localToken}
              loading={busy}
              onClick={() =>
                void run(async () => {
                  if (!(await confirmSwitch())) return;
                  await acceptToken(localToken);
                })
              }
            >
              载入手动测试令牌
            </Button>
          </View>
        )}
        {name && (
          <>
            <Button
              type="primary"
              disabled={busy}
              onClick={() =>
                void Taro.reLaunch({ url: '/pages/materials/index' })
              }
            >
              进入材料提交
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  try {
                    await client.request('logout', { token: session.token });
                  } finally {
                    clearSession();
                    setName('');
                  }
                  setNotice('会话已退出');
                })
              }
            >
              退出测试身份
            </Button>
          </>
        )}
        {notice && (
          <Text className={failed ? 'error' : 'result'}>{notice}</Text>
        )}
      </View>
      <Button
        className="text-button"
        onClick={() => void Taro.navigateTo({ url: '/pages/index/index' })}
      >
        工程连接检查
      </Button>
    </View>
  );
}
