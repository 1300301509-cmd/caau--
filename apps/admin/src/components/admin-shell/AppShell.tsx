import type { ReactNode } from 'react';
import { NavIcon } from './NavIcon';
import './review-center.css';

export function AppShell({
  children,
  active = 'materials',
}: {
  children: ReactNode;
  active?: 'materials' | 'events' | 'hosting';
}) {
  const events = active === 'events';
  const date = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
  return (
    <div className="hq-shell">
      <a className="skip-link" href="#review-content">
        跳到审核内容
      </a>
      <aside className="hq-sidebar">
        <a
          className="hq-brand"
          href="/hosting-applications"
          aria-label="CAAU 总部首页"
        >
          <span className="hq-brand-symbol" aria-hidden="true">
            C<span />
          </span>
          <span>
            <strong>CAAU</strong>
            <small>赛事协作平台</small>
          </span>
        </a>
        <div className="hq-nav-caption">
          工作空间 <span>WORKSPACE</span>
        </div>
        <nav aria-label="主要导航">
          <a
            className="hq-nav-item active"
            href="/hosting-applications"
            aria-current="page"
          >
            <NavIcon name="review" />
            <span>赛事审核中心</span>
            <span className="hq-nav-arrow" aria-hidden="true">
              ›
            </span>
          </a>
        </nav>
        <div className="hq-sidebar-note">
          <div className="hq-court" aria-hidden="true">
            <span />
            <i />
          </div>
          <strong>每一场热爱，都值得认真对待。</strong>
          <p>
            从办赛申请到材料审核
            <br />
            让赛事筹备有序向前
          </p>
        </div>
        <div className="hq-sidebar-footer">
          <span>CAAU 总部工作台</span>
          <small>本地测试环境</small>
        </div>
      </aside>
      <div className="hq-main">
        <header className="hq-topbar">
          <div className="hq-breadcrumb">
            总部工作台 <span>/</span>{' '}
            <strong>{events ? '赛事详情' : '赛事审核中心'}</strong>
          </div>
          <div className="hq-topbar-right">
            <time>{date}</time>
            {active === 'hosting' ? (
              <div id="hq-account-slot" />
            ) : (
              <>
                <span className="hq-account-avatar" aria-hidden="true">
                  总
                </span>
                <span className="hq-account-copy">
                  总部工作空间<small>本地测试</small>
                </span>
              </>
            )}
          </div>
        </header>
        <main
          id="review-content"
          className="review-content hq-content"
          tabIndex={-1}
        >
          <header className="hq-page-heading">
            <div>
              <p className="hq-eyebrow">EVENT REVIEW CENTER</p>
              <h1>{events ? '赛事详情' : '赛事审核中心'}</h1>
              <p>
                {events
                  ? '查看申请获批后的赛事信息与承办机构。'
                  : '有序处理每一份申请，让赛事从这里启程。'}
              </p>
            </div>
            <span className="hq-heading-badge">
              <NavIcon name="application" />
              总部审核工作台
            </span>
          </header>
          {!events && (
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
