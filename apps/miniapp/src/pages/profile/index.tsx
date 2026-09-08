import { useRef, useState } from 'react';
import { Button, Input, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { workflowError } from '@caau/api-client';
import {
  client,
  importSession,
  session,
} from '../../features/materials/session';
export default function Profile() {
  const [name, setName] = useState(session.identity?.displayName ?? ''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [localToken, setLocalToken] = useState('');
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice('');
    setFailed(false);
    try {
      await work();
    } catch (e) {
      setFailed(true);
      setNotice(`${workflowError(e)} 请核对本地测试令牌与承办身份。`);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <View className="page">
      <Text className="eyebrow">CAAU · 承办工作空间</Text>
      <Text className="title">我的</Text>
      <View className="card">
        <Text className="subtitle">{name || '尚未载入身份'}</Text>
        <Text className="warning">本地测试身份入口 · 非正式登录</Text>
        <Text className="description">
          从本机合成会话文件复制 token
          到下方密码框，仅保存在内存。不要通过微信聊天发送会话文件，也不要截图令牌。真实微信登录、合法域名与真机尚未验收。
        </Text>
        <Text>本地测试令牌（仅内存）</Text>
        <Input
          password
          ariaLabel="本地测试令牌（仅内存）"
          className="session-input"
          value={localToken}
          maxlength={43}
          disabled={busy}
          onInput={(e) => setLocalToken(e.detail.value)}
        />
        <Button
          disabled={busy || !localToken}
          loading={busy}
          onClick={() =>
            void run(async () => {
              if (
                name &&
                !(
                  await Taro.showModal({
                    title: '确认切换身份',
                    content: '请先保存当前任务，切换将清除当前会话。',
                  })
                ).confirm
              )
                return;
              await importSession(localToken);
              setLocalToken('');
              setName(session.identity!.displayName);
              setNotice('本地身份已载入');
            })
          }
        >
          载入本地测试身份
        </Button>
        {name && (
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                try {
                  await client.request('logout', { token: session.token });
                } finally {
                  session.token = '';
                  session.identity = undefined;
                  setName('');
                }
                setNotice('会话已退出');
              })
            }
          >
            退出会话
          </Button>
        )}
        {notice && (
          <Text className={failed ? 'error' : 'result'}>{notice}</Text>
        )}
      </View>
      <View className="card">
        <Text className="subtitle">验收边界</Text>
        <Text>
          模板目前只有版本标识，尚无真实模板下载。请按任务说明填写材料。
        </Text>
        <Button
          onClick={() => void Taro.navigateTo({ url: '/pages/index/index' })}
        >
          工程连接检查
        </Button>
      </View>
    </View>
  );
}
