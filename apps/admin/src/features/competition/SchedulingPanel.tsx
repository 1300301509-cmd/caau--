import { useEffect, useReducer } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tag,
} from 'antd';
import { ApiError, type components } from '@caau/api-client';
import { client } from '../materials/client';
import { useAuth } from '../auth/AuthContext';
import { ScheduleWeek } from './ScheduleWeek';
import { useAgentWindow } from '../agent/AgentHost';

type Schedule = components['schemas']['ScheduleViewDto'];
type EventTeam = components['schemas']['TeamViewDto'];
type Match = components['schemas']['ScheduleMatchDto'];
type Config = components['schemas']['ScheduleConfigDto'];
type FormValues = Config & {
  format: 'ROUND_ROBIN' | 'SINGLE_ELIMINATION';
};
type State = {
  loading: boolean;
  saving: boolean;
  error: string;
  schedule?: Schedule;
  teams: EventTeam[];
  editor?: Match;
};
type Action =
  | { type: 'loading' }
  | { type: 'loaded'; schedule: Schedule; teams: EventTeam[] }
  | { type: 'error'; message: string }
  | { type: 'saving'; value: boolean }
  | { type: 'schedule'; value: Schedule }
  | { type: 'editor'; value?: Match };
const initial: State = {
  loading: true,
  saving: false,
  error: '',
  teams: [],
};
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loading':
      return { ...state, loading: true, error: '' };
    case 'loaded':
      return { ...state, loading: false, error: '', ...action };
    case 'error':
      return { ...state, loading: false, saving: false, error: action.message };
    case 'saving':
      return { ...state, saving: action.value, error: '' };
    case 'schedule':
      return {
        ...state,
        schedule: action.value,
        saving: false,
        editor: undefined,
      };
    case 'editor':
      return { ...state, editor: action.value, error: '' };
  }
}
function errorMessage(cause: unknown) {
  if (cause instanceof ApiError) {
    if (cause.status === 403) return '当前账号没有这场赛事的赛程管理权限。';
    if (cause.status === 409)
      return '赛程已变化，或仍存在不能发布的冲突。请刷新后核对。';
    if (cause.status === 400) return '编排条件不完整或格式不正确，请检查表单。';
  }
  return '赛程操作未完成，请稍后重试。';
}
function localDateTime(value: string) {
  if (!value) return '';
  return new Date(Date.parse(value) + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
}
function isoDateTime(value: string) {
  return new Date(`${value}:00+08:00`).toISOString();
}
function defaultDate() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function SchedulingPanel({ eventId }: { eventId: string }) {
  const auth = useAuth();
  const assistant = useAgentWindow();
  const token =
    auth.mode === 'local'
      ? (sessionStorage.getItem('caau.local-test-session') ?? '')
      : '';
  const [state, dispatch] = useReducer(reducer, initial);
  const roles = auth.identity?.roles ?? [];
  const canDraftAdjust = roles.some((role) =>
    ['HEADQUARTERS_SUPER_ADMIN', 'EVENT_MANAGER', 'ORGANIZER'].includes(role),
  );
  const canPublish = roles.some((role) =>
    ['HEADQUARTERS_SUPER_ADMIN', 'EVENT_MANAGER', 'ORGANIZER'].includes(role),
  );
  const [form] = Form.useForm<FormValues>();
  const [editForm] = Form.useForm<{ startAt: string; venue: string }>();
  async function load() {
    if (!eventId) {
      dispatch({ type: 'error', message: '请先选择赛事。' });
      return;
    }
    dispatch({ type: 'loading' });
    try {
      const schedule = await client.request('getEventSchedule', {
        token,
        path: { eventId },
      });
      const teams = canDraftAdjust
        ? await client
            .request('listEventTeams', { token, path: { eventId } })
            .catch((cause) => {
              if (cause instanceof ApiError && cause.status === 403) return [];
              throw cause;
            })
        : [];
      dispatch({ type: 'loaded', schedule, teams });
      const activeIds = teams
        .filter((item) => item.active)
        .map((item) => item.id);
      form.setFieldsValue(
        schedule.exists
          ? { ...schedule.config, format: schedule.format }
          : {
              format: 'ROUND_ROBIN',
              teamIds: activeIds,
              venues: ['主场地'],
              startDate: defaultDate(),
              endDate: defaultDate(),
              dailyStart: '09:00',
              dailyEnd: '18:00',
              durationMinutes: 40,
              bufferMinutes: 10,
              minRestMinutes: 60,
            },
      );
    } catch (cause) {
      dispatch({ type: 'error', message: errorMessage(cause) });
    }
  }
  useEffect(() => {
    void load();
    const refresh = (event: Event) => {
      if (
        (event as CustomEvent<{ eventId: string }>).detail.eventId === eventId
      )
        void load();
    };
    window.addEventListener('caau:schedule-changed', refresh);
    return () => window.removeEventListener('caau:schedule-changed', refresh);
  }, [eventId, token]);

  async function generate() {
    const values = await form.validateFields().catch(() => undefined);
    if (!values) return;
    dispatch({ type: 'saving', value: true });
    try {
      const schedule = await client.request('generateEventSchedule', {
        token,
        path: { eventId },
        body: {
          commandId: crypto.randomUUID(),
          format: values.format,
          config: {
            teamIds: values.teamIds,
            venues: values.venues,
            startDate: values.startDate,
            endDate: values.endDate,
            dailyStart: values.dailyStart,
            dailyEnd: values.dailyEnd,
            durationMinutes: values.durationMinutes,
            bufferMinutes: values.bufferMinutes,
            minRestMinutes: values.minRestMinutes,
          },
        },
      });
      dispatch({ type: 'schedule', value: schedule });
    } catch (cause) {
      dispatch({ type: 'error', message: errorMessage(cause) });
    }
  }
  function edit(match: Match) {
    editForm.setFieldsValue({
      startAt: localDateTime(match.startAt),
      venue: match.venue,
    });
    dispatch({ type: 'editor', value: match });
  }
  async function saveMatch() {
    if (!state.editor || !state.schedule) return;
    const values = await editForm.validateFields().catch(() => undefined);
    if (!values) return;
    dispatch({ type: 'saving', value: true });
    try {
      const schedule = await client.request('adjustEventScheduleMatch', {
        token,
        path: { eventId, matchId: state.editor.id },
        body: {
          commandId: crypto.randomUUID(),
          expectedRevision: state.schedule.revision,
          startAt: isoDateTime(values.startAt),
          venue: values.venue,
        },
      });
      dispatch({ type: 'schedule', value: schedule });
    } catch (cause) {
      dispatch({ type: 'error', message: errorMessage(cause) });
    }
  }
  async function publish() {
    if (!state.schedule) return;
    dispatch({ type: 'saving', value: true });
    try {
      const schedule = await client.request('publishEventSchedule', {
        token,
        path: { eventId },
        body: {
          commandId: crypto.randomUUID(),
          expectedRevision: state.schedule.revision,
        },
      });
      dispatch({ type: 'schedule', value: schedule });
    } catch (cause) {
      dispatch({ type: 'error', message: errorMessage(cause) });
    }
  }
  const teamOptions = state.teams
    .filter((team) => team.active)
    .map((team) => ({ label: team.profile.name, value: team.id }));
  const schedule = state.schedule;
  return (
    <section className="competition-panel schedule-panel">
      <header>
        <div>
          <span className="competition-kicker">SCHEDULE</span>
          <h2>赛程编排</h2>
          <p>设置约束并生成候选赛程，人工核对后再发布。</p>
        </div>
        {schedule?.exists && (
          <Tag color={schedule.status === 'PUBLISHED' ? 'green' : 'gold'}>
            {schedule.status === 'PUBLISHED' ? '已发布' : '待发布'} · V
            {schedule.revision}
          </Tag>
        )}
      </header>
      {!canDraftAdjust && (
        <Alert
          type="info"
          showIcon
          title="当前身份为赛程只读权限，不能生成、调整或发布。"
        />
      )}
      {state.error && (
        <Alert
          type="error"
          showIcon
          title={state.error}
          action={
            <Button size="small" onClick={() => void load()}>
              刷新
            </Button>
          }
        />
      )}
      <Button disabled={!eventId} onClick={() => assistant.open(eventId)}>
        在 CAAU 智能助手中调整单场赛程
      </Button>
      <div className="schedule-layout">
        <details className="schedule-settings" open={!schedule?.exists}>
          <summary>编排条件 · 点击展开或收起</summary>
          <Form<FormValues>
            form={form}
            layout="vertical"
            className="schedule-config"
            disabled={state.loading || state.saving || !canDraftAdjust}
            onFinish={() => void generate()}
          >
            <h3>编排条件</h3>
            <Form.Item
              name="format"
              label="比赛方式"
              rules={[{ required: true }]}
            >
              <Select
                options={[
                  { value: 'ROUND_ROBIN', label: '单循环' },
                  { value: 'SINGLE_ELIMINATION', label: '单败淘汰' },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="teamIds"
              label="参赛球队"
              rules={[
                {
                  required: true,
                  type: 'array',
                  min: 2,
                  message: '至少选择两支球队',
                },
              ]}
            >
              <Checkbox.Group
                options={teamOptions}
                className="schedule-team-options"
              />
            </Form.Item>
            <Form.Item
              name="venues"
              label="比赛场地"
              rules={[{ required: true, message: '请至少填写一个场地' }]}
            >
              <Select
                mode="tags"
                tokenSeparators={[',', '，']}
                placeholder="输入场地后回车"
              />
            </Form.Item>
            <div className="schedule-form-grid">
              <Form.Item
                name="startDate"
                label="开始日期"
                rules={[{ required: true }]}
              >
                <Input type="date" />
              </Form.Item>
              <Form.Item
                name="endDate"
                label="结束日期"
                rules={[{ required: true }]}
              >
                <Input type="date" />
              </Form.Item>
              <Form.Item
                name="dailyStart"
                label="每日开始"
                rules={[{ required: true }]}
              >
                <Input type="time" />
              </Form.Item>
              <Form.Item
                name="dailyEnd"
                label="每日结束"
                rules={[{ required: true }]}
              >
                <Input type="time" />
              </Form.Item>
              <Form.Item
                name="durationMinutes"
                label="每场分钟"
                rules={[{ required: true }]}
              >
                <InputNumber min={10} max={240} />
              </Form.Item>
              <Form.Item
                name="bufferMinutes"
                label="换场缓冲"
                rules={[{ required: true }]}
              >
                <InputNumber min={0} max={120} />
              </Form.Item>
              <Form.Item
                name="minRestMinutes"
                label="最短休息"
                rules={[{ required: true }]}
              >
                <InputNumber min={0} max={1440} />
              </Form.Item>
            </div>
            <Button
              type="primary"
              htmlType="submit"
              loading={state.saving}
              block
            >
              {schedule?.exists ? '按当前条件重新生成' : '生成候选赛程'}
            </Button>
            <p className="schedule-helper">
              重新生成会建立新版本。已发布方案会回到待发布状态，原发布版本继续保留。
            </p>
          </Form>
        </details>
        <div className="schedule-result" aria-live="polite">
          <div className="schedule-result-heading">
            <div>
              <h3>候选赛程</h3>
              <p>{schedule?.matches.length ?? 0} 场比赛</p>
            </div>
            <Space wrap>
              <Button
                onClick={() => void load()}
                disabled={state.loading || state.saving}
              >
                刷新
              </Button>
              <Button
                type="primary"
                disabled={
                  !canPublish ||
                  !schedule?.exists ||
                  schedule.status === 'PUBLISHED' ||
                  !!schedule.issues.length
                }
                loading={state.saving}
                onClick={() =>
                  Modal.confirm({
                    title: '确认发布当前赛程？',
                    content: '发布后将作为正式赛程版本留存。',
                    okText: '确认发布',
                    cancelText: '取消',
                    onOk: publish,
                  })
                }
              >
                发布赛程
              </Button>
            </Space>
          </div>
          {!!schedule?.issues.length && (
            <Alert
              type="warning"
              showIcon
              title={`当前有 ${schedule.issues.length} 项冲突，处理后才能发布`}
              description={
                <details>
                  <summary>查看冲突明细</summary>
                  <ul className="schedule-issues">
                    {schedule.issues.map((issue, index) => (
                      <li key={`${issue.code}-${index}`}>{issue.message}</li>
                    ))}
                  </ul>
                </details>
              }
            />
          )}
          {schedule?.exists ? (
            <ScheduleWeek
              schedule={schedule}
              disabled={state.loading || state.saving || !canDraftAdjust}
              onEdit={edit}
            />
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                state.loading ? '正在加载赛程' : '设置左侧条件后生成候选赛程'
              }
            />
          )}
        </div>
      </div>
      <Modal
        open={!!state.editor}
        title="调整比赛时间与场地"
        okText="保存调整"
        cancelText="取消"
        confirmLoading={state.saving}
        maskClosable={false}
        onOk={() => void saveMatch()}
        onCancel={() => dispatch({ type: 'editor' })}
      >
        {state.editor && (
          <p>
            {state.editor.homeLabel} vs {state.editor.awayLabel}
          </p>
        )}
        <Form form={editForm} layout="vertical" disabled={state.saving}>
          <Form.Item
            name="startAt"
            label="比赛时间"
            rules={[{ required: true, message: '请选择比赛时间' }]}
          >
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item
            name="venue"
            label="比赛场地"
            rules={[{ required: true, message: '请选择场地' }]}
          >
            <Select
              options={(schedule?.config.venues ?? []).map((venue) => ({
                value: venue,
                label: venue,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}
