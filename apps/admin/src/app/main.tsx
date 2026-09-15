import { StrictMode } from 'react';
import { ConfigProvider } from 'antd';
import { createRoot } from 'react-dom/client';
import { HealthPage } from '../features/health/HealthPage';
import { WorkspacePage } from '../features/materials/WorkspacePage';
import { IndividualPage } from '../features/individuals/IndividualPage';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <ConfigProvider
      theme={{
        token: {
          motion: false,
          colorPrimary: '#1d4ed8',
          colorPrimaryHover: '#1e40af',
          colorPrimaryActive: '#1e3a8a',
          colorError: '#b91c1c',
          colorErrorHover: '#991b1b',
          colorText: '#172033',
          fontSize: 16,
          borderRadius: 8,
        },
      }}
    >
      {location.pathname === '/materials' ? (
        <IndividualPage />
      ) : location.pathname === '/workspace' ? (
        <WorkspacePage />
      ) : (
        <>
          <nav className="home-nav">
            <a href="/workspace">进入赛事与材料任务工作台</a>
            {' · '}
            <a href="/materials">进入单份材料与共享审核</a>
          </nav>
          <HealthPage />
        </>
      )}
    </ConfigProvider>
  </StrictMode>,
);
