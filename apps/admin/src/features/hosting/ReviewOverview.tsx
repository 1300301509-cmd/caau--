import { useMemo, useState, type CSSProperties } from 'react';
import type { components } from '@caau/api-client';
import { NavIcon } from '../../components/admin-shell/NavIcon';
import './review-overview.css';

type Detail = components['schemas']['HostingApplicationDetailDto'];
type Status = Detail['status'];
const states: Array<{ value: Status | 'ALL'; label: string }> = [
  { value: 'ALL', label: '全部申请' },
  { value: 'PENDING_REVIEW', label: '待审核' },
  { value: 'IN_REVIEW', label: '审核中' },
  { value: 'NEEDS_SUPPLEMENT', label: '待补充' },
  { value: 'APPROVED', label: '已通过' },
  { value: 'REJECTED', label: '已驳回' },
];
const labels = Object.fromEntries(states.map((s) => [s.value, s.label]));
function info(item: Detail) {
  const submission =
    item.submissions.find((s) => s.id === item.currentSubmissionId) ??
    item.submissions.at(-1);
  const form = (submission?.form ?? {}) as {
    eventName?: string;
    startDate?: string;
    endDate?: string;
    location?: { administrativeArea?: { province?: string; city?: string } };
  };
  return { submission, form };
}
const shortDate = (date?: string) =>
  date ? date.slice(0, 10).replaceAll('-', '.') : '未填写';
const submitDate = (date?: string) =>
  date
    ? new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(date))
    : '尚未提交';

export function ReviewOverview({
  items,
  materials = false,
  available,
  loading,
  onSelect,
}: {
  items: Detail[];
  materials?: boolean;
  available: boolean;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Status | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        states.map((s) => [
          s.value,
          s.value === 'ALL'
            ? items.length
            : items.filter((i) => i.status === s.value).length,
        ]),
      ),
    [items],
  );
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) =>
        (info(b).submission?.submittedAt ?? '').localeCompare(
          info(a).submission?.submittedAt ?? '',
        ),
      ),
    [items],
  );
  const filtered = sorted.filter((item) => {
    const { form } = info(item);
    return (
      (filter === 'ALL' || item.status === filter) &&
      `${form.eventName ?? ''} ${item.applicantOrganizationName}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase())
    );
  });
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 6) - 1),
  );
  const rows = filtered.slice(currentPage * 6, currentPage * 6 + 6);
  const completed = (counts.APPROVED ?? 0) + (counts.REJECTED ?? 0);
  const percentage = items.length
    ? Math.round((completed / items.length) * 100)
    : 0;
  const chooseFilter = (value: Status | 'ALL') => {
    setFilter(value);
    setPage(0);
  };
  const metrics = [
    {
      state: 'PENDING_REVIEW' as const,
      title: '等待审核',
      detail: '等待总部开始处理',
      theme: 'apricot',
      icon: 'application' as const,
    },
    {
      state: 'IN_REVIEW' as const,
      title: '正在审核',
      detail: '可与其他审核员接续处理',
      theme: 'mint',
      icon: 'review' as const,
    },
    {
      state: 'APPROVED' as const,
      title: '审核通过',
      detail: materials ? '整套办赛材料已审核通过' : '已获批并创建正式赛事',
      theme: 'blue',
      icon: 'calendar' as const,
    },
  ];
  return (
    <div className="review-dashboard">
      <div className="review-dashboard-primary">
        <section className="review-metrics" aria-label="申请审核概况">
          {metrics.map((metric) => (
            <button
              key={metric.state}
              type="button"
              className={`review-metric ${metric.theme}`}
              onClick={() => chooseFilter(metric.state)}
              aria-pressed={filter === metric.state}
            >
              <span className="metric-top">
                <span>{metric.title}</span>
                <NavIcon name={metric.icon} />
              </span>
              <span className="metric-value">
                {available
                  ? (counts[metric.state] ?? 0).toString().padStart(2, '0')
                  : '—'}
                <small>项</small>
              </span>
              <span className="metric-foot">
                {metric.detail}
                <span aria-hidden="true">↗</span>
              </span>
            </button>
          ))}
        </section>
        <section
          className="review-queue-card"
          aria-labelledby="review-queue-title"
          aria-busy={loading}
        >
          <header className="review-queue-heading">
            <div>
              <h2 id="review-queue-title">
                {materials ? '办赛材料' : '承办申请'}
                <span>{materials ? 'MATERIALS' : 'APPLICATIONS'}</span>
              </h2>
              <p>
                {materials
                  ? '核对7项必填信息，整套通过或退回补充'
                  : '查看申请资料，推进赛事筹备'}
              </p>
            </div>
            <span className="review-total">
              {available
                ? `${items.length} 套${materials ? '材料' : '申请'}`
                : '等待载入'}
            </span>
          </header>
          <div className="review-queue-tools">
            <label className="review-search">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                aria-label="搜索赛事或申请机构"
                placeholder="搜索赛事名称、申请机构"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
              {query && (
                <button
                  type="button"
                  aria-label="清除搜索"
                  onClick={() => {
                    setQuery('');
                    setPage(0);
                  }}
                >
                  ×
                </button>
              )}
            </label>
            <span className="review-sorting">
              按提交时间排序 <span aria-hidden="true">↓</span>
            </span>
          </div>
          <div
            className="review-state-filters"
            role="group"
            aria-label="申请状态筛选"
          >
            {states
              .filter((state) => !materials || state.value !== 'REJECTED')
              .map((state) => (
                <button
                  type="button"
                  key={state.value}
                  aria-pressed={filter === state.value}
                  className={filter === state.value ? 'active' : ''}
                  onClick={() => chooseFilter(state.value)}
                >
                  {materials && state.value === 'ALL'
                    ? '全部材料'
                    : state.label}
                  <span>{available ? counts[state.value] : '—'}</span>
                </button>
              ))}
          </div>
          <div className="review-table" role="table" aria-label="承办申请队列">
            <div className="review-table-header" role="row">
              <span role="columnheader">赛事 / 申请机构</span>
              <span role="columnheader">赛事日期</span>
              <span role="columnheader">状态</span>
              <span role="columnheader">操作</span>
            </div>
            <div role="rowgroup">
              {rows.map((item, index) => {
                const { form, submission } = info(item);
                return (
                  <div role="row" className="review-table-row" key={item.id}>
                    <div className="review-event-cell" role="cell">
                      <span
                        className={`review-event-icon tone-${index % 3}`}
                        aria-hidden="true"
                      >
                        <NavIcon name="calendar" />
                      </span>
                      <div>
                        <button
                          className="review-event-title"
                          type="button"
                          onClick={() => onSelect(item.id)}
                        >
                          {form.eventName || '未命名赛事'}
                        </button>
                        <span>{item.applicantOrganizationName}</span>
                        <small>
                          提交于 {submitDate(submission?.submittedAt)}
                        </small>
                      </div>
                    </div>
                    <div className="review-date-cell" role="cell">
                      <span>{shortDate(form.startDate)}</span>
                      <small>至 {shortDate(form.endDate)}</small>
                    </div>
                    <div role="cell">
                      <span className={`review-state state-${item.status}`}>
                        <i aria-hidden="true" />
                        {labels[item.status] ?? item.status}
                      </span>
                    </div>
                    <div role="cell">
                      <button
                        className="review-open"
                        type="button"
                        aria-label={`查看申请：${form.eventName || '未命名赛事'}`}
                        onClick={() => onSelect(item.id)}
                      >
                        查看<span aria-hidden="true">↗</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {!rows.length && (
            <div className="review-zero">
              <span className="review-zero-icon">
                <NavIcon name="application" />
              </span>
              <strong>
                {loading
                  ? '正在读取申请…'
                  : !available
                    ? '选择总部身份，开始审核'
                    : query
                      ? '没有找到匹配的申请'
                      : '当前没有这类申请'}
              </strong>
              <p>
                {!available
                  ? '登录后将展示您有权审核的赛事申请。'
                  : query
                    ? '试试其他赛事名称，或清除搜索条件。'
                    : '新的申请提交后，会显示在这里。'}
              </p>
              {query && (
                <button type="button" onClick={() => setQuery('')}>
                  清除搜索
                </button>
              )}
            </div>
          )}
          <footer className="review-table-footer">
            <span>
              {available
                ? `共 ${filtered.length} 项${filtered.length ? ` · 当前 ${currentPage * 6 + 1}–${Math.min((currentPage + 1) * 6, filtered.length)} 项` : ''}`
                : '仅显示当前身份有权查看的申请'}
            </span>
            <div>
              <button
                type="button"
                aria-label="上一页申请"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                ‹
              </button>
              <span>{currentPage + 1}</span>
              <button
                type="button"
                aria-label="下一页申请"
                disabled={(currentPage + 1) * 6 >= filtered.length}
                onClick={() => setPage(currentPage + 1)}
              >
                ›
              </button>
            </div>
          </footer>
        </section>
        <p className="review-data-note">
          <span aria-hidden="true">○</span>{' '}
          数据范围随当前审核权限更新，审核操作均保留历史记录。
        </p>
      </div>
      <aside className="review-dashboard-aside">
        <section className="review-progress-card">
          <header>
            <h2>审核概览</h2>
            <span>当前全部申请</span>
          </header>
          <div
            className="review-progress-ring"
            style={
              {
                '--progress': `${available ? percentage : 0}%`,
              } as CSSProperties
            }
          >
            <div>
              <strong>
                {available && items.length ? `${percentage}%` : '—'}
              </strong>
              <span>已形成审核结论</span>
            </div>
          </div>
          <div className="review-progress-count">
            <span>
              <i className="dot-complete" />
              已通过 / 已驳回<strong>{available ? completed : '—'}</strong>
            </span>
            <span>
              <i className="dot-pending" />
              待处理 / 待补充
              <strong>{available ? items.length - completed : '—'}</strong>
            </span>
          </div>
          <p>通过或驳回后计入已完成审核</p>
        </section>
        <section className="review-recent-card">
          <header>
            <h2>最近提交</h2>
            <span>最新 3 项</span>
          </header>
          {sorted.slice(0, 3).map((item) => {
            const { form, submission } = info(item);
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => onSelect(item.id)}
              >
                <span className="review-recent-mark" aria-hidden="true">
                  <NavIcon name="application" />
                </span>
                <span>
                  <strong>{form.eventName || '未命名赛事'}</strong>
                  <small>
                    {submitDate(submission?.submittedAt)} · V
                    {submission?.version ?? 1}
                  </small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            );
          })}
          {!items.length && (
            <p className="review-recent-empty">
              {available ? '暂无提交记录' : '登录后查看最新申请'}
            </p>
          )}
        </section>
        <section className="review-note-card">
          <NavIcon name="review" />
          <strong>让每一份申请都有迹可循</strong>
          <p>
            核对赛事信息与申请资料。需要补充时，写明具体要求，帮助承办方顺利完善。
          </p>
          <span>认真审核 · 有序办赛</span>
        </section>
      </aside>
    </div>
  );
}
