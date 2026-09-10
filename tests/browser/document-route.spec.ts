import { test, expect, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const jobId = 'a0000000-0000-4000-8000-000000000001';
const fileId = 'b0000000-0000-4000-8000-000000000001';
const user = { id: 'synthetic-document-user', email: 'ar@katathani.com', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-09-09T00:00:00Z' };
function session(token: string) { return { access_token: token, refresh_token: 'synthetic-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user }; }

async function mockApplication(page: Page, requestedLayout='combined') {
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  source.addPage([595, 842]).drawText('SYNTHETIC INVOICE A', { x: 45, y: 740, font, size: 18 });
  const bytes = Buffer.from(await source.save());
  const job = { id: jobId, owner: user.id, hotel: 'KAT', account_id: 'synthetic-account', account_name: 'Synthetic Document Account', content: 'invoices', layout: requestedLayout, purpose: 'billing', invoice_ids: ['A'], manifest: [{ id: 'A', invoice_no: 'INVOICE-A' }], state: 'ready', revision: 0, project_key: null as string | null, exports: [], acknowledged: false, files: [{ id: fileId, kind: 'invoice', invoice_id: 'A', ordinal: 0, state: 'ready', storage_key: `jobs/${jobId}/originals/${fileId}.pdf`, error_code: null, byte_count: bytes.length, sha256: 'synthetic' }], created_at: '2026-09-09T00:00:00Z' };
  const controls = {
    portfolioRequests: [] as string[], documentReads: 0, sourceReads: 0,
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
    if (url.pathname === `/api/documents/${jobId}/upload`) {
      if (url.searchParams.get('kind') === 'project') controls.uploadRequests.push({ token, project: request.postDataJSON() });
      return route.fulfill({ json: { storage_key: `jobs/${jobId}/drafts/synthetic-project.json`, byte_count: request.postDataBuffer()?.length || 0, sha256: 'synthetic' } });
    }
    if (url.pathname === `/api/documents/${jobId}/save`) {
      const body = request.postDataJSON(); controls.saveRequests.push({ token, body }); job.revision++; job.project_key = String(body.projectKey);
      return route.fulfill({ json: job });
    }
    return route.fulfill({ status: 501, json: { error: 'unmocked_synthetic_test_api' } });
  });
  return controls;
}

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
 await expect(page.getByRole('dialog')).toContainText('Statement: Generate in AR Workspace');
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
