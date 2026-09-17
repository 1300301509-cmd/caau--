import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Text, Textarea, View } from '@tarojs/components';
import Taro, {
  useDidHide,
  useDidShow,
  useRouter,
  useUnload,
} from '@tarojs/taro';
import { IndividualWorkspace } from '@caau/api-client';
import {
  clearSession,
  client,
  newKey,
  readBytes,
  session,
} from '../materials/session';
import {
  individualExtensions,
  individualMaxBytes,
  isAllowedIndividualFile,
  isPreviewImage,
  materialActionLabel,
  materialStateLabel,
  safeLocalName,
} from './platform';

const syncLabels = {
  idle: '等待载入身份',
  syncing: '正在核对权限与材料',
  online: '自动同步已连接',
  offline: '同步中断',
  paused: '已暂停同步',
  unauthorized: '会话已失效',
};
const when = (value: string) => new Date(value).toLocaleString();

export function IndividualTaskPage() {
  const router = useRouter();
  const id = router.params.id ?? '';
  const initialMaterial = router.params.material ?? '';
  const model = useMemo(
    () =>
      new IndividualWorkspace(client, () => {
        throw new Error('小程序命令必须使用平台安全随机数');
      }),
    [],
  );
  const [view, setView] = useState(model.value);
  const loadedToken = useRef('');
  const [reading, setReading] = useState(false);
  const [leavingWarning, setLeavingWarning] = useState('');

  useEffect(
    () =>
      model.subscribe(() => {
        setView({ ...model.value });
        if (
          model.value.status === 'unauthorized' &&
          session.token &&
          session.token === loadedToken.current
        )
          clearSession();
      }),
    [model],
  );
  useEffect(() => {
    const changed: Taro.onNetworkStatusChange.Callback = (result) => {
      if (result.isConnected) model.wake();
      else model.networkOffline();
    };
    Taro.onNetworkStatusChange(changed);
    return () => Taro.offNetworkStatusChange(changed);
  }, [model]);
  useEffect(() => {
    void Promise.resolve()
      .then(() =>
        view.dirty || view.pending
          ? Taro.enableAlertBeforeUnload({
              message: '有未保存输入或未确认命令，请先保存或核实。',
            })
          : Taro.disableAlertBeforeUnload(),
      )
      .then(() => setLeavingWarning(''))
      .catch(() =>
        setLeavingWarning('当前环境无法设置离开提醒，请主动保存后再返回。'),
      );
  }, [view.dirty, view.pending]);

  async function activate() {
    if (!session.token) {
      loadedToken.current = '';
      model.logout();
      return;
    }
    if (loadedToken.current !== session.token) {
      loadedToken.current = session.token;
      await model.login(session.token);
      if (model.value.identity) {
        model.query({ taskId: id, offset: 0, limit: 10 });
        if (initialMaterial) model.select(initialMaterial);
      }
    } else model.setForeground(true);
  }
  useEffect(() => {
    void activate();
    return () => model.dispose();
  }, [model]);
  useDidShow(() => void activate());
  useDidHide(() => model.setForeground(false));
  useUnload(() => model.dispose());

  async function changeTarget(work: () => void) {
    if (view.dirty || view.pending) {
      const result = await Taro.showModal({
        title: '确认离开当前编辑',
        content: '离开将清除当前未保存输入或未确认命令，是否继续？',
      });
      if (!result.confirm) return;
    }
    work();
  }
  async function prepare(
    op: 'createIndividualMaterial' | 'submitIndividualMaterial',
  ) {
    const key = await newKey();
    model.ask(
      op,
      op === 'createIndividualMaterial' ? { key, id: await newKey() } : { key },
    );
    const command = model.value.confirm;
    if (!command) return;
    const result = await Taro.showModal({
      title:
        op === 'createIndividualMaterial' ? '确认新增材料' : '确认单份提交',
      content:
        op === 'createIndividualMaterial'
          ? '将建立一份独立草稿，不影响任务中的其他材料。'
          : `将当前已保存草稿生成不可变版本，目标修订 ${'expectedRevision' in command.body ? command.body.expectedRevision : '未知'}。`,
    });
    if (result.confirm) await model.commit();
    else model.cancelConfirm();
  }
  async function chooseFile() {
    const choice = await Taro.chooseMessageFile({
      count: 1,
      type: 'all',
    });
    const file = choice.tempFiles[0];
    if (!file) return;
    if (!isAllowedIndividualFile(file.name)) {
      await Taro.showModal({
        title: '附件格式不支持',
        content: `请选择 ${individualExtensions.join('/')} 文件。`,
        showCancel: false,
      });
      return;
    }
    if (file.size > individualMaxBytes) {
      await Taro.showModal({
        title: '附件过大',
        content: '单个附件不能超过 10 MiB，请重新选择。',
        showCancel: false,
      });
      return;
    }
    await model.upload(file.name, () => readBytes(file.path));
  }
  async function download(fileId: string) {
    if (reading) return;
    setReading(true);
    try {
      const file = await model.download(fileId);
      if (!file) return;
      const name = safeLocalName(file.name);
      const path = `${Taro.env.USER_DATA_PATH}/${Date.now()}-${name}`;
      await new Promise<void>((resolve, reject) =>
        Taro.getFileSystemManager().writeFile({
          filePath: path,
          data: file.bytes,
          success: () => resolve(),
          fail: reject,
        }),
      );
      if (isPreviewImage(name))
        await Taro.previewImage({ current: path, urls: [path] });
      else await Taro.openDocument({ filePath: path, showMenu: true });
    } catch {
      await Taro.showModal({
        title: '附件打开失败',
        content:
          '请确认网络和访问权限后重试；图片使用预览，文档使用系统查看器。',
        showCancel: false,
      });
    } finally {
      setReading(false);
    }
  }

  const selected = view.selected;
  const editable =
    !!selected &&
    !selected.closed &&
    ['DRAFT', 'RETURNED'].includes(selected.state);
  const blocked =
    view.status !== 'online' || view.busy || !!view.pending || reading;
  const task = view.tasks.find((item) => item.id === id);
  const title = (item: typeof selected) =>
    item?.draft?.title ?? item?.submission?.content.title ?? '未命名材料';

  if (!session.token)
    return (
      <View className="page">
        <Text className="eyebrow">CAAU · 单份材料</Text>
        <Text className="title">需要承办方身份</Text>
        <View className="card">
          <Text>会话不存在或已失效，受保护内容未显示。</Text>
          <Button
            onClick={() => void Taro.switchTab({ url: '/pages/profile/index' })}
          >
            重新载入测试身份
          </Button>
          <Button
            onClick={() => void Taro.reLaunch({ url: '/pages/home/index' })}
          >
            返回首页
          </Button>
        </View>
      </View>
    );

  return (
    <View className="page individual-page" key={view.protectionEpoch}>
      <View className="page-top-actions">
        <Text className="eyebrow">CAAU · 单份材料</Text>
        <Button
          className="text-button compact-button"
          onClick={() =>
            void changeTarget(() => Taro.reLaunch({ url: '/pages/home/index' }))
          }
        >
          返回首页
        </Button>
      </View>
      <Text className="title">{task?.title ?? '材料任务'}</Text>
      <View className={`sync-card sync-${view.status}`}>
        <Text className="subtitle">{syncLabels[view.status]}</Text>
        <Text className="description">
          {view.lastSync ? `最近核对：${when(view.lastSync)}；` : ''}
          前台约2秒自动核对，切回页面立即刷新。
        </Text>
      </View>
      {view.notice && (
        <Text className={view.error ? 'error' : 'result'}>{view.notice}</Text>
      )}
      {leavingWarning && <Text className="warning">{leavingWarning}</Text>}

      <View className="card">
        <Text className="subtitle">任务材料</Text>
        <Text className="description">
          {view.total}份 · 第{Math.floor(view.offset / view.limit) + 1}页
        </Text>
        <Button
          type="primary"
          disabled={blocked || !task || task.state !== 'PUBLISHED'}
          onClick={() => void changeTarget(() => model.beginCreate())}
        >
          自由新增材料
        </Button>
        {!view.rows.length && !view.creating && (
          <Text>暂无材料，可自由新增一份独立草稿。</Text>
        )}
        {view.rows.map((item) => (
          <View className="material-row" key={item.id}>
            <View className="grow">
              <Text className="subtitle">{title(item)}</Text>
              <Text className={`state state-${item.state.toLowerCase()}`}>
                {materialStateLabel(item.state)} · V
                {item.submission?.version ?? 0}
              </Text>
            </View>
            <Button
              disabled={blocked}
              onClick={() => void changeTarget(() => model.select(item.id))}
            >
              查看
            </Button>
          </View>
        ))}
        <View className="button-row">
          <Button
            disabled={blocked || view.offset === 0}
            onClick={() =>
              model.query({ offset: Math.max(0, view.offset - view.limit) })
            }
          >
            上一页
          </Button>
          <Button
            disabled={blocked || view.offset + view.limit >= view.total}
            onClick={() => model.query({ offset: view.offset + view.limit })}
          >
            下一页
          </Button>
        </View>
      </View>

      {view.creating && (
        <View className="card">
          <Text className="subtitle">新增独立材料</Text>
          <Text>材料名称（必填）</Text>
          <Input
            className="field"
            ariaLabel="材料名称"
            maxlength={160}
            disabled={blocked}
            value={view.buffer.title}
            onInput={(event) => model.edit({ title: event.detail.value })}
          />
          <Text>材料类别</Text>
          <Input
            className="field"
            ariaLabel="材料类别"
            maxlength={120}
            disabled={blocked}
            value={view.buffer.category}
            onInput={(event) => model.edit({ category: event.detail.value })}
          />
          <Text>材料说明</Text>
          <Textarea
            className="material-input"
            ariaLabel="材料说明"
            autoHeight
            maxlength={20000}
            disabled={blocked}
            value={view.buffer.text}
            onInput={(event) => model.edit({ text: event.detail.value })}
          />
          <Button
            type="primary"
            disabled={blocked || !view.buffer.title.trim()}
            onClick={() => void prepare('createIndividualMaterial')}
          >
            建立材料草稿
          </Button>
        </View>
      )}

      {view.pending && !selected && (
        <View className="card">
          <Text className="warning">
            上次新增命令结果未知，原幂等键和内容已保留；不会自动重放。
          </Text>
          <Button
            disabled={view.busy || view.status !== 'online'}
            onClick={() => void model.commit()}
          >
            沿用原命令核实/重试
          </Button>
        </View>
      )}

      {selected && (
        <>
          <View className="card">
            <Text className="subtitle">{title(selected)}</Text>
            <Text className={`state state-${selected.state.toLowerCase()}`}>
              {materialStateLabel(selected.state)} · V
              {selected.submission?.version ?? 0} · 修订{selected.revision}
            </Text>
            <Text>有效截止：{when(selected.deadline)}</Text>
            {selected.closed && (
              <Text className="warning">任务已关闭，只能查看。</Text>
            )}
            {selected.lastAction && (
              <View className="history-item">
                <Text>
                  最近操作：{materialActionLabel(selected.lastAction.action)}
                </Text>
                <Text className="description">
                  {selected.lastAction.actorName} ·{' '}
                  {when(selected.lastAction.occurredAt)}
                </Text>
              </View>
            )}
            {selected.lastAction?.reason && (
              <View className="return-box">
                <Text>退回原因：{selected.lastAction.reason}</Text>
                <Text>修改要求：{selected.lastAction.modification}</Text>
              </View>
            )}
          </View>

          {editable && (
            <View className="card">
              <Text className="subtitle">草稿编辑</Text>
              <Text className="description">
                {view.dirty
                  ? '有未保存输入；同步不会覆盖。'
                  : '草稿已与服务器核对。'}
              </Text>
              {view.conflict && (
                <View className="return-box">
                  <Text>服务器草稿已变化，本地输入仍保留。</Text>
                  <Text className="description">
                    服务器内容：{selected.draft?.text || '无文字'}
                  </Text>
                  <Button
                    disabled={blocked}
                    onClick={() => model.reconcile(false)}
                  >
                    核对后保留我的输入
                  </Button>
                  <Button
                    disabled={blocked}
                    onClick={() =>
                      void Taro.showModal({
                        title: '采用服务器草稿',
                        content: '本地未保存输入将被替换，是否继续？',
                      }).then(
                        (result) => result.confirm && model.reconcile(true),
                      )
                    }
                  >
                    采用服务器草稿
                  </Button>
                </View>
              )}
              <Text>材料名称（必填）</Text>
              <Input
                className="field"
                ariaLabel="材料名称"
                maxlength={160}
                disabled={blocked}
                value={view.buffer.title}
                onInput={(event) => model.edit({ title: event.detail.value })}
              />
              <Text>材料类别</Text>
              <Input
                className="field"
                ariaLabel="材料类别"
                maxlength={120}
                disabled={blocked}
                value={view.buffer.category}
                onInput={(event) =>
                  model.edit({ category: event.detail.value })
                }
              />
              <Text>材料说明</Text>
              <Textarea
                className="material-input"
                ariaLabel="材料说明"
                autoHeight
                maxlength={20000}
                disabled={blocked}
                value={view.buffer.text}
                onInput={(event) => model.edit({ text: event.detail.value })}
              />
              <Button
                disabled={blocked || view.conflict}
                onClick={() => void chooseFile()}
              >
                选择并上传私有附件
              </Button>
              <Text className="description">
                支持txt/pdf/png/jpg/jpeg，单个不超过10
                MiB；上传确认后仍需保存草稿绑定。
              </Text>
              {view.buffer.fileIds.map((file, index) => {
                const bound = !!selected.draft?.fileIds.includes(file);
                return (
                  <View className="attachment-row-mini" key={file}>
                    <Text>
                      附件{index + 1} · {bound ? '已绑定' : '待保存绑定'}
                    </Text>
                    {bound && (
                      <Button
                        disabled={blocked}
                        onClick={() => void download(file)}
                      >
                        受控下载
                      </Button>
                    )}
                    <Button
                      disabled={blocked}
                      onClick={() =>
                        model.edit({
                          fileIds: view.buffer.fileIds.filter(
                            (item) => item !== file,
                          ),
                        })
                      }
                    >
                      移除
                    </Button>
                  </View>
                );
              })}
              <Button
                disabled={
                  blocked ||
                  view.conflict ||
                  !view.dirty ||
                  !view.buffer.title.trim()
                }
                onClick={() => void model.save()}
              >
                保存草稿
              </Button>
              <Button
                type="primary"
                disabled={blocked || view.dirty || view.conflict}
                onClick={() => void prepare('submitIndividualMaterial')}
              >
                单份提交
              </Button>
            </View>
          )}

          {view.pending && (
            <View className="card">
              <Text className="warning">
                上次正式命令结果未知，原幂等键和目标已保留；不会自动重放。
              </Text>
              <Button
                disabled={view.busy || view.status !== 'online'}
                onClick={() => void model.commit()}
              >
                沿用原命令核实/重试
              </Button>
            </View>
          )}

          {selected.submission && (
            <View className="card">
              <Text className="subtitle">
                当前不可变提交 V{selected.submission.version}
              </Text>
              <Text className="description">
                {selected.submission.actorName} ·{' '}
                {when(selected.submission.occurredAt)}
              </Text>
              <Text>
                类别：{selected.submission.content.category || '未分类'}
              </Text>
              <Text className="material-text">
                {selected.submission.content.text || '无文字内容'}
              </Text>
              {selected.submission.content.fileIds.map((file, index) => (
                <Button
                  key={file}
                  disabled={blocked}
                  onClick={() => void download(file)}
                >
                  受控下载当前版本附件{index + 1}
                </Button>
              ))}
            </View>
          )}

          {view.history && (
            <View className="card">
              <Text className="subtitle">操作与不可变版本历史</Text>
              {view.history.actions.map((action) => (
                <View className="history-item" key={action.id}>
                  <Text>
                    {materialActionLabel(action.action)} ·{' '}
                    {materialStateLabel(action.fromState)} →{' '}
                    {materialStateLabel(action.toState)}
                  </Text>
                  <Text className="description">
                    {action.actorName} · {when(action.occurredAt)}
                  </Text>
                  {action.reason && (
                    <Text>
                      原因：{action.reason}；修改要求：{action.modification}
                    </Text>
                  )}
                  {action.content && (
                    <View className="history-snapshot">
                      <Text>当时草稿：{action.content.title}</Text>
                      <Text className="material-text">
                        {action.content.text}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
              {view.history.submissions.map((version) => (
                <View className="history-version" key={version.id}>
                  <Text className="subtitle">
                    不可变提交 V{version.version} · {version.content.title}
                  </Text>
                  <Text className="description">
                    {version.actorName} · {when(version.occurredAt)}
                  </Text>
                  <Text className="material-text">
                    {version.content.text || '无文字内容'}
                  </Text>
                  {version.content.fileIds.map((file, index) => (
                    <Button
                      key={file}
                      disabled={blocked}
                      onClick={() => void download(file)}
                    >
                      受控下载 V{version.version} 附件{index + 1}
                    </Button>
                  ))}
                </View>
              ))}
              <View className="button-row">
                <Button
                  disabled={view.busy || view.historyOffset === 0}
                  onClick={() =>
                    model.historyPage(Math.max(0, view.historyOffset - 10))
                  }
                >
                  历史上一页
                </Button>
                <Button
                  disabled={
                    view.busy || view.historyOffset + 10 >= view.history!.total
                  }
                  onClick={() => model.historyPage(view.historyOffset + 10)}
                >
                  历史下一页
                </Button>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}
