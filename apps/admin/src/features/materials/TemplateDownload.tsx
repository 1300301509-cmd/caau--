import { useState } from 'react';
import { Button } from 'antd';
import { workflowError, type components } from '@caau/api-client';
import { client } from './client';
export function TemplateDownload({
  file,
  token,
}: {
  file: components['schemas']['TemplateFileDto'];
  token: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function download() {
    setBusy(true);
    setError('');
    try {
      const info = await client.request('getTemplateInfo', {
        token,
        path: { id: file.id },
      });
      const bytes = await client.request('downloadTemplateContent', {
        token,
        path: { id: file.id },
      });
      const url = URL.createObjectURL(
        new Blob([bytes], { type: 'application/octet-stream' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = info.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(workflowError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="attachment-row">
      <span>
        模板：{file.name} · {file.bytes} 字节
      </span>
      <Button loading={busy} disabled={busy} onClick={() => void download()}>
        下载模板
      </Button>
      {error && <p role="alert">{error} 可重新认证或刷新后重试。</p>}
    </div>
  );
}
