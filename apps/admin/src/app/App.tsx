import { CompetitionPage } from '../features/competition/CompetitionPage';
import { useEffect } from 'react';
import { Button, Result } from 'antd';
import { AppShell } from '../components/admin-shell/AppShell';
import { EventPage } from '../features/events/EventPage';
import { HealthPage } from '../features/health/HealthPage';
import { HostingReviewPage } from '../features/hosting/HostingReviewPage';
import { IndividualPage } from '../features/individuals/IndividualPage';
import { WorkspacePage } from '../features/materials/WorkspacePage';
import { AccountManagementPage } from '../features/auth/AccountManagementPage';
import { PasswordPage } from '../features/auth/PasswordPage';

function normalizePath(path: string) {
  if (path === '/') return '/hosting-applications';
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

export function App() {
  const path = normalizePath(
    location.pathname === '/login'
      ? '/hosting-applications'
      : location.pathname,
  );
  const reviewPage = path === '/materials' || path === '/materials/legacy';
  const eventPage = path === '/events';
  const hostingPage = path === '/hosting-applications';

  useEffect(() => {
    document.title =
      path === '/competition'
        ? '比赛管理中心 · CAAU'
        : reviewPage
          ? '办赛材料审核 · CAAU'
          : hostingPage
            ? '赛事审核中心 · CAAU'
            : eventPage
              ? '赛事管理 · CAAU'
              : path === '/accounts'
                ? '账号与权限 · CAAU'
                : path === '/account/password'
                  ? '账号安全 · CAAU'
                  : path === '/system/health'
                    ? '工程连接检查 · CAAU'
                    : '页面未找到 · CAAU';
  }, [eventPage, hostingPage, path, reviewPage]);

  if (reviewPage) {
    return (
      <AppShell>
        {path === '/materials/legacy' ||
        new URLSearchParams(location.search).has('task') ||
        new URLSearchParams(location.search).has('material') ? (
          <IndividualPage />
        ) : (
          <HostingReviewPage materials />
        )}
        <a className="hq-back-link" href="/materials/legacy">
          历史单份材料
        </a>
      </AppShell>
    );
  }
  if (path === '/competition')
    return (
      <AppShell active="competition">
        <CompetitionPage />
      </AppShell>
    );
  if (eventPage) {
    return (
      <AppShell active="events">
        <EventPage />
      </AppShell>
    );
  }
  if (hostingPage) {
    return (
      <AppShell active="hosting">
        <HostingReviewPage />
      </AppShell>
    );
  }
  if (path === '/accounts') {
    return (
      <AppShell active="accounts">
        <AccountManagementPage />
      </AppShell>
    );
  }
  if (path === '/account/password') {
    return (
      <AppShell>
        <PasswordPage />
      </AppShell>
    );
  }

  // 暂不出现在导航中，仅保留既有自动化回归所需的兼容入口。
  if (path === '/workspace') return <WorkspacePage />;
  if (path === '/system/health') return <HealthPage />;

  return (
    <Result
      status="404"
      title="页面未找到"
      subTitle="当前地址不存在，请返回赛事审核中心。"
      extra={
        <Button type="primary" href="/hosting-applications">
          进入赛事审核中心
        </Button>
      }
    />
  );
}
