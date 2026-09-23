// Render the existing vector brand asset unchanged for email clients without SVG support.
import {readFileSync,writeFileSync} from 'node:fs';
import {chromium} from '@playwright/test';
const svg=readFileSync('public/katathani-collection.svg');
const browser=await chromium.launch({headless:true,...process.platform==='win32'?{channel:'msedge'}:{}});
try{
 const page=await browser.newPage({viewport:{width:176,height:176},deviceScaleFactor:2});
 await page.setContent(`<html><body style="margin:0;background:transparent"><img alt="Katathani Collection" width="176" height="176" src="data:image/svg+xml;base64,${svg.toString('base64')}"></body></html>`);
 await page.getByRole('img').evaluate(img=>img.decode());
 const bytes=await page.getByRole('img').screenshot({omitBackground:true});
 writeFileSync('public/email-signature-logo.png',bytes);
 writeFileSync('worker/email/signature-logo-data.ts',`// Generated from public/katathani-collection.svg by scripts/render-email-logo.mjs. Public brand asset only.\nexport const signatureLogoBase64=${JSON.stringify(bytes.toString('base64'))};\n`);
 console.log(JSON.stringify({pngBytes:bytes.length}));
}finally{await browser.close();}
