import { useRef, useState } from 'react';
import { Alert, Button } from 'antd';
import { sha256, workflowError, type components } from '@caau/api-client';
import { client } from './client';
export function TemplateControl({
  task,
  material,
  token,
  busy,
  changed,
}: {
  task: components['schemas']['TaskViewDto'];
  material: { id: string; title: string };
  token: string;
  busy: boolean;
  changed: () => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false),
    [error, setError] = useState('');
  const current = task.templateFiles.find((t) => t.materialId === material.id);
  async function upload(file: File) {
    setWorking(true);
    setError('');
    try {
      const bytes = await file.arrayBuffer();
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      const intent = await client.request('createTemplateUploadIntent', {
        token,
        path: { id: task.id },
        body: {
          materialId: material.id,
          originalName: file.name,
          extension: extension as 'txt' | 'pdf' | 'png' | 'jpg' | 'jpeg',
          expectedBytes: bytes.byteLength,
          sha256: sha256(bytes),
        },
      });
      await client.request('uploadTemplateContent', {
        token,
        path: { id: intent.id },
        body: bytes,
      });
      await client.request('confirmTemplateUpload', {
        token,
        path: { id: intent.id },
      });
      await changed();
    } catch (e) {
      setError(`${workflowError(e)} 文件未绑定为模板，可选择有效文件后重试。`);
    } finally {
      setWorking(false);
      if (input.current) input.current.value = '';
    }
  }
  async function remove() {
    if (
      !current ||
      !window.confirm(
        `移除“${current.name}”？仅发布前可移除，发布后模板快照不能改。`,
      )
    )
      return;
    setWorking(true);
    setError('');
    try {
      await client.request('removeDraftTemplate', {
        token,
        path: { id: current.id },
      });
      await changed();
    } catch (e) {
      setError(workflowError(e));
    } finally {
      setWorking(false);
    }
  }
  return (
    <section
      className="template-control"
      aria-label={`模板文件 · ${material.title}`}
    >
      <p>
        模板文件（可选）：
        {current ? <strong>{current.name}</strong> : '尚未上传'}
        {current ? ` · ${current.bytes} 字节` : ''}
      </p>
      <p>
        文件将和当前要求一同冻结；仅允许当前能力格式，存储路径不会使用原文件名。
      </p>
      <input
        ref={input}
        aria-label={`上传模板 · ${material.title}`}
        type="file"
        accept=".txt,.pdf,.png,.jpg,.jpeg"
        disabled={busy || working || !!current}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button
        htmlType="button"
        danger
        disabled={busy || working || !current}
        loading={working}
        onClick={() => void remove()}
      >
        移除模板
      </Button>
      {error && <Alert role="alert" type="error" title={error} />}
    </section>
  );
}
