import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 2,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    headless: false,
    viewport: { width: 1440, height: 1200 },
    trace: 'retain-on-failure',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
});
