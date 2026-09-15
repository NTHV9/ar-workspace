import {test,expect} from '@playwright/test';
import {setupDashboard} from './fixtures/dashboard-period';
import {currentAgingAccounts,currentAgingInvoices} from './fixtures/current-aging';

test('signed outstanding count and hotel totals include credit rows while positive work uses its own denominator',async({page})=>{
 const c=await setupDashboard(page,{creditAmount:-20});await page.goto('/?dashboard=1');
 await expect(page.getByTestId('dashboard-closing-count')).toHaveText('3 invoices');await expect(page.getByTestId('dashboard-closing-amount')).toHaveText('฿280.00');
 const all=page.getByRole('button',{name:'View invoices',exact:true});await expect(all).toContainText('Net open balance');await expect(all).toContainText('Includes 1 credit item · -฿20.00');
 await expect(page.getByTestId('metric-open-KAT')).toContainText('2 invoices');await expect(page.getByTestId('metric-open-KAT')).toContainText('฿80.00');await expect(page.getByTestId('metric-open-TSK')).toContainText('฿200.00');
 const stage=page.getByRole('button',{name:/^Final · All hotels/});await expect(stage).toContainText('1 invoices');await expect(stage).toContainText('66.7% of positive open');
 await expect(page.getByRole('img',{name:'50% of billing-required invoices billed'})).toBeVisible();await all.click();const detail=page.getByRole('region',{name:'Dashboard invoice details'});await expect(detail.locator('tbody tr')).toHaveCount(3);await expect(detail).toContainText('INV-kat-credit');await expect(detail).toContainText('Open -฿20.00');
 await page.getByRole('button',{name:'View not yet billed',exact:true}).click();await expect(detail.locator('tbody tr')).toHaveCount(1);await expect(detail).not.toContainText('INV-kat-credit');
 await page.getByText('All status counts, amounts & percentages',{exact:true}).click();const breakdown=page.getByRole('region',{name:'Closing-date status breakdown'});await expect(breakdown.getByRole('row').filter({hasText:'Billing required · billed'})).toContainText('66.7%');
 expect(c.errors).toEqual([]);expect(c.unexpected).toEqual([]);
});

for(const creditAmount of [-300,-500])test('zero or negative net retains positive work proportions '+creditAmount,async({page})=>{
 const c=await setupDashboard(page,{creditAmount});await page.goto('/?dashboard=1');await expect(page.getByTestId('dashboard-closing-amount')).toHaveText(creditAmount===-300?'฿0.00':'-฿200.00');
 const stage=page.getByRole('button',{name:/^Final · All hotels/});await expect(stage).toContainText('66.7% of positive open');await expect(page.getByTestId('stage-Final-TSK')).toContainText('฿200.00');
 await expect(page.getByTestId('metric-open-KAT')).toContainText(creditAmount===-300?'-฿200.00':'-฿400.00');await expect(page.locator('.dashboard-kpi-card').first().locator('.hotel-comparison-track')).toHaveCount(0);expect(c.errors).toEqual([]);
});

test('credit-only balance has no collection work and no invalid percentages',async({page})=>{
 const c=await setupDashboard(page,{creditAmount:-20,creditOnly:true});await page.goto('/?dashboard=1');await expect(page.getByTestId('dashboard-closing-count')).toHaveText('1 invoices');await expect(page.getByTestId('dashboard-closing-amount')).toHaveText('-฿20.00');
 await expect(page.getByRole('button',{name:'View not yet billed',exact:true})).toContainText('0 invoices');const stage=page.getByRole('button',{name:/^Final · All hotels/});await expect(stage).toContainText('0 invoices');await expect(stage).toContainText('— of positive open');await expect(stage).toContainText('฿0.00');expect(c.errors).toEqual([]);
});

test('legacy captures keep net totals unknown and positive work visible without a credit-coverage notice',async({page})=>{
 const c=await setupDashboard(page,{creditAmount:-20,legacyCreditGap:true});await page.goto('/?dashboard=1&dashboardFrom=2026-09-11&dashboardTo=2026-09-11');
 await expect(page.getByTestId('dashboard-closing-count')).toHaveText('— invoices');await expect(page.getByTestId('dashboard-closing-amount')).toHaveText('—');await expect(page.getByRole('region',{name:'Outstanding at period end',exact:true}).locator('.dashboard-notice')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'View not yet billed',exact:true})).toContainText('1 invoices');await expect(page.getByTestId('metric-open-KAT')).toContainText('—');await page.getByRole('button',{name:'View invoices',exact:true}).click();const detail=page.getByRole('region',{name:'Dashboard invoice details'});await expect(detail.locator('.dashboard-notice')).toHaveCount(0);await expect(detail).toContainText('INV-kat-parent');await expect(detail).not.toContainText('INV-kat-credit');
 await page.getByRole('button',{name:'View not yet billed',exact:true}).click();await expect(detail).not.toContainText('Credit balances were not captured');await expect(detail).not.toContainText('Source coverage is incomplete');await expect(detail.locator('tbody tr')).toHaveCount(1);expect(c.errors).toEqual([]);
});

for(const width of [1280,390])test('signed outstanding note and comparison remain readable at '+width,async({page})=>{
 const c=await setupDashboard(page,{creditAmount:-20});await page.setViewportSize({width,height:width===1280?800:844});await page.goto('/?dashboard=1');const card=page.getByRole('button',{name:'View invoices',exact:true});await expect(card).toContainText('Includes 1 credit item · -฿20.00');
 await page.getByRole('region',{name:'Outstanding at period end',exact:true}).evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:'evidence/signed-outstanding-'+width+'.png',animations:'disabled'});
 expect(await page.locator('.dashboard-page').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);expect(await card.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);expect(c.errors).toEqual([]);expect(c.unexpected).toEqual([]);
});

test('stale Account API child rows are hidden from Folio counts, selection and a child deep link',async({page})=>{
 const c=await setupDashboard(page),account={...currentAgingAccounts[0],open:80,items:2,agingBuckets:[{label:'0–30',start:0,end:30,sequence:0,amount:80,debit:100,credit:-20}]};
 await page.route('**/api/portfolio',r=>r.fulfill({json:{status:'connected',accounts:[account],refresh:{running:false,hotels:[]}}}));
 await page.route('**/api/accounts/KAT/kat-azure',r=>r.fulfill({json:{invoices:currentAgingInvoices['kat-azure'].slice(0,3).map((row,index)=>({...row as object,collection_selectable:index===0,aging:'0–30',workflow:null}))}}));
 await page.route('**/api/invoice-exceptions/**',r=>r.fulfill({status:503,json:{error:'synthetic_unavailable'}}));
 await page.route('**/api/account-settings/KAT/kat-azure',r=>r.fulfill({json:{billing_method:'email',billing_portal:null}}));
 await page.goto('/?account=kat-azure&property=KAT&focusInvoice=kat-child');
 await expect(page.getByRole('heading',{name:'Guest Invoice / Folio KAT · 2 items'})).toBeVisible();await expect(page.locator('.ledger tbody tr')).toHaveCount(2);await expect(page.locator('.account-page')).not.toContainText('INV-kat-child');await expect(page.getByRole('complementary',{name:'Invoice details'})).not.toContainText('FOL-kat-child');
 await expect(page.getByLabel('Select INV-kat-credit',{exact:true})).toBeDisabled();await expect(page.locator('.ledger tbody tr').filter({hasText:'INV-kat-credit'}).locator('td').nth(7)).toHaveText('THB -20');await page.getByLabel('Select all visible invoices',{exact:true}).check();await expect(page.getByLabel('Select INV-kat-parent',{exact:true})).toBeChecked();await expect(page.getByLabel('Select INV-kat-credit',{exact:true})).not.toBeChecked();expect(c.errors).toEqual([]);expect(c.unexpected).toEqual([]);
});
