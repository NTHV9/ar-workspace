import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/browser',testMatch:['current-only-dashboard.spec.ts'],timeout:45000,expect:{timeout:10000},workers:1,
 use:{viewport:{width:1440,height:900},headless:true,channel:process.platform==='win32'?'msedge':undefined,baseURL:'http://127.0.0.1:5196',serviceWorkers:'block',screenshot:'only-on-failure'},
 webServer:{command:'node scripts/browser-test-server.mjs .tmp/current-only-site 5196',url:'http://127.0.0.1:5196',reuseExistingServer:false,timeout:30000},reporter:'list',
});
