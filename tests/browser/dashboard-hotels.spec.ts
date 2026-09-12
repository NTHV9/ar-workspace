import {test,expect} from '@playwright/test';
import {setupDashboard} from './fixtures/dashboard-period';
test('every closing headline shows exact KAT and TSK counts and amounts',async({page})=>{
 await setupDashboard(page);await page.goto('/?dashboard=1');await expect(page.getByTestId('dashboard-closing-count')).toHaveText('2 invoices');
 await expect(page.getByTestId('metric-open-KAT')).toContainText('1');await expect(page.getByTestId('metric-open-KAT')).toContainText('100.00');await expect(page.getByTestId('metric-open-TSK')).toContainText('200.00');
 await page.getByTestId('metric-open-TSK').click();await expect(page.getByRole('region',{name:'Dashboard invoice details'})).toContainText('INV-tsk-old');await expect(page.getByRole('region',{name:'Dashboard invoice details'})).not.toContainText('INV-kat-parent');
});

 test('period measures and latest stages have asymmetric hotel breakdowns',async({page})=>{
  const c=await setupDashboard(page);await page.goto('/?dashboard=1');
  await expect(page.getByTestId('activity-invoice_entries-KAT')).toContainText('5 invoices');await expect(page.getByTestId('activity-invoice_entries-KAT')).toContainText('2,000.00');await expect(page.getByTestId('activity-invoice_entries-TSK')).toContainText('2 invoices');await expect(page.getByTestId('activity-invoice_entries-TSK')).toContainText('1,500.00');
  await expect(page.getByTestId('activity-first-KAT')).toContainText('1 invoices');await expect(page.getByTestId('activity-first-TSK')).toContainText('0 invoices');await expect(page.getByTestId('stage-Final-TSK')).toContainText('200.00');await expect(page.getByTestId('sent-Follow 1-KAT')).toContainText('100.00');await expect(page.getByTestId('sent-Follow 1-TSK')).toContainText('150.00');
  await expect(page.getByTestId('payment-creditPostings-KAT')).toContainText('50.00');await expect(page.getByTestId('payment-creditPostings-TSK')).toContainText('0.00');
  expect(new Set(c.calls.filter(r=>r.path==='/api/dashboard/hotel-overview').map(r=>r.query.toString())).size).toBe(1);expect(c.calls.some(r=>r.path==='/api/financial/payments'||r.path==='/api/reports/activity')).toBe(false);
 });
 test('single-hotel and account filters remove the comparison without reusing another scope',async({page})=>{
  await setupDashboard(page);await page.goto('/?dashboard=1');await expect(page.getByTestId('metric-open-TSK')).toBeVisible();await page.getByRole('button',{name:'KAT',exact:true}).click();await expect(page.getByTestId('metric-open-TSK')).toHaveCount(0);await expect(page.getByTestId('dashboard-closing-count')).toHaveText('1 invoices');
 });
 test('hotel drill survives Account Detail return and clears with global hotel changes',async({page})=>{
  await setupDashboard(page);await page.goto('/?dashboard=1');await page.getByTestId('metric-open-TSK').click();const detail=page.getByRole('region',{name:'Dashboard invoice details'});await expect(detail).not.toContainText('INV-kat-parent');await detail.getByRole('button',{name:'Open current account',exact:true}).click();await page.locator('.account-page .breadcrumb').click();await expect(detail).toContainText('TSK · Open as of');await expect(detail).not.toContainText('INV-kat-parent');await page.getByRole('button',{name:'KAT',exact:true}).click();await expect(detail).toContainText('KAT · Open as of');await expect(detail).toContainText('INV-kat-parent');
 });
 test('complete hotel with no matching retired stage is zero, failed hotel source remains unavailable',async({page})=>{
  await setupDashboard(page,{retiredStage:true});await page.goto('/?dashboard=1');await expect(page.getByTestId('stage-round_retired-KAT')).toContainText('100.00');await expect(page.getByTestId('stage-round_retired-TSK')).toContainText('0 invoices');await expect(page.getByTestId('stage-round_retired-TSK')).toContainText('0.00');
 });
 test('a failed hotel balance reader does not invent zero or hide other verified sources',async({page})=>{
  await setupDashboard(page,{nullTskBalance:true});await page.goto('/?dashboard=1');await expect(page.getByTestId('metric-open-KAT')).toContainText('100.00');await expect(page.getByTestId('metric-open-TSK')).toContainText('—');await expect(page.getByTestId('metric-open-TSK')).toBeDisabled();await expect(page.getByTestId('dashboard-closing-count')).toHaveText('2 invoices');await expect(page.getByTestId('activity-invoice_entries-TSK')).toContainText('1,500.00');
 });
 test('partial reload retains an entire hotel comparison group and updates unrelated sources',async({page})=>{
  const options={nullTskBalance:false,balanceLift:0,invoiceLift:0};await setupDashboard(page,options);await page.goto('/?dashboard=1');await expect(page.getByTestId('dashboard-closing-amount')).toContainText('300.00');
  options.nullTskBalance=true;options.balanceLift=100;options.invoiceLift=1;await page.getByRole('button',{name:'Reload dashboard',exact:true}).click();await expect(page.getByText('Reload failed. Showing the last loaded balances; try again.',{exact:true})).toBeVisible();await expect(page.getByTestId('dashboard-closing-amount')).toContainText('300.00');await expect(page.getByTestId('metric-open-KAT')).toContainText('100.00');await expect(page.getByTestId('metric-open-TSK')).toContainText('200.00');await expect(page.getByTestId('dashboard-invoice_entries-count')).toHaveText('9');
  options.nullTskBalance=false;await page.getByRole('button',{name:'Reload dashboard',exact:true}).click();await expect(page.getByTestId('dashboard-closing-amount')).toContainText('500.00');await expect(page.getByTestId('metric-open-KAT')).toContainText('200.00');await expect(page.getByTestId('metric-open-TSK')).toContainText('300.00');await expect(page.getByText('Reload failed. Showing the last loaded balances; try again.',{exact:true})).toHaveCount(0);
 });
 test('hotel-only retired stages and unclassified sends stay accessible when total readers fail',async({page})=>{
  await setupDashboard(page,{nullTotalBalance:true,nullTotalActivity:true,retiredStage:true,retiredSent:true,billingUnclassified:true});await page.goto('/?dashboard=1');await expect(page.getByTestId('stage-round_retired-KAT')).toContainText('100.00');await expect(page.getByTestId('stage-round_retired-TSK')).toContainText('0.00');await expect(page.getByTestId('sent-round_retired-KAT')).toContainText('75.00');await expect(page.getByTestId('activity-billing-unclassified-KAT')).toContainText('75.00');await expect(page.getByTestId('dashboard-billing-unclassified-count')).toHaveText('—');
 });
 test('account-scoped detail captions and mobile card widths stay explicit',async({page})=>{
  await setupDashboard(page);await page.setViewportSize({width:390,height:844});await page.goto('/?dashboard=1&dashboardAccount='+encodeURIComponent(JSON.stringify(['KAT','kat-azure'])));const card=page.locator('.dashboard-kpi-card').first(),button=card.getByRole('button',{name:'View invoices',exact:true});await expect(button).toBeVisible();const bounds=await card.boundingBox(),content=await button.boundingBox();expect(content!.width).toBeGreaterThan(bounds!.width*.95);await button.click();await expect(page.getByRole('region',{name:'Dashboard invoice details'})).toContainText('KAT · Open as of');
 });
 for(const width of [1280,390])test('lower-page comparisons remain readable at '+width,async({page})=>{
  await setupDashboard(page);await page.setViewportSize({width,height:width===1280?800:844});await page.goto('/?dashboard=1');await expect(page.getByTestId('activity-invoice_entries-KAT')).toBeVisible();await page.getByRole('region',{name:'Activity in selected period',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'evidence/comparison-activity-'+width+'.png',animations:'disabled'});await page.getByTestId('payment-creditPostings-KAT').scrollIntoViewIfNeeded();await page.screenshot({path:'evidence/comparison-payments-'+width+'.png',animations:'disabled'});expect(await page.locator('.dashboard-page').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 });
