import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdirSync } from 'node:fs';

// Deployment UI evidence only. Every API response and every PDF is synthetic.
// In particular this does NOT verify OPERA native Statement availability.
const jobId = 'c0000000-0000-4000-8000-000000000001';
const account = 'SYNTHETIC frontend QA account';
const user = { id: 'synthetic-deployed-pdf-user', email: 'ar@katathani.com', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-09-09T00:00:00Z' };

async function fixturePdf(kind: 'statement' | 'invoice', pageCount: number, label: string) {
  const pdf = await PDFDocument.create(), regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(.07, .18, .31), muted = rgb(.38, .45, .54);
  for (let index = 0; index < pageCount; index++) {
    const page = pdf.addPage([595, 842]);
    page.drawText('SYNTHETIC FRONTEND TEST', { x: 42, y: 782, size: 11, font: bold, color: navy });
    page.drawText('No customer data / not an OPERA native Statement', { x: 42, y: 764, size: 9, font: regular, color: muted });
    page.drawLine({ start: { x: 42, y: 741 }, end: { x: 553, y: 741 }, color: rgb(.8, .85, .9), thickness: 1 });
    page.drawText(kind === 'statement' ? 'Billing statement' : 'Invoice / Folio', { x: 42, y: 700, size: 23, font: bold, color: navy });
    page.drawText(account, { x: 42, y: 676, size: 10, font: regular, color: navy });
    page.drawText(`KAT / ${label} / Page ${index + 1} of ${pageCount}`, { x: 42, y: 654, size: 9, font: regular, color: muted });
    page.drawRectangle({ x: 42, y: 603, width: 511, height: 25, color: navy });
    [['Guest', 50], ['Invoice', 226], ['Open balance', 452]].forEach(([text, x]) => page.drawText(String(text), { x: Number(x), y: 612, size: 9, font: bold, color: rgb(1, 1, 1) }));
    for (const [n, name] of ['SYNTHETIC GUEST A', 'SYNTHETIC GUEST B'].entries()) {
      page.drawText(name, { x: 50, y: 580 - n * 30, size: 9, font: regular, color: navy });
      page.drawText(`SYNTHETIC-${n + 1}`, { x: 226, y: 580 - n * 30, size: 9, font: regular, color: navy });
      page.drawText('THB 100.00', { x: 452, y: 580 - n * 30, size: 9, font: regular, color: navy });
      page.drawLine({ start: { x: 42, y: 566 - n * 30 }, end: { x: 553, y: 566 - n * 30 }, color: rgb(.8, .85, .9), thickness: .5 });
    }
    page.drawText('Original synthetic wording for replacement', { x: 42, y: 485, size: 11, font: regular, color: navy });
  }
  return Buffer.from(await pdf.save());
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
  test(`deployed PDF workspace and actual export preview ${viewport.width}x${viewport.height} using synthetic data only`, async ({ page, baseURL }) => {
    test.setTimeout(60000); await page.setViewportSize(viewport);
    expect(baseURL).toContain('ar-workspace.ar-c82.workers.dev');
    const pdfs = await Promise.all([fixturePdf('statement', 1, 'STATEMENT'), fixturePdf('invoice', 2, 'INVOICE-A'), fixturePdf('invoice', 1, 'INVOICE-B')]);
    const fileIds = ['d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003'];
    const files = fileIds.map((id, index) => ({ id, kind: index === 0 ? 'statement' : 'invoice', invoice_id: index === 0 ? null : index === 1 ? 'A' : 'B', ordinal: index, state: 'ready', storage_key: `jobs/${jobId}/originals/${id}.pdf`, error_code: null, byte_count: pdfs[index].length, sha256: 'synthetic-only' }));
    const job = { id: jobId, owner: user.id, hotel: 'KAT', account_id: 'synthetic-deployed-account', account_name: account, content: 'both', layout: 'combined', purpose: 'billing', invoice_ids: ['A', 'B'], manifest: [{ id: 'A', invoice_no: 'SYNTHETIC-A' }, { id: 'B', invoice_no: 'SYNTHETIC-B' }], state: 'ready', revision: 0, project_key: null, exports: [], acknowledged: false, files, created_at: '2026-09-09T00:00:00Z' };
    const unexpectedApis: string[] = [], pageErrors: string[] = [], scripts: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', response => { if (response.url().startsWith(baseURL!) && response.url().includes('/assets/') && response.url().endsWith('.js') && response.ok()) scripts.push(response.url()); });
    await page.addInitScript(value => localStorage.setItem('sb-example-auth-token', JSON.stringify(value)), { access_token: 'synthetic-only-token', refresh_token: 'synthetic-only-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user });
    await page.route('https://example.supabase.co/**', route => route.fulfill({ json: { user } }));
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/config') return route.fulfill({ json: { supabaseUrl: 'https://example.supabase.co', publishableKey: 'synthetic-key' } });
      if (path === '/api/refresh') return route.fulfill({ json: { jobs: [], running: false, hotels: [] } });
      if (path === '/api/portfolio') return route.fulfill({ json: { status: 'connected', accounts: [], refresh: { running: false, hotels: [] } } });
      if (path === `/api/documents/${jobId}`) return route.fulfill({ json: job });
      const fileIndex = fileIds.findIndex(id => path === `/api/documents/${jobId}/files/${id}`);
      if (fileIndex >= 0) return route.fulfill({ contentType: 'application/pdf', body: pdfs[fileIndex] });
      unexpectedApis.push(path); return route.fulfill({ status: 501, json: { error: 'blocked_unmocked_synthetic_api' } });
    });
    await page.goto(`/?documentJob=${jobId}`);
    await page.getByRole('button', { name: 'Open PDF Workspace', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Select page 4', exact: true })).toBeVisible();
    await expect(page.locator('.pdf-canvas canvas')).toHaveCount(5);
    await page.getByRole('button', { name: 'Edit source text', exact: true }).click();
    await page.getByRole('button', { name: 'Edit original text: Original synthetic wording for replacement', exact: true }).click();
    await page.getByRole('textbox', { name: 'Layer text', exact: true }).fill('Edited synthetic outbound copy');
    await page.getByRole('button', { name: 'Select page 1', exact: true }).click();
    await page.locator('.pdf-page-scroll').evaluate(element => { element.scrollTop = 0; });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.pdf-workspace')).toContainText(account);
    expect(await page.locator('.pdf-workspace').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    mkdirSync('evidence', { recursive: true });
    await page.screenshot({ path: `evidence/pdf-workspace-cloudflare-${viewport.width}x${viewport.height}.png`, animations: 'disabled' });
    await page.getByRole('button', { name: 'Open mandatory Preview', exact: true }).click();
    await expect(page.locator('.pdf-final-pages canvas')).toHaveCount(4);
    await expect(page.getByRole('img', { name: 'Final PDF page 1', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save reviewed PDFs privately', exact: true })).toBeDisabled();
    await page.screenshot({ path: `evidence/pdf-workspace-cloudflare-final-preview-${viewport.width}x${viewport.height}.png`, animations: 'disabled' });
    expect(scripts.length).toBeGreaterThan(0); expect(unexpectedApis).toEqual([]); expect(pageErrors).toEqual([]);
  });
}

