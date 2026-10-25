import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/browser',
 testMatch:['billing-channel.spec.ts','email-threads.spec.ts','current-only-dashboard.spec.ts','**/pdf-editor.spec.ts','document-route.spec.ts','email-draft-recovery.spec.ts','email-navigation.spec.ts','saved-email-review.spec.ts','supplemental-files.spec.ts','tracker-background.spec.ts','tracker-admin-access.spec.ts','cfo-dashboard.spec.ts','dashboard-account-groups.spec.ts','remittance-account-identity.spec.ts','tracker-sync.spec.ts','tracker-conflict-pages.spec.ts','bulk-account-settings.spec.ts','dashboard-table-sorting.spec.ts','report-sheet-links.spec.ts','impeccable-fixes.spec.ts','aging-all-ranges.spec.ts','google-staff.spec.ts','email-preferences.spec.ts','email-composer.spec.ts','collections-workspace.spec.ts','short-credit-queue.spec.ts','opera-status-menu.spec.ts','period-progressive.spec.ts','invoice-pdf-attachments.spec.ts','invoice-register.spec.ts'],
 timeout:60000,expect:{timeout:15000},retries:0,workers:1,
 use:{viewport:{width:1440,height:900},headless:true,channel:process.platform==='win32'?'msedge':undefined,baseURL:'http://127.0.0.1:5191',serviceWorkers:'block',trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:{command:'node scripts/browser-test-server.mjs',url:'http://127.0.0.1:5191',reuseExistingServer:false,timeout:30000},
 reporter:process.env.CI?[['list'],['html',{open:'never',outputFolder:'playwright-report/smoke'}],['json',{outputFile:'playwright-report/smoke/results.json'}]]:'list',
});
