import { useState } from 'react';
import { Alert, Button, Modal } from 'antd';
import type { components } from '@caau/api-client';
import type { Requirements, Task } from './types';
const names = [
  '办赛基础信息确认表',
  '场馆及场地确认材料',
  '安全、医疗和应急方案',
  '竞赛执行方案',
  '物料搭建或现场 VI 方案',
];
function localTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
const blank = (title = '') => ({
  id: crypto.randomUUID(),
  title,
  required: true,
  instructions: '',
  templateVersion: '',
  formats: [] as string[],
  formatsText: '',
  maxBytes: 0,
  sizeText: '',
  deadline: '',
  deadlineText: '',
  acceptanceStandard: '',
});
const editable = (m: Requirements['materials'][number]) => ({
  ...m,
  formatsText: m.formats.join(','),
  sizeText: String(m.maxBytes),
  deadlineText: localTime(m.deadline),
});
export function RequirementsEditor({
  task,
  busy,
  capabilities,
  save,
  reusable,
  onDirty,
}: {
  task: Task;
  busy: boolean;
  capabilities?: components['schemas']['UploadCapabilitiesDto'];
  save: (requirements: Requirements) => void;
  reusable: Task[];
  onDirty: () => void;
}) {
  const [items, setItems] = useState(
    () => task.requirements?.materials.map(editable) ?? names.map(blank),
  );
  const [deadline, setDeadline] = useState(
    localTime(task.requirements?.deadline),
  );
  const [source, setSource] = useState(''),
    [batch, setBatch] = useState({
      template: '',
      formats: '',
      size: '',
      deadline: '',
    }),
    [confirm, setConfirm] = useState<'batch' | 'reuse'>();
  const selected = reusable.find((t) => t.id === source);
  const set = (i: number, key: string, value: string | boolean) => {
    onDirty();
    setItems((old) =>
      old.map((m, index) => (index === i ? { ...m, [key]: value } : m)),
    );
  };
  const batchValid =
    Object.values(batch).some(Boolean) &&
    (!batch.formats ||
      batch.formats
        .split(',')
        .every((f) => capabilities?.formats.includes(f))) &&
    (!batch.size ||
      (Number.isInteger(Number(batch.size)) &&
        Number(batch.size) > 0 &&
        Number(batch.size) <= (capabilities?.maxBytes ?? 0)));
  return (
    <form
      className="workflow-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!capabilities || busy) return;
        save({
          deadline: new Date(deadline).toISOString(),
          materials: items.map((m) => ({
            id: m.id,
            title: m.title,
            required: m.required,
            instructions: m.instructions,
            templateVersion: m.templateVersion,
            formats: m.formatsText.split(',').map((s) => s.trim()),
            maxBytes: Number(m.sizeText),
            deadline: new Date(m.deadlineText).toISOString(),
            acceptanceStandard: m.acceptanceStandard,
          })),
        });
      }}
    >
      <p>
        时间按本机时区填写并保存为 UTC。当前上传格式：
        {capabilities?.formats.join(', ')}，技术上限 {capabilities?.maxBytes}{' '}
        字节。没有正式业务默认值；模板仅版本标识，真实模板下载仍待实现。
      </p>
      <fieldset disabled={busy}>
        <legend>快捷配置 · 仅修改当前草案</legend>
        <p>公共字段填一次，核对后应用到全部材料；留空的字段不改变。</p>
        <div className="form-grid">
          <label>
            通用模板版本
            <input
              maxLength={120}
              value={batch.template}
              onChange={(e) => setBatch({ ...batch, template: e.target.value })}
            />
          </label>
          <label>
            通用格式
            <input
              aria-label="通用格式"
              value={batch.formats}
              placeholder={capabilities?.formats.join(',')}
              onChange={(e) => setBatch({ ...batch, formats: e.target.value })}
            />
          </label>
          <label>
            通用大小上限（字节）
            <input
              aria-label="通用大小上限（字节）"
              type="number"
              min={1}
              max={capabilities?.maxBytes}
              step={1}
              value={batch.size}
              onChange={(e) => setBatch({ ...batch, size: e.target.value })}
            />
          </label>
          <label>
            通用截止时间
            <input
              aria-label="通用截止时间"
              type="datetime-local"
              value={batch.deadline}
              onChange={(e) => setBatch({ ...batch, deadline: e.target.value })}
            />
          </label>
        </div>
        <Button disabled={!batchValid} onClick={() => setConfirm('batch')}>
          核对并批量应用
        </Button>
        <label>
          复用已发布配置
          <select
            aria-label="复用已发布配置"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="">请选择有权读取的来源任务</option>
            {reusable.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} · 要求 V{t.requirementVersion} · {t.id.slice(-8)}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={!selected?.requirements}
          onClick={() => setConfirm('reuse')}
        >
          预览并确认复用
        </Button>
        <p>
          只复制要求到本草案，生成新的材料标识；不复制附件、提交、指派或审核。来源任务快照不变。
        </p>
      </fieldset>
      <label>
        任务截止时间
        <input
          required
          type="datetime-local"
          value={deadline}
          disabled={busy}
          onChange={(e) => {
            setDeadline(e.target.value);
            onDirty();
          }}
        />
      </label>
      {items.map((m, i) => (
        <fieldset key={m.id} disabled={busy}>
          <legend>材料 {i + 1}</legend>
          <div className="form-grid">
            <label>
              材料名称
              <input
                required
                maxLength={160}
                value={m.title}
                onChange={(e) => set(i, 'title', e.target.value)}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={m.required}
                onChange={(e) => set(i, 'required', e.target.checked)}
              />
              必交材料
            </label>
            <label>
              模板版本
              <input
                required
                maxLength={120}
                value={m.templateVersion}
                onChange={(e) => set(i, 'templateVersion', e.target.value)}
              />
            </label>
            <label>
              支持格式（小写扩展名，逗号分隔）
              <input
                required
                pattern={`(${capabilities?.formats.join('|') ?? ''})(,(${capabilities?.formats.join('|') ?? ''}))*`}
                value={m.formatsText}
                onChange={(e) => set(i, 'formatsText', e.target.value)}
              />
            </label>
            <label>
              文件大小上限（字节）
              <input
                required
                type="number"
                min={1}
                max={capabilities?.maxBytes ?? 0}
                step={1}
                value={m.sizeText}
                onChange={(e) => set(i, 'sizeText', e.target.value)}
              />
            </label>
            <label>
              材料截止时间
              <input
                required
                type="datetime-local"
                value={m.deadlineText}
                onChange={(e) => set(i, 'deadlineText', e.target.value)}
              />
            </label>
          </div>
          <label>
            填写说明
            <textarea
              required
              maxLength={2000}
              aria-label="填写说明"
              value={m.instructions}
              onChange={(e) => set(i, 'instructions', e.target.value)}
            />
          </label>
          <label>
            示例或合格标准
            <textarea
              required
              maxLength={2000}
              aria-label="示例或合格标准"
              value={m.acceptanceStandard}
              onChange={(e) => set(i, 'acceptanceStandard', e.target.value)}
            />
          </label>
          <Button
            disabled={busy || items.length === 1}
            onClick={() => {
              onDirty();
              setItems((old) => old.filter((_, index) => index !== i));
            }}
          >
            移除材料 {i + 1}
          </Button>
        </fieldset>
      ))}
      <div className="actions">
        <Button
          disabled={busy || items.length >= 50}
          onClick={() => {
            onDirty();
            setItems((old) => [...old, blank()]);
          }}
        >
          添加材料
        </Button>
        <Button
          aria-label="保存材料要求"
          type="primary"
          htmlType="submit"
          loading={busy}
          disabled={!capabilities || busy}
        >
          保存材料要求
        </Button>
      </div>
      <Modal
        className="workflow-modal"
        title={confirm === 'batch' ? '确认公共配置' : '确认复用要求配置'}
        open={!!confirm}
        okText="确认应用到草案"
        cancelText="返回核对"
        onCancel={() => setConfirm(undefined)}
        onOk={() => {
          if (confirm === 'batch' && batchValid) {
            setItems((old) =>
              old.map((m) => ({
                ...m,
                ...(batch.template ? { templateVersion: batch.template } : {}),
                ...(batch.formats ? { formatsText: batch.formats } : {}),
                ...(batch.size ? { sizeText: batch.size } : {}),
                ...(batch.deadline ? { deadlineText: batch.deadline } : {}),
              })),
            );
            if (batch.deadline) setDeadline(batch.deadline);
          } else if (confirm === 'reuse' && selected?.requirements) {
            setItems(
              selected.requirements.materials.map((m) => ({
                ...editable(m),
                id: crypto.randomUUID(),
              })),
            );
            setDeadline(localTime(selected.requirements.deadline));
          } else return;
          onDirty();
          setConfirm(undefined);
        }}
      >
        <Alert
          type="warning"
          title="应用后仍需保存并由总部确认发布；不会修改旧快照。"
        />
        {confirm === 'batch' ? (
          <>
            <p>
              影响全部 {items.length}{' '}
              项材料；截止有填写时也更新任务截止。空字段保持原值。
            </p>
            <p>
              模板版本：{batch.template || '不改变'}；格式：
              {batch.formats || '不改变'}；大小：{batch.size || '不改变'}{' '}
              字节；截止：{batch.deadline || '不改变'}。
            </p>
          </>
        ) : (
          <>
            <p>
              来源：{selected?.title} · 要求 V{selected?.requirementVersion}
              。请特别核对旧截止、模板版本、格式、大小和说明。
            </p>
            {selected?.requirements?.materials.map((m) => (
              <p key={m.id}>
                {m.title} · {m.templateVersion} · {m.formats.join(',')} ·{' '}
                {m.maxBytes} 字节 · {m.deadline}
                <br />
                {m.instructions}
                <br />
                {m.acceptanceStandard}
              </p>
            ))}
          </>
        )}
      </Modal>
    </form>
  );
}
