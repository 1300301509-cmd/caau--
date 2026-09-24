import { StrictMode } from 'react';
import { ConfigProvider } from 'antd';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from '../features/auth/AuthContext';
import { AgentHost } from '../features/agent/AgentHost';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <ConfigProvider
      theme={{
        token: {
          motion: false,
          colorPrimary: '#23695b',
          colorPrimaryHover: '#1b594c',
          colorPrimaryActive: '#15483e',
          colorError: '#b91c1c',
          colorErrorHover: '#991b1b',
          colorText: '#2b332f',
          fontSize: 14,
          borderRadius: 10,
        },
      }}
    >
      <AuthProvider>
        {location.pathname === '/system/health' ? (
          <App />
        ) : (
          <AgentHost>
            <App />
          </AgentHost>
        )}
      </AuthProvider>
    </ConfigProvider>
  </StrictMode>,
);
