import { useState } from 'react';
import { Button } from 'antd';
import type { Directory, Task } from './types';
export function AssignmentForm({
  directory,
  task,
  busy,
  submit,
}: {
  directory: Directory;
  task?: Task;
  busy: boolean;
  submit: (values: {
    title: string;
    organizationId: string;
    handlerMemberId: string;
    reviewerMemberId: string;
  }) => void;
}) {
  const [organizationId, setOrganization] = useState(
    task?.organizationId ?? '',
  );
  const [handlerMemberId, setHandler] = useState(task?.handlerMemberId ?? '');
  const handler = directory.members.find((m) => m.id === handlerMemberId);
  const label = (userId: string) =>
    directory.users.find((u) => u.id === userId)?.displayName ?? '未知用户';
  const reviewers = directory.members.filter(
    (m) =>
      m.role === 'REVIEWER' &&
      m.userId !== handler?.userId &&
      !directory.members.some(
        (other) =>
          other.userId === m.userId &&
          (other.organizationId === organizationId ||
            other.role === 'ORGANIZER'),
      ),
  );
  return (
    <form
      className="workflow-form"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        submit({
          title: String(data.get('title') ?? task?.title),
          organizationId,
          handlerMemberId,
          reviewerMemberId: String(data.get('reviewerMemberId')),
        });
      }}
    >
      {!task && (
        <label>
          任务名称
          <input
            name="title"
            required
            maxLength={160}
            defaultValue="赛前办赛信息包"
          />
        </label>
      )}
      <div className="form-grid">
        <label>
          承办机构
          <select
            required
            aria-label="承办机构"
            value={organizationId}
            onChange={(e) => {
              setOrganization(e.target.value);
              setHandler('');
            }}
          >
            <option value="">请选择机构</option>
            {directory.organizations
              .filter((o) =>
                directory.members.some(
                  (m) => m.organizationId === o.id && m.role === 'ORGANIZER',
                ),
              )
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          经办人
          <select
            required
            aria-label="经办人"
            value={handlerMemberId}
            onChange={(e) => setHandler(e.target.value)}
          >
            <option value="">请选择经办人</option>
            {directory.members
              .filter(
                (m) =>
                  m.organizationId === organizationId && m.role === 'ORGANIZER',
              )
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {label(m.userId)}
                </option>
              ))}
          </select>
        </label>
        <label>
          审核员
          <select
            required
            aria-label="审核员"
            name="reviewerMemberId"
            defaultValue={task?.reviewerMemberId ?? ''}
            key={organizationId + handlerMemberId}
          >
            <option value="">请选择审核员</option>
            {reviewers.map((m) => (
              <option key={m.id} value={m.id}>
                {label(m.userId)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Button
        aria-label={task ? '保存指派' : '创建任务草案'}
        type="primary"
        htmlType="submit"
        loading={busy}
      >
        {task ? '保存指派' : '创建任务草案'}
      </Button>
    </form>
  );
}
