import { useEffect } from 'react';
import { Button, Result } from 'antd';
import { AppShell } from '../components/admin-shell/AppShell';
import { EventPage } from '../features/events/EventPage';
import { HealthPage } from '../features/health/HealthPage';
import { HostingReviewPage } from '../features/hosting/HostingReviewPage';
import { IndividualPage } from '../features/individuals/IndividualPage';
import { WorkspacePage } from '../features/materials/WorkspacePage';

function normalizePath(path: string) {
  if (path === '/') return '/materials';
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

export function App() {
  const path = normalizePath(location.pathname);
  const reviewPage = path === '/materials';
  const eventPage = path === '/events';
  const hostingPage = path === '/hosting-applications';

  useEffect(() => {
    document.title = reviewPage
      ? '资料审核 · CAAU'
      : hostingPage
        ? '承办申请 · CAAU'
        : eventPage
          ? '赛事管理 · CAAU'
          : path === '/system/health'
            ? '工程连接检查 · CAAU'
            : '页面未找到 · CAAU';
  }, [eventPage, hostingPage, path, reviewPage]);

  if (reviewPage) {
    return (
      <AppShell>
        <IndividualPage />
      </AppShell>
    );
  }
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

  // 暂不出现在导航中，仅保留既有自动化回归所需的兼容入口。
  if (path === '/workspace') return <WorkspacePage />;
  if (path === '/system/health') return <HealthPage />;

  return (
    <Result
      status="404"
      title="页面未找到"
      subTitle="当前地址不存在，请从顶部业务导航进入。"
      extra={
        <Button type="primary" href="/materials">
          进入资料审核
        </Button>
      }
    />
  );
}
