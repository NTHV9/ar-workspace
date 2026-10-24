import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/browser',testMatch:['refresh-activity.spec.ts','idle-publication.spec.ts','tracker-background.spec.ts','tracker-revision-watch.spec.ts'],
 timeout:45000,workers:1,retries:0,
 use:{baseURL:'http://127.0.0.1:5197',viewport:{width:1440,height:900},headless:true,channel:'msedge',serviceWorkers:'block'},
 webServer:{command:'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5197 --strictPort',url:'http://127.0.0.1:5197',reuseExistingServer:false,timeout:30000},reporter:'list',
});
