import { useEffect, useState, type ReactNode } from 'react';
import { Breadcrumb, Button, Layout, Menu, Tag } from 'antd';
import { NavIcon } from './NavIcon';

const { Header, Sider, Content } = Layout;
const COLLAPSE_KEY = 'caau-review-navigation-collapsed';

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === 'true',
  );
  const [compact, setCompact] = useState(
    () => matchMedia('(max-width: 991px)').matches,
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!compact) localStorage.setItem(COLLAPSE_KEY, String(collapsed));
  }, [collapsed, compact]);

  useEffect(() => {
    if (!compact) setMobileOpen(false);
  }, [compact]);

  const navigationCollapsed = compact ? !mobileOpen : collapsed;

  return (
    <Layout className="review-shell">
      <a className="skip-link" href="#review-content">
        跳到资料审核内容
      </a>
      {compact && mobileOpen && (
        <button
          className="review-nav-scrim"
          type="button"
          aria-label="关闭导航"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <Sider
        className="review-sider"
        theme="light"
        width={232}
        collapsedWidth={compact ? 0 : 68}
        collapsed={navigationCollapsed}
        collapsible={!compact}
        trigger={null}
        breakpoint="lg"
        onBreakpoint={setCompact}
      >
        <a
          className="review-brand"
          href="/materials"
          aria-label="CAAU 资料审核首页"
        >
          <span className="review-brand-mark" aria-hidden="true">
            C
          </span>
          {!navigationCollapsed && (
            <span className="review-brand-copy">
              <strong>CAAU</strong>
              <small>赛事协作平台</small>
            </span>
          )}
        </a>

        <div className="review-nav-section">
          {!navigationCollapsed && (
            <span className="review-nav-label">业务工作台</span>
          )}
          <nav aria-label="主要导航">
            <Menu
              mode="inline"
              selectedKeys={['materials']}
              items={[
                {
                  key: 'materials',
                  icon: <NavIcon name="review" />,
                  label: (
                    <a href="/materials" aria-current="page">
                      资料审核
                    </a>
                  ),
                },
              ]}
            />
          </nav>
        </div>

        <div className="review-sider-footer">
          {!navigationCollapsed && (
            <div className="environment-status">
              <NavIcon name="status" />
              <span>
                <strong>本地开发环境</strong>
                <small>非生产系统</small>
              </span>
            </div>
          )}
          {!compact && (
            <Button
              className="review-collapse"
              type="text"
              aria-label={collapsed ? '展开导航' : '折叠导航'}
              aria-expanded={!collapsed}
              icon={<NavIcon name="collapse" />}
              onClick={() => setCollapsed((value) => !value)}
            >
              {!collapsed && '收起侧栏'}
            </Button>
          )}
        </div>
      </Sider>

      <Layout className="review-main-layout">
        <Header className="review-header">
          <Button
            className="review-mobile-menu"
            type="text"
            aria-label={mobileOpen ? '关闭导航' : '打开导航'}
            aria-expanded={mobileOpen}
            icon={<NavIcon name={mobileOpen ? 'close' : 'menu'} />}
            onClick={() => setMobileOpen((value) => !value)}
          />
          <Breadcrumb
            items={[{ title: '业务工作台' }, { title: '资料审核' }]}
          />
          <div className="review-header-status">
            <span className="review-sync-dot" aria-hidden="true" />
            <span>本地服务</span>
            <Tag color="gold">测试身份</Tag>
          </div>
        </Header>

        <Content id="review-content" className="review-content" tabIndex={-1}>
          <header className="review-page-heading">
            <div>
              <h1>资料审核</h1>
              <p>单份提交、共享审核与完整版本记录</p>
            </div>
            <Tag color="blue">约 2 秒自动同步</Tag>
          </header>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
