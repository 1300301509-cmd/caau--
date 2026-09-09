import { useEffect, useState } from 'react';
import { Button } from 'antd';
import {
  executionStatus,
  workflowError,
  type components,
} from '@caau/api-client';
import type { Task } from './types';
import { client } from './client';
export function TaskAction({
  task,
  token,
  organizer,
  reviewer,
  open,
}: {
  task: Task;
  token: string;
  organizer: boolean;
  reviewer: boolean;
  open: () => void;
}) {
  const [execution, setExecution] =
      useState<components['schemas']['ExecutionViewDto']>(),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setExecution(undefined);
    setError('');
    if (task.state === 'PUBLISHED')
      void client
        .request('getTaskExecution', { token, path: { id: task.id } })
        .then((e) => {
          if (live) setExecution(e);
        })
        .catch((e) => {
          if (live) setError(workflowError(e));
        });
    return () => {
      live = false;
    };
  }, [task, token]);
  if (task.state !== 'PUBLISHED') return <p>下一步：配置、核对并发布要求。</p>;
  const action =
    execution?.state === 'EDITING' && organizer
      ? '办理'
      : execution?.state === 'SUBMITTED' && reviewer
        ? '审核'
        : '查看结果';
  return (
    <div>
      <p>
        当前状态：{error || executionStatus(execution)} · 下一步：
        {action === '办理'
          ? '填写或修改材料，保存后提交'
          : action === '审核'
            ? '核对当前提交并作整包结论'
            : '查看要求、进度及版本历史'}
      </p>
      <Button type="primary" disabled={!execution || !!error} onClick={open}>
        {action} {task.title}
      </Button>
    </div>
  );
}
