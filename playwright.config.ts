import { defineConfig } from '@playwright/test';

const apiPort = process.env.CAAU_BROWSER_API_PORT ?? '3000';

export default defineConfig({
  testDir: './apps/admin/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'corepack pnpm --filter @caau/api start',
      url: `http://127.0.0.1:${apiPort}/api/v1/health`,
      env: {
        HOST: '127.0.0.1',
        PORT: apiPort,
        DATABASE_URL: '',
        CORS_ORIGINS: 'http://127.0.0.1:4173',
      },
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'corepack pnpm --filter @caau/admin preview',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
