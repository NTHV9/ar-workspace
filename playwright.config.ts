import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 30000, retries: 0,
  use: { baseURL: process.env.AR_TEST_URL || 'https://ar-workspace.ar-c82.workers.dev', viewport: {width:1440,height:900}, headless: true, channel: 'msedge' },
  reporter: 'list',
});
