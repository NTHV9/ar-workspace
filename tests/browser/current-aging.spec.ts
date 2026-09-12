import {test,expect,type Locator,type Page} from '@playwright/test';
import {currentAgingInvoices} from './fixtures/current-aging';
const local=(process.env.AR_AGING_TEST_ORIGIN??'http://127.0.0.1:5191')+'/tests/browser/current-aging-harness.html';
const ranges=['0–30','31–60','61–90','91–120','121–150','151+'];
async function expectMeasures(table:Locator,labels=['net open',...ranges],hotel='Total'){
 await expect(table.locator('thead tr')).toHaveCount(1);
 await expect(table.getByRole('columnheader')).toHaveCount(labels.length+2);
 await expect(table.locator('thead button[aria-label]')).toHaveCount(labels.length);
 for(const label of labels)await expect(table.getByRole('button',{name:`Sort ${label} ${hotel}`,exact:true})).toBeVisible();
}
async function setup(page:Page){
 const failures:string[]=[];page.on('pageerror',e=>failures.push(e.message));
 await page.route('**/api/accounts/**',route=>{
  const request=route.request(),parts=new URL(request.url()).pathname.split('/'),id=decodeURIComponent(parts[4]);
  if(request.headers().authorization!=='Bearer synthetic-aging-session'||!Object.hasOwn(currentAgingInvoices,id)){failures.push('Unexpected account read');return route.fulfill({status:400,json:{error:'unexpected'}});}
  return route.fulfill({json:{invoices:currentAgingInvoices[id],source:'opera',status:'connected'}});
 });return failures;
}
test('current Aging drills type/account/bucket, excludes children, keeps credits and returns context',async({page})=>{
 const failures=await setup(page);await page.goto(local);
 const comparison=page.getByRole('table',{name:'Current source aging comparison'});
 await expect(comparison.locator('tbody[data-aging-group]')).toHaveCount(2);
 await expect(comparison.locator('tbody tr')).toHaveCount(6);
 await expect(comparison.getByRole('button',{name:'Corporate · TSK · 0–30',exact:true})).toBeDisabled();
 await expect(comparison.getByRole('button',{name:'Corporate · TSK · 0–30',exact:true})).toHaveText('—No account');
 await comparison.getByRole('button',{name:'Open accounts in Agent',exact:true}).click();
 await page.getByLabel('Search current aging').fill('Azure TSK');await expect(comparison.locator('tbody[data-aging-group]')).toHaveCount(1);
 await comparison.getByRole('button',{name:'Azure Travel · Synthetic · KAT · 0–30',exact:true}).click();
 const invoices=page.getByRole('table',{name:'Current aging invoices'});
 await expect(invoices).toContainText('INV-kat-parent');await expect(invoices).not.toContainText('INV-kat-child');
 await expect(page.getByText('1 child row excluded')).toBeVisible();
 await invoices.getByRole('button',{name:'Open invoice INV-kat-parent'}).click();await expect(page.getByLabel('Opened invoice')).toHaveText('["KAT","kat-azure","kat-parent"]');
 await page.getByRole('button',{name:'Return from Account Detail'}).click();await expect(invoices).toContainText('INV-kat-parent');await expect(page.getByLabel('Invoice hotel')).toHaveValue('KAT');
 await page.getByLabel('Invoice aging bucket').selectOption({label:'31–60'});await expect(invoices).toContainText('INV-kat-credit');await expect(invoices).toContainText('-20.00');
 await page.getByLabel('Invoice aging bucket').selectOption({label:'151+'});await expect(invoices).toContainText('INV-kat-old');await expect(page.getByText('Difference · THB 20.00',{exact:true})).toBeVisible();
 await page.getByLabel('Invoice evidence view').selectOption('unassigned');await expect(invoices).toContainText('INV-kat-unknown');
 await page.getByRole('button',{name:'Back to Agent accounts',exact:true}).click();await expect(page.getByLabel('Search current aging')).toHaveValue('Azure TSK');await expect(comparison.locator('tbody[data-aging-group]')).toHaveCount(1);
 await page.getByRole('button',{name:'All account types',exact:true}).click();await expect(comparison.locator('tbody[data-aging-group]')).toHaveCount(2);
 await page.getByLabel('Global hotel').selectOption('TSK');await expect(comparison.locator('tbody[data-aging-group]')).toHaveCount(1);await expect(comparison.locator('tbody tr')).toHaveCount(1);await expect(comparison.locator('tbody .aging-row-hotel')).toHaveText(['TSK']);
 await expect(comparison.getByRole('button',{name:'Agent · TSK · 0–30',exact:true})).toHaveText('50.0033.3%');
 await expect(comparison.getByRole('button',{name:'Agent · KAT · 0–30',exact:true})).toHaveCount(0);
 expect(failures).toEqual([]);
});
test('range selection highlights all-range comparison and drives row navigation, invoice selector and restored context',async({page})=>{
 const failures=await setup(page);await page.goto(local);
 const comparison=page.getByRole('table',{name:'Current source aging comparison'});
 await expectMeasures(comparison);
 await expect(comparison.locator('thead th.is-selected')).toContainText('0–30');
 await page.getByRole('button',{name:'Compare 151+ days',exact:true}).click();
 await expectMeasures(comparison);
 await expect(comparison.locator('thead th.is-selected')).toContainText('151+');
 await expect(comparison.locator('thead [aria-sort="descending"] button')).toHaveAttribute('aria-label','Sort net open Total');
 await comparison.getByRole('button',{name:'Open accounts in Agent',exact:true}).click();
 await comparison.getByRole('button',{name:'Open invoices for Azure Travel · Synthetic',exact:true}).click();
 const invoices=page.getByRole('table',{name:'Current aging invoices'});
 await expect(invoices).toContainText('INV-kat-old');await expect(invoices).not.toContainText('INV-kat-parent');
 await page.getByLabel('Invoice aging bucket').selectOption({label:'31–60'});
 await expect(page.getByRole('button',{name:'Compare 31–60 days',exact:true})).toHaveAttribute('aria-pressed','true');
 await expectMeasures(comparison);await expect(comparison.locator('thead th.is-selected')).toContainText('31–60');
 await invoices.getByRole('button',{name:'Open invoice INV-kat-credit',exact:true}).click();await page.getByRole('button',{name:'Return from Account Detail',exact:true}).click();
 await expectMeasures(comparison);await expect(comparison.locator('thead th.is-selected')).toContainText('31–60');await expect(invoices).toContainText('-20.00');
 await page.getByRole('button',{name:'Back to Agent accounts',exact:true}).click();
 await expect(page.getByRole('button',{name:'Compare 31–60 days',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(failures).toEqual([]);
});
test('hidden sort columns yield to a visible measure and all ranges stay one click away',async({page})=>{
 await setup(page);await page.goto(local);
 const comparison=page.getByRole('table',{name:'Current source aging comparison'});
 await expectMeasures(comparison);await page.getByLabel('Sort hotel',{exact:true}).selectOption('KAT');
 await comparison.getByRole('button',{name:'Sort 151+ KAT',exact:true}).click();
 const controls=page.locator('.aging-column-controls');await controls.locator('summary').click();
 await controls.getByLabel('151+ days',{exact:true}).uncheck();
 await expect(comparison.locator('thead [aria-sort="descending"]')).toHaveCount(1);
 await expect(page.getByLabel('Sort hotel',{exact:true})).toHaveValue('KAT');
 await expect(comparison.locator('thead [aria-sort="descending"] button')).toHaveAttribute('aria-label','Sort 0–30 KAT');
 await expectMeasures(comparison,['net open',...ranges.slice(0,-1)],'KAT');
 await controls.locator('summary').click();await page.getByRole('button',{name:'Show all ranges',exact:true}).click();
 await expectMeasures(comparison,undefined,'KAT');
});
test('current Aging handles failed invoice reads and verified empty buckets',async({page})=>{
 await setup(page);let fail=true;await page.route('**/api/accounts/KAT/kat-birch',route=>fail?route.fulfill({status:503,json:{error:'unavailable'}}):route.fulfill({json:{invoices:[]}}));
 await page.goto(local);await page.getByRole('button',{name:'Open accounts in Agent',exact:true}).click();
 await page.getByRole('button',{name:'Birch · Synthetic · KAT · 0–30',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Invoice data is unavailable');
 fail=false;await page.getByRole('button',{name:'Retry invoice read',exact:true}).click();await expect(page.getByText('No verified nonzero invoices in this bucket.',{exact:true})).toBeVisible();
});
test('changing invoice hotel ignores a late response from the previous ledger',async({page})=>{
 const failures=await setup(page);let release!:()=>void,start!:()=>void,finish!:()=>void;
 const pending=new Promise<void>(r=>release=r),started=new Promise<void>(r=>start=r),finished=new Promise<void>(r=>finish=r);
 await page.route('**/api/accounts/KAT/kat-azure',async route=>{start();await pending;await route.fulfill({json:{invoices:currentAgingInvoices['kat-azure']}});finish();});
 await page.goto(local);await page.getByRole('button',{name:'Open accounts in Agent',exact:true}).click();
 await page.getByRole('button',{name:'Azure Travel · Synthetic · KAT · 0–30',exact:true}).click();await started;
 await page.getByLabel('Invoice hotel').selectOption('TSK');const invoices=page.getByRole('table',{name:'Current aging invoices'});await expect(invoices).toContainText('INV-tsk-young');
 release();await finished;await expect(invoices).not.toContainText('INV-kat-parent');await expect(page.getByLabel('Invoice hotel')).toHaveValue('TSK');expect(failures).toEqual([]);
});
test('all matched accounts remain reachable by sorting, pagination and search',async({page})=>{
 await setup(page);await page.goto(local+'?large=1');await page.getByRole('button',{name:'Open accounts in Agent',exact:true}).click();
 const comparison=page.getByRole('table',{name:'Current source aging comparison'}),rows=comparison.locator('tbody[data-aging-group]');
 await expect(rows).toHaveCount(25);await expect(rows.first()).toContainText('Extra 63');
 await comparison.getByRole('button',{name:'Sort 0–30 Total',exact:true}).click();await comparison.getByRole('button',{name:'Sort 0–30 Total',exact:true}).click();await expect(rows.first()).toContainText('Birch');
 await page.getByRole('button',{name:'Next',exact:true}).click();await expect(rows).toHaveCount(25);await page.getByRole('button',{name:'Next',exact:true}).click();await expect(rows).toHaveCount(15);await expect(rows.last()).toContainText('Extra 63');
 await page.getByLabel('Search current aging').fill('Extra 63');await expect(rows).toHaveCount(1);await expect(rows).toContainText('Extra 63');await expect(page.getByText('1 matched accounts · page 1 of 1',{exact:true})).toBeVisible();
});
test('opening an account from a later page preserves that page when returning',async({page})=>{
 await setup(page);await page.route('**/api/accounts/KAT/extra-*',route=>route.fulfill({json:{invoices:[]}}));
 await page.goto(local+'?large=1');await page.getByRole('button',{name:'Open accounts in Agent',exact:true}).click();
 await page.getByRole('button',{name:'Next',exact:true}).click();
 const comparison=page.getByRole('table',{name:'Current source aging comparison'});
 const name=await comparison.locator('tbody .aging-row-link').first().textContent();
 await comparison.locator('tbody .aging-row-link').first().click();
 await page.getByRole('button',{name:'Back to Agent accounts',exact:true}).click();
 await expect(page.getByText('65 matched accounts · page 2 of 3',{exact:true})).toBeVisible();
 await expect(comparison.locator('tbody .aging-row-link').first()).toHaveText(name!);
});
for(const change of ['bucket cell','invoice selector'])test(`all-range ${change} drill preserves the origin page, search and sort`,async({page})=>{
 const failures=await setup(page);await page.route('**/api/accounts/KAT/extra-*',route=>route.fulfill({json:{invoices:[]}}));
 await page.goto(local+'?large=1');await page.getByRole('button',{name:'Open accounts in Agent',exact:true}).click();
 await page.getByLabel('Sort hotel',{exact:true}).selectOption('KAT');
 await page.getByLabel('Search current aging').fill('Extra');
 const comparison=page.getByRole('table',{name:'Current source aging comparison'});
 await comparison.getByRole('button',{name:'Sort net open KAT',exact:true}).click();
 await page.getByRole('button',{name:'Next',exact:true}).click();
 await expect(comparison.locator('tbody .aging-row-link').first()).toHaveText('Extra 26 · Synthetic');
 await page.getByRole('button',{name:'Compare 151+ days',exact:true}).click();
 await expect(page.getByText('63 matched accounts · page 2 of 3',{exact:true})).toBeVisible();
 await expectMeasures(comparison,undefined,'KAT');
 await expect(comparison.locator('tbody .aging-row-link').first()).toHaveText('Extra 26 · Synthetic');
 await comparison.getByRole('button',{name:'Extra 26 · Synthetic · KAT · 151+',exact:true}).click();
 await expect(page.getByLabel('Invoice aging bucket')).toHaveValue('["151+",151,null,5]');
 if(change==='invoice selector')await page.getByLabel('Invoice aging bucket').selectOption({label:'31–60'});
 await page.getByRole('button',{name:'Back to Agent accounts',exact:true}).click();
 await expect(page.getByLabel('Search current aging')).toHaveValue('Extra');
 await expect(comparison.locator('thead [aria-sort="ascending"] button')).toHaveAttribute('aria-label','Sort net open KAT');
 await expect(page.getByText('63 matched accounts · page 2 of 3',{exact:true})).toBeVisible();
 await expect(comparison.locator('tbody .aging-row-link').first()).toHaveText('Extra 26 · Synthetic');
 await expect(page.getByRole('button',{name:`Compare ${change==='invoice selector'?'31–60':'151+'} days`,exact:true})).toHaveAttribute('aria-pressed','true');
 expect(failures).toEqual([]);
});
test('column presets and toggles preserve hotel groups, exact amounts and drill-back context',async({page})=>{
 const failures=await setup(page);await page.goto(local);
 const comparison=page.getByRole('table',{name:'Current source aging comparison'}),columns=page.locator('.aging-column-controls');
 await columns.locator('summary').click();await columns.getByRole('button',{name:'Summary',exact:true}).click();
 await expectMeasures(comparison,['net open']);
 await expect(page.getByLabel('Current aging overview').getByRole('button',{name:/^Compare .* days$/})).toHaveCount(6);
 await columns.getByLabel('151+ days',{exact:true}).check();await columns.getByLabel('Net open',{exact:true}).uncheck();
 await expect(columns.locator('.aging-column-state')).toContainText('Custom');await expectMeasures(comparison,['151+']);
 const firstGroup=comparison.locator('tbody[data-aging-group]').first();
 await expect(firstGroup.locator('.aging-row-hotel')).toHaveText(['TSK','KAT','Total']);
 await expect(firstGroup.locator('td')).toHaveText(['100.0066.7%','200.0071.4%','300.0069.8%']);
 await columns.getByLabel('Bucket percentages',{exact:true}).uncheck();await expect(firstGroup.locator('td')).toHaveText(['100.00','200.00','300.00']);
 await columns.locator('summary').click();await comparison.getByRole('button',{name:'Open accounts in Agent',exact:true}).click();
 await comparison.getByRole('button',{name:'Azure Travel · Synthetic · KAT · 151+',exact:true}).click();
 await page.getByRole('button',{name:'Open invoice INV-kat-old',exact:true}).click();await page.getByRole('button',{name:'Return from Account Detail',exact:true}).click();
 await expectMeasures(comparison,['151+']);await expect(page.getByLabel('Invoice aging bucket')).toHaveValue('["151+",151,null,5]');
 await columns.locator('summary').click();await expect(columns.getByLabel('Bucket percentages',{exact:true})).not.toBeChecked();
 await columns.getByRole('button',{name:'All aging',exact:true}).click();await expectMeasures(comparison);
 await expect(comparison.locator('tbody[data-aging-group] td')).toHaveCount(21);expect(failures).toEqual([]);
});
test('overview follows the complete filtered set rather than the current table page',async({page})=>{
 await setup(page);await page.goto(local+'?large=1');await page.getByRole('button',{name:'Open accounts in Agent',exact:true}).click();
 const overview=page.getByLabel('Current aging overview');await expect(overview).toContainText('67 hotel accounts');
 const before=await overview.textContent();await page.getByRole('button',{name:'Next',exact:true}).click();await expect(overview).toHaveText(before!);
 await page.getByLabel('Search current aging').fill('Azure TSK');await expect(overview).toContainText('2 hotel accounts');await expect(overview.getByText('430.00',{exact:true})).toBeVisible();
});
test('a retired saved bucket selection keeps net open visible after a source schema change',async({page})=>{
 await setup(page);await page.goto(local+'?staleColumns=1');
 const comparison=page.getByRole('table',{name:'Current source aging comparison'});
 await expectMeasures(comparison,['net open']);
 await expect(comparison.locator('tbody[data-aging-group]').first().locator('td')).toHaveText(['150.00','280.00','430.00']);
 await page.locator('.aging-column-controls summary').click();await page.getByRole('button',{name:'All aging',exact:true}).click();
 await expectMeasures(comparison);
});
for(const width of [1440,1280,390])test(`current Aging ${width} shows every range without horizontal scrolling`,async({page})=>{
 const failures=await setup(page);await page.setViewportSize({width,height:width===1440?900:800});await page.goto(local+'?visual=1');
 const comparison=page.getByRole('table',{name:'Current source aging comparison'});
 await expect(comparison).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(await comparison.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.evaluate(()=>document.fonts.ready);
 if(process.env.AR_AGING_CAPTURE!=='0')await page.screenshot({path:`.superpowers/sdd/2026-09-12-aging-all-ranges/aging-regression-${width}.png`,fullPage:true,animations:'disabled'});
 if(width===390){
  await expect(comparison.getByRole('columnheader')).toHaveText(['Range · THB','TSK','KAT','Total']);
  const agent=comparison.locator('tbody[data-aging-group]').filter({has:page.getByRole('button',{name:'Open accounts in Agent',exact:true})});
  await expect(agent.locator('tr')).toHaveCount(8);
  await expect(agent.locator('tr>th[scope="row"]')).toHaveText(['Net open',...ranges]);
  for(const range of ranges)for(const hotel of ['TSK','KAT','Total'])await expect(agent.getByRole('button',{name:`Agent · ${hotel} · ${range}`,exact:true})).toBeVisible();
  const oldest=agent.getByRole('button',{name:'Agent · Total · 151+',exact:true});await oldest.scrollIntoViewIfNeeded();await expect(oldest).toBeInViewport();
 }else await expectMeasures(comparison);
 await page.locator('.aging-column-controls summary').click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(failures).toEqual([]);
});
