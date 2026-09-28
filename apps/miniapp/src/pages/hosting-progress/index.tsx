import { withAgentEntry } from '../../features/agent/AgentEntry';
import {
  WorkflowHeading,
  WorkflowEmptyIcon,
} from '../../features/hosting/WorkflowHeading';
import { useEffect, useRef, useState } from 'react';
import { Button, ScrollView, Text, View } from '@tarojs/components';
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
  hostingStatuses,
  hostingActionLabel,
} from '../../features/hosting/platform';

type Journey = components['schemas']['HostingJourneyDto'];
const stages = ['APPLICATION', 'MATERIALS', 'CONTRACT', 'PERMITTED'];
const names = ['申请审核', '材料审核', '合同签订', '批准办赛'];
function HostingProgress() {
  const [rows, setRows] = useState<Journey[]>([]);
  const [filter, setFilter] = useState('ALL');
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
    <View className="page workflow-page workflow-progress">
      <WorkflowHeading
        title="办赛进度"
        tone="blue"
        note="从申请到批准，每一步都在这里。"
      />
      <View className="workflow-sync">
        <View>
          <Text className="workflow-sync-title">办理动态</Text>
          <Text className="workflow-sync-time">
            {updated ? `自动同步 · 最近更新 ${updated}` : '正在读取进度…'}
          </Text>
        </View>
      </View>
      {error && <Text className="error">{error}</Text>}
      {!rows.length && updated && (
        <View className="card workflow-empty">
          <WorkflowEmptyIcon />
          <Text className="subtitle">暂无办赛申请</Text>
          <Text className="description">
            从“申请比赛”开始办理，提交后可在此查看各阶段进展。
          </Text>
          <Button
            type="primary"
            onClick={() =>
              void Taro.navigateTo({ url: '/pages/hosting/index' })
            }
          >
            申请比赛
          </Button>
        </View>
      )}
      <Text className="subtitle">本机构申请</Text>
      <ScrollView scrollX className="workflow-filter-scroll">
        <View className="hosting-filter">
          <Button
            className={filter === 'ALL' ? 'active' : ''}
            onClick={() => setFilter('ALL')}
          >
            全部
          </Button>
          {hostingStatuses.map((status) => (
            <Button
              key={status.value}
              className={filter === status.value ? 'active' : ''}
              onClick={() => setFilter(status.value)}
            >
              {status.label}
            </Button>
          ))}
        </View>
      </ScrollView>
      {!!rows.length &&
        !rows.some(
          (row) => filter === 'ALL' || row.applicationStatus === filter,
        ) && <Text className="description">当前筛选下暂无申请。</Text>}
      {rows
        .filter((row) => filter === 'ALL' || row.applicationStatus === filter)
        .map((row) => (
          <View className="card workflow-journey-card" key={row.applicationId}>
            <Text
              className={`workflow-status state-${row.applicationStatus.toLowerCase()}`}
            >
              {hostingStatusLabel(row.applicationStatus)}
            </Text>
            <Text className="subtitle">{row.eventName}</Text>
            <Text className="description">{row.organizationName}</Text>
            <Button
              className="workflow-open-application"
              onClick={() =>
                void Taro.navigateTo({
                  url: `/pages/hosting/index?applicationId=${row.applicationId}`,
                })
              }
            >
              {row.applicationStatus === 'DRAFT'
                ? '继续填写'
                : row.applicationStatus === 'NEEDS_SUPPLEMENT'
                  ? '补充申请'
                  : '查看申请'}
            </Button>
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
export default withAgentEntry(HostingProgress);
