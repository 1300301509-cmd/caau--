import type { ReactNode } from 'react';
import { Tag } from 'antd';
import { NavIcon } from './NavIcon';

export function AppShell({
  children,
  active = 'materials',
}: {
  children: ReactNode;
  active?: 'materials' | 'events' | 'hosting';
}) {
  const events = active === 'events';
  const hosting = active === 'hosting';
  const pageName = hosting ? '承办申请' : events ? '赛事管理' : '资料审核';
  return (
    <div className="review-shell">
      <a className="skip-link" href="#review-content">
        跳到{pageName}内容
      </a>

      <header className="global-header">
        <div className="global-header-inner">
          <a
            className="review-brand"
            href="/materials"
            aria-label="CAAU 资料审核首页"
          >
            <span className="review-brand-mark" aria-hidden="true">
              C
            </span>
            <span className="review-brand-copy">
              <strong>CAAU</strong>
              <small>赛事协作平台</small>
            </span>
          </a>

          <div className="global-header-account" aria-label="当前环境">
            <span className="review-sync-dot" aria-hidden="true" />
            <span className="environment-copy">
              <strong>本地测试环境</strong>
              <small>账号功能暂未开放</small>
            </span>
            <Tag color="gold">测试身份</Tag>
          </div>
        </div>
      </header>

      <div className="module-navigation-bar">
        <div className="module-navigation-inner">
          <nav aria-label="主要导航">
            <a
              className={`module-navigation-item ${active === 'materials' ? 'active' : ''}`}
              href="/materials"
              aria-current={active === 'materials' ? 'page' : undefined}
            >
              <NavIcon name="review" />
              <span>资料审核</span>
            </a>
            <a
              className={`module-navigation-item ${hosting ? 'active' : ''}`}
              href="/hosting-applications"
              aria-current={hosting ? 'page' : undefined}
            >
              <NavIcon name="application" />
              <span>承办申请</span>
            </a>
            <a
              className={`module-navigation-item ${events ? 'active' : ''}`}
              href="/events"
              aria-current={events ? 'page' : undefined}
            >
              <NavIcon name="calendar" />
              <span>赛事管理</span>
            </a>
          </nav>
        </div>
      </div>

      <main id="review-content" className="review-content" tabIndex={-1}>
        <header className="review-page-heading">
          <div>
            <span className="review-page-kicker">业务工作台</span>
            <h1>{pageName}</h1>
            <p>
              {hosting
                ? '审核申请、核对版本资料并追溯获批赛事'
                : events
                  ? '创建赛事并查看当前有权管理的赛事详情'
                  : '单份提交、共享审核与完整版本记录'}
            </p>
          </div>
          {(events || hosting) && (
            <div className="review-page-actions">
              <Tag color={hosting ? 'purple' : 'blue'}>
                {hosting ? '总部申请审核' : '总部赛事管理员'}
              </Tag>
            </div>
          )}
        </header>
        {children}
      </main>
    </div>
  );
}
