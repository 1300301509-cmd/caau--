import { useEffect, useRef, useState } from 'react';
import { Text, View, Picker } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { ApiError, sha256 } from '@caau/api-client';
import { client, newKey, readBytes } from '../materials/session';
import { Action, Field, Shell, confirm, saved, useCompetition } from './shared';
import { supplyStatuses, supplyPhotoExtension, type S } from './model';
type Item = S['EventSupplyItemViewDto'];
type Status = keyof typeof supplyStatuses;
type Edit = {
  id: string;
  row?: Item;
  name: string;
  quantity: string;
  notes: string;
  status: Status;
};
type Upload = {
  itemId: string;
  revision: number;
  meta: S['CreateEventSupplyPhotoDto'];
  bytes: ArrayBuffer;
  phase: number;
};
function historySummary(snapshot: object) {
  const value = snapshot as {
    name?: string;
    quantity?: number;
    notes?: string;
    status?: Status;
    photos?: { originalName: string }[];
  };
  return `${value.name ?? ''} · 数量 ${value.quantity ?? '—'}\n${value.status ? supplyStatuses[value.status] : ''}\n${value.notes || '无备注'}\n照片：${value.photos?.map((p) => p.originalName).join('、') || '无'}`;
}
export default function SuppliesPage() {
  const [items, setItems] = useState<Item[]>([]),
    [ready, setReady] = useState(false);
  const [edit, setEdit] = useState<Edit>(),
    [history, setHistory] = useState<S['EventSupplyHistoryDto'][]>();
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('');
  const [frozen, setFrozen] = useState(false),
    [uploading, setUploading] = useState(false);
  const creation = useRef<S['CreateEventSupplyItemDto']>(),
    upload = useRef<Upload>();
  const files = useRef<string[]>([]);
  function cleanFiles() {
    for (const path of files.current)
      Taro.getFileSystemManager().unlink({
        filePath: path,
        fail: () => undefined,
      });
    files.current = [];
  }
  const ctx = useCompetition(() => {
    setItems([]);
    setReady(false);
    setEdit(undefined);
    setHistory(undefined);
    creation.current = undefined;
    upload.current = undefined;
    setUploading(false);
    setFrozen(false);
    cleanFiles();
  }, !!edit || uploading);
  useEffect(() => () => cleanFiles(), []);
  async function read(token: string, valid: () => boolean) {
    const list = await client.request('listEventSupplies', {
      token,
      path: { eventId: ctx.eventId },
    });
    if (valid()) {
      setItems(list);
      setReady(true);
    }
  }
  async function load() {
    await ctx.run(read);
  }
  useDidShow(() => {
    if (!edit && !uploading) void load();
  });
  async function open(row?: Item) {
    await ctx.run(async (_token, valid) => {
      const id = row?.id ?? (await newKey());
      if (valid()) {
        creation.current = undefined;
        setFrozen(false);
        setEdit({
          id,
          row,
          name: row?.name ?? '',
          quantity: String(row?.quantity ?? 1),
          notes: row?.notes ?? '',
          status: (row?.status as Status) ?? 'TO_PREPARE',
        });
      }
    });
  }
  async function save() {
    if (!edit) return;
    const quantity = Number(edit.quantity);
    if (
      !edit.name.trim() ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 1000000
    ) {
      ctx.setError('请填写物料名称，数量须为 1～1000000 的整数');
      return;
    }
    await ctx.run(async (token, valid) => {
      let next: Item;
      if (edit.row)
        next = await client.request('updateEventSupply', {
          token,
          path: { eventId: ctx.eventId, id: edit.id },
          body: {
            expectedRevision: edit.row.revision,
            name: edit.name,
            quantity,
            notes: edit.notes,
            status: edit.status,
          },
        });
      else {
        const body = creation.current ?? {
          id: edit.id,
          name: edit.name,
          quantity,
          notes: edit.notes,
        };
        creation.current = body;
        setFrozen(true);
        try {
          next = await client.request('createEventSupply', {
            token,
            path: { eventId: ctx.eventId },
            body,
          });
        } catch (e) {
          if (valid() && e instanceof ApiError && e.status === 400) {
            creation.current = undefined;
            setFrozen(false);
          }
          throw e;
        }
      }
      if (valid()) {
        setItems((v) => [next, ...v.filter((i) => i.id !== next.id)]);
        setEdit(undefined);
        creation.current = undefined;
        setFrozen(false);
        saved();
      }
    });
  }
  async function photo(item?: Item, existing?: S['EventSupplyPhotoViewDto']) {
    await ctx.run(async (token, valid) => {
      if (!upload.current) {
        if (!item) return;
        const result = await Taro.chooseImage({
          count: 1,
          sizeType: ['original'],
          sourceType: ['album', 'camera'],
        });
        if (!valid()) return;
        const file = result.tempFilePaths[0];
        if (!file) return;
        const bytes = await readBytes(file);
        if (!valid()) return;
        const extension = supplyPhotoExtension(bytes);
        if (existing && bytes.byteLength !== existing.expectedBytes)
          throw new Error('请重新选择原照片文件，大小须与原上传一致');
        const id = existing?.id ?? (await newKey());
        if (!valid()) return;
        upload.current = {
          itemId: item.id,
          revision: item.revision,
          meta: {
            id,
            originalName: existing?.originalName ?? `物料照片.${extension}`,
            extension,
            expectedBytes: bytes.byteLength,
            sha256: sha256(bytes),
          },
          bytes,
          phase: 0,
        };
        setUploading(true);
      }
      const current = upload.current;
      if (current.phase === 0) {
        await client.request('createEventSupplyPhoto', {
          token,
          path: { eventId: ctx.eventId, id: current.itemId },
          body: current.meta,
        });
        if (!valid()) return;
        current.phase = 1;
      }
      if (current.phase === 1) {
        await client.request('EventSuppliesController_upload', {
          token,
          path: { id: current.meta.id },
          body: current.bytes,
        });
        if (!valid()) return;
        current.phase = 2;
      }
      await client.request('confirmEventSupplyPhoto', {
        token,
        path: { id: current.meta.id },
        body: { expectedRevision: current.revision },
      });
      if (!valid()) return;
      upload.current = undefined;
      setUploading(false);
      saved();
      await read(token, valid);
    });
  }
  async function discardUpload() {
    await ctx.run(async (token, valid) => {
      const p = upload.current;
      if (!p) return;
      if (
        !(await confirm(
          '暂停本次上传',
          '已建立的待确认照片会保留，可在清单中选择原文件继续上传；已确认的照片不会删除。',
        )) ||
        !valid()
      )
        return;
      if (valid()) {
        upload.current = undefined;
        setUploading(false);
        await read(token, valid);
      }
    });
  }
  async function view(photo: S['EventSupplyPhotoViewDto']) {
    await ctx.run(async (token, valid) => {
      const bytes = await client.request('EventSuppliesController_download', {
        token,
        path: { id: photo.id },
      });
      if (!valid()) return;
      const path = `${Taro.env.USER_DATA_PATH}/caau-supply-${photo.id}.${photo.extension}`;
      await new Promise<void>((resolve, reject) =>
        Taro.getFileSystemManager().writeFile({
          filePath: path,
          data: bytes,
          success: () => resolve(),
          fail: reject,
        }),
      );
      if (!valid()) {
        Taro.getFileSystemManager().unlink({ filePath: path });
        return;
      }
      files.current.push(path);
      await Taro.previewImage({ urls: [path], current: path });
    });
  }
  async function remove(item: Item, photo: S['EventSupplyPhotoViewDto']) {
    await ctx.run(async (token, valid) => {
      if (!(await confirm('移除照片', photo.originalName)) || !valid()) return;
      await client.request('removeEventSupplyPhoto', {
        token,
        path: { id: photo.id },
        body: { expectedRevision: item.revision },
      });
      if (valid()) {
        cleanFiles();
        await read(token, valid);
      }
    });
  }
  return (
    <Shell title="物料管理" ctx={ctx}>
      {uploading && (
        <View className="card">
          <Text>照片上传尚未确认，失败可继续原上传。</Text>
          <Action disabled={ctx.busy} onClick={() => void photo()}>
            重试上传 / 确认
          </Action>
          <Action disabled={ctx.busy} onClick={() => void discardUpload()}>
            暂停本次上传
          </Action>
        </View>
      )}
      {edit ? (
        <View className="card">
          <Text className="subtitle">{edit.row ? '编辑物料' : '新增物料'}</Text>
          {frozen && (
            <Text className="competition-note">
              新增结果待确认，重试使用原内容。
            </Text>
          )}
          <Field
            label="物料名称 *"
            value={edit.name}
            disabled={ctx.busy || frozen}
            onChange={(v) => setEdit({ ...edit, name: v })}
          />
          <Field
            label="数量 *"
            type="number"
            value={edit.quantity}
            disabled={ctx.busy || frozen}
            onChange={(v) => setEdit({ ...edit, quantity: v })}
          />
          <Field
            label="备注"
            max={2000}
            value={edit.notes}
            disabled={ctx.busy || frozen}
            onChange={(v) => setEdit({ ...edit, notes: v })}
          />
          {edit.row && (
            <Picker
              disabled={ctx.busy}
              range={Object.values(supplyStatuses)}
              onChange={(e) =>
                setEdit({
                  ...edit,
                  status: Object.keys(supplyStatuses)[
                    Number(e.detail.value)
                  ] as Status,
                })
              }
            >
              <Text>准备状态：{supplyStatuses[edit.status]}</Text>
            </Picker>
          )}
          <Action primary disabled={ctx.busy} onClick={() => void save()}>
            {frozen ? '重试原请求' : '保存物料'}
          </Action>
          <Action
            disabled={ctx.busy}
            onClick={() => {
              void confirm(
                '退出编辑',
                '放弃未保存输入？新增结果不明时请先刷新核对。',
              ).then((ok) => {
                if (ok) {
                  setEdit(undefined);
                  creation.current = undefined;
                  setFrozen(false);
                  void load();
                }
              });
            }}
          >
            取消编辑
          </Action>
        </View>
      ) : history ? (
        <View>
          <Action onClick={() => setHistory(undefined)}>返回物料清单</Action>
          {history.map((h) => (
            <View className="card" key={h.id}>
              <Text className="subtitle">
                V{h.revision} ·{' '}
                {(
                  {
                    CREATED: '新增物料',
                    UPDATED: '更新资料与进度',
                    PHOTO_ADDED: '添加照片',
                    PHOTO_REMOVED: '移除照片',
                  } as Record<string, string>
                )[h.action] ?? '变更记录'}
              </Text>
              <Text className="competition-note">
                操作人：{h.actorId} · {h.occurredAt}
              </Text>
              <Text className="competition-line">
                {historySummary(h.snapshot)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View>
          <View className="competition-row">
            <Action
              disabled={ctx.busy || uploading}
              onClick={() => void load()}
            >
              刷新
            </Action>
            <Action
              primary
              disabled={ctx.busy || !ready || uploading}
              onClick={() => void open()}
            >
              新增物料
            </Action>
          </View>
          <Field label="搜索物料" value={query} onChange={setQuery} />
          <View className="competition-filter-chips">
            {[['', '全部'], ...Object.entries(supplyStatuses)].map(
              ([key, label]) => (
                <Action
                  key={key}
                  primary={filter === key}
                  onClick={() => setFilter(key ?? '')}
                >
                  {label}
                  {ready
                    ? ` ${items.filter((i) => !key || i.status === key).length}`
                    : ''}
                </Action>
              ),
            )}
          </View>
          {items
            .filter(
              (i) =>
                i.name.includes(query.trim()) &&
                (!filter || i.status === filter),
            )
            .map((item) => (
              <View className="card" key={item.id}>
                <Text className="subtitle">
                  {item.name} · {item.quantity}
                </Text>
                <Text className="competition-line">
                  {supplyStatuses[item.status as Status]} ·{' '}
                  {item.notes || '暂无备注'}
                </Text>
                <View className="competition-row">
                  <Action
                    disabled={ctx.busy || uploading}
                    onClick={() => void open(item)}
                  >
                    编辑 / 更新进度
                  </Action>
                  <Action
                    disabled={ctx.busy}
                    onClick={() =>
                      void ctx.run(async (token, valid) => {
                        const h = await client.request(
                          'getEventSupplyHistory',
                          {
                            token,
                            path: { eventId: ctx.eventId, id: item.id },
                          },
                        );
                        if (valid()) setHistory(h);
                      })
                    }
                  >
                    历史
                  </Action>
                </View>
                {item.photos.map((p) => (
                  <View key={p.id}>
                    <Text className="competition-note">
                      {p.originalName} ·{' '}
                      {p.state === 'CONFIRMED' ? '已上传' : '待确认'}
                    </Text>
                    <View className="competition-row">
                      {p.state === 'CONFIRMED' && (
                        <Action
                          disabled={ctx.busy}
                          onClick={() => void view(p)}
                        >
                          查看照片
                        </Action>
                      )}
                      {p.state === 'CONFIRMED' ? (
                        <Action
                          disabled={ctx.busy || uploading}
                          onClick={() => void remove(item, p)}
                        >
                          移除照片
                        </Action>
                      ) : (
                        <Action
                          disabled={ctx.busy || uploading}
                          onClick={() => void photo(item, p)}
                        >
                          选择原照片继续上传
                        </Action>
                      )}
                    </View>
                  </View>
                ))}
                <Action
                  disabled={ctx.busy || uploading || item.photos.length >= 20}
                  onClick={() => void photo(item)}
                >
                  上传照片（JPG / PNG，最多 10 MB）
                </Action>
              </View>
            ))}
          {ready &&
            !items.some(
              (i) =>
                i.name.includes(query.trim()) &&
                (!filter || i.status === filter),
            ) && (
              <View className="competition-empty">
                {items.length
                  ? '没有符合筛选条件的物料，试试其他状态或关键词。'
                  : '还没有物料清单，点击“新增物料”开始准备。'}
              </View>
            )}
        </View>
      )}
    </Shell>
  );
}
