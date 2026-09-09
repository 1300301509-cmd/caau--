import { Card, Tag } from 'antd';
import type { components } from '@caau/api-client';
import type { Requirements } from './types';
import { FileAttachment } from './FileAttachment';
export function VersionHistory({
  versions,
  requirements,
  token,
}: {
  versions: components['schemas']['SubmissionViewDto'][];
  requirements: Requirements | null;
  token: string;
}) {
  return (
    <section aria-label="提交版本与审核历史">
      <h3>提交版本与审核历史</h3>
      <p>姓名为当前目录显示名；稳定身份 ID、原提交及审核时间保留。</p>
      {!versions.length && <p>尚无正式提交。</p>}
      {[...versions].reverse().map((v) => (
        <Card key={v.id} title={`提交 V${v.version}`}>
          <p>
            提交人：<strong>{v.actorName}</strong> ·{' '}
            {new Date(v.submittedAt).toLocaleString()}
            <br />
            <small>身份 ID：{v.actorId}</small>
          </p>
          <Tag>
            {v.review
              ? v.review.decision === 'PASS'
                ? '已通过'
                : '已退回'
              : '待审核'}
          </Tag>
          {v.entries.map((e) => (
            <section className="requirement-read" key={e.materialId}>
              <h4>
                {requirements?.materials.find((m) => m.id === e.materialId)
                  ?.title ?? e.materialId}
              </h4>
              <p className="material-text">{e.text || '无文字内容'}</p>
              {e.fileIds.map((id, i) => (
                <FileAttachment
                  key={id}
                  id={id}
                  token={token}
                  label={`下载 V${v.version} 附件 ${i + 1}`}
                />
              ))}
            </section>
          ))}
          {v.review && (
            <section>
              <p>
                审核人：<strong>{v.review.actorName}</strong> ·{' '}
                {new Date(v.review.reviewedAt).toLocaleString()}
                <br />
                <small>身份 ID：{v.review.actorId}</small>
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
