import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
} from 'antd';
import { ApiError, type components } from '@caau/api-client';
import { client } from '../materials/client';
import { useAuth } from '../auth/AuthContext';
type Team = components['schemas']['TeamViewDto'];
type Profile = components['schemas']['TeamProfileDto'];
type Organization = components['schemas']['TeamOrganizationDto'];
type Schedule = components['schemas']['ScheduleViewDto'];
type Removal = {
  team: Team;
  scheduled: boolean;
  scheduleStatus: Schedule['status'];
};
const fields: {
  name: keyof Profile;
  label: string;
  required?: boolean;
  max: number;
}[] = [
  { name: 'name', label: '球队名称', required: true, max: 120 },
  { name: 'shortName', label: '球队简称', max: 40 },
  { name: 'contactName', label: '球队负责人', required: true, max: 80 },
  { name: 'contactPhone', label: '联系方式', required: true, max: 40 },
  { name: 'province', label: '所在省份', required: true, max: 60 },
  { name: 'city', label: '所在城市', required: true, max: 60 },
  { name: 'district', label: '区县', max: 60 },
  { name: 'address', label: '详细地址', max: 300 },
  { name: 'clubName', label: '所属俱乐部 / 机构', max: 120 },
  { name: 'introduction', label: '球队简介', max: 2000 },
  { name: 'notes', label: '备注', max: 2000 },
];
const empty = Object.fromEntries(fields.map((f) => [f.name, ''])) as Profile;
function failure(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) return '当前账号没有此范围的球队管理权限。';
    if (error.status === 409)
      return '资料或状态已变化。请保留当前填写内容，关闭窗口并刷新列表后重新修改。';
    if (error.status === 400) return '请检查必填信息和联系方式格式。';
  }
  return '操作未完成，请稍后重试。填写内容已保留。';
}
export function TeamManagementPanel({
  eventId,
  eventName,
}: {
  eventId: string;
  eventName: string;
}) {
  const auth = useAuth();
  const token =
    auth.mode === 'local'
      ? (sessionStorage.getItem('caau.local-test-session') ?? '')
      : '';
  const [tab, setTab] = useState('event');
  const [teams, setTeams] = useState<Team[]>([]);
  const [entries, setEntries] = useState<Team[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [eventError, setEventError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [participation, setParticipation] = useState('active');
  const [removing, setRemoving] = useState<Removal | null>(null);
  const [checkingRemovalId, setCheckingRemovalId] = useState('');
  const [removeError, setRemoveError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<{
    id: string;
    scope: string;
    row?: Team;
  } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkId, setLinkId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form] = Form.useForm<
    Profile & { organizationId: string; active: boolean }
  >();
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    setEventError('');
    setTeams([]);
    setEntries([]);
    setOrganizations([]);
    void Promise.allSettled([
      client.request('listTeams', { token }),
      client.request('listTeamOrganizations', { token }),
      eventId
        ? client.request('listEventTeams', { token, path: { eventId } })
        : Promise.resolve([] as Team[]),
    ]).then(([master, orgs, event]) => {
      if (!alive) return;
      if (master.status === 'fulfilled') setTeams(master.value);
      else setError(failure(master.reason));
      if (orgs.status === 'fulfilled') setOrganizations(orgs.value);
      else setError(failure(orgs.reason));
      if (event.status === 'fulfilled') setEntries(event.value);
      else setEventError(failure(event.reason));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [eventId, token, attempt]);
  function edit(row?: Team) {
    setSaveError('');
    setEditor({
      id: row?.id ?? crypto.randomUUID(),
      scope: tab,
      ...(row ? { row } : {}),
    });
    form.setFieldsValue({
      ...empty,
      ...row?.profile,
      organizationId: organizations[0]?.id ?? '',
      active: row?.active ?? true,
    });
  }
  async function save() {
    if (!editor || saving) return;
    const values = await form
      .validateFields()
      .catch((error: { errorFields?: { name: string[] }[] }) => {
        const first = error.errorFields?.[0];
        if (first) form.scrollToField(first.name, { focus: true });
        return null;
      });
    if (!values) return;
    setSaving(true);
    setSaveError('');
    const profile = Object.fromEntries(
      fields.map((f) => [f.name, values[f.name]?.trim() ?? '']),
    ) as Profile;
    try {
      if (editor.row) {
        const body = {
          profile,
          active: values.active ?? editor.row.active,
          expectedRevision: editor.row.revision,
        };
        if (editor.scope === 'event')
          await client.request('updateEventTeam', {
            token,
            path: { eventId, id: editor.id },
            body,
          });
        else
          await client.request('updateTeam', {
            token,
            path: { id: editor.id },
            body,
          });
      } else
        await client.request('createTeam', {
          token,
          body: {
            id: editor.id,
            organizationId: values.organizationId,
            profile,
            ...(editor.scope === 'event' ? { eventId } : {}),
          },
        });
      setEditor(null);
      setAttempt((v) => v + 1);
    } catch (cause) {
      setSaveError(failure(cause));
    } finally {
      setSaving(false);
    }
  }
  async function link() {
    if (!linkId || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await client.request('addEventTeam', {
        token,
        path: { eventId },
        body: { teamId: linkId },
      });
      setLinkOpen(false);
      setAttempt((v) => v + 1);
    } catch (cause) {
      setSaveError(failure(cause));
    } finally {
      setSaving(false);
    }
  }
  async function prepareRemoval(team: Team) {
    if (checkingRemovalId || saving) return;
    setCheckingRemovalId(team.id);
    setRemoveError('');
    setNotice('');
    try {
      const schedule = await client.request('getEventSchedule', {
        token,
        path: { eventId },
      });
      setRemoving({
        team,
        scheduleStatus: schedule.status,
        scheduled:
          schedule.exists &&
          schedule.matches.some(
            (match) =>
              match.homeEventTeamId === team.id ||
              match.awayEventTeamId === team.id,
          ),
      });
    } catch (cause) {
      setEventError(
        cause instanceof ApiError && cause.status === 403
          ? '当前账号已无此赛事的球队管理权限，无法检查赛程影响。'
          : '暂时无法检查球队是否已进入赛程，请刷新后再试。',
      );
    } finally {
      setCheckingRemovalId('');
    }
  }
  async function remove() {
    if (!removing || saving) return;
    setSaving(true);
    setRemoveError('');
    try {
      await client.request('updateEventTeam', {
        token,
        path: { eventId, id: removing.team.id },
        body: {
          profile: removing.team.profile,
          active: false,
          expectedRevision: removing.team.revision,
        },
      });
      setNotice(
        `已将“${removing.team.profile.name}”移出本赛事，可在“已退出”中查看。`,
      );
      setRemoving(null);
      setAttempt((value) => value + 1);
    } catch (cause) {
      setRemoveError(
        cause instanceof ApiError && cause.status === 409
          ? '球队资料或状态已变化，请取消并刷新列表，核对后重新操作。'
          : cause instanceof ApiError && cause.status === 403
            ? '当前账号已无此赛事的球队管理权限，请取消并刷新列表。'
            : '未能确认移出结果，请取消并刷新列表核对后再试。',
      );
    } finally {
      setSaving(false);
    }
  }
  const rows = (tab === 'event' ? entries : teams).filter(
    (row) =>
      (tab !== 'event' ||
        participation === 'all' ||
        row.active === (participation === 'active')) &&
      Object.values(row.profile).some((value) =>
        value.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
      ),
  );
  const name = Form.useWatch('name', form);
  const duplicate = teams.some(
    (row) => row.id !== editor?.id && row.profile.name.trim() === name?.trim(),
  );
  return (
    <section className="competition-panel team-panel">
      <header>
        <div>
          <span className="competition-kicker">TEAM MANAGEMENT</span>
          <h2>球队管理</h2>
          <p>记录每支球队，留存每场比赛的独立资料。</p>
        </div>
      </header>
      <Tabs
        activeKey={tab}
        onChange={(key) => {
          setTab(key);
          setSearch('');
        }}
        items={[
          { key: 'event', label: '本赛事球队' },
          { key: 'master', label: '球队档案' },
        ]}
      />
      <Alert
        type="info"
        showIcon
        title={
          tab === 'event'
            ? '本页修改仅用于当前比赛，不影响球队档案或其他比赛。'
            : '球队档案独立维护，修改后不会自动同步到已参加的比赛。'
        }
      />
      {(error || (tab === 'event' && eventError)) && (
        <Alert type="error" showIcon title={error || eventError} />
      )}
      {notice && <Alert type="success" showIcon title={notice} />}
      <div className="team-toolbar">
        <Input.Search
          aria-label="搜索球队"
          placeholder="搜索球队、负责人、城市"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
        />
        <Space wrap>
          {tab === 'event' && (
            <Select
              aria-label="参赛状态"
              value={participation}
              onChange={setParticipation}
              style={{ minWidth: 120 }}
              options={[
                { value: 'active', label: '参赛中' },
                { value: 'inactive', label: '已退出' },
                { value: 'all', label: '全部状态' },
              ]}
            />
          )}
          <Button onClick={() => setAttempt((v) => v + 1)} disabled={loading}>
            刷新
          </Button>
          {tab === 'event' && (
            <Button
              disabled={!eventId || loading || !!eventError || !!error}
              onClick={() => {
                setLinkId(undefined);
                setSaveError('');
                setLinkOpen(true);
              }}
            >
              从档案添加
            </Button>
          )}
          <Button
            type="primary"
            disabled={
              loading ||
              !organizations.length ||
              !!error ||
              (tab === 'event' && (!eventId || !!eventError))
            }
            onClick={() => edit()}
          >
            录入球队
          </Button>
        </Space>
      </div>
      <Table<Team>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        scroll={{ x: 760 }}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                error || (tab === 'event' && eventError)
                  ? '请处理上方提示后重试'
                  : tab === 'event' && !eventId
                    ? '请先选择赛事'
                    : tab === 'event' && participation === 'inactive'
                      ? '暂无已退出球队'
                      : '暂无球队，可手动录入资料'
              }
            />
          ),
        }}
        columns={[
          {
            title: '球队名称',
            dataIndex: ['profile', 'name'],
            render: (_, row) => (
              <>
                <strong>{row.profile.name}</strong>
                <div className="team-secondary">
                  {row.profile.clubName || '独立球队'}
                </div>
              </>
            ),
          },
          { title: '负责人', dataIndex: ['profile', 'contactName'] },
          { title: '联系方式', dataIndex: ['profile', 'contactPhone'] },
          {
            title: '所在城市',
            render: (_, row) => `${row.profile.province} · ${row.profile.city}`,
          },
          {
            title: '状态',
            render: (_, row) => (
              <>
                <Tag color={row.active ? 'green' : 'default'}>
                  {row.active
                    ? tab === 'event'
                      ? '参赛中'
                      : '正常'
                    : tab === 'event'
                      ? '已退出'
                      : '已归档'}
                </Tag>
                {tab === 'master' && (
                  <div className="team-secondary">
                    {row.bound ? '已绑定账号' : '未绑定账号'}
                  </div>
                )}
              </>
            ),
          },
          {
            title: '操作',
            render: (_, row) => (
              <Space wrap>
                <Button
                  type="link"
                  disabled={!row.canEdit}
                  onClick={() => edit(row)}
                >
                  编辑资料
                </Button>
                {tab === 'event' && row.active && (
                  <Button
                    type="link"
                    danger
                    loading={checkingRemovalId === row.id}
                    disabled={
                      !row.canEdit ||
                      loading ||
                      !!checkingRemovalId ||
                      !!eventError ||
                      !!error
                    }
                    onClick={() => void prepareRemoval(row)}
                  >
                    移出本赛事
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />
      <Modal
        open={!!removing}
        title="移出本赛事"
        okText="确认移出"
        cancelText="取消"
        okButtonProps={{ danger: true, disabled: !!removeError }}
        confirmLoading={saving}
        cancelButtonProps={{ disabled: saving }}
        closable={!saving}
        maskClosable={false}
        onOk={() => void remove()}
        onCancel={() => {
          if (!saving) setRemoving(null);
        }}
      >
        <p>
          确认将球队“{removing?.team.profile.name}”移出赛事“
          {eventName || eventId}”？
        </p>
        <p>只移出当前赛事，不删除球队档案和历史。</p>
        {removing?.scheduled ? (
          <Alert
            type="warning"
            showIcon
            title={`该球队已进入${removing.scheduleStatus === 'PUBLISHED' ? '已发布' : '当前候选'}赛程`}
            description="确认移出后，现有赛程和已发布历史不会被删除或改写，但当前赛程会提示球队不可用；重新编排或处理冲突前不能再次发布。"
          />
        ) : (
          <Alert
            type="info"
            showIcon
            title="当前赛程未使用该球队"
            description="移出操作仍只改变本赛事球队状态，不影响其他赛事或球队档案。"
          />
        )}
        {removeError && <Alert type="error" showIcon title={removeError} />}
      </Modal>
      <Modal
        open={!!editor}
        title={
          editor?.row
            ? editor.scope === 'event'
              ? '编辑本赛事球队资料'
              : '编辑球队档案'
            : '录入球队'
        }
        onCancel={() => {
          if (!saving) setEditor(null);
        }}
        onOk={() => void save()}
        confirmLoading={saving}
        cancelButtonProps={{ disabled: saving }}
        closable={!saving}
        maskClosable={false}
        okText="保存"
        cancelText="取消"
        width={700}
        styles={{
          body: { maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 },
        }}
      >
        <p>
          {editor?.scope === 'event'
            ? '保存的赛事资料独立使用，不会同步其他比赛。'
            : '更新球队档案不会改变任何比赛中已保存的资料。'}
        </p>
        {saveError && <Alert type="error" title={saveError} showIcon />}
        {duplicate && (
          <Alert
            type="warning"
            title="已有同名球队，请核对是否重复录入；同名不代表同一支球队。"
            showIcon
          />
        )}
        <Form form={form} layout="vertical" disabled={saving}>
          {!editor?.row && (
            <Form.Item
              name="organizationId"
              label="录入机构"
              rules={[{ required: true, message: '请选择录入机构' }]}
            >
              <Select
                options={organizations.map((o) => ({
                  value: o.id,
                  label: o.name,
                }))}
              />
            </Form.Item>
          )}
          <div className="team-form-grid">
            {fields.map((field) => (
              <Form.Item
                className={
                  ['introduction', 'notes', 'address', 'clubName'].includes(
                    field.name,
                  )
                    ? 'team-form-wide'
                    : ''
                }
                key={field.name}
                name={field.name}
                label={field.label}
                rules={[
                  {
                    required: field.required,
                    whitespace: true,
                    message: `请填写${field.label}`,
                  },
                  ...(field.name === 'contactPhone'
                    ? [
                        {
                          pattern: /^[+\d][\d\s()-]{5,39}$/,
                          message: '请输入有效联系方式',
                        },
                      ]
                    : []),
                ]}
              >
                {['introduction', 'notes'].includes(field.name) ? (
                  <Input.TextArea rows={3} maxLength={field.max} showCount />
                ) : (
                  <Input maxLength={field.max} />
                )}
              </Form.Item>
            ))}
          </div>
          {editor?.row && (
            <Form.Item
              name="active"
              hidden={editor.scope === 'event' && editor.row.active}
              label={
                editor.scope === 'event' ? '继续参加本赛事' : '球队档案启用'
              }
              valuePropName="checked"
            >
              <Switch checkedChildren="是" unCheckedChildren="否" />
            </Form.Item>
          )}
        </Form>
      </Modal>
      <Modal
        open={linkOpen}
        title="从球队档案添加到本赛事"
        okText="添加"
        cancelText="取消"
        confirmLoading={saving}
        okButtonProps={{ disabled: !linkId }}
        cancelButtonProps={{ disabled: saving }}
        closable={!saving}
        maskClosable={false}
        onOk={() => void link()}
        onCancel={() => {
          if (!saving) setLinkOpen(false);
        }}
      >
        <p>添加时复制当前档案。以后档案更新，本赛事资料保持不变。</p>
        {saveError && <Alert type="error" title={saveError} />}
        <Select
          aria-label="选择球队档案"
          style={{ width: '100%' }}
          showSearch
          optionFilterProp="label"
          value={linkId}
          onChange={setLinkId}
          placeholder="选择已有球队"
          options={teams
            .filter((t) => t.active && !entries.some((e) => e.teamId === t.id))
            .map((t) => ({
              value: t.id,
              label: `${t.profile.name} · ${t.profile.city} · ${t.profile.contactName}`,
            }))}
        />
      </Modal>
    </section>
  );
}
