import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import { ApiError, type components } from '@caau/api-client';
import { client } from '../materials/client';
import { useAuth } from '../auth/AuthContext';

type Staff = components['schemas']['EventStaffViewDto'];
type Profile = components['schemas']['EventStaffProfileDto'];
type History = components['schemas']['EventStaffHistoryDto'];
const roles = [
  '裁判',
  '记录台',
  '技术代表',
  '赛事执行',
  '场地保障',
  '医疗',
  '摄影摄像',
  '志愿者',
  '其他',
];
const blank: Profile = {
  name: '',
  roles: [],
  duties: '',
  contactPhone: '',
  organization: '',
  notes: '',
};
function message(error: unknown) {
  if (error instanceof ApiError && error.status === 409)
    return '资料已被修改或请求内容冲突，请保留当前输入，关闭后刷新核对。';
  if (error instanceof ApiError && error.status === 403)
    return '当前账号没有此赛事的人员管理权限。';
  return '操作未完成，请检查网络后重试；当前输入已保留。';
}
export function StaffManagementPanel({ eventId }: { eventId: string }) {
  const auth = useAuth();
  const token =
    auth.mode === 'local'
      ? (sessionStorage.getItem('caau.local-test-session') ?? '')
      : '';
  const [rows, setRows] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string>();
  const [status, setStatus] = useState('active');
  const [editor, setEditor] = useState<{ id: string; row?: Staff }>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [history, setHistory] = useState<{
    name: string;
    rows: History[];
    loading: boolean;
    error: string;
  }>();
  const [form] = Form.useForm<Profile>();
  useEffect(() => {
    let alive = true;
    setRows([]);
    setError('');
    if (!eventId) return;
    setLoading(true);
    void client
      .request('listEventStaff', { token, path: { eventId } })
      .then((value) => {
        if (alive) setRows(value);
      })
      .catch((e) => {
        if (alive) setError(message(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [eventId, token, attempt]);
  function edit(row?: Staff) {
    setSaveError('');
    form.setFieldsValue(row?.profile ?? blank);
    setEditor({ id: row?.id ?? crypto.randomUUID(), row });
  }
  async function save() {
    if (!editor || saving) return;
    const profile = await form.validateFields().catch(() => undefined);
    if (!profile) return;
    setSaving(true);
    setSaveError('');
    try {
      if (editor.row)
        await client.request('updateEventStaff', {
          token,
          path: { eventId, id: editor.id },
          body: {
            profile,
            expectedRevision: editor.row.revision,
            active: editor.row.active,
          },
        });
      else
        await client.request('createEventStaff', {
          token,
          path: { eventId },
          body: { id: editor.id, profile },
        });
      setEditor(undefined);
      setAttempt((v) => v + 1);
    } catch (e) {
      setSaveError(message(e));
    } finally {
      setSaving(false);
    }
  }
  async function toggle(row: Staff) {
    setSaving(true);
    setError('');
    try {
      await client.request('updateEventStaff', {
        token,
        path: { eventId, id: row.id },
        body: {
          expectedRevision: row.revision,
          profile: row.profile,
          active: !row.active,
        },
      });
      setAttempt((v) => v + 1);
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(false);
    }
  }
  async function showHistory(row: Staff) {
    setHistory({ name: row.profile.name, rows: [], loading: true, error: '' });
    try {
      const versions = await client.request('getEventStaffHistory', {
        token,
        path: { eventId, id: row.id },
      });
      setHistory({
        name: row.profile.name,
        rows: versions,
        loading: false,
        error: '',
      });
    } catch (e) {
      setHistory({
        name: row.profile.name,
        rows: [],
        loading: false,
        error: message(e),
      });
    }
  }
  const filtered = rows.filter(
    (r) =>
      (status === 'all' || r.active === (status === 'active')) &&
      (!role || r.profile.roles.includes(role)) &&
      `${r.profile.name} ${r.profile.contactPhone} ${r.profile.organization}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  return (
    <section className="competition-panel staff-panel">
      <header>
        <div>
          <span className="competition-kicker">EVENT STAFF</span>
          <h2>人员管理</h2>
          <p>登记本赛事工作人员，供单场比赛选择；人员资料不创建登录账号。</p>
        </div>
        <Button
          type="primary"
          disabled={!eventId || loading || saving || !!error}
          onClick={() => edit()}
        >
          新增人员
        </Button>
      </header>
      {error && <Alert type="error" showIcon title={error} />}
      <div className="team-toolbar">
        <Input.Search
          aria-label="搜索工作人员"
          placeholder="搜索姓名、电话或单位"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
        />
        <Space wrap>
          <Select
            aria-label="筛选岗位"
            placeholder="全部岗位"
            allowClear
            value={role}
            onChange={setRole}
            options={[
              ...new Set([...roles, ...rows.flatMap((r) => r.profile.roles)]),
            ].map((value) => ({ value, label: value }))}
            style={{ minWidth: 120 }}
          />
          <Select
            aria-label="人员状态"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'active', label: '在岗人员' },
              { value: 'inactive', label: '已停用' },
              { value: 'all', label: '全部状态' },
            ]}
          />
          <Button
            disabled={loading || saving}
            onClick={() => setAttempt((v) => v + 1)}
          >
            刷新
          </Button>
        </Space>
      </div>
      <Table<Staff>
        rowKey="id"
        dataSource={filtered}
        loading={loading}
        scroll={{ x: 850 }}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                error
                  ? '暂时无法读取名单'
                  : !eventId
                    ? '请先选择赛事'
                    : '暂无符合条件的人员'
              }
            />
          ),
        }}
        columns={[
          {
            title: '姓名',
            render: (_, r) => <strong>{r.profile.name}</strong>,
          },
          {
            title: '岗位',
            render: (_, r) =>
              r.profile.roles.map((value) => <Tag key={value}>{value}</Tag>),
          },
          {
            title: '联系电话',
            render: (_, r) => r.profile.contactPhone || '—',
          },
          {
            title: '所属单位',
            render: (_, r) => r.profile.organization || '—',
          },
          {
            title: '状态',
            render: (_, r) => (
              <Tag color={r.active ? 'green' : 'default'}>
                {r.active ? '在岗' : '已停用'}
              </Tag>
            ),
          },
          {
            title: '操作',
            width: 220,
            render: (_, r) => (
              <Space wrap>
                <Button
                  type="link"
                  disabled={saving || !!error}
                  onClick={() => edit(r)}
                >
                  编辑
                </Button>
                <Button
                  type="link"
                  disabled={history?.loading}
                  onClick={() => void showHistory(r)}
                >
                  历史
                </Button>
                <Button
                  type="link"
                  danger={r.active}
                  disabled={saving || !!error}
                  onClick={() =>
                    Modal.confirm({
                      title: `${r.active ? '停用' : '恢复'}人员“${r.profile.name}”？`,
                      content:
                        '仅影响本赛事后续选人，已记录的场次与历史保持不变。',
                      okText: '确认',
                      cancelText: '取消',
                      onOk: () => toggle(r),
                    })
                  }
                >
                  {r.active ? '停用' : '恢复'}
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editor?.row ? '编辑工作人员' : '新增工作人员'}
        open={!!editor}
        okText="保存人员"
        cancelText="取消"
        confirmLoading={saving}
        closable={!saving}
        cancelButtonProps={{ disabled: saving }}
        maskClosable={false}
        onCancel={() => {
          if (!saving) setEditor(undefined);
        }}
        onOk={() => void save()}
      >
        {saveError && <Alert type="error" showIcon title={saveError} />}
        <Form form={form} layout="vertical" disabled={saving}>
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, whitespace: true, max: 80 }]}
          >
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item
            name="roles"
            label="岗位"
            rules={[{ required: true, type: 'array', min: 1, max: 10 }]}
          >
            <Select
              mode="tags"
              options={roles.map((value) => ({ value, label: value }))}
            />
          </Form.Item>
          <Form.Item
            name="contactPhone"
            label="联系电话"
            rules={[
              {
                pattern: /^[+\d][\d\s()-]{5,39}$/,
                message: '请填写有效电话号码',
              },
            ]}
          >
            <Input maxLength={40} />
          </Form.Item>
          <Form.Item name="organization" label="所属单位">
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="duties" label="职责说明">
            <Input.TextArea maxLength={1000} />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>
      <Drawer
        title={`${history?.name ?? ''} · 变更历史`}
        open={!!history}
        onClose={() => {
          if (!history?.loading) setHistory(undefined);
        }}
      >
        <Table<History>
          rowKey="revision"
          loading={history?.loading}
          dataSource={history?.rows ?? []}
          pagination={false}
          columns={[
            { title: '版本', render: (_, r) => `V${r.revision}` },
            {
              title: '资料',
              render: (_, r) => (
                <>
                  <strong>{r.profile.name}</strong>
                  <p>
                    {r.profile.roles.join('、')} ·{' '}
                    {r.active ? '在岗' : '已停用'}
                  </p>
                  <p>
                    {r.profile.organization} {r.profile.contactPhone}
                  </p>
                  <p>{r.profile.duties}</p>
                  <p>{r.profile.notes}</p>
                  <small>
                    {new Date(r.createdAt).toLocaleString('zh-CN', {
                      timeZone: 'Asia/Shanghai',
                    })}
                    <br />
                    操作人：{r.actorName}
                  </small>
                </>
              ),
            },
          ]}
        />
        {history?.error && <Alert type="error" title={history.error} />}
      </Drawer>
    </section>
  );
}
