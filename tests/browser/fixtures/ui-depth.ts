import { expect, type Locator, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdirSync } from 'node:fs';
import { setupDashboard } from './dashboard-period';
import { currentAgingAccounts } from './current-aging';

export const depthJobId = 'd0000000-0000-4000-8000-000000000001';
const fileId = 'd0000000-0000-4000-8000-000000000002';
const draftId = 'd0000000-0000-4000-8000-000000000003';
const observedAt = '2026-09-12T02:59:00Z';

/** Actual App/assets, synthetic responses only. Unknown API/provider requests fail closed. */
export async function setupDepth(page: Page, options: { anonymous?: boolean; compose?: boolean } = {}) {
  const external: string[] = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['127.0.0.1', 'localhost', 'ar-workspace.ar-c82.workers.dev'].includes(url.hostname)) return route.continue();
    external.push(url.origin + url.pathname);
    return route.abort('blockedbyclient');
  });
  if (options.anonymous) {
    const errors: string[] = [], unexpected: string[] = [], methods: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => addEventListener('DOMContentLoaded', () => {
      const badge = document.createElement('aside');
      badge.textContent = 'SYNTHETIC TEST DATA';
      badge.setAttribute('aria-label', 'Synthetic test data');
      badge.style.cssText = 'position:fixed;bottom:8px;right:12px;z-index:9999;pointer-events:none;font:600 9px/1.4 sans-serif;padding:4px 7px;background:#fff;color:#51677e;border:1px solid #c8d6eb;border-radius:5px';
      document.body.appendChild(badge);
    }));
    await page.route('https://example.supabase.co/**', route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { user: null } });
      unexpected.push(route.request().method() + ' anonymous auth request');
      return route.abort('blockedbyclient');
    });
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname, method = route.request().method();
      methods.push(method + ' ' + path);
      if (path === '/api/config' && method === 'GET') return route.fulfill({ json: { supabaseUrl: 'https://example.supabase.co', publishableKey: 'synthetic-key' } });
      unexpected.push(method + ' ' + path);
      return route.fulfill({ status: 501, json: { error: 'blocked_anonymous_synthetic_request' } });
    });
    return { errors, unexpected, methods, external };
  }
  const controls = await setupDashboard(page);
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  const paper = pdf.addPage([595, 842]);
  paper.drawText('SYNTHETIC LIGHTING TEST', { x: 42, y: 790, font, size: 18, color: rgb(.1, .2, .3) });
  paper.drawText('Invoice SYNTH-001 | THB 100.00', { x: 42, y: 730, font, size: 11 });
  paper.drawText('No customer data or provider documents', { x: 42, y: 705, font, size: 10 });
  const bytes = Buffer.from(await pdf.save());
  const files = [{ id: fileId, kind: 'statement', invoice_id: null, ordinal: 0, state: 'ready', storage_key: 'synthetic/depth.pdf', error_code: null, byte_count: bytes.length, sha256: 'a'.repeat(64) }];
  const exports = [{ name: 'Synthetic-reviewed.pdf', storage_key: 'synthetic/reviewed.pdf', byte_count: bytes.length, sha256: 'a'.repeat(64) }];
  const job = { id: depthJobId, owner: '00000000-0000-4000-8000-000000000001', hotel: 'KAT', account_id: 'kat-azure', account_name: 'Azure Travel · Synthetic', content: 'statement', layout: 'combined', purpose: 'billing', invoice_ids: ['kat-parent'], manifest: [{ id: 'kat-parent', invoice_no: 'SYNTH-001' }], state: 'ready', revision: options.compose ? 1 : 0, project_key: null, exports: options.compose ? exports : [], acknowledged: !!options.compose, files, created_at: observedAt };
  const attachments = [{ id: 'd0000000-0000-4000-8000-000000000004', name: 'Synthetic-supporting-note.pdf', storage_key: 'synthetic/supplement.pdf', mime: 'application/pdf', byte_count: bytes.length, sha256: 'b'.repeat(64), inspection: { version: 1, pages: 1 } }];
  const draft = { id: draftId, document_job_id: depthJobId, document_revision: 1, hotel: job.hotel, account_id: job.account_id, account_name: job.account_name, invoice_ids: job.invoice_ids, purpose: 'billing', recipients: { to: ['lighting@example.test'], cc: [], bcc: [] }, subject: 'Synthetic billing review', body: 'Dear synthetic customer,\n\nPlease review the attached synthetic statement.\n\nAccounts Receivable', exports, attachments, revision: 1, package_changed: false };
  const methods: string[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
    methods.push(method + ' ' + path);
    if (path === '/api/email/open' && method === 'POST' && options.compose) return route.fulfill({ json: draft });
    // App-on-open refresh is simulated. Never forward a write to a service.
    if (path === '/api/refresh' && method === 'POST') return route.fulfill({ json: { jobs: [], running: false, hotels: [] } });
    if (method !== 'GET') {
      controls.unexpected.push(method + ' ' + path);
      return route.fulfill({ status: 501, json: { error: 'blocked_synthetic_write' } });
    }
    if (path.startsWith('/api/account-settings/')) return route.fulfill({ json: { revision: 1, billing_required: true, credit_term: 30, billing_method: 'email', billing_recipients: { to: [], cc: [], bcc: [] }, collection_recipients: { to: [], cc: [], bcc: [] } } });
    if (path.startsWith('/api/invoice-exceptions/')) {
      const [, , , hotel, accountId, invoiceId] = path.split('/');
      return route.fulfill({ json: { hotel, accountId, invoiceId, revision: 1, note: '', dispute: '', held: false, holdReason: null, holdReviewDate: null, needsReview: false, reviewReason: null, reopenedAt: null, updatedAt: observedAt, source: { open: '100.00', verification: 'verified', collectionRole: 'standalone', verifiedAt: observedAt } } });
    }
    if (path === '/api/collection-queue') return route.fulfill({ json: { asOf: '2026-09-12', rows: [{ hotel: 'KAT', account_id: 'kat-azure', id: 'kat-parent', guest: 'Synthetic Guest', invoice_no: 'SYNTH-001', folio_no: 'SYNTH-FOL', open: 100, transaction_date: '2026-09-01', collection_role: 'standalone', collection_selectable: true, verification_state: 'verified', account_name: 'Azure Travel · Synthetic', account_type: 'Agent', workflow: { revision: 1, billing_required: true, credit_term: 30, first_billing_date: null, last_reminder_stage: null, last_reminder_date: null, due_date: null } }] } });
    if (path === '/api/mail-reconciliation') return route.fulfill({ json: { enabled: true, intervalMinutes: 15, waiting: 0, needsReview: 0, last: null } });
    if (path.startsWith('/api/email/templates')) return route.fulfill({ json: { items: [], nextOffset: null } });
    if (path === '/api/remittances/options') return route.fulfill({ json: { accounts: currentAgingAccounts.map(a => ({ hotel: a.hotel, accountId: a.id, name: a.name, type: a.type, accountNo: a.account_no, verified: true })), config: { maxFileBytes: 10485760, maxFiles: 50, maxTotalFileBytes: 104857600 } } });
    if (path === '/api/remittances') return route.fulfill({ json: { rows: [], total: 0, summary: { documents: 0, invoices: 0, reportedAmount: '0.00', knownReportedAmount: '0.00', unspecifiedAmounts: 0, linkedOpen: '0.00', knownLinkedOpen: '0.00', unverifiedInvoices: 0 } } });
    if (path === '/api/drive/status') return route.fulfill({ json: { configured: true, connected: true, email: 'ar@katathani.com', folder: { configured: true, id: 'synthetic-depth-folder', name: 'Synthetic archive', revision: 1, ready: true, verifiedAt: observedAt, visibility: 'restricted' }, cleanupDisabled: false, pickerConfigured: false } });
    if (path.startsWith('/api/drive/jobs/')) return route.fulfill({ json: { archive: null } });
    if (path === '/api/operations/status') return route.fulfill({ json: { enabled: true, activatedAt: observedAt, active: 0, unresolved: 0, chargedEgress: 10485760, limits: { storedBytes: 1073741824, egressBytes: 2147483648, databaseBytes: 268435456, safetyPercent: 20 }, measurement: { periodStart: '2026-08-31T17:00:00Z', periodEnd: '2026-09-30T17:00:00Z', used: { storedBytes: 12582912, databaseBytes: 41943040 }, observedAt: { storedBytes: observedAt, databaseBytes: observedAt } }, pendingUploads: [] } });
    if (path === '/api/operations/retention') return route.fulfill({ json: { enabled: true, total: 0, summary: { waiting: 0, blocked: 0, uncertain: 0, deleted: 0, deletedBytes: 0 }, rows: [] } });
    if (path === '/api/operations/queue') return route.fulfill({ json: { total: 0, writeHold: false, rows: [] } });
    if (path === '/api/gmail/status') return route.fulfill({ json: { configured: true, connected: true, canRead: true, email: 'ar@katathani.com', maxAttachmentBytes: 10485760 } });
    if (path === `/api/documents/${depthJobId}`) return route.fulfill({ json: job });
    if (path === `/api/documents/${depthJobId}/files/${fileId}`) return route.fulfill({ contentType: 'application/pdf', body: bytes });
    return route.fallback();
  });
  return { ...controls, methods, external };
}

export async function expectElevation(surface: Locator) {
  await expect(surface).toBeVisible();
  const shadow = await surface.evaluate(el => getComputedStyle(el).boxShadow);
  expect(shadow, 'surface has a soft outer shadow and a light inset edge').not.toBe('none');
  expect(shadow).toContain('inset');
  expect(shadow.split(/,(?![^()]*\))/).some(layer => !layer.includes('inset') && /[1-9]\d*(?:\.\d+)?px/.test(layer))).toBe(true);
}

export async function expectLighting(surface: Locator) {
  await expect(surface).toBeVisible();
  expect(await surface.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('gradient');
}

export async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'page fits the viewport').toBe(true);
}

export async function expectChromeTypography(page: Page) {
  const labels = page.getByRole('navigation', { name: 'Main navigation' }).locator('button');
  const sizes = await labels.evaluateAll(elements => elements.map(el => parseFloat(getComputedStyle(el).fontSize)));
  expect(sizes.length).toBeGreaterThan(0);
  expect(Math.min(...sizes), 'navigation remains readable at desktop and narrow widths').toBeGreaterThanOrEqual(11);
}

/** Conservative caption contrast across each stop of a single translucent gradient. */
export async function expectGradientCaptionContrast(surface: Locator) {
  const result = await surface.evaluate(el => {
    const rgba = (value: string) => { const channels = value.match(/[\d.]+/g)?.map(Number) ?? []; return [channels[0], channels[1], channels[2], channels[3] ?? 1]; };
    const over = (front: number[], back: number[]) => front.slice(0, 3).map((value, i) => value * front[3] + back[i] * (1 - front[3])).concat(1);
    const luminance = (color: number[]) => color.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((total, v, i) => total + v * [.2126, .7152, .0722][i], 0);
    const style = getComputedStyle(el), base = rgba(style.backgroundColor), foreground = rgba(getComputedStyle(el.querySelector('span') ?? el).color);
    const stops = style.backgroundImage.match(/rgba?\([^)]+\)/g) ?? [];
    const ratios = stops.map(stop => {
      const bg = over(rgba(stop), base), fg = over(foreground, bg), levels = [luminance(bg), luminance(fg)].sort((a, b) => a - b);
      return (levels[1] + .05) / (levels[0] + .05);
    });
    return { baseAlpha: base[3], image: style.backgroundImage, ratios };
  });
  expect(result.baseAlpha, 'caption card has an opaque base').toBe(1);
  expect(result.ratios.length, 'the rendered gradient has color stops').toBeGreaterThan(1);
  expect(Math.min(...result.ratios), JSON.stringify(result)).toBeGreaterThanOrEqual(4.5);
}

export async function expectFlatContent(page: Page, selector: string) {
  const content = page.locator(selector);
  expect(await content.count(), 'financial content is present').toBeGreaterThan(0);
  const unexpected = await content.evaluateAll(elements => elements.filter(el => {
    const s = getComputedStyle(el);
    return s.boxShadow !== 'none' || s.textShadow !== 'none' || s.filter !== 'none';
  }).map(el => ({ tag: el.tagName, className: el.className, shadow: getComputedStyle(el).boxShadow })));
  expect(unexpected, 'paper, financial cells and text controls stay flat').toEqual([]);
}

/** Set AR_DEPTH_CAPTURE=1 only when capturing a new synthetic evidence set. */
export async function captureDepth(page: Page, name: string) {
  if (process.env.AR_DEPTH_CAPTURE !== '1') return;
  mkdirSync('evidence', { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `evidence/depth-${name}.png`, animations: 'disabled' });
}
