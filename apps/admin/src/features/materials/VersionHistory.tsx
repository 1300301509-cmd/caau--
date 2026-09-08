import { useState } from 'react';
import { Alert, Button, Card, Tag } from 'antd';
import { workflowError, type components } from '@caau/api-client';
import { client } from './client';
import type { Requirements } from './types';
export function VersionHistory({
  versions,
  requirements,
  token,
}: {
  versions: components['schemas']['SubmissionViewDto'][];
  requirements: Requirements | null;
  token: string;
}) {
  const [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  return (
    <section aria-label="提交版本与审核历史">
      <h3>提交版本与审核历史</h3>
      {error && <Alert type="error" title={error} />}{' '}
      {!versions.length && <p>尚无正式提交。</p>}
      {[...versions].reverse().map((v) => (
        <Card key={v.id} title={`提交 V${v.version}`}>
          <p>
            提交人：{v.actorId} · {new Date(v.submittedAt).toLocaleString()}
          </p>
          <Tag>
            {v.review
              ? v.review.decision === 'PASS'
                ? '已通过'
                : '已退回'
              : '待审核'}
          </Tag>
          {v.entries.map((e) => (
            <section key={e.materialId} className="requirement-read">
              <h4>
                {requirements?.materials.find((m) => m.id === e.materialId)
                  ?.title ?? e.materialId}
              </h4>
              <p className="material-text">{e.text || '无文字内容'}</p>
              {e.fileIds.map((id, i) => (
                <Button
                  key={id}
                  disabled={!!busy}
                  loading={busy === id}
                  onClick={() => {
                    setBusy(id);
                    setError('');
                    void client
                      .request('downloadPrivateContent', {
                        token,
                        path: { id },
                      })
                      .then((bytes) => {
                        const url = URL.createObjectURL(
                          new Blob([bytes], {
                            type: 'application/octet-stream',
                          }),
                        );
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `material-${id}.bin`;
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      })
                      .catch((e) => setError(workflowError(e)))
                      .finally(() => setBusy(''));
                  }}
                >
                  下载 V{v.version} 附件 {i + 1}
                </Button>
              ))}
            </section>
          ))}
          {v.review && (
            <section>
              <p>
                审核人：{v.review.actorId} ·{' '}
                {new Date(v.review.reviewedAt).toLocaleString()}
              </p>
              {v.review.issues.map((i) => (
                <div className="review-issue" key={i.materialId}>
                  <strong>
                    {
                      requirements?.materials.find((m) => m.id === i.materialId)
                        ?.title
                    }
                  </strong>
                  <p>退回原因：{i.reason}</p>
                  <p>修改要求：{i.instruction}</p>
                </div>
              ))}
            </section>
          )}
        </Card>
      ))}
    </section>
  );
}
