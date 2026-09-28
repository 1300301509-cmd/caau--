import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Input, Text, Textarea, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useRouter } from '@tarojs/taro';
import { ApiError } from '@caau/api-client';
import { clearSession, session, subscribeSession } from '../materials/session';
import './competition.css';
export { useVisibleAutoRefresh } from '../refresh/useVisibleAutoRefresh';

export function useCompetition(clear: () => void, editing = false) {
  const eventId = useRouter().params.event ?? '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const live = useRef(true);
  const visible = useRef(false);
  const actionVersion = useRef(0);
  const readVersion = useRef(0);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const clearRef = useRef(clear);
  clearRef.current = clear;
  useEffect(() => {
    live.current = true;
    const stop = subscribeSession(() => {
      clearRef.current();
      void Taro.reLaunch({ url: '/pages/login/index' });
    });
    return () => {
      live.current = false;
      stop();
    };
  }, []);
  useDidShow(() => {
    visible.current = true;
    if (!session.token) void Taro.reLaunch({ url: '/pages/login/index' });
  });
  useDidHide(() => {
    visible.current = false;
    readVersion.current += 1;
  });
  useEffect(() => {
    if (editing)
      Taro.enableAlertBeforeUnload({ message: '有未保存的修改，确定离开？' });
    else Taro.disableAlertBeforeUnload();
    return () => Taro.disableAlertBeforeUnload();
  }, [editing]);
  async function run(
    work: (token: string, valid: () => boolean) => Promise<void>,
  ) {
    if (lock.current) return;
    if (!eventId) {
      setError('请返回首页选择赛事');
      return;
    }
    if (!session.token) {
      clearSession();
      return;
    }
    actionVersion.current += 1;
    readVersion.current += 1;
    lock.current = true;
    setBusy(true);
    setError('');
    const token = session.token;
    const epoch = session.epoch;
    const valid = () =>
      live.current && token === session.token && epoch === session.epoch;
    try {
      await work(token, valid);
    } catch (e) {
      if (!valid()) return;
      if (
        e &&
        typeof e === 'object' &&
        'errMsg' in e &&
        String(e.errMsg).includes('cancel')
      )
        return;
      if (e instanceof ApiError && e.status === 401) {
        clearSession();
        return;
      }
      if (e instanceof ApiError && e.status === 403) {
        clearRef.current();
        setError('当前身份没有此赛事的操作权限，请返回首页。');
      } else
        setError(
          e instanceof ApiError
            ? e.status === 409
              ? '数据已变化或操作冲突，输入已保留。请取消编辑、刷新核对后再操作，不能直接覆盖。'
              : '请求未完成，请检查输入或网络后重试。'
            : e instanceof Error
              ? e.message
              : '操作未完成，请重试。',
        );
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function read(
    work: (token: string, valid: () => boolean) => Promise<void>,
  ) {
    if (lock.current || editingRef.current || !visible.current || !eventId)
      return;
    if (!session.token) {
      clearSession();
      return;
    }
    const token = session.token;
    const epoch = session.epoch;
    const action = actionVersion.current;
    const request = ++readVersion.current;
    const valid = () =>
      live.current &&
      visible.current &&
      !lock.current &&
      !editingRef.current &&
      token === session.token &&
      epoch === session.epoch &&
      action === actionVersion.current &&
      request === readVersion.current;
    try {
      await work(token, valid);
    } catch (e) {
      if (!valid()) return;
      if (e instanceof ApiError && e.status === 401) clearSession();
      else if (e instanceof ApiError && e.status === 403) {
        clearRef.current();
        setError('当前身份没有此赛事的操作权限，请返回首页。');
      } else setError('暂时无法自动更新，请检查网络后重试。');
    }
  }
  return { eventId, busy, error, setError, run, read };
}
export type CompetitionContext = ReturnType<typeof useCompetition>;
export function Shell({
  title,
  ctx,
  retry,
  children,
}: {
  title: string;
  ctx: CompetitionContext;
  retry?: () => void;
  children: ReactNode;
}) {
  return (
    <View className="page competition-mobile">
      <View className="competition-page-heading">
        <Text className="eyebrow">我的比赛</Text>
        <Text className="title">{title}</Text>
      </View>
      {ctx.error && (
        <View className="competition-error" role="alert">
          {ctx.error}
          {retry && (
            <Button disabled={ctx.busy} onClick={retry}>
              重新加载
            </Button>
          )}
        </View>
      )}
      {ctx.busy && (
        <View className="competition-loading" role="status">
          正在更新，请稍候…
        </View>
      )}
      {children}
    </View>
  );
}
export function Field({
  label,
  value,
  onChange,
  disabled,
  max = 120,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  max?: number;
  type?: 'text' | 'number';
}) {
  return (
    <View className="competition-field">
      <Text>{label}</Text>
      {max > 300 ? (
        <Textarea
          ariaLabel={label}
          value={value}
          disabled={disabled}
          maxlength={max}
          onInput={(e) => onChange(e.detail.value)}
        />
      ) : (
        <Input
          ariaLabel={label}
          value={value}
          disabled={disabled}
          maxlength={max}
          type={type}
          onInput={(e) => onChange(e.detail.value)}
        />
      )}
    </View>
  );
}
export function Action({
  children,
  onClick,
  disabled,
  primary = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Button
      className={primary ? 'competition-primary' : ''}
      hoverClass="competition-pressed"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
export async function confirm(title: string, content: string) {
  return (await Taro.showModal({ title, content })).confirm;
}
export function saved() {
  void Taro.showToast({ title: '已保存', icon: 'success' });
}
