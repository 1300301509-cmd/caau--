import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Image,
  Input,
  Select,
  Skeleton,
  Statistic,
  Table,
  Tag,
  Timeline,
} from 'antd';
import { ApiError, type components } from '@caau/api-client';
import { NavIcon } from '../../components/admin-shell/NavIcon';
import { useAuth } from '../auth/AuthContext';
import { client } from '../materials/client';

type Supply = components['schemas']['EventSupplyItemViewDto'];
type SupplyPhoto = components['schemas']['EventSupplyPhotoViewDto'];
type SupplyHistory = components['schemas']['EventSupplyHistoryDto'];
type Status = Supply['status'];

const statusMeta: Record<
  Status,
  { label: string; color: string; className: string }
> = {
  TO_PREPARE: {
    label: '待准备',
    color: 'default',
    className: 'is-waiting',
  },
  PREPARING: {
    label: '准备中',
    color: 'processing',
    className: 'is-progress',
  },
  READY: { label: '已备齐', color: 'success', className: 'is-ready' },
  SHORTAGE: { label: '有缺口', color: 'error', className: 'is-shortage' },
};

const actionLabels: Record<string, string> = {
  CREATED: '承办方新增物料',
  UPDATED: '承办方更新信息',
  PHOTO_ADDED: '承办方补充照片',
  PHOTO_REMOVED: '承办方移除照片',
};

const dateTime = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function message(cause: unknown) {
  if (cause instanceof ApiError && cause.status === 403)
    return '当前账号没有查看这场赛事物料的权限。';
  return '物料信息暂时无法读取，请稍后重试。';
}

function snapshotStatus(snapshot: SupplyHistory['snapshot']) {
  const status = snapshot.status;
  return typeof status === 'string' && status in statusMeta
    ? statusMeta[status as Status].label
    : '';
}

export function SuppliesPanel({ eventId }: { eventId: string }) {
  const auth = useAuth();
  const token =
    auth.mode === 'local'
      ? (sessionStorage.getItem('caau.local-test-session') ?? '')
      : '';
  const [rows, setRows] = useState<Supply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status | 'ALL'>('ALL');
  const [selected, setSelected] = useState<Supply>();
  const [history, setHistory] = useState<SupplyHistory[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const objectUrls = useRef<string[]>([]);

  const clearPhotoUrls = () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current = [];
    setPhotoUrls({});
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    setRows([]);
    setSelected(undefined);
    clearPhotoUrls();
    if (!eventId) {
      setLoading(false);
      return () => {
        alive = false;
      };
    }
    void client
      .request('listEventSupplies', { token, path: { eventId } })
      .then((items) => {
        if (alive) setRows(items);
      })
      .catch((cause) => {
        if (alive) setError(message(cause));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [eventId, token, attempt]);

  useEffect(
    () => () => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  const summary = useMemo(
    () => ({
      total: rows.length,
      quantity: rows.reduce((total, item) => total + item.quantity, 0),
      ready: rows.filter((item) => item.status === 'READY').length,
      attention: rows.filter((item) => item.status === 'SHORTAGE').length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('zh-CN');
    return rows.filter(
      (item) =>
        (status === 'ALL' || item.status === status) &&
        (!keyword ||
          item.name.toLocaleLowerCase('zh-CN').includes(keyword) ||
          item.notes.toLocaleLowerCase('zh-CN').includes(keyword)),
    );
  }, [query, rows, status]);

  async function openDetail(item: Supply) {
    clearPhotoUrls();
    setSelected(item);
    setHistory([]);
    setDetailError('');
    setDetailLoading(true);
    try {
      const [historyRows, photos] = await Promise.all([
        client.request('getEventSupplyHistory', {
          token,
          path: { eventId, id: item.id },
        }),
        Promise.all(
          item.photos
            .filter((photo) => photo.state === 'CONFIRMED')
            .slice(0, 4)
            .map(async (photo) => {
              const bytes = await client.request(
                'EventSuppliesController_download',
                { token, path: { id: photo.id } },
              );
              const url = URL.createObjectURL(
                new Blob([bytes], {
                  type: `image/${photo.extension === 'jpg' ? 'jpeg' : photo.extension}`,
                }),
              );
              return [photo.id, url] as const;
            }),
        ),
      ]);
      setHistory(historyRows);
      objectUrls.current = photos.map(([, url]) => url);
      setPhotoUrls(Object.fromEntries(photos));
    } catch (cause) {
      setDetailError(message(cause));
    } finally {
      setDetailLoading(false);
    }
  }

  async function previewPhoto(photo: SupplyPhoto) {
    if (photoUrls[photo.id]) return;
    setDetailError('');
    try {
      const bytes = await client.request('EventSuppliesController_download', {
        token,
        path: { id: photo.id },
      });
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type: `image/${photo.extension === 'jpg' ? 'jpeg' : photo.extension}`,
        }),
      );
      objectUrls.current.push(url);
      setPhotoUrls((current) => ({ ...current, [photo.id]: url }));
    } catch (cause) {
      setDetailError(message(cause));
    }
  }

  async function downloadPhoto(photo: SupplyPhoto) {
    setDetailError('');
    try {
      const bytes = await client.request('EventSuppliesController_download', {
        token,
        path: { id: photo.id },
      });
      const url = URL.createObjectURL(new Blob([bytes]));
      const link = document.createElement('a');
      link.href = url;
      link.download = photo.originalName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setDetailError(message(cause));
    }
  }

  return (
    <section className="competition-panel supplies-panel">
      <header>
        <div>
          <span className="competition-kicker">SUPPLIES</span>
          <h2>物料管理</h2>
          <p>查看承办方提交的物料数量、照片和当前准备进度。</p>
        </div>
        <Tag className="supplies-readonly-tag">总部只读追踪</Tag>
      </header>

      <Alert
        className="supplies-intro"
        type="info"
        showIcon
        title="承办方更新后自动同步到这里"
        description="该模块用于查看和追踪，不设置审核通过、退回或总部代改操作。"
      />

      {error && (
        <Alert
          className="supplies-error"
          type="error"
          showIcon
          title={error}
          action={
            <Button
              size="small"
              onClick={() => setAttempt((value) => value + 1)}
            >
              重试
            </Button>
          }
        />
      )}

      <div className="supplies-summary" aria-label="物料概览">
        <div>
          <span className="supplies-summary-icon is-total" aria-hidden="true">
            <NavIcon name="supplies" />
          </span>
          <Statistic title="物料项" value={summary.total} suffix="项" />
        </div>
        <div>
          <span
            className="supplies-summary-icon is-quantity"
            aria-hidden="true"
          >
            <NavIcon name="chart" />
          </span>
          <Statistic title="需求总量" value={summary.quantity} />
        </div>
        <div>
          <span
            className="supplies-summary-icon is-complete"
            aria-hidden="true"
          >
            <NavIcon name="application" />
          </span>
          <Statistic title="已备齐" value={summary.ready} suffix="项" />
        </div>
        <div>
          <span
            className="supplies-summary-icon is-attention"
            aria-hidden="true"
          >
            <NavIcon name="review" />
          </span>
          <Statistic title="需要关注" value={summary.attention} suffix="项" />
        </div>
      </div>

      <div className="supplies-toolbar">
        <Input.Search
          allowClear
          aria-label="搜索物料"
          placeholder="搜索物料名称或备注"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select
          aria-label="按准备状态筛选"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'ALL', label: '全部状态' },
            ...Object.entries(statusMeta).map(([value, meta]) => ({
              value,
              label: meta.label,
            })),
          ]}
        />
      </div>

      <Table<Supply>
        rowKey="id"
        loading={loading}
        dataSource={filtered}
        pagination={{ pageSize: 8, hideOnSinglePage: true }}
        scroll={{ x: 760 }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                eventId
                  ? query || status !== 'ALL'
                    ? '当前筛选条件下没有物料'
                    : '承办方尚未提交赛事物料'
                  : '请先选择赛事'
              }
            />
          ),
        }}
        columns={[
          {
            title: '物料名称',
            dataIndex: 'name',
            width: 230,
            render: (value: string, item) => (
              <div className="supplies-name-cell">
                <strong>{value}</strong>
                <span>{item.notes || '暂无补充说明'}</span>
              </div>
            ),
          },
          {
            title: '数量',
            dataIndex: 'quantity',
            width: 100,
            render: (value: number) => <strong>{value}</strong>,
          },
          {
            title: '准备状态',
            dataIndex: 'status',
            width: 130,
            render: (value: Status) => (
              <Tag
                color={statusMeta[value].color}
                className={`supplies-status ${statusMeta[value].className}`}
              >
                {statusMeta[value].label}
              </Tag>
            ),
          },
          {
            title: '照片',
            dataIndex: 'photos',
            width: 100,
            render: (photos: SupplyPhoto[]) =>
              `${photos.filter((photo) => photo.state === 'CONFIRMED').length} 张`,
          },
          {
            title: '最后更新',
            dataIndex: 'updatedAt',
            width: 150,
            render: (value: string) => dateTime.format(new Date(value)),
          },
          {
            title: '操作',
            key: 'action',
            fixed: 'right',
            width: 96,
            render: (_, item) => (
              <Button type="link" onClick={() => void openDetail(item)}>
                查看详情
              </Button>
            ),
          },
        ]}
      />

      <Drawer
        className="supplies-drawer"
        title="物料详情"
        width={560}
        open={!!selected}
        onClose={() => {
          setSelected(undefined);
          clearPhotoUrls();
        }}
      >
        {selected && (
          <>
            <div className="supplies-detail-heading">
              <div>
                <span>物料名称</span>
                <h3>{selected.name}</h3>
              </div>
              <Tag color={statusMeta[selected.status].color}>
                {statusMeta[selected.status].label}
              </Tag>
            </div>
            <dl className="supplies-detail-meta">
              <div>
                <dt>需求数量</dt>
                <dd>{selected.quantity}</dd>
              </div>
              <div>
                <dt>当前版本</dt>
                <dd>V{selected.revision}</dd>
              </div>
              <div>
                <dt>最后更新</dt>
                <dd>{dateTime.format(new Date(selected.updatedAt))}</dd>
              </div>
            </dl>
            <section className="supplies-detail-section">
              <h4>补充说明</h4>
              <p>{selected.notes || '承办方未填写补充说明。'}</p>
            </section>
            {detailError && <Alert type="error" showIcon title={detailError} />}
            <section className="supplies-detail-section">
              <h4>现场照片</h4>
              {detailLoading ? (
                <Skeleton active paragraph={{ rows: 2 }} />
              ) : selected.photos.filter((photo) => photo.state === 'CONFIRMED')
                  .length ? (
                <Image.PreviewGroup>
                  <div className="supplies-photo-grid">
                    {selected.photos
                      .filter((photo) => photo.state === 'CONFIRMED')
                      .map((photo) => (
                        <figure key={photo.id}>
                          {photoUrls[photo.id] ? (
                            <Image
                              src={photoUrls[photo.id]}
                              alt={`${selected.name} - ${photo.originalName}`}
                              height={124}
                            />
                          ) : (
                            <div className="supplies-photo-placeholder">
                              <Button
                                type="link"
                                onClick={() => void previewPhoto(photo)}
                              >
                                加载预览
                              </Button>
                            </div>
                          )}
                          <figcaption>
                            <span title={photo.originalName}>
                              {photo.originalName}
                            </span>
                            <Button
                              type="link"
                              size="small"
                              onClick={() => void downloadPhoto(photo)}
                            >
                              下载
                            </Button>
                          </figcaption>
                        </figure>
                      ))}
                  </div>
                </Image.PreviewGroup>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无已确认照片"
                />
              )}
            </section>
            <section className="supplies-detail-section">
              <h4>更新记录</h4>
              {detailLoading ? (
                <Skeleton active paragraph={{ rows: 3 }} />
              ) : history.length ? (
                <Timeline
                  items={[...history].reverse().map((entry) => ({
                    color: entry.action === 'PHOTO_REMOVED' ? 'gray' : 'green',
                    children: (
                      <div className="supplies-history-entry">
                        <strong>
                          {actionLabels[entry.action] ?? entry.action}
                        </strong>
                        <span>
                          V{entry.revision} ·{' '}
                          {dateTime.format(new Date(entry.occurredAt))}
                          {snapshotStatus(entry.snapshot)
                            ? ` · ${snapshotStatus(entry.snapshot)}`
                            : ''}
                        </span>
                      </div>
                    ),
                  }))}
                />
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无更新记录"
                />
              )}
            </section>
          </>
        )}
      </Drawer>
    </section>
  );
}
