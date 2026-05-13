import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? 'html' : 'list',
  timeout: 30_000,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      // Tests de API pura (APIRequestContext — sin browser)
      name: 'api-smoke',
      testMatch: '**/smoke/auth.spec.ts',
      use: {
        baseURL: process.env['APP_URL'] ?? 'http://localhost:3333',
      },
    },
    {
      // Tests de API: estimate y admin endpoints
      name: 'api-admin',
      testMatch: '**/smoke/estimate.spec.ts',
      use: {
        baseURL: process.env['APP_URL'] ?? 'http://localhost:3333',
      },
    },
    {
      // Tests de browser: admin web Vite
      name: 'admin-web',
      testMatch: '**/smoke/admin-web.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env['ADMIN_WEB_URL'] ?? 'http://localhost:5173',
      },
    },
    {
      // Tests de browser: vertical editor (VerticalesPage)
      name: 'vertical-editor',
      testMatch: '**/smoke/vertical-editor.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env['ADMIN_WEB_URL'] ?? 'http://localhost:5173',
      },
    },
    {
      // Tests API + browser: trip detail con tabs verticales
      name: 'trip-detail-vertical',
      testMatch: '**/smoke/trip-detail-vertical.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env['ADMIN_WEB_URL'] ?? 'http://localhost:5173',
      },
    },
    {
      // Tests API + browser: flujo de aprobación multi-vertical
      name: 'approval-flow',
      testMatch: '**/smoke/approval-flow.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env['ADMIN_WEB_URL'] ?? 'http://localhost:5173',
      },
    },
  ],
});
