import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Switch,
  Table,
  Tag,
} from 'antd';
import { ApiError, type components } from '@caau/api-client';
import { client } from '../materials/client';
import { useAuth } from './AuthContext';
import './accounts.css';

type S = components['schemas'];
type Account = S['AccountSummaryDto'];
type Role = S['AccountMembershipInputDto']['role'];
const roles: Array<{ value: Role; label: string }> = [
  { value: 'HEADQUARTERS_SUPER_ADMIN', label: '总部超级管理员' },
  { value: 'SYSTEM_ADMIN', label: '系统管理员' },
  { value: 'EVENT_MANAGER', label: '赛事管理员' },
  { value: 'REVIEWER', label: '总部审核员' },
  { value: 'ORGANIZER', label: '承办方经办人' },
];
const roleName = Object.fromEntries(
  roles.map((item) => [item.value, item.label]),
);
const errorText = (error: unknown) =>
  error instanceof ApiError && error.status === 409
    ? '操作与当前账号状态冲突，请刷新后重试。'
    : error instanceof ApiError && error.status === 403
      ? '当前账号没有执行此操作的权限。'
      : '操作失败，请稍后重试。';

export function AccountManagementPage() {
  const auth = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [accessId, setAccessId] = useState('');
  const [events, setEvents] = useState<S['EventViewDto'][]>([]);
  const [newOrganization, setNewOrganization] = useState('');
  const [newRole, setNewRole] = useState<Role>('REVIEWER');
  const [grantEvent, setGrantEvent] = useState('');
  const [grantMember, setGrantMember] = useState('');
  const [reset, setReset] = useState<Account>();
  const [busy, setBusy] = useState(false);
  const [createForm] = Form.useForm();
  const [resetForm] = Form.useForm();
  const access = accounts.find((account) => account.id === accessId);
  const organizations = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accounts)
      for (const membership of account.memberships)
        map.set(membership.organizationId, membership.organizationName);
    return [...map].map(([value, label]) => ({ value, label }));
  }, [accounts]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextAccounts, nextEvents] = await Promise.all([
        client.request('listAccounts'),
        client.request('listEvents'),
      ]);
      setAccounts(nextAccounts);
      setEvents(nextEvents);
      setError('');
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const complete = async (success: string, action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      await load();
      setMessage(success);
      return true;
    } catch (reason) {
      setError(errorText(reason));
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!auth.identity?.canManageAccounts)
    return (
      <Alert
        type="error"
        showIcon
        message="无权访问账号管理"
        description="账号管理权限由后端决定。"
      />
    );
  return (
    <section className="account-management">
      {(error || message) && (
        <Alert
          closable
          showIcon
          type={error ? 'error' : 'success'}
          message={error || message}
          onClose={() => {
            setError('');
            setMessage('');
          }}
        />
      )}
      <Card
        title="工作账号"
        extra={
          <Button type="primary" onClick={() => setCreateOpen(true)}>
            创建账号
          </Button>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={accounts}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          scroll={{ x: 900 }}
          columns={[
            {
              title: '账号',
              key: 'account',
              render: (_, account) => (
                <div className="account-name">
                  <strong>{account.displayName}</strong>
                  <span>{account.loginName ?? '未配置登录名'}</span>
                </div>
              ),
            },
            {
              title: '角色与机构',
              key: 'memberships',
              render: (_, account) => (
                <div className="account-tags">
                  {account.memberships.map((membership) => (
                    <Tag
                      key={membership.id}
                      color={membership.active ? 'green' : 'default'}
                    >
                      {membership.organizationName} ·{' '}
                      {roleName[membership.role]}
                    </Tag>
                  ))}
                </div>
              ),
            },
            {
              title: '业务授权',
              key: 'grants',
              render: (_, account) => (
                <span className="account-grants">
                  赛事 {account.eventGrantIds.length} · 承办办理{' '}
                  {account.hostingHandlerGrantId ? 1 : 0} · 承办审核{' '}
                  {account.hostingReviewGrantId ? 1 : 0}
                </span>
              ),
            },
            {
              title: '状态',
              key: 'status',
              render: (_, account) => (
                <div className="account-status">
                  <Tag color={account.active ? 'green' : 'default'}>
                    {account.active ? '启用' : '停用'}
                  </Tag>
                  {account.mustChangePassword && <Tag color="gold">待改密</Tag>}
                </div>
              ),
            },
            {
              title: '操作',
              key: 'actions',
              fixed: 'right',
              width: 180,
              render: (_, account) => (
                <div className="account-row-actions">
                  <Button size="small" onClick={() => setAccessId(account.id)}>
                    权限
                  </Button>
                  <Button
                    size="small"
                    disabled={
                      !account.active || account.id === auth.session?.id
                    }
                    onClick={() => {
                      resetForm.resetFields();
                      setReset(account);
                    }}
                  >
                    重置密码
                  </Button>
                  <Switch
                    checked={account.active}
                    disabled={account.id === auth.session?.id}
                    checkedChildren="启用"
                    unCheckedChildren="停用"
                    onChange={(active) =>
                      Modal.confirm({
                        title: active ? '恢复这个账号？' : '停用这个账号？',
                        content: active
                          ? '恢复后必须重新登录，旧会话不会恢复。'
                          : '停用将立即撤销该账号的全部会话。',
                        okText: active ? '确认恢复' : '确认停用',
                        okButtonProps: { danger: !active },
                        onOk: () =>
                          complete(
                            active
                              ? '账号已恢复。'
                              : '账号已停用并撤销全部会话。',
                            () =>
                              client.request('setUserActive', {
                                path: { id: account.id },
                                body: { active },
                              }),
                          ),
                      })
                    }
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>
      <p className="account-help">
        角色、赛事范围和承办申请权限均通过后端既有授权模型变更，不写入Cookie；每次业务请求都会重新核验。
      </p>
      <Modal
        title={`角色与业务授权${access ? ` · ${access.displayName}` : ''}`}
        open={!!access}
        width={720}
        footer={null}
        onCancel={() => setAccessId('')}
      >
        {access && (
          <div className="account-access-editor">
            <section>
              <h3>组织角色</h3>
              {access.memberships.map((membership) => (
                <div className="access-row" key={membership.id}>
                  <span>
                    <strong>{membership.organizationName}</strong>
                    <small>{roleName[membership.role]}</small>
                  </span>
                  <Switch
                    checked={membership.active}
                    disabled={busy}
                    checkedChildren="启用"
                    unCheckedChildren="停用"
                    onChange={(active) =>
                      void complete('角色状态已更新。', () =>
                        client.request('setMemberActive', {
                          path: { id: membership.id },
                          body: { active },
                        }),
                      )
                    }
                  />
                </div>
              ))}
              <div className="access-add-row">
                <Select
                  aria-label="新增角色机构"
                  placeholder="选择机构"
                  options={organizations}
                  value={newOrganization || undefined}
                  onChange={setNewOrganization}
                />
                <Select
                  aria-label="新增角色"
                  options={roles}
                  value={newRole}
                  onChange={setNewRole}
                />
                <Button
                  disabled={!newOrganization || busy}
                  onClick={() =>
                    void complete('角色已添加。', () =>
                      client.request('createOrganizationMember', {
                        body: {
                          userId: access.id,
                          organizationId: newOrganization,
                          role: newRole,
                        },
                      }),
                    )
                  }
                >
                  添加角色
                </Button>
              </div>
            </section>
            <section>
              <h3>赛事范围</h3>
              {access.eventGrants.length === 0 && (
                <p className="muted">尚未配置赛事范围。</p>
              )}
              {access.eventGrants.map((grant) => (
                <div className="access-row" key={grant.id}>
                  <span>
                    <strong>
                      {grant.eventName ?? `赛事 ${grant.eventId.slice(0, 8)}`}
                    </strong>
                    <small>成员 {grant.memberId.slice(0, 8)}</small>
                  </span>
                  <Switch
                    checked={grant.active}
                    disabled={busy}
                    checkedChildren="启用"
                    unCheckedChildren="停用"
                    onChange={(active) =>
                      void complete('赛事授权已更新。', () =>
                        client.request('setEventGrantActive', {
                          path: { id: grant.id },
                          body: { active },
                        }),
                      )
                    }
                  />
                </div>
              ))}
              <div className="access-add-row">
                <Select
                  aria-label="授权赛事"
                  placeholder="选择赛事"
                  options={events.map((event) => ({
                    value: event.id,
                    label: event.name,
                  }))}
                  value={grantEvent || undefined}
                  onChange={setGrantEvent}
                />
                <Select
                  aria-label="授权成员角色"
                  placeholder="选择角色"
                  options={access.memberships
                    .filter(
                      (membership) =>
                        membership.active &&
                        !['SYSTEM_ADMIN', 'HEADQUARTERS_SUPER_ADMIN'].includes(
                          membership.role,
                        ),
                    )
                    .map((membership) => ({
                      value: membership.id,
                      label: `${membership.organizationName} · ${roleName[membership.role]}`,
                    }))}
                  value={grantMember || undefined}
                  onChange={setGrantMember}
                />
                <Button
                  disabled={!grantEvent || !grantMember || busy}
                  onClick={() =>
                    void complete('赛事授权已添加。', () =>
                      client.request('createEventGrant', {
                        body: { eventId: grantEvent, memberId: grantMember },
                      }),
                    )
                  }
                >
                  添加赛事授权
                </Button>
              </div>
            </section>
            <section>
              <h3>承办申请权限</h3>
              {access.memberships
                .filter((membership) =>
                  ['ORGANIZER', 'REVIEWER'].includes(membership.role),
                )
                .map((membership) => {
                  const handler = membership.role === 'ORGANIZER';
                  const grant = handler
                    ? access.hostingHandlerGrant
                    : access.hostingReviewGrant;
                  const checked =
                    grant?.memberId === membership.id && grant.active;
                  return (
                    <div
                      className="access-row"
                      key={`hosting-${membership.id}`}
                    >
                      <span>
                        <strong>{handler ? '申请办理' : '申请审核'}</strong>
                        <small>
                          {membership.organizationName} ·{' '}
                          {roleName[membership.role]}
                        </small>
                      </span>
                      <Switch
                        checked={checked}
                        disabled={busy}
                        checkedChildren="启用"
                        unCheckedChildren="停用"
                        onChange={(active) =>
                          void complete('承办申请权限已更新。', () =>
                            grant && grant.memberId === membership.id
                              ? client.request(
                                  handler
                                    ? 'HostingController_handlerGrantActive'
                                    : 'HostingController_reviewGrantActive',
                                  { path: { id: grant.id }, body: { active } },
                                )
                              : client.request(
                                  handler
                                    ? 'HostingController_handlerGrant'
                                    : 'HostingController_reviewGrant',
                                  { body: { memberId: membership.id } },
                                ),
                          )
                        }
                      />
                    </div>
                  );
                })}
            </section>
          </div>
        )}
      </Modal>
      <Modal
        title="创建正式账号"
        open={createOpen}
        destroyOnHidden
        okText="创建账号"
        cancelText="取消"
        confirmLoading={busy}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
      >
        <Form
          form={createForm}
          layout="vertical"
          requiredMark={false}
          onFinish={(values: {
            loginName: string;
            displayName: string;
            temporaryPassword: string;
            organizationId: string;
            role: Role;
          }) =>
            void complete('账号已创建；请通过受控渠道交付临时密码。', () =>
              client.request('createAccount', {
                body: {
                  loginName: values.loginName,
                  displayName: values.displayName,
                  temporaryPassword: values.temporaryPassword,
                  memberships: [
                    {
                      organizationId: values.organizationId,
                      role: values.role,
                    },
                  ],
                },
              }),
            ).then((ok) => {
              if (ok) {
                setCreateOpen(false);
                createForm.resetFields();
              }
            })
          }
        >
          <Form.Item
            label="登录账号"
            name="loginName"
            extra="3–64位小写字母、数字、点、下划线或连字符。"
            rules={[
              { required: true },
              {
                pattern: /^[a-z0-9][a-z0-9._-]{2,63}$/,
                message: '账号格式不正确',
              },
            ]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            label="显示名称"
            name="displayName"
            rules={[{ required: true, message: '请输入显示名称' }]}
          >
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item
            label="所属机构"
            name="organizationId"
            rules={[{ required: true, message: '请选择机构' }]}
          >
            <Select
              options={organizations}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item
            label="初始角色"
            name="role"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select options={roles} />
          </Form.Item>
          <Form.Item
            label="临时密码"
            name="temporaryPassword"
            extra="至少12个字符；创建后不会再次显示。"
            rules={[{ required: true }, { min: 12, message: '至少12个字符' }]}
          >
            <Input.Password autoComplete="new-password" maxLength={128} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={`重置密码${reset ? ` · ${reset.displayName}` : ''}`}
        open={!!reset}
        destroyOnHidden
        okText="重置并撤销会话"
        cancelText="取消"
        confirmLoading={busy}
        onCancel={() => setReset(undefined)}
        onOk={() => resetForm.submit()}
      >
        <Alert
          type="warning"
          showIcon
          message="重置会立即撤销该账号的全部会话；新密码首次使用后必须更换。"
        />
        <Form
          form={resetForm}
          layout="vertical"
          requiredMark={false}
          onFinish={(values: { temporaryPassword: string }) =>
            reset &&
            void complete('密码已重置，旧会话已全部撤销。', () =>
              client.request('resetAccountPassword', {
                path: { id: reset.id },
                body: values,
              }),
            ).then((ok) => {
              if (ok) {
                setReset(undefined);
                resetForm.resetFields();
              }
            })
          }
        >
          <Form.Item
            label="新临时密码"
            name="temporaryPassword"
            rules={[{ required: true }, { min: 12, message: '至少12个字符' }]}
          >
            <Input.Password autoComplete="new-password" maxLength={128} />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}
