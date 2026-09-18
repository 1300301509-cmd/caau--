import { useEffect, useRef, useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow } from '@tarojs/taro';
import { ApiError, type components } from '@caau/api-client';
import {
  client,
  session,
  clearSession,
  newKey,
  subscribeSession,
} from '../../features/materials/session';
import {
  hostingStatusLabel,
  hostingActionLabel,
} from '../../features/hosting/platform';

type Journey = components['schemas']['HostingJourneyDto'];
const stages = ['APPLICATION', 'MATERIALS', 'CONTRACT', 'PERMITTED'];
const names = ['申请审核', '材料审核', '合同签订', '批准办赛'];
export default function HostingProgress() {
  const [rows, setRows] = useState<Journey[]>([]);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState('');
  const [busy, setBusy] = useState('');
  const [expanded, setExpanded] = useState('');
  const active = useRef(false);
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pending = useRef<Record<string, { key: string; submissionId: string }>>(
    {},
  );
  useEffect(() => {
    const unsubscribe = subscribeSession(() => {
      setRows([]);
      setUpdated('');
      pending.current = {};
    });
    return () => {
      active.current = false;
      clearTimeout(timer.current);
      unsubscribe();
    };
  }, []);
  async function refresh() {
    if (!active.current || running.current || !session.token) return;
    running.current = true;
    const token = session.token;
    try {
      const next = await client.request('HostingController_journeys', {
        token,
      });
      if (token !== session.token || !active.current) return;
      setRows(next);
      setError('');
      setUpdated(new Date().toLocaleTimeString());
    } catch (cause) {
      if (token !== session.token || !active.current) return;
      if (
        cause instanceof ApiError &&
        (cause.status === 401 || cause.status === 403)
      ) {
        setRows([]);
        setUpdated('');
        if (cause.status === 401) {
          clearSession();
          void Taro.reLaunch({ url: '/pages/login/index' });
        }
      }
      setError(
        '进度暂未同步，请检查网络或权限后重试。当前内容可能不是最新状态。',
      );
    } finally {
      running.current = false;
      if (active.current)
        timer.current = setTimeout(() => void refresh(), 3000);
    }
  }
  useDidShow(() => {
    if (!session.token) {
      void Taro.reLaunch({ url: '/pages/login/index' });
      return;
    }
    active.current = true;
    clearTimeout(timer.current);
    void refresh();
  });
  useDidHide(() => {
    active.current = false;
    clearTimeout(timer.current);
  });
  async function confirm(row: Journey) {
    if (!row.materialApplicationId || busy || error) return;
    const answer = await Taro.showModal({
      title: '确认批准办赛',
      content:
        '请确认线下合同已签订。本操作将记录您的身份和时间，并更新承办方的办赛进度。',
      confirmText: '确认批准',
    });
    if (!answer.confirm) return;
    const id = row.materialApplicationId;
    const token = session.token;
    setBusy(id);
    try {
      if (!pending.current[id]) {
        const detail = await client.request('HostingController_detail', {
          token,
          path: { id },
        });
        if (!detail.currentSubmissionId) throw new Error('Missing submission');
        pending.current[id] = {
          key: await newKey(),
          submissionId: detail.currentSubmissionId,
        };
      }
      await client.request('HostingController_confirmPermit', {
        token,
        path: { id },
        body: pending.current[id]!,
      });
      delete pending.current[id];
      clearTimeout(timer.current);
      await refresh();
      await Taro.showToast({ title: '已批准办赛', icon: 'success' });
    } catch {
      setError(
        '操作未确认，请刷新核对；若仍未批准，可再次点击并沿用原命令重试。',
      );
    } finally {
      setBusy('');
    }
  }
  return (
    <View className="page">
      <Text className="eyebrow">CAAU · 办赛全流程</Text>
      <Text className="title">办赛进度</Text>
      <Text className="description">
        页面打开时每3秒自动同步。
        {updated ? `最近同步 ${updated}` : '正在读取进度…'}
      </Text>
      {error && <Text className="error">{error}</Text>}
      <Button
        onClick={() => {
          clearTimeout(timer.current);
          void refresh();
        }}
      >
        刷新进度
      </Button>
      {!rows.length && updated && (
        <View className="card">
          <Text>暂无办赛申请</Text>
          <Text className="description">
            从“申请比赛”开始办理，提交后可在此查看各阶段进展。
          </Text>
          <Button
            onClick={() =>
              void Taro.navigateTo({ url: '/pages/hosting/index' })
            }
          >
            申请比赛
          </Button>
        </View>
      )}
      {rows.map((row) => (
        <View className="card" key={row.applicationId}>
          <Text className="subtitle">{row.eventName}</Text>
          <Text className="description">{row.organizationName}</Text>
          <View className="journey-steps">
            {stages.map((stage, index) => (
              <View
                key={stage}
                className={`journey-step ${index <= stages.indexOf(row.stage) ? 'reached' : ''}`}
              >
                <Text className="journey-number">{index + 1}</Text>
                <Text>{names[index]}</Text>
                <Text className="description">
                  {index < stages.indexOf(row.stage) ||
                  row.stage === 'PERMITTED'
                    ? '已完成'
                    : index === stages.indexOf(row.stage)
                      ? '当前阶段'
                      : '未开始'}
                </Text>
              </View>
            ))}
          </View>
          <Text className="description">
            申请：{hostingStatusLabel(row.applicationStatus)} · 材料：
            {row.materialStatus
              ? hostingStatusLabel(row.materialStatus)
              : '待提交'}
          </Text>
          {row.stage === 'CONTRACT' && (
            <Text className="warning">
              材料已通过，正在等待线下合同签订。签好后由总部工作人员确认批准办赛。
            </Text>
          )}
          {row.permit && (
            <View>
              <Text className="success">已批准办赛</Text>
              <Text className="description">
                确认时间：{new Date(row.permit.confirmedAt).toLocaleString()}
              </Text>
              <Text className="description">
                操作人：{row.permit.confirmedBy}
              </Text>
            </View>
          )}
          {row.canConfirm && (
            <Button
              type="primary"
              disabled={!!busy || !!error}
              loading={busy === row.materialApplicationId}
              onClick={() => void confirm(row)}
            >
              确认合同已签订，批准办赛
            </Button>
          )}
          <Button
            onClick={() =>
              setExpanded(
                expanded === row.applicationId ? '' : row.applicationId,
              )
            }
          >
            {expanded === row.applicationId ? '收起办理记录' : '查看办理记录'}
          </Button>
          {expanded === row.applicationId &&
            row.history.map((action) => (
              <View className="journey-history" key={action.id}>
                <Text>
                  {hostingActionLabel(action.action)} ·{' '}
                  {new Date(action.occurredAt).toLocaleString()}
                </Text>
                {typeof (action.detail as { reason?: unknown }).reason ===
                  'string' && (
                  <Text className="warning">
                    {String((action.detail as { reason: string }).reason)}
                  </Text>
                )}
                <Text className="description">操作人：{action.actorId}</Text>
              </View>
            ))}
        </View>
      ))}
    </View>
  );
}
