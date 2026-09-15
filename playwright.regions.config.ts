import {defineConfig} from '@playwright/test';
process.env.AR_TEST_CAPTURE_DIR='.tmp/khao-lak-ui-results';
process.env.AR_AGING_TEST_ORIGIN='http://127.0.0.1:5197';
process.env.AR_AGING_CAPTURE='0';
export default defineConfig({testDir:'./tests/browser',testMatch:['hotel-regions.spec.ts','region-financial-status.spec.ts','dashboard.spec.ts','portfolio-comparison.spec.ts','current-aging.spec.ts'],timeout:30000,workers:2,use:{baseURL:'http://127.0.0.1:5197',viewport:{width:1440,height:900},headless:true,channel:process.platform==='win32'?'msedge':undefined},webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5197 --strictPort',url:'http://127.0.0.1:5197',reuseExistingServer:true},outputDir:'.tmp/khao-lak-ui-results/playwright',reporter:'list'});
