import { useCallback, useEffect, useRef, useState } from 'react';
import { withAgentEntry } from '../../features/agent/AgentEntry';
import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow } from '@tarojs/taro';
import { ApiError, workflowError, type components } from '@caau/api-client';
import {
  clearSession,
  client,
  importSession,
  session,
} from '../../features/materials/session';

type Choice = components['schemas']['LocalIdentityChoiceDto'];
const AUTO_REFRESH_MS = 20_000;

function Profile() {
  const [name, setName] = useState(session.identity?.displayName ?? '');
  const [choices, setChoices] = useState<Choice[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [localToken, setLocalToken] = useState('');
  const [manual, setManual] = useState(false);
  const [loadingChoices, setLoadingChoices] = useState(false);
  const [choiceError, setChoiceError] = useState('');
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const choiceRequest = useRef(0);
  const active = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>();

  const loadChoices = useCallback(async (quiet = false) => {
    clearTimeout(refreshTimer.current);
    const request = ++choiceRequest.current;
    if (!quiet) setLoadingChoices(true);
    try {
      const rows = await client.request('listLocalTestIdentities');
      if (request !== choiceRequest.current) return;
      const organizers = rows.filter((row) => row.role === 'ORGANIZER');
      setChoices(organizers);
      setChoiceError(
        organizers.length ? '' : '当前环境没有可选择的承办方测试账号。',
      );
    } catch (error) {
      if (request !== choiceRequest.current) return;
      setChoices([]);
      setChoiceError(
        error instanceof ApiError && error.status === 503
          ? '本地测试身份入口未开启，请检查本机 API 的身份模式。'
          : error instanceof ApiError
            ? `读取测试账号失败（HTTP ${error.status}），请重试。`
            : '无法连接本机 API，请确认后端已启动并检查小程序的请求域名设置。',
      );
    } finally {
      if (request === choiceRequest.current) {
        setLoadingChoices(false);
        if (active.current)
          refreshTimer.current = setTimeout(
            () => void loadChoices(true),
            AUTO_REFRESH_MS,
          );
      }
    }
  }, []);
  useDidShow(() => {
    active.current = true;
    setName(session.identity?.displayName ?? '');
    void loadChoices();
  });
  useDidHide(() => {
    active.current = false;
    ++choiceRequest.current;
    clearTimeout(refreshTimer.current);
  });
  useEffect(
    () => () => {
      active.current = false;
      ++choiceRequest.current;
      clearTimeout(refreshTimer.current);
    },
    [],
  );

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
    await Taro.reLaunch({ url: '/pages/home/index' });
  }

  return (
    <View className="page identity-page">
      <View className="page-top-actions">
        <Text className="eyebrow">CAAU · 本地体验</Text>
        {name && (
          <Button
            className="text-button compact-button"
            onClick={() => void Taro.reLaunch({ url: '/pages/home/index' })}
          >
            返回首页
          </Button>
        )}
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
        {loadingChoices && (
          <Text className="description">正在读取测试账号…</Text>
        )}
        {choiceError && <Text className="error">{choiceError}</Text>}
        {!!choiceError && (
          <Button
            disabled={busy || loadingChoices}
            onClick={() => void loadChoices()}
          >
            重新加载测试账号
          </Button>
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
export default withAgentEntry(Profile);
