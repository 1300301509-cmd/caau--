import { useEffect, useReducer, useRef, useState } from 'react';
import { Alert, Button, Card, Modal } from 'antd';
import {
  MaterialEditor,
  executionStatus,
  workflowError,
} from '@caau/api-client';
import { client } from './client';
import { VersionHistory } from './VersionHistory';
export function OrganizerPanel({
  id,
  token,
  reauthenticate,
  changed,
}: {
  id: string;
  token: string;
  reauthenticate: () => void;
  changed: () => Promise<void>;
}) {
  const [, update] = useReducer((x) => x + 1, 0);
  const [editor] = useState(
    () =>
      new MaterialEditor(
        client,
        token,
        id,
        async () => crypto.randomUUID(),
        update,
      ),
  );
  const [confirm, setConfirm] = useState(false);
  const onChanged = useRef(changed);
  onChanged.current = changed;
  const revision = editor.execution?.revision,
    state = editor.execution?.state;
  useEffect(() => {
    if (state) void onChanged.current();
  }, [revision, state]);
  useEffect(() => {
    void (editor.token === token ? editor.load() : editor.resume(token)).catch(
      (e) => {
        editor.error = true;
        editor.denied = true;
        editor.notice = workflowError(e);
        update();
      },
    );
  }, [editor, token]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (editor.dirty || editor.pending) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [editor]);
  const editable = editor.execution?.state === 'EDITING' && !editor.denied;
  return (
    <section aria-label="承办材料办理">
      <Card title="承办材料办理 · Web 本地联调入口">
        {editor.denied && (
          <Alert
            type="warning"
            title="输入仍保留在本页，请重新认证"
            description="同一身份恢复会重新核对权限与版本，不自动提交；切换其他身份会清除本页旧输入。"
            action={
              <Button disabled={!!editor.busy} onClick={reauthenticate}>
                重新认证（保留输入）
              </Button>
            }
          />
        )}
        <p>与小程序使用同一业务契约；此浏览器页面不是微信平台验收。</p>
        <Button disabled={!!editor.busy} onClick={() => void editor.load()}>
          核对最新状态（保留输入）
        </Button>
        <p>
          当前状态：{executionStatus(editor.execution)} · 草稿修订{' '}
          {editor.draft?.revision}
        </p>
        <p>
          有效截止：
          {editor.execution &&
            new Date(editor.execution.deadlines.task).toLocaleString()}
        </p>
        {editor.overdue && (
          <Alert
            type="warning"
            title="已逾期：仍可保存草稿，正式提交需要总部延期。"
          />
        )}
        <div aria-live="polite">
          {editor.busy && <p>{editor.busy}…</p>}
          {editor.notice && (
            <Alert
              type={editor.error ? 'error' : 'success'}
              title={editor.notice}
            />
          )}
        </div>
        {editor.latest && (
          <Card
            title={`最新草稿修订 ${editor.latest.revision} · 当前输入未覆盖`}
          >
            <pre>{JSON.stringify(editor.latest.entries, null, 2)}</pre>
            <Button onClick={() => editor.acceptLatestBase()}>
              已核对，保留我的输入以最新修订继续保存
            </Button>
          </Card>
        )}
        {editor.task?.requirements?.materials.map((m) => {
          const entry = editor.entry(m.id);
          return (
            <fieldset
              key={m.id}
              disabled={!editable || !!editor.busy || !!editor.pending}
            >
              <legend>
                {m.title} · {m.required ? '必交' : '选交'}
              </legend>
              <p>{m.instructions}</p>
              <p>模板版本 {m.templateVersion}（仅标识，暂无模板下载）</p>
              <p>
                格式 {m.formats.join(', ')} · 上限{' '}
                {Math.min(m.maxBytes, editor.capabilities?.maxBytes ?? 0)} 字节
              </p>
              <p>
                有效材料截止：
                {new Date(
                  editor.execution?.deadlines.materials.find(
                    (d) => d.id === m.id,
                  )?.deadline ?? m.deadline,
                ).toLocaleString()}
              </p>
              <label>
                材料填写 · {m.title}
                <textarea
                  aria-label={`材料填写 · ${m.title}`}
                  aria-invalid={!!editor.fieldErrors[m.id]}
                  maxLength={4000}
                  value={entry.text}
                  onChange={(e) => editor.edit(m.id, { text: e.target.value })}
                />
              </label>
              {editor.fieldErrors[m.id] && (
                <p role="alert">{editor.fieldErrors[m.id]}</p>
              )}
              <label>
                上传附件 · {m.title}
                <input
                  type="file"
                  accept={m.formats.map((f) => '.' + f).join(',')}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    if (
                      !file.size ||
                      file.size >
                        Math.min(m.maxBytes, editor.capabilities?.maxBytes ?? 0)
                    ) {
                      editor.uploadFailures[m.id] =
                        '文件为空或超出大小限制，未读取上传。';
                      update();
                      return;
                    }
                    void editor.upload(m.id, file.name, () =>
                      file.arrayBuffer(),
                    );
                  }}
                />
              </label>
              {editor.uploadFailures[m.id] && (
                <div role="alert">
                  <p>{editor.uploadFailures[m.id]}</p>
                  <Button onClick={() => editor.clearFailure(m.id)}>
                    移除失败项
                  </Button>
                </div>
              )}
              {entry.fileIds.map((file, i) => (
                <p key={file}>
                  {editor.fileInfo[file]?.name ??
                    `新附件 ${i + 1}（保存后显示安全文件名）`}{' '}
                  · 已确认{' '}
                  <Button
                    onClick={() =>
                      editor.edit(m.id, {
                        fileIds: entry.fileIds.filter((f) => f !== file),
                      })
                    }
                  >
                    移除附件 {i + 1}
                  </Button>
                </p>
              ))}
              <p>标准：{m.acceptanceStandard}</p>
            </fieldset>
          );
        })}
        <div className="actions">
          <Button
            disabled={
              !editable || !!editor.busy || !!editor.latest || !!editor.pending
            }
            loading={editor.busy === '保存中'}
            onClick={() => void editor.save()}
          >
            保存草稿
          </Button>
          <Button
            type="primary"
            disabled={
              !!editor.busy ||
              editor.denied ||
              (!editor.pending &&
                (!editable ||
                  editor.dirty ||
                  !!editor.latest ||
                  editor.overdue ||
                  !!Object.keys(editor.uploadFailures).length))
            }
            onClick={() => setConfirm(true)}
          >
            {editor.pending ? '核实/重试提交' : '正式提交'}
          </Button>
        </div>
        <p>
          {editor.dirty
            ? '有未保存内容，请先保存再提交。'
            : '正式提交后形成不可变版本。'}
          {editor.pending
            ? ' 上次提交结果未确认，重试将沿用同一幂等键；请勿离开页面。'
            : ''}
        </p>
      </Card>
      <VersionHistory
        token={token}
        versions={editor.versions}
        requirements={editor.task?.requirements ?? null}
      />
      <Modal
        title="确认正式提交材料包"
        open={confirm}
        okText="确认提交"
        cancelText="返回核对"
        onCancel={() => setConfirm(false)}
        onOk={() => {
          setConfirm(false);
          void editor.submit();
        }}
      >
        <p>
          提交当前已保存草稿，形成不可修改版本。请确认材料完整；重试不会生成重复版本。
        </p>
      </Modal>
    </section>
  );
}
