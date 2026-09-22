import { useState, type ReactNode } from 'react';
import { Button, Select } from 'antd';
import { NavIcon } from './NavIcon';
import { useAuth } from '../../features/auth/AuthContext';
import brandImage from '../../assets/caau-brand.jpg';
import './review-center.css';

const localRoleLabels: Record<string, string> = {
  HEADQUARTERS_SUPER_ADMIN: '超级管理员',
  EVENT_MANAGER: '赛事管理员',
  REVIEWER: '总部审核员',
  ORGANIZER: '承办方经办人',
};

export function AppShell({
  children,
  active = 'materials',
}: {
  children: ReactNode;
  active?: 'materials' | 'events' | 'hosting' | 'accounts' | 'competition';
}) {
  const auth = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const events = active === 'events';
  const competition = active === 'competition';
  const reviewing = active === 'hosting' || active === 'materials';
  return (
    <div className="hq-shell">
      <a className="skip-link" href="#review-content">
        跳到主要内容
      </a>
      <aside
        className={`hq-sidebar ${sidebarOpen ? 'is-expanded' : ''}`}
        aria-label="总部侧栏"
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') setSidebarOpen(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') setSidebarOpen(false);
        }}
        onFocus={(event) => {
          if (event.target.matches(':focus-visible')) setSidebarOpen(true);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setSidebarOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setSidebarOpen(false);
        }}
      >
        <div className="hq-sidebar-panel">
          <a
            className="hq-brand"
            href="/hosting-applications"
            aria-label="CAAU 总部首页"
          >
            <svg
              className="hq-brand-symbol"
              viewBox="306 154 666 648"
              preserveAspectRatio="xMidYMid meet"
              aria-hidden="true"
              focusable="false"
            >
              <image href={brandImage} width="1254" height="1254" />
            </svg>
            <span className="hq-brand-copy">
              <svg
                className="hq-brand-wordmark"
                viewBox="100 803 1054 233"
                preserveAspectRatio="xMidYMid meet"
                aria-hidden="true"
                focusable="false"
              >
                <image href={brandImage} width="1254" height="1254" />
              </svg>
              <small>赛事协作平台</small>
            </span>
          </a>
          <div className="hq-nav-caption">
            工作空间 <span>WORKSPACE</span>
          </div>
          <nav id="hq-primary-nav" aria-label="主要导航">
            <a
              className={`hq-nav-item ${reviewing || events ? 'active' : ''}`}
              href="/hosting-applications"
              aria-current={reviewing || events ? 'page' : undefined}
            >
              <NavIcon name="review" />
              <span>赛事审核中心</span>
            </a>
            <a
              className={`hq-nav-item ${competition ? 'active' : ''}`}
              href="/competition"
              aria-current={competition ? 'page' : undefined}
            >
              <NavIcon name="calendar" />
              <span>比赛管理中心</span>
            </a>
            {auth.mode === 'formal' && auth.identity?.canManageAccounts && (
              <a
                className={`hq-nav-item ${active === 'accounts' ? 'active' : ''}`}
                href="/accounts"
                aria-current={active === 'accounts' ? 'page' : undefined}
              >
                <NavIcon name="account" />
                <span>账号与权限</span>
              </a>
            )}
          </nav>
          <div className="hq-sidebar-note">
            <strong>每一场热爱，都值得认真对待。</strong>
            <p>
              从办赛申请到材料审核
              <br />
              让赛事筹备有序向前
            </p>
          </div>
          <div className="hq-sidebar-footer">
            <span className="hq-account-avatar" aria-hidden="true">
              {(auth.identity?.displayName ?? auth.session?.displayName)?.slice(
                0,
                1,
              ) ?? '总'}
            </span>
            <span className="hq-account-copy">
              {auth.identity?.displayName ??
                auth.session?.displayName ??
                '总部工作空间'}
              <small>{auth.mode === 'formal' ? '正式账号' : '本地测试'}</small>
            </span>
            {auth.mode === 'local' && (
              <div className="hq-local-switcher">
                <span className="hq-local-switcher-label">
                  LOCAL · 测试身份
                </span>
                <Select
                  aria-label="全局切换本地账号权限"
                  value={auth.localIdentityKey || undefined}
                  loading={auth.localBusy}
                  disabled={auth.localBusy}
                  onChange={(key) => void auth.switchLocalIdentity(key)}
                  options={auth.localChoices.map((choice) => ({
                    value: choice.key,
                    label: `${choice.displayName} · ${localRoleLabels[choice.role] ?? choice.role}`,
                  }))}
                  popupMatchSelectWidth={280}
                />
                <small>仅本地测试可见；切换后按该账号权限重新加载。</small>
              </div>
            )}
            {auth.mode === 'formal' && (
              <div className="hq-account-actions">
                <a href="/account/password">账号安全</a>
                <Button
                  type="text"
                  size="small"
                  onClick={() => void auth.logout()}
                >
                  退出
                </Button>
              </div>
            )}
          </div>
        </div>
      </aside>
      <div className="hq-main">
        <header className="hq-topbar">
          <div className="hq-breadcrumb">
            总部工作台 <span>/</span>{' '}
            <strong>
              {competition
                ? '比赛管理中心'
                : events
                  ? '赛事详情'
                  : active === 'accounts'
                    ? '账号与权限'
                    : '赛事审核中心'}
            </strong>
          </div>
        </header>
        <main
          id="review-content"
          className="review-content hq-content"
          tabIndex={-1}
        >
          <header className="hq-page-heading">
            <div>
              <p className="hq-eyebrow">
                {competition ? 'COMPETITION MANAGEMENT' : 'EVENT REVIEW CENTER'}
              </p>
              <h1>
                {competition
                  ? '比赛管理中心'
                  : events
                    ? '赛事详情'
                    : active === 'accounts'
                      ? '账号与权限'
                      : '赛事审核中心'}
              </h1>
              <p>
                {competition
                  ? '从球队到赛程，集中管理每一场比赛。'
                  : events
                    ? '查看申请获批后的赛事信息与承办机构。'
                    : active === 'accounts'
                      ? '创建、停用和重置总部工作账号；业务授权仍以后端为准。'
                      : '有序处理每一份申请，让赛事从这里启程。'}
              </p>
            </div>
            <span className="hq-heading-badge">
              <NavIcon
                name={
                  competition
                    ? 'calendar'
                    : active === 'accounts'
                      ? 'account'
                      : 'application'
                }
              />
              {competition
                ? '总部比赛工作台'
                : active === 'accounts'
                  ? '安全管理'
                  : '总部审核工作台'}
            </span>
          </header>
          {reviewing && (
            <nav className="hq-review-tabs" aria-label="审核类型">
              <a
                href="/hosting-applications"
                className={active === 'hosting' ? 'active' : ''}
                aria-current={active === 'hosting' ? 'page' : undefined}
              >
                <NavIcon name="application" />
                承办申请审核
              </a>
              <a
                href="/materials"
                className={active === 'materials' ? 'active' : ''}
                aria-current={active === 'materials' ? 'page' : undefined}
              >
                <NavIcon name="review" />
                办赛材料审核
              </a>
            </nav>
          )}
          {events && (
            <a className="hq-back-link" href="/hosting-applications">
              ← 返回赛事审核中心
            </a>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
