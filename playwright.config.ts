import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 30000, retries: 0,
  use: { viewport: {width:1440,height:900}, headless: true, channel: process.platform==='win32'?'msedge':undefined },
  webServer: {command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5191 --strictPort',url:'http://127.0.0.1:5191',reuseExistingServer:!process.env.CI,timeout:60000},
  projects:[
    {name:'cloudflare',testIgnore:'**/pdf-editor.spec.ts',use:{baseURL:process.env.AR_TEST_URL||'https://ar-workspace.ar-c82.workers.dev'}},
    {name:'editor-harness',testMatch:'**/pdf-editor.spec.ts',use:{baseURL:'http://127.0.0.1:5191'}},
  ],
  reporter: 'list',
});
