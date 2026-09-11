import {test,expect,type Page} from '@playwright/test';
import {currentAgingInvoices} from './fixtures/current-aging';
const local='http://127.0.0.1:5191/tests/browser/current-aging-harness.html';
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
 await expect(comparison.locator('tbody tr')).toHaveCount(2);
 await comparison.getByRole('button',{name:'Open accounts in Agent',exact:true}).click();
 await page.getByLabel('Search current aging').fill('Azure TSK');await expect(comparison.locator('tbody tr')).toHaveCount(1);
 await comparison.getByRole('button',{name:'Azure Travel · Synthetic · KAT · 0–30',exact:true}).click();
 const invoices=page.getByRole('table',{name:'Current aging invoices'});
 await expect(invoices).toContainText('INV-kat-parent');await expect(invoices).not.toContainText('INV-kat-child');
 await expect(page.getByText('1 child row excluded')).toBeVisible();
 await invoices.getByRole('button',{name:'Open invoice INV-kat-parent'}).click();await expect(page.getByLabel('Opened invoice')).toHaveText('["KAT","kat-azure","kat-parent"]');
 await page.getByRole('button',{name:'Return from Account Detail'}).click();await expect(invoices).toContainText('INV-kat-parent');await expect(page.getByLabel('Invoice hotel')).toHaveValue('KAT');
 await page.getByLabel('Invoice aging bucket').selectOption({label:'31–60'});await expect(invoices).toContainText('INV-kat-credit');await expect(invoices).toContainText('-20.00');
 await page.getByLabel('Invoice aging bucket').selectOption({label:'151+'});await expect(invoices).toContainText('INV-kat-old');await expect(page.getByText('Difference · THB 20.00',{exact:true})).toBeVisible();
 await page.getByLabel('Invoice evidence view').selectOption('unassigned');await expect(invoices).toContainText('INV-kat-unknown');
 await page.getByRole('button',{name:'Back to Agent accounts',exact:true}).click();await expect(page.getByLabel('Search current aging')).toHaveValue('Azure TSK');await expect(comparison.locator('tbody tr')).toHaveCount(1);
 await page.getByRole('button',{name:'All account types',exact:true}).click();await expect(comparison.locator('tbody tr')).toHaveCount(2);
 await page.getByLabel('Global hotel').selectOption('TSK');await expect(comparison.locator('tbody tr')).toHaveCount(1);await expect(comparison.getByText('Outside scope').first()).toBeVisible();
 expect(failures).toEqual([]);
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
 const comparison=page.getByRole('table',{name:'Current source aging comparison'}),rows=comparison.locator('tbody tr');
 await expect(rows).toHaveCount(25);await expect(rows.first()).toContainText('Extra 63');
 await comparison.getByRole('button',{name:'Sort net open Total',exact:true}).click();await expect(rows.first()).toContainText('Birch');
 await page.getByRole('button',{name:'Next',exact:true}).click();await expect(rows).toHaveCount(25);await page.getByRole('button',{name:'Next',exact:true}).click();await expect(rows).toHaveCount(15);await expect(rows.last()).toContainText('Extra 63');
 await page.getByLabel('Search current aging').fill('Extra 63');await expect(rows).toHaveCount(1);await expect(rows).toContainText('Extra 63');await expect(page.getByText('1 matched accounts · page 1 of 1',{exact:true})).toBeVisible();
});
for(const width of [1440,1280,390])test(`current Aging ${width} stays within the viewport with scrollable comparison`,async({page})=>{
 const failures=await setup(page);await page.setViewportSize({width,height:width===1440?900:800});await page.goto(local);
 await expect(page.getByRole('table',{name:'Current source aging comparison'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`.superpowers/sdd/2026-09-12-dashboard-period-analysis/aging-${width}.png`,fullPage:false,animations:'disabled'});
 expect(failures).toEqual([]);
});
