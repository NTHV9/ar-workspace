import {defineConfig} from '@playwright/test';

// Dedicated local server and outputs: do not reuse another chat's application.
export default defineConfig({
 testDir:'./tests/browser',workers:1,retries:0,timeout:30000,expect:{timeout:10000},
 use:{baseURL:'http://127.0.0.1:52873',channel:process.platform==='win32'?'msedge':undefined,headless:true,serviceWorkers:'block'},
 webServer:{command:'node node_modules/vite/bin/vite.js preview --outDir .tmp/browser-site --host 127.0.0.1 --port 52873 --strictPort',url:'http://127.0.0.1:52873',reuseExistingServer:false,timeout:60000},
 projects:[
  {name:'email',testMatch:['default-self-cc.spec.ts','email-composer.spec.ts','email-threads.spec.ts','regional-mailboxes.spec.ts']},
  {name:'recipients',testMatch:['billing-channel.spec.ts'],grep:/account recipients load automatically|editing saved draft recipients/},
  // Includes native PDF export before email; allow the existing full workflow to finish.
  {name:'batch',testMatch:['**/batch-workspace/pdf-editor.spec.ts'],timeout:120000,expect:{timeout:30000}},
 ],
 outputDir:'.tmp/self-cc-results',reporter:'list',
});
