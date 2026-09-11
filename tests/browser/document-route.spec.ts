import {syntheticStatement} from './fixtures/statement-pdf';
import {reviewPreviewPages} from './fixtures/pdf-preview';
import { test, expect, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {assertButtonVisibility} from './fixtures/button-visibility';

const jobId = 'a0000000-0000-4000-8000-000000000001';
const fileId = 'b0000000-0000-4000-8000-000000000001';
const user = { id: 'synthetic-document-user', email: 'ar@katathani.com', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-09-09T00:00:00Z' };
function session(token: string) { return { access_token: token, refresh_token: 'synthetic-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user }; }

async function mockApplication(page: Page, requestedLayout='combined', lifecycle:'legacy'|'transient'='legacy',pdfBytes?:Uint8Array) {
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  source.addPage([595, 842]).drawText('SYNTHETIC INVOICE A', { x: 45, y: 740, font, size: 18 });
  source.getPage(0).drawLine({start:{x:45,y:650},end:{x:450,y:650},thickness:1});
  source.getPage(0).drawText('DATE                   DESCRIPTION                       AMOUNT',{x:45,y:550,font,size:9});for(let i=0;i<4;i++)source.getPage(0).drawText('01/09/2026        SYNTHETIC ROW '+i+'                  100.00',{x:45,y:530-i*16,font,size:9});source.getPage(0).drawText('SYNTHETIC FOOTER - KEEP',{x:45,y:35,font,size:9});
  const bytes = Buffer.from(pdfBytes??await source.save());
  const job = { lifecycle,closed_at:null as string|null,closed_reason:null as string|null,id: jobId, owner: user.id, hotel: 'KAT', account_id: 'synthetic-account', account_name: 'Synthetic Document Account', content: 'invoices', layout: requestedLayout, purpose: 'billing', invoice_ids: ['A'], manifest: [{ id: 'A', invoice_no: 'INVOICE-A' }], state: 'ready', revision: 0, project_key: null as string | null, exports: [] as {name:string;storage_key:string;byte_count:number;sha256:string}[], acknowledged: false, files: [{ id: fileId, kind: 'invoice', invoice_id: 'A', ordinal: 0, state: 'ready', storage_key: `jobs/${jobId}/originals/${fileId}.pdf`, error_code: null, byte_count: bytes.length, sha256: 'synthetic' }], created_at: '2026-09-09T00:00:00Z' };
  const controls = {
    job, reviewRequests:[] as any[], exportUploads:0, discards:0, portfolioRequests: [] as string[], documentReads: 0, sourceReads: 0, emailOpens:[] as any[],outboundRequests:[] as string[],
    saveRequests: [] as { token: string; body: Record<string, unknown> }[],
    uploadRequests: [] as { token: string; project: any }[], createRequests: [] as any[],
    holdPortfolio: false, pendingPortfolio: [] as (() => void)[],
    releasePortfolio() { this.holdPortfolio = false; this.pendingPortfolio.splice(0).forEach(resolve => resolve()); },
  };
  await page.addInitScript(value => localStorage.setItem('sb-example-auth-token', JSON.stringify(value)), session('synthetic-token-old'));
  await page.route('https://example.supabase.co/**', route => route.fulfill({ json: { user } }));
  // Every application API is intercepted; unexpected calls fail locally and cannot
  // touch OPERA, Supabase, customer documents, or production services.
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), token = request.headers().authorization || '';
    if(/\/(send|gmail-draft)$/.test(url.pathname))controls.outboundRequests.push(url.pathname);
    if (url.pathname === '/api/config') return route.fulfill({ json: { supabaseUrl: 'https://example.supabase.co', publishableKey: 'synthetic-key' } });
    if (url.pathname === '/api/refresh') return route.fulfill({ json: { jobs: [], running: false, hotels: [] } });
    if (url.pathname === '/api/portfolio') {
      controls.portfolioRequests.push(token);
      if (controls.holdPortfolio) await new Promise<void>(resolve => controls.pendingPortfolio.push(resolve));
      return route.fulfill({ json: { status: 'connected', accounts: [{ hotel: 'KAT', id: 'synthetic-account', name: job.account_name, type: 'Agent', open: 300, over90: 0, items: 3 }], refresh: { running: false, hotels: [] } } });
    }
    if (url.pathname === '/api/accounts/KAT/synthetic-account') return route.fulfill({ json: { invoices: ['A', 'B', 'C'].map(id => ({ id, hotel: 'KAT', account_id: 'synthetic-account', guest: `Synthetic Guest ${id}`, invoice_no: `INVOICE-${id}`, folio_no: `FOLIO-${id}`, transaction_date: '2026-09-01', original: 100, open: 100, aging: 'Up to 30', verification_state: 'verified', collection_role: 'standalone', collection_selectable: true })) } });
    if (url.pathname === '/api/documents' && request.method() === 'POST') { controls.createRequests.push(request.postDataJSON()); return route.fulfill({ json: job }); }
    if (url.pathname === `/api/documents/${jobId}`) { controls.documentReads++; return route.fulfill({ json: job }); }
    if (url.pathname === `/api/documents/${jobId}/files/${fileId}`) { controls.sourceReads++; return route.fulfill({ contentType: 'application/pdf', body: bytes }); }
    if (url.pathname === `/api/documents/${jobId}/project`) return route.fulfill({json:controls.uploadRequests.at(-1)?.project});
    if (url.pathname === '/api/gmail/status')return route.fulfill({json:{configured:true,connected:true,canRead:true,email:'ar@katathani.com'}});
    if (url.pathname === '/api/email/open') {controls.emailOpens.push(request.postDataJSON());return route.fulfill({json:{id:'synthetic-draft',document_job_id:job.id,document_revision:job.revision,hotel:job.hotel,account_id:job.account_id,account_name:job.account_name,invoice_ids:job.invoice_ids,purpose:'billing',recipients:{to:[],cc:[],bcc:[]},subject:'Synthetic message',body:'Synthetic only',exports:job.exports,attachments:[],revision:0,package_changed:false}});}
    if (url.pathname === `/api/documents/${jobId}/upload`) {
      if (url.searchParams.get('kind') === 'export') controls.exportUploads++;
      if (url.searchParams.get('kind') === 'project') controls.uploadRequests.push({ token, project: request.postDataJSON() });
      return route.fulfill({ json: { storage_key: `jobs/${jobId}/${url.searchParams.get('kind')==='project'?'drafts/synthetic-project.json':'exports/synthetic-export.pdf'}`, byte_count: request.postDataBuffer()?.length || 0, sha256: 'synthetic' } });
    }
    if (url.pathname === `/api/documents/${jobId}/review`) {const body=request.postDataJSON();controls.reviewRequests.push(body);job.revision=body.revision+1;job.exports=body.exports;job.acknowledged=true;return route.fulfill({json:job});}
    if (url.pathname === `/api/documents/${jobId}/discard`) {controls.discards++;job.closed_at='2026-09-11T10:30:00Z';job.closed_reason='discarded';return route.fulfill({json:job});}
    if (url.pathname === `/api/documents/${jobId}/save`) {
      const body = request.postDataJSON(); controls.saveRequests.push({ token, body }); job.revision++; job.project_key = String(body.projectKey);job.exports=body.exports;job.acknowledged=body.acknowledged;
      return route.fulfill({ json: job });
    }
    return route.fulfill({ status: 501, json: { error: 'unmocked_synthetic_test_api' } });
  });
  return controls;
}

for(const width of [1440,390])test(`document actions ${width} are readable before hover, including the create-job dialog`,async({page})=>{
 await page.setViewportSize({width,height:width===390?844:900});
 const controls=await mockApplication(page);await page.goto('/?account=synthetic-account&property=KAT');await page.getByLabel('Select INVOICE-A',{exact:true}).check();
 await page.getByRole('button',{name:'Prepare documents',exact:true}).click();await assertButtonVisibility(page,page.locator('.document-dialog'));
 await page.locator('.document-dialog select').first().focus();await page.mouse.move(0,0);await page.screenshot({path:`evidence/document-create-button-visible-${width}.png`,animations:'disabled'});
 await page.getByRole('button',{name:'Create document job',exact:true}).click();await expect(page.getByRole('button',{name:'Open PDF Workspace',exact:true})).toBeVisible();await assertButtonVisibility(page,page.locator('.document-jobs'));
 expect(controls.createRequests).toHaveLength(1);expect(controls.outboundRequests).toEqual([]);
});

test('reviewed PDF continues directly to email with the saved revision; newer edits require review again',async({page})=>{
 const controls=await mockApplication(page);await page.goto(`/?documentJob=${jobId}`);await page.getByRole('button',{name:'Open PDF Workspace',exact:true}).click();
 await expect(page.getByRole('button',{name:'Continue to email',exact:true})).toBeDisabled({timeout:20000});
 await page.getByRole('button',{name:'Text box',exact:true}).click();await page.getByLabel('Layer text').fill('SYNTHETIC REVIEWED EDIT');
 await page.getByRole('button',{name:'Open mandatory Preview'}).click();await reviewPreviewPages(page);await page.getByRole('checkbox').check();await assertButtonVisibility(page,page.locator('.pdf-preview-dialog'));await page.getByRole('button',{name:'Save reviewed PDFs privately'}).click();
 const preview=page.getByRole('dialog',{name:'Final PDF preview'});await expect(preview.getByRole('button',{name:'Continue to email',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Close final preview'}).click();const next=page.getByRole('button',{name:'Continue to email',exact:true});await expect(next).toBeInViewport();await page.screenshot({path:'evidence/pdf-reviewed-email-handoff.png',animations:'disabled'});
 await next.click();await expect(page.getByRole('heading',{name:'Email preparation',exact:true})).toBeVisible();
 expect(controls.emailOpens.length).toBeGreaterThan(0);expect(controls.emailOpens.every(p=>p.jobId===jobId&&p.documentRevision===1)).toBe(true);const opens=controls.emailOpens.length;await expect(page.getByRole('dialog',{name:'PDF Workspace',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Back to document preparation'}).click();await page.getByRole('button',{name:'Start from original PDFs'}).click();await expect(page.getByRole('button',{name:'Continue to email',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Close PDF Workspace'}).click();await page.getByRole('button',{name:'Reopen saved PDF project'}).click();
 await expect(page.getByRole('button',{name:'Continue to email',exact:true})).toBeEnabled();await expect(page.locator('.pdf-differences')).toContainText('SYNTHETIC REVIEWED EDIT');
 await page.getByRole('button',{name:'Note',exact:true}).click();await expect(page.getByRole('button',{name:'Continue to email',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('button',{name:'Continue to email',exact:true})).toBeDisabled();expect(controls.emailOpens).toHaveLength(opens);expect(controls.outboundRequests).toEqual([]);
});

test('a failed private save cannot enable email continuation',async({page})=>{
 await mockApplication(page);let failed=false;
 await page.route(`**/api/documents/${jobId}/save`,r=>{if(!failed){failed=true;return r.fulfill({status:503,json:{error:'document_unavailable'}});}return r.fallback();});
 await page.goto(`/?documentJob=${jobId}`);await page.getByRole('button',{name:'Open PDF Workspace',exact:true}).click();await page.getByRole('button',{name:'Open mandatory Preview'}).click();await reviewPreviewPages(page);await page.getByRole('checkbox').check();
 await page.getByRole('button',{name:'Save reviewed PDFs privately'}).click();await expect(page.getByRole('alert')).toContainText('document unavailable');await expect(page.locator('.pdf-email-next button')).toBeDisabled();
 await page.getByRole('button',{name:'Save reviewed PDFs privately'}).click();await expect(page.getByRole('dialog',{name:'Final PDF preview'}).getByRole('button',{name:'Continue to email'})).toBeEnabled();
});

test('dirty PDF survives same-user token refresh and portfolio reload; draft uses refreshed token', async ({ page }) => {
  const controls = await mockApplication(page);
  await page.goto(`/?documentJob=${jobId}`);
  await page.getByRole('button', { name: 'Open PDF Workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Note', exact: true }).click();
  const text = page.getByRole('textbox', { name: 'Layer text', exact: true });
  await text.fill('UNSAVED NOTE SURVIVES SESSION REFRESH');
  const readsBefore = controls.documentReads, sourcesBefore = controls.sourceReads;
  controls.holdPortfolio = true;
  // Verified installed auth-js 2.115.0 GoTrueClient.ts:527–550,5169–5175:
  // another tab persists the session then broadcasts {event, session} on its
  // storageKey. SupabaseClient.ts derives sb-example-auth-token for this host.
  // This exercises the SDK's actual subscriber path, not a React-state hook.
  await page.evaluate(value => {
    localStorage.setItem('sb-example-auth-token', JSON.stringify(value));
    const channel = new BroadcastChannel('sb-example-auth-token');
    channel.postMessage({ event: 'TOKEN_REFRESHED', session: value });
    channel.close();
  }, session('synthetic-token-new'));
  await expect.poll(() => controls.portfolioRequests.includes('Bearer synthetic-token-new')).toBe(true);
  await expect(text).toHaveValue('UNSAVED NOTE SURVIVES SESSION REFRESH');
  controls.releasePortfolio();
  await expect(page.getByRole('button', { name: 'Reload saved data', exact: true })).toBeEnabled();
  await expect(text).toHaveValue('UNSAVED NOTE SURVIVES SESSION REFRESH');
  expect(controls.documentReads).toBe(readsBefore); expect(controls.sourceReads).toBe(sourcesBefore);

  // Invoke the actual reload button handler behind the modal as a deterministic
  // background refresh, then hold its response while asserting editor continuity.
  controls.holdPortfolio = true; const beforeReload = controls.portfolioRequests.length;
  await page.getByRole('button', { name: 'Reload saved data', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  await expect.poll(() => controls.portfolioRequests.length).toBe(beforeReload + 1);
  await expect(text).toHaveValue('UNSAVED NOTE SURVIVES SESSION REFRESH'); controls.releasePortfolio();
  await expect(page.getByRole('button', { name: 'Reload saved data', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Draft saved. Final review is still required.');
  expect(controls.uploadRequests.at(-1)?.token).toBe('Bearer synthetic-token-new');
  expect(controls.uploadRequests.at(-1)?.project.pages[0].layers[0].text).toBe('UNSAVED NOTE SURVIVES SESSION REFRESH');
  expect(controls.saveRequests.at(-1)).toMatchObject({ token: 'Bearer synthetic-token-new', body: { exports: [], acknowledged: false } });
});

test('document creation preserves click selection order C then A', async ({ page }) => {
  const controls = await mockApplication(page);
  await page.goto('/?account=synthetic-account&property=KAT');
  await page.getByLabel('Select INVOICE-C', { exact: true }).check();
  await page.getByLabel('Select INVOICE-A', { exact: true }).check();
  await page.getByRole('button', { name: 'Prepare documents', exact: true }).click();
  await page.getByRole('button', { name: 'Create document job', exact: true }).click();
  await expect.poll(() => controls.createRequests.length).toBe(1);
  expect(controls.createRequests[0]).toMatchObject({ hotel: 'KAT', accountId: 'synthetic-account', ids: ['C', 'A'] });
});

for(const [layout,label] of [['statement_bundle','Statement + combined Invoices'],['separate','Statement + each Invoice']]){
 test(`requested delivery ${layout} is selected when first opening the job`,async({page})=>{
  await mockApplication(page,layout);await page.goto(`/?documentJob=${jobId}`);
  await page.getByRole('button',{name:'Open PDF Workspace',exact:true}).click();
  await expect(page.getByRole('button',{name:label,exact:true})).toHaveClass(/chosen/);
 });
}

test('Statement preparation has one approved system source and preserves Invoice delivery choices',async({page})=>{
 const controls=await mockApplication(page);
 await page.goto('/?account=synthetic-account&property=KAT');
 await page.getByLabel('Select INVOICE-A',{exact:true}).check();
 await page.getByRole('button',{name:'Prepare documents',exact:true}).click();
 await page.getByRole('combobox',{name:'Document content',exact:true}).selectOption('both');
 await expect(page.getByText('Statement: Generate in AR Workspace.',{exact:false})).toHaveCount(0);
 await expect(page.getByRole('option',{name:'Original from OPERA',exact:true})).toHaveCount(0);
 await page.getByRole('combobox',{name:'Delivery layout',exact:true}).selectOption('statement_bundle');
 await page.getByRole('button',{name:'Create document job',exact:true}).click();
 await expect.poll(()=>controls.createRequests.length).toBe(1);
 expect(controls.createRequests[0]).toMatchObject({content:'both',statementSource:'workspace',layout:'statement_bundle',ids:['A']});
});

test('mobile document companion previews one private source at a time without editing',async({page})=>{
 await page.setViewportSize({width:390,height:844});await mockApplication(page);await page.goto(`/?documentJob=${jobId}`);
 await expect(page.getByRole('button',{name:'Open PDF Workspace',exact:true})).toBeDisabled();
 await expect(page.getByText('Continue PDF editing and final review on a larger screen.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Preview source PDF',exact:true}).click();await expect(page.getByRole('img',{name:'PDF page 1',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Note',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:'evidence/pdf-mobile-readonly-390.png'});
 await page.getByRole('button',{name:'Close PDF preview',exact:true}).click();await expect(page.getByRole('heading',{name:'Document preparation',exact:true})).toBeVisible();
});
test('desktop PDF edits survive a resize to the mobile companion and can be saved as a draft',async({page})=>{
 const controls=await mockApplication(page);await page.goto(`/?documentJob=${jobId}`);await page.getByRole('button',{name:'Open PDF Workspace',exact:true}).click();await page.getByRole('button',{name:'Note',exact:true}).click();await page.getByRole('textbox',{name:'Layer text',exact:true}).fill('Synthetic desktop edit survives resize');
 await page.setViewportSize({width:390,height:844});await expect(page.getByRole('heading',{name:'Continue editing on desktop',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Note',exact:true})).not.toBeVisible();
 await page.getByRole('button',{name:'Save draft for desktop',exact:true}).click();await expect.poll(()=>controls.uploadRequests.length).toBe(1);expect(controls.uploadRequests[0].project.pages[0].layers[0].text).toBe('Synthetic desktop edit survives resize');
});
for(const width of [1440,1280])test(`transient review goes directly to email without a saved PDF project at ${width}`,async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width,height:width===1440?900:800});
 const controls=await mockApplication(page,'combined','transient');await page.goto(`/?documentJob=${jobId}`);
 await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Documents',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Open PDF Workspace',exact:true}).click();
 await expect(page.getByRole('button',{name:'Save draft',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Note',exact:true}).click();await page.getByRole('textbox',{name:'Layer text',exact:true}).fill('SYNTHETIC TEMPORARY REVIEW');
 await page.getByRole('button',{name:'Continue to email',exact:true}).click();
 const preview=page.getByRole('dialog',{name:'Final PDF preview'});
 await expect(preview.getByRole('button',{name:'Continue to email',exact:true})).toBeDisabled();
 await expect(preview.getByRole('img',{name:'Final PDF page 1',exact:true})).toBeVisible();
 await expect(preview.getByRole('button',{name:'Save reviewed PDFs privately'})).toHaveCount(0);
 await reviewPreviewPages(page);await preview.getByRole('checkbox').check();
 await assertButtonVisibility(page,preview);
 await page.screenshot({path:`evidence/transient-review-${width}.png`,animations:'disabled'});
 await preview.getByRole('button',{name:'Continue to email',exact:true}).click();
 await expect.poll(()=>controls.emailOpens.length).toBeGreaterThan(0);
 expect(controls.reviewRequests).toHaveLength(1);expect(controls.exportUploads).toBe(1);expect(controls.uploadRequests).toHaveLength(0);expect(controls.saveRequests).toHaveLength(0);expect(controls.job.project_key).toBeNull();expect(controls.outboundRequests).toEqual([]);
 await expect(page.getByRole('heading',{name:'Email preparation',exact:true})).toBeVisible();
});

test('transient review retry retains uploaded receipts and never opens email before confirmation',async({page})=>{
 const controls=await mockApplication(page,'combined','transient');let lost=true;const attempts:any[]=[];
 await page.route(`**/api/documents/${jobId}/review`,r=>{attempts.push(r.request().postDataJSON());if(lost){lost=false;return r.fulfill({status:503,json:{error:'document_unavailable'}});}return r.fallback();});
 await page.goto(`/?documentJob=${jobId}`);await page.getByRole('button',{name:'Open PDF Workspace',exact:true}).click();await page.getByRole('button',{name:'Continue to email',exact:true}).click();
 const preview=page.getByRole('dialog',{name:'Final PDF preview'});await reviewPreviewPages(page);await preview.getByRole('checkbox').check();await preview.getByRole('button',{name:'Continue to email',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('document unavailable');expect(controls.emailOpens).toHaveLength(0);
 await preview.getByRole('button',{name:'Continue to email',exact:true}).click();await expect.poll(()=>controls.emailOpens.length).toBeGreaterThan(0);
 expect(controls.exportUploads).toBe(1);expect(attempts[1]).toEqual(attempts[0]);expect(controls.outboundRequests).toEqual([]);
});

test('download-only review stays temporary; explicit discard closes it and prevents reopening',async({page})=>{
 const controls=await mockApplication(page,'combined','transient');await page.goto(`/?documentJob=${jobId}`);await page.getByRole('button',{name:'Open PDF Workspace',exact:true}).click();await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();
 const preview=page.getByRole('dialog',{name:'Final PDF preview'});await reviewPreviewPages(page);await preview.getByRole('checkbox').check();
 const download=page.waitForEvent('download');await preview.getByRole('button',{name:'Download reviewed PDFs',exact:true}).click();expect((await download).suggestedFilename()).toContain('.pdf');
 expect(controls.emailOpens).toHaveLength(0);expect(controls.discards).toBe(0);
 await page.getByRole('button',{name:'Close final preview',exact:true}).click();await page.getByRole('button',{name:'Close PDF Workspace',exact:true}).click();
 await expect(page.getByRole('button',{name:'Open PDF Workspace',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Continue to email',exact:true})).toBeVisible();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Discard preparation',exact:true}).click();await expect(page.getByRole('heading',{name:'Preparation discarded',exact:true})).toBeVisible();expect(controls.discards).toBe(1);
 await expect(page.getByRole('button',{name:'Continue to email',exact:true})).toHaveCount(0);expect(controls.uploadRequests).toHaveLength(0);
});

test('transient edits survive resize but cannot be saved as a project',async({page})=>{
 await mockApplication(page,'combined','transient');await page.goto(`/?documentJob=${jobId}`);await page.getByRole('button',{name:'Open PDF Workspace',exact:true}).click();await page.getByRole('button',{name:'Note',exact:true}).click();await page.getByRole('textbox',{name:'Layer text',exact:true}).fill('SYNTHETIC TAB-ONLY EDIT');
 await page.setViewportSize({width:390,height:844});await expect(page.getByText('Your edits stay in this tab.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Save draft for desktop',exact:true})).toHaveCount(0);
 await page.setViewportSize({width:1280,height:800});await expect(page.getByRole('textbox',{name:'Layer text',exact:true})).toHaveValue('SYNTHETIC TAB-ONLY EDIT');await page.getByRole('button',{name:'Close PDF Workspace',exact:true}).click();
 await expect(page.getByRole('alertdialog',{name:'Unsaved PDF changes'})).toContainText('PDF edits only live in this tab');await page.getByRole('button',{name:'Discard changes and close',exact:true}).click();await expect(page.getByRole('heading',{name:'Document preparation',exact:true})).toBeVisible();
});
test('browser Back warns before discarding tab-only PDF edits',async({page})=>{
 await mockApplication(page,'combined','transient');await page.goto(`/?documentJob=${jobId}`);
 // Give this isolated fixture the same same-document history shape as opening
 // an Account from Portfolio and replacing its URL with document preparation.
 await page.evaluate(()=>{const current=location.href;history.replaceState(null,'','/');history.pushState(null,'',current);});
 await page.getByRole('button',{name:'Open PDF Workspace',exact:true}).click();await page.getByRole('button',{name:'Note',exact:true}).click();await page.getByRole('textbox',{name:'Layer text',exact:true}).fill('SYNTHETIC KEEP ON BACK');
 const prompt=page.waitForEvent('dialog');await page.evaluate(()=>history.back());const dialog=await prompt;expect(dialog.message()).toContain('tab-only PDF edits');await dialog.dismiss();
 await expect(page.getByRole('textbox',{name:'Layer text',exact:true})).toHaveValue('SYNTHETIC KEEP ON BACK');await expect(page).toHaveURL(new RegExp('documentJob='+jobId));
});

test('a review in flight locks editing and keeps email closed until confirmed',async({page})=>{
 const controls=await mockApplication(page,'combined','transient');let release!:()=>void,started=false;const pending=new Promise<void>(resolve=>{release=resolve;});
 await page.route(`**/api/documents/${jobId}/review`,async route=>{started=true;await pending;await route.fallback();});
 await page.goto(`/?documentJob=${jobId}`);await page.getByRole('button',{name:'Open PDF Workspace',exact:true}).click();await page.getByRole('button',{name:'Continue to email',exact:true}).click();
 const preview=page.getByRole('dialog',{name:'Final PDF preview'});await reviewPreviewPages(page);await preview.getByRole('checkbox').check();await preview.getByRole('button',{name:'Continue to email',exact:true}).click();await expect.poll(()=>started).toBe(true);
 await expect(page.locator('.pdf-layout')).toHaveAttribute('inert','');await expect(page.getByRole('button',{name:'Close final preview',exact:true})).toBeDisabled();expect(controls.emailOpens).toHaveLength(0);
 release();await expect(page.getByRole('heading',{name:'Email preparation',exact:true})).toBeVisible();expect(controls.reviewRequests).toHaveLength(1);expect(controls.outboundRequests).toEqual([]);
});

for(const width of [1440,1280])test(`source editing and dragging controls on deployed app at ${width}`,async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width,height:width===1440?900:800});const controls=await mockApplication(page,'combined','transient');await page.goto(`/?documentJob=${jobId}`);await page.getByRole('button',{name:'Open PDF Workspace',exact:true}).click();await page.getByRole('button',{name:'Edit original text: SYNTHETIC INVOICE A',exact:true}).click();
 await expect(page.getByLabel('Text color',{exact:true})).toHaveValue('#000000');await expect(page.getByLabel('Font size',{exact:true})).toHaveValue('18');const text=page.getByRole('textbox',{name:'Layer text',exact:true});await text.fill('SYNTHETIC INVOICE 12345');
 await expect(page.getByRole('button',{name:'Add row below',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Restore original formatting',exact:true})).toBeVisible();
 await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');await page.screenshot({path:`evidence/pdf-source-editing-${width}.png`,animations:'disabled'});
 await page.getByRole('button',{name:'Move lines',exact:true}).click();const line=page.locator('.pdf-native-line').first();await line.scrollIntoViewIfNeeded();const box=(await line.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+15,box.y+box.height/2+15,{steps:5});await page.mouse.up();await expect(page.locator('.pdf-differences')).toContainText('Moved line / area');
 await page.getByRole('button',{name:'Continue to email',exact:true}).click();const preview=page.getByRole('dialog',{name:'Final PDF preview'});await reviewPreviewPages(page);await preview.getByRole('checkbox').check();await preview.getByRole('button',{name:'Continue to email',exact:true}).click();await expect(page.getByRole('heading',{name:'Email preparation',exact:true})).toBeVisible();expect(controls.reviewRequests).toHaveLength(1);expect(controls.uploadRequests).toHaveLength(0);expect(controls.outboundRequests).toEqual([]);
});

for(const width of [1440,1280])test(`direct Word-style typing and width-fitted Preview ${width}`,async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width,height:width===1440?900:800});const controls=await mockApplication(page,'combined','transient');await page.goto(`/?documentJob=${jobId}`);await page.getByRole('button',{name:'Open PDF Workspace',exact:true}).click();await page.getByRole('button',{name:'Edit original text: SYNTHETIC INVOICE A',exact:true}).click();
 const input=page.getByRole('textbox',{name:'Edit document text',exact:true});await expect(input).toBeFocused();await input.press('End');await input.pressSequentially('n');await input.press('Enter');await input.pressSequentially('SECOND LINE');await expect(input).toHaveValue('SYNTHETIC INVOICE An\nSECOND LINE');
 await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');await expect(page.locator('.pdf-paper .pdf-canvas-warning')).toHaveCount(0);await page.screenshot({path:`evidence/pdf-direct-typing-${width}.png`,animations:'disabled'});
 await page.getByRole('button',{name:'Continue to email',exact:true}).click();const preview=page.getByRole('dialog',{name:'Final PDF preview'});await expect(preview.locator('.pdf-final-sheet')).toHaveAttribute('data-render-state','ready');
 expect(await preview.locator('.pdf-final-sheet canvas').evaluate(canvas=>{const r=canvas.getBoundingClientRect(),v=canvas.closest('.pdf-final-viewport')!.getBoundingClientRect();return r.left>=v.left-.5&&r.right<=v.right+.5&&r.width>v.width-40;})).toBe(true);await expect(preview.getByLabel('Preview zoom')).toHaveValue('fit-width');await page.screenshot({path:`evidence/pdf-preview-width-${width}.png`,animations:'disabled'});
 await reviewPreviewPages(page);await preview.getByRole('checkbox').check();await preview.getByRole('button',{name:'Continue to email',exact:true}).click();await expect(page.getByRole('heading',{name:'Email preparation',exact:true})).toBeVisible();expect(controls.reviewRequests).toHaveLength(1);expect(controls.uploadRequests).toHaveLength(0);expect(controls.outboundRequests).toEqual([]);
});


test('unchanged direct text selection preserves the source font on the app canvas',async({page})=>{
 await mockApplication(page,'combined','transient');await page.goto(`/?documentJob=${jobId}`);await page.getByRole('button',{name:'Open PDF Workspace',exact:true}).click();await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');
 await page.locator('.pdf-paper canvas').evaluate((c:HTMLCanvasElement)=>{(window as any).__sourcePixels=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;});
 await page.getByRole('button',{name:'Edit original text: SYNTHETIC INVOICE A',exact:true}).click();await expect(page.getByRole('textbox',{name:'Edit document text',exact:true})).toBeFocused();await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');
 const ratio=await page.locator('.pdf-paper canvas').evaluate((c:HTMLCanvasElement)=>{const original=(window as any).__sourcePixels as Uint8ClampedArray,pixels=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;if(pixels.length!==original.length)return 1;let ink=0,diff=0;for(let i=0;i<original.length;i+=4){if(original[i]<250)ink++;if(Math.abs(original[i]-pixels[i])+Math.abs(original[i+1]-pixels[i+1])+Math.abs(original[i+2]-pixels[i+2])>30)diff++;}return diff/ink;});expect(ratio).toBeLessThan(.06);
});

async function statementGrayBands(page:Page){return await page.locator('.pdf-paper canvas').evaluate((c:HTMLCanvasElement)=>{const scale=c.width/612,data=c.getContext('2d')!.getImageData(Math.round(70*scale),0,1,c.height).data,result:number[]=[];let start=-1;for(let y=Math.floor(180*scale);y<Math.min(c.height,360*scale);y++){const gray=data[y*4]>210&&data[y*4]<225;if(gray&&start<0)start=y;if(!gray&&start>=0){if(y-start>2*scale)result.push((y-start)/scale);start=-1;}}return result;});}
for(const width of [1440,1280])test('Statement row insertion preserves the total rectangle on deployed app '+width,async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width,height:width===1440?900:800});const controls=await mockApplication(page,'combined','transient',await syntheticStatement(width===1440?'KAT':'TSK'));await page.goto(`/?documentJob=${jobId}`);await page.getByRole('button',{name:'Open PDF Workspace',exact:true}).click();await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');const originalBands=await statementGrayBands(page);await page.getByRole('button',{name:'Edit original text: F001',exact:true}).click();await page.getByRole('button',{name:'Add row below',exact:true}).click();await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(8);await page.getByRole('button',{name:'Edit original text: F002',exact:true}).click();await page.getByRole('button',{name:'Add row below',exact:true}).click();await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(16);await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');
 expect(await page.locator('.pdf-layer-target.empty-cell').evaluateAll(cells=>cells.every(cell=>parseFloat(getComputedStyle(cell,'::after').lineHeight)<=cell.getBoundingClientRect().height))).toBe(true);const bands=await statementGrayBands(page);expect(originalBands[1]).toBeGreaterThan(23);expect(Math.abs(bands[0]-originalBands[0])).toBeLessThan(1.5);expect(Math.abs(bands[1]-originalBands[1])).toBeLessThan(1.5);
 await page.getByRole('button',{name:'Select',exact:true}).click();await page.screenshot({path:`evidence/pdf-statement-row-fix-${width}.png`,animations:'disabled'});await page.getByRole('button',{name:'Continue to email',exact:true}).click();const preview=page.getByRole('dialog',{name:'Final PDF preview'});await expect(preview.getByLabel('Preview zoom')).toHaveValue('fit-width');await expect(preview.getByLabel('Preview zoom').locator('option[value="fit-page"]')).toHaveCount(0);await reviewPreviewPages(page);await preview.getByRole('checkbox').check();await preview.getByRole('button',{name:'Continue to email',exact:true}).click();await expect(page.getByRole('heading',{name:'Email preparation',exact:true})).toBeVisible();expect(controls.outboundRequests).toEqual([]);
});
