import { useEffect } from 'react';
import { Button, Result } from 'antd';
import { AppShell } from '../components/admin-shell/AppShell';
import { HealthPage } from '../features/health/HealthPage';
import { IndividualPage } from '../features/individuals/IndividualPage';
import { WorkspacePage } from '../features/materials/WorkspacePage';

function normalizePath(path: string) {
  if (path === '/') return '/materials';
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

export function App() {
  const path = normalizePath(location.pathname);
  const reviewPage = path === '/materials';

  useEffect(() => {
    document.title = reviewPage
      ? '资料审核 · CAAU'
      : path === '/system/health'
        ? '工程连接检查 · CAAU'
        : '页面未找到 · CAAU';
  }, [path, reviewPage]);

  if (reviewPage) {
    return (
      <AppShell>
        <IndividualPage />
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
      subTitle="当前前端只开放资料审核模块。"
      extra={
        <Button type="primary" href="/materials">
          进入资料审核
        </Button>
      }
    />
  );
}
