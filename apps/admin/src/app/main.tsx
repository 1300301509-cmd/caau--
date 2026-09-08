import { StrictMode } from 'react';
import { ConfigProvider } from 'antd';
import { createRoot } from 'react-dom/client';
import { HealthPage } from '../features/health/HealthPage';
import { WorkspacePage } from '../features/materials/WorkspacePage';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <ConfigProvider theme={{ token: { motion: false } }}>
      {location.pathname === '/workspace' ? (
        <WorkspacePage />
      ) : (
        <>
          <nav className="home-nav">
            <a href="/workspace">进入赛事与材料任务工作台</a>
          </nav>
          <HealthPage />
        </>
      )}
    </ConfigProvider>
  </StrictMode>,
);
