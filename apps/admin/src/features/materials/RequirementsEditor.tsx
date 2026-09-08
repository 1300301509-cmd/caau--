import { useState } from 'react';
import { Button } from 'antd';
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
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function RequirementsEditor({
  task,
  busy,
  save,
}: {
  task: Task;
  busy: boolean;
  save: (requirements: Requirements) => void;
}) {
  const [items, setItems] = useState(
    () =>
      task.requirements?.materials.map((m) => ({
        ...m,
        formatsText: m.formats.join(','),
        sizeText: String(m.maxBytes),
        deadlineText: localTime(m.deadline),
      })) ??
      names.map((title) => ({
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
      })),
  );
  const [deadline, setDeadline] = useState(
    localTime(task.requirements?.deadline),
  );
  const change = (index: number, key: string, value: string | boolean) =>
    setItems((old) =>
      old.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
    );
  return (
    <form
      className="workflow-form"
      onSubmit={(event) => {
        event.preventDefault();
        save({
          deadline: new Date(deadline).toISOString(),
          materials: items.map((m) => ({
            id: m.id,
            title: m.title,
            required: m.required,
            instructions: m.instructions,
            templateVersion: m.templateVersion,
            formats: m.formatsText.split(',').map((x) => x.trim()),
            maxBytes: Number(m.sizeText),
            deadline: new Date(m.deadlineText).toISOString(),
            acceptanceStandard: m.acceptanceStandard,
          })),
        });
      }}
    >
      <p>
        时间按本机时区填写，保存为
        UTC。格式、大小和模板由总部配置；本段不提供上传或逾期提交规则。
      </p>
      <label>
        任务截止时间
        <input
          required
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
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
                onChange={(e) => change(i, 'title', e.target.value)}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={m.required}
                onChange={(e) => change(i, 'required', e.target.checked)}
              />
              必交材料
            </label>
            <label>
              模板版本
              <input
                required
                maxLength={120}
                value={m.templateVersion}
                onChange={(e) => change(i, 'templateVersion', e.target.value)}
              />
            </label>
            <label>
              支持格式（小写扩展名，逗号分隔）
              <input
                required
                pattern="[a-z0-9]{1,12}(,[a-z0-9]{1,12})*"
                value={m.formatsText}
                onChange={(e) => change(i, 'formatsText', e.target.value)}
              />
            </label>
            <label>
              文件大小上限（字节）
              <input
                required
                type="number"
                min={1}
                max={2147483647}
                step={1}
                value={m.sizeText}
                onChange={(e) => change(i, 'sizeText', e.target.value)}
              />
            </label>
            <label>
              材料截止时间
              <input
                required
                type="datetime-local"
                value={m.deadlineText}
                onChange={(e) => change(i, 'deadlineText', e.target.value)}
              />
            </label>
          </div>
          <label>
            填写说明
            <textarea
              required
              maxLength={2000}
              value={m.instructions}
              onChange={(e) => change(i, 'instructions', e.target.value)}
            />
          </label>
          <label>
            示例或合格标准
            <textarea
              required
              maxLength={2000}
              value={m.acceptanceStandard}
              onChange={(e) => change(i, 'acceptanceStandard', e.target.value)}
            />
          </label>
          <Button
            disabled={items.length === 1 || busy}
            onClick={() =>
              setItems((old) => old.filter((_, index) => index !== i))
            }
          >
            移除材料 {i + 1}
          </Button>
        </fieldset>
      ))}
      <div className="actions">
        <Button
          disabled={busy || items.length >= 50}
          onClick={() =>
            setItems((old) => [
              ...old,
              {
                id: crypto.randomUUID(),
                title: '',
                required: true,
                instructions: '',
                templateVersion: '',
                formats: [],
                formatsText: '',
                maxBytes: 0,
                sizeText: '',
                deadline: '',
                deadlineText: '',
                acceptanceStandard: '',
              },
            ])
          }
        >
          添加材料
        </Button>
        <Button
          aria-label="保存材料要求"
          type="primary"
          htmlType="submit"
          loading={busy}
        >
          保存材料要求
        </Button>
      </div>
    </form>
  );
}
