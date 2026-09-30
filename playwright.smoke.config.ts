import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/browser',
 testMatch:['bulk-account-settings.spec.ts','dashboard-table-sorting.spec.ts','report-sheet-links.spec.ts','impeccable-fixes.spec.ts','aging-all-ranges.spec.ts','google-staff.spec.ts','email-preferences.spec.ts','collections-workspace.spec.ts','short-credit-queue.spec.ts','opera-status-menu.spec.ts','period-progressive.spec.ts','invoice-pdf-attachments.spec.ts','invoice-register.spec.ts','**/source-deletion/pdf-editor.spec.ts','**/voucher-field/pdf-editor.spec.ts'],
 timeout:60000,expect:{timeout:15000},retries:0,workers:1,
 use:{viewport:{width:1440,height:900},headless:true,channel:process.platform==='win32'?'msedge':undefined,baseURL:'http://127.0.0.1:5191',serviceWorkers:'block'},
 webServer:{command:'node scripts/browser-test-server.mjs',url:'http://127.0.0.1:5191',reuseExistingServer:false,timeout:30000},
 reporter:process.env.CI?[['list'],['html',{open:'never'}]]:'list',
});
