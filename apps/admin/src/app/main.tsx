import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HealthPage } from '../features/health/HealthPage';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <HealthPage />
  </StrictMode>,
);
