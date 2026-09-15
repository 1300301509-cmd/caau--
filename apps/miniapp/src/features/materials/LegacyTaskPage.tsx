import { useEffect, useReducer, useRef, useState } from 'react';
import { Button, Text, Textarea, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import {
  MaterialEditor,
  executionStatus,
  workflowError,
} from '@caau/api-client';
import { client, newKey, readBytes, session } from './session';
export function LegacyTaskPage() {
  const router = useRouter();
  const [, update] = useReducer((x) => x + 1, 0);
  const [editor] = useState(
    () =>
      new MaterialEditor(
        client,
        session.token,
        router.params.id ?? '',
        newKey,
        update,
      ),
  );
  const [reading, setReading] = useState(false),
    [fileError, setFileError] = useState('');
  const lock = useRef(false);
  useEffect(() => {
    void editor.load();
  }, [editor]);
  useEffect(() => {
    void Promise.resolve()
      .then(() =>
        editor.dirty || editor.pending
          ? Taro.enableAlertBeforeUnload({
              message: '有未保存输入或未确认提交，请先保存或核实。',
            })
          : Taro.disableAlertBeforeUnload(),
      )
      .catch(() =>
        setFileError(
          '当前环境无法设置离开提醒，请主动保存或核实提交后再返回。',
        ),
      );
  }, [editor.dirty, editor.pending]);
  const disabled = !!editor.busy || reading || editor.denied,
    editable = editor.execution?.state === 'EDITING' && !editor.denied;
  async function downloadTemplate(id: string) {
    if (lock.current) return;
    lock.current = true;
    setReading(true);
    setFileError('');
    try {
      const info = await client.request('getTemplateInfo', {
        token: session.token,
        path: { id },
      });
      const bytes = await client.request('downloadTemplateContent', {
        token: session.token,
        path: { id },
      });
      const path = `${Taro.env.USER_DATA_PATH}/${info.name}`;
      await new Promise<void>((resolve, reject) =>
        Taro.getFileSystemManager().writeFile({
          filePath: path,
          data: bytes,
          success: () => resolve(),
          fail: reject,
        }),
      );
      await Taro.openDocument({ filePath: path, showMenu: true });
    } catch (e) {
      setFileError(`${workflowError(e)} 可重新认证或刷新后重试。`);
    } finally {
      setReading(false);
      lock.current = false;
    }
  }
  async function choose(id: string) {
    if (lock.current) return;
    lock.current = true;
    setReading(true);
    setFileError('');
    try {
      const m = editor.task?.requirements?.materials.find((m) => m.id === id);
      if (!m) return;
      const choice = await Taro.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: m.formats,
      });
      const file = choice.tempFiles[0];
      if (!file) return;
      if (file.size > Math.min(m.maxBytes, editor.capabilities?.maxBytes ?? 0))
        throw new Error('File too large');
      await editor.upload(id, file.name, await readBytes(file.path));
    } catch (e) {
      editor.uploadFailures[id] =
        '文件选择或读取失败，未加入草稿；请重试或移除失败项。';
      setFileError(workflowError(e));
      update();
    } finally {
      setReading(false);
      lock.current = false;
    }
  }
  return (
    <View className="page">
      <Text className="eyebrow">CAAU · 材料任务</Text>
      <Text className="title">{editor.task?.title ?? '任务详情'}</Text>
      <View className="card">
        <Text className="status">{executionStatus(editor.execution)}</Text>
        <Text>
          有效截止：
          {editor.execution &&
            new Date(editor.execution.deadlines.task).toLocaleString()}
        </Text>
        <Text className="description">
          草稿修订 {editor.draft?.revision} · 已提交 {editor.versions.length}{' '}
          个版本
        </Text>
        {editor.overdue && (
          <Text className="warning">
            已逾期，仍可保存草稿；正式提交需要总部延期。
          </Text>
        )}
        <Button disabled={disabled} onClick={() => void editor.load()}>
          核对最新状态（保留输入）
        </Button>
        {(editor.busy || reading) && (
          <Text className="result">
            {reading ? '正在读取文件' : editor.busy}…
          </Text>
        )}
        {editor.notice && (
          <Text className={editor.error ? 'error' : 'result'}>
            {editor.notice}
          </Text>
        )}
        {fileError && <Text className="error">{fileError}</Text>}
      </View>
      {editor.latest && (
        <View className="card">
          <Text className="warning">
            草稿冲突：当前输入已保留。最新修订 {editor.latest.revision}
          </Text>
          {editor.latest.entries.map((e) => (
            <View key={e.materialId}>
              <Text>
                {
                  editor.task?.requirements?.materials.find(
                    (m) => m.id === e.materialId,
                  )?.title
                }
              </Text>
              <Text className="material-text">{e.text}</Text>
              <Text>已绑定附件 {e.fileIds.length} 个</Text>
            </View>
          ))}
          <Button
            disabled={disabled}
            onClick={() =>
              void Taro.showModal({
                title: '确认已核对差异',
                content:
                  '保留我的输入，以最新修订为基础。下一次保存才写入服务器。',
              }).then((r) => {
                if (r.confirm) editor.acceptLatestBase();
              })
            }
          >
            保留我的输入，以最新修订继续保存
          </Button>
        </View>
      )}
      {editor.task?.requirements?.materials.map((m) => {
        const entry = editor.entry(m.id);
        return (
          <View className="card" key={m.id}>
            <Text className="subtitle">
              {m.title} · {m.required ? '必交' : '选交'}
            </Text>
            <Text className="description">{m.instructions}</Text>
            <Text>模板版本：{m.templateVersion}</Text>
            {editor.task?.templateFiles.find(
              (file) => file.materialId === m.id,
            ) ? (
              <View>
                <Text>
                  模板文件：
                  {
                    editor.task.templateFiles.find(
                      (file) => file.materialId === m.id,
                    )?.name
                  }
                </Text>
                <Button
                  disabled={disabled}
                  onClick={() =>
                    void downloadTemplate(
                      editor.task!.templateFiles.find(
                        (file) => file.materialId === m.id,
                      )!.id,
                    )
                  }
                >
                  下载模板
                </Button>
              </View>
            ) : (
              <Text>本项未附模板文件。</Text>
            )}
            <Text>
              格式：{m.formats.join(', ')} · 上限{' '}
              {Math.min(m.maxBytes, editor.capabilities?.maxBytes ?? 0)} 字节
            </Text>
            <Text>
              有效材料截止：
              {new Date(
                editor.execution?.deadlines.materials.find((d) => d.id === m.id)
                  ?.deadline ?? m.deadline,
              ).toLocaleString()}
            </Text>
            <Text className="description">标准：{m.acceptanceStandard}</Text>
            <Text>材料填写 · {m.title}</Text>
            <Textarea
              className="material-input"
              ariaLabel={`材料填写 · ${m.title}`}
              autoHeight
              maxlength={4000}
              disabled={disabled || !editable || !!editor.pending}
              value={entry.text}
              onInput={(e) => editor.edit(m.id, { text: e.detail.value })}
            />
            <Text className="description">{entry.text.length}/4000</Text>
            {editor.fieldErrors[m.id] && (
              <Text className="error">{editor.fieldErrors[m.id]}</Text>
            )}
            <Button
              disabled={disabled || !editable || !!editor.pending}
              onClick={() => void choose(m.id)}
            >
              选择并上传私有附件
            </Button>
            {editor.uploadFailures[m.id] && (
              <View>
                <Text className="error">{editor.uploadFailures[m.id]}</Text>
                <Button
                  disabled={disabled}
                  onClick={() => editor.clearFailure(m.id)}
                >
                  移除失败项
                </Button>
              </View>
            )}
            {entry.fileIds.map((file, i) => (
              <View key={file}>
                <Text>附件 {i + 1} · 已确认</Text>
                <Button
                  disabled={disabled || !editable || !!editor.pending}
                  onClick={() =>
                    editor.edit(m.id, {
                      fileIds: entry.fileIds.filter((f) => f !== file),
                    })
                  }
                >
                  移除附件 {i + 1}
                </Button>
              </View>
            ))}
          </View>
        );
      })}
      <View className="card">
        <Text className="description">
          {editor.dirty
            ? '有未保存输入，请先保存。'
            : '正式提交会生成不可修改版本。'}
        </Text>
        <Button
          disabled={
            disabled || !editable || !!editor.pending || !!editor.latest
          }
          loading={editor.busy === '保存中'}
          onClick={() => void editor.save()}
        >
          保存草稿
        </Button>
        <Button
          type="primary"
          disabled={
            disabled ||
            (!editor.pending &&
              (!editable ||
                editor.dirty ||
                !!editor.latest ||
                editor.overdue ||
                !!Object.keys(editor.uploadFailures).length))
          }
          loading={editor.busy === '提交中'}
          onClick={() =>
            void Taro.showModal({
              title: '确认正式提交',
              content:
                '请确认材料完整。提交已保存草稿形成不可变版本；网络重试沿用同一幂等命令。',
            }).then((r) => {
              if (r.confirm) void editor.submit();
            })
          }
        >
          {editor.pending ? '核实/重试提交' : '正式提交'}
        </Button>
        {editor.pending && (
          <Text className="warning">
            上次提交结果未确认，请重试核实，不要离开页面。
          </Text>
        )}
      </View>
      <Text className="title">提交与审核历史</Text>
      {[...editor.versions].reverse().map((v) => (
        <View className="card" key={v.id}>
          <Text className="subtitle">
            提交 V{v.version} ·{' '}
            {v.review
              ? v.review.decision === 'PASS'
                ? '已通过'
                : '已退回'
              : '待审核'}
          </Text>
          <Text className="description">
            提交人 {v.actorId} · {new Date(v.submittedAt).toLocaleString()}
          </Text>
          {v.entries.map((e) => (
            <View key={e.materialId}>
              <Text className="subtitle">
                {
                  editor.task?.requirements?.materials.find(
                    (m) => m.id === e.materialId,
                  )?.title
                }
              </Text>
              <Text className="material-text">{e.text || '无文字内容'}</Text>
              <Text>附件 {e.fileIds.length} 个（历史绑定记录）</Text>
            </View>
          ))}
          {v.review && (
            <View>
              <Text className="description">
                审核人 {v.review.actorId} ·{' '}
                {new Date(v.review.reviewedAt).toLocaleString()}
              </Text>
              {v.review.issues.map((i) => (
                <View key={i.materialId}>
                  <Text className="subtitle">
                    {
                      editor.task?.requirements?.materials.find(
                        (m) => m.id === i.materialId,
                      )?.title
                    }
                  </Text>
                  <Text className="error">退回原因：{i.reason}</Text>
                  <Text>修改要求：{i.instruction}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ))}
      {!editor.versions.length && <Text>尚无正式提交。</Text>}
    </View>
  );
}
