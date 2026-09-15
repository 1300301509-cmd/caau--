import { StrictMode } from 'react';
import { ConfigProvider } from 'antd';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <ConfigProvider
      theme={{
        token: {
          motion: false,
          colorPrimary: '#206bc4',
          colorPrimaryHover: '#1a5aa6',
          colorPrimaryActive: '#174f91',
          colorError: '#b91c1c',
          colorErrorHover: '#991b1b',
          colorText: '#172033',
          fontSize: 14,
          borderRadius: 4,
        },
      }}
    >
      <App />
    </ConfigProvider>
  </StrictMode>,
);
