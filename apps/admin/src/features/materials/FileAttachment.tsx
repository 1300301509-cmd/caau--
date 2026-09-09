import { useEffect, useRef, useState } from 'react';
import { Button } from 'antd';
import { workflowError, type components } from '@caau/api-client';
import { client } from './client';
export function FileAttachment({
  id,
  token,
  label,
}: {
  id: string;
  token: string;
  label: string;
}) {
  const [info, setInfo] = useState<components['schemas']['FileInfoDto']>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    generation.current++;
    setInfo(undefined);
    setError('');
    void client
      .request('getPrivateFileInfo', { token, path: { id } })
      .then((v) => {
        if (active) setInfo(v);
      })
      .catch((e) => {
        if (active) setError(workflowError(e));
      });
    return () => {
      active = false;
      generation.current++;
    };
  }, [id, token]);
  async function download() {
    if (lock.current) return;
    lock.current = true;
    const currentGeneration = generation.current;
    setBusy(true);
    setError('');
    try {
      const current = await client.request('getPrivateFileInfo', {
        token,
        path: { id },
      });
      if (
        currentGeneration !== generation.current ||
        !container.current?.isConnected
      )
        return;
      const bytes = await client.request('downloadPrivateContent', {
        token,
        path: { id },
      });
      if (
        currentGeneration !== generation.current ||
        !container.current?.isConnected
      )
        return;
      setInfo(current);
      const url = URL.createObjectURL(
        new Blob([bytes], { type: 'application/octet-stream' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = current.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      if (currentGeneration === generation.current) setError(workflowError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div ref={container} className="attachment-row">
      <span>
        {info?.name ?? '附件信息待读取'}
        {info && !info.originalNameKnown
          ? '（旧附件原名未记录，使用真实扩展名）'
          : ''}
      </span>
      <Button
        aria-label={label}
        loading={busy}
        disabled={busy}
        onClick={() => void download()}
      >
        {label}
      </Button>
      {error && <p role="alert">{error} 可重新点击下载核对。</p>}
    </div>
  );
}
