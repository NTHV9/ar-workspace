import { test, expect } from '@playwright/test';
import { assertButtonVisibility } from './fixtures/button-visibility';
import { captureDepth, depthJobId, expectChromeTypography, expectElevation, expectFlatContent, expectGradientCaptionContrast, expectLighting, expectNoOverflow, setupDepth } from './fixtures/ui-depth';

for (const width of [1440, 1280]) {
  test(`shared lighting survives lazy navigation across the app at ${width}`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 });
    const controls = await setupDepth(page);
    const surfaces = [
      { route: '/?dashboard=1', surface: '.dashboard-period-filters', lit: '.dashboard-kpi-card.primary', capture: 'dashboard', card: true },
      { route: '/?dashboard=1&dashboardView=aging', surface: '.aging-v4-overview', lit: '.aging-v4-balance', capture: 'aging', action: 'Current Aging · KAT / TSK' },
      { route: '/', surface: '.total-summary', lit: '.total-summary', capture: 'portfolio', nav: 'Portfolio' },
      { route: '/?account=kat-azure&property=KAT', surface: '.ledger-panel', lit: '.metric.blue', capture: 'account', card: true },
      { route: '/?account=kat-azure&property=KAT&accountSection=Overview', surface: '.account-config', lit: '.account-config', action: 'Overview', controls: true },
      { route: '/?collections=1', surface: '.queue-work', lit: '.queue-metrics .billing-metric', capture: 'collections', nav: 'Collections', card: true },
      { route: '/?collectionPolicy=1', surface: '.policy-panel', lit: '.policy-panel', action: 'Edit collection rules' },
      { route: '/?reports=1', surface: '.external-billing-history', lit: '.external-billing-history', nav: 'Reports' },
      { route: '/?remittances=1', surface: '.remittance-records', lit: '.remittance-summary-accent', nav: 'Remittances', card: true, contrast: true, capture: 'remittances' },
      { route: '/?templates=1', surface: '.template-editor', lit: '.template-editor', nav: 'Templates', controls: true },
      { route: '/?storage=1', surface: '.drive-settings', lit: '.storage-controls', capture: 'storage', nav: 'Storage' },
      { route: '/?operations=1', surface: '.operations-section', lit: '.operations-section' },
    ];
    for (const item of surfaces) {
      await test.step(item.route, async () => {
        if (item.nav) await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: item.nav, exact: true }).click();
        else if (item.action) await page.getByRole('button', { name: item.action, exact: true }).click();
        else await page.goto(item.route);
        await expectElevation(page.locator(item.surface).first());
        await expectLighting(page.locator(item.lit).first());
        if (item.card) await expectElevation(page.locator(item.lit).first());
        if (item.contrast) await expectGradientCaptionContrast(page.locator(item.lit).first());
        if (item.controls) await assertButtonVisibility(page, page.locator(item.surface).first());
        await expectChromeTypography(page);
        await expectNoOverflow(page);
        if (item.capture === 'portfolio') {
          await page.evaluate(() => document.fonts.ready);
          const toggle = await page.locator('.aging-toggle').boundingBox(), filters = await page.locator('.filters').boundingBox();
          expect(toggle!.y + toggle!.height, 'Aging toggle clears the filter row after larger type').toBeLessThanOrEqual(filters!.y);
        }
        if (item.capture) await captureDepth(page, `${item.capture}-${width}`);
      });
    }
    // Revisit an eager page without reloading after an operations stylesheet loads.
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Portfolio', exact: true }).click();
    await expectElevation(page.locator('.total-summary'));
    await expectFlatContent(page, '.table-panel tbody td');
    await expectFlatContent(page, '.table-panel .sort-button');
    await expectFlatContent(page, '.table-panel .name-link');
    expect(controls.errors).toEqual([]);
    expect(controls.unexpected).toEqual([]);
    expect(controls.external).toEqual([]);
  });

  test(`raised actions and confirmation keep readable labels at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 });
    const controls = await setupDepth(page, { compose: true });
    await page.goto(`/?documentJob=${depthJobId}&compose=1`);
    await expect(page.getByLabel('Email TO')).toHaveValue('lighting@example.test');
    await expectElevation(page.locator('.email-workspace'));
    await expectFlatContent(page, '.email-file-link');
    await expectFlatContent(page, '.remove-supplemental');
    await assertButtonVisibility(page, page.locator('.email-workspace'));
    await page.getByRole('button', { name: 'Review & send now', exact: true }).click();
    const confirm = page.locator('.email-send-confirm');
    await expectElevation(confirm);
    await expect(page.getByRole('button', { name: 'Confirm send now', exact: true })).toBeDisabled();
    await page.getByRole('checkbox', { name: 'I reviewed the recipients, message and final PDF files.' }).check();
    await assertButtonVisibility(page, confirm);
    await expectNoOverflow(page);
    await captureDepth(page, `email-confirm-${width}`);
    expect(controls.methods.some(method => /\/(send|gmail-draft)$/.test(method))).toBe(false);
    expect(controls.unexpected).toEqual([]);
    expect(controls.errors).toEqual([]);
    expect(controls.external).toEqual([]);
  });

  test(`PDF chrome is raised while source paper remains unchanged at ${width}`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 });
    const controls = await setupDepth(page);
    await page.goto(`/?documentJob=${depthJobId}`);
    await expectElevation(page.locator('.document-manifest'));
    await page.getByRole('button', { name: 'Open PDF Workspace', exact: true }).click();
    await expect(page.locator('.pdf-canvas canvas').first()).toBeVisible();
    await expectElevation(page.locator('.pdf-workspace'));
    await expectFlatContent(page, '.pdf-canvas canvas');
    await expectFlatContent(page, '.pdf-text-target');
    await assertButtonVisibility(page, page.locator('.pdf-toolbar'));
    await assertButtonVisibility(page, page.locator('.pdf-review'));
    const clippedTools = await page.locator('.pdf-toolbar').evaluate(toolbar => {
      const bounds = toolbar.getBoundingClientRect();
      return Array.from(toolbar.querySelectorAll('button,select')).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1);
      }).map(el => el.textContent?.trim() || el.getAttribute('aria-label'));
    });
    expect(clippedTools, 'wrapped PDF tools remain inside the toolbar').toEqual([]);
    await expectNoOverflow(page);
    await captureDepth(page, `pdf-workspace-${width}`);
    await page.getByRole('button', { name: 'Open mandatory Preview', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Final PDF page 1', exact: true })).toBeVisible();
    await expectElevation(page.locator('.pdf-preview-dialog'));
    await expectFlatContent(page, '.pdf-preview-dialog canvas');
    await expect(page.getByRole('button', { name: 'Save reviewed PDFs privately', exact: true })).toBeDisabled();
    expect(controls.unexpected).toEqual([]);
    expect(controls.errors).toEqual([]);
    expect(controls.external).toEqual([]);
  });
}

test('login and recovery have readable raised actions without submitting credentials', async ({ page }) => {
  const controls = await setupDepth(page, { anonymous: true });
  await page.goto('/');
  await expectElevation(page.locator('.login-panel'));
  expect(await page.evaluate(() => localStorage.getItem('sb-example-auth-token'))).toBeNull();
  await assertButtonVisibility(page, page.locator('.login-panel'));
  await captureDepth(page, 'login-1440');
  await page.getByRole('button', { name: 'Forgot web app password?', exact: true }).click();
  await expectElevation(page.locator('.login-panel'));
  await assertButtonVisibility(page, page.locator('.login-panel'));
  expect(controls.methods.every(method => method.startsWith('GET '))).toBe(true);
  expect(controls.unexpected).toEqual([]);
  expect(controls.external).toEqual([]);
});

test('narrow Aging and Portfolio keep readable colors while surfaces fit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const controls = await setupDepth(page);
  await page.goto('/?dashboard=1&dashboardView=aging');
  const table = page.getByRole('table', { name: 'Current source aging comparison' });
  for (const range of ['0–30', '31–60', '61–90', '91–120', '121–150', '151+']) await expect(table).toContainText(range);
  await expectElevation(page.locator('.aging-v4-overview'));
  await expectLighting(page.locator('.aging-v4-balance'));
  await expectFlatContent(page, '.aging-comparison-frame tbody td, .aging-comparison-frame th button');
  await expectNoOverflow(page);
  await expectChromeTypography(page);
  await captureDepth(page, 'aging-390');
  await page.locator('.aging-comparison-frame').scrollIntoViewIfNeeded();
  await captureDepth(page, 'aging-table-390');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Portfolio', exact: true }).click();
  await expectElevation(page.locator('.total-summary'));
  await expectGradientCaptionContrast(page.locator('.total-summary'));
  await expectChromeTypography(page);
  await expectNoOverflow(page);
  await page.evaluate(() => scrollTo(0, 0));
  await captureDepth(page, 'portfolio-390');
  expect(controls.unexpected).toEqual([]);
  expect(controls.errors).toEqual([]);
  expect(controls.external).toEqual([]);
});
