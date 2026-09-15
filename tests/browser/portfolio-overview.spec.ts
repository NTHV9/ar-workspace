import {test,expect} from '@playwright/test';
import {setupRegional,regionalAccounts} from './fixtures/hotel-regions';
const regions={phuket:['KAT','TSK'],'khao-lak':['TLKL','WAKL','TLFO','TSAN']};

for(const [region,hotels] of Object.entries(regions)){
 for(const width of [1440,1280,390])test(`Portfolio overview ${region} fits ${width}`,async({page})=>{
  const c=await setupRegional(page);await page.setViewportSize({width,height:1000});await page.goto('/?region='+region);
  const overview=page.getByRole('region',{name:'Portfolio overview'}),table=page.getByRole('table',{name:'Portfolio aging by hotel'});
  await expect(overview).toBeVisible();await expect(overview.locator('.portfolio-hotel-card')).toHaveCount(hotels.length);
  await expect(table.locator('thead th')).toHaveCount(8);await expect(table.locator('tbody tr')).toHaveCount(hotels.length);
  await expect(overview).toContainText(region==='phuket'?'1.8K':'10.8K');
  if(width>=1280){expect(await table.evaluate(e=>e.scrollWidth<=e.parentElement!.clientWidth)).toBe(true);for(const card of await overview.locator('.portfolio-hotel-card').all())expect(await card.locator('.portfolio-hotel-value').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(c.regionalCalls.some(r=>r.path==='/api/dashboard/aging-invoices')).toBe(false);
  await page.screenshot({path:`.tmp/portfolio-${region}-${width}.png`,fullPage:true});expect(c.errors).toEqual([]);
 });
 test(`Portfolio overview ${region} selects hotels and opens protected invoice details`,async({page})=>{
  await page.clock.install({time:new Date('2026-09-12T03:00:00Z')});const c=await setupRegional(page);await page.goto('/?region='+region);
  const first=hotels[0];await page.getByRole('button',{name:`View ${first} portfolio`,exact:true}).click();
  await expect(page).toHaveURL(new RegExp('hotel='+first));await expect(page.getByRole('table',{name:'Portfolio aging by hotel'}).locator('tbody tr')).toHaveCount(1);
  // Other hotel contributions stay visible for regional comparison, rather than becoming zero.
  await expect(page.locator('.portfolio-hotel-card').filter({has:page.getByText(hotels[1],{exact:true})})).toContainText(region==='phuket'?'1.2K':'2.4K');
  await page.getByRole('button',{name:'Exact amounts',exact:true}).click();await expect(page.getByRole('table',{name:'Portfolio aging by hotel'})).toContainText(region==='phuket'?'100.00':'300.00');
  await page.getByRole('button',{name:`View ${first} invoices · 0–30`,exact:true}).click();await expect(page.getByRole('heading',{name:`${first} · Invoice details`,exact:true})).toBeVisible();
  const calls=c.regionalCalls.filter(r=>r.path==='/api/dashboard/aging-invoices');expect(calls.length).toBeGreaterThan(0);expect(calls.every(r=>r.query.get('hotel')===first&&(region==='phuket'||r.query.get('region')===region))).toBe(true);
  await page.getByRole('button',{name:`Open invoice SYN-${first}-0 · ${first}`,exact:true}).click();await expect(page).toHaveURL(new RegExp('property='+first));await expect(page).toHaveURL(/focusInvoice=invoice-0/);expect(c.errors).toEqual([]);
 });
}

test('Portfolio source range differences and missing buckets remain distinct',async({page})=>{
 const c=await setupRegional(page);const accounts=regionalAccounts.filter(a=>a.hotel==='KAT'||a.hotel==='TSK').map(a=>structuredClone(a));
 accounts[1].agingBuckets![0]={...accounts[1].agingBuckets![0],label:'0–15',end:15};
 await page.route('**/api/portfolio**',r=>r.fulfill({json:{accounts,status:'connected',refresh:{running:false,hotels:[]}}}));await page.goto('/');
 const table=page.getByRole('table',{name:'Portfolio aging by hotel'});await expect(table.locator('thead th')).toHaveCount(9);await expect(table).toContainText('0–15');await expect(table).toContainText('0–30');
 await expect(table).toContainText('Not in source');expect(c.errors).toEqual([]);
});

test('an invoice detail chunk failure leaves Portfolio usable and can be dismissed',async({page})=>{
 await setupRegional(page);
 await page.route(/\/(?:src\/dashboard\/AgingInvoiceBreakdown\.tsx|assets\/AgingInvoiceBreakdown-[^/]+\.js)(?:\?.*)?$/,route=>route.abort());
 await page.goto('/?region=phuket');const trigger=page.getByRole('button',{name:'View KAT invoices · 0–30',exact:true});await trigger.click();
 await expect(page.getByRole('alert')).toContainText('This page could not be loaded');await expect(page.getByRole('heading',{name:'Receivables portfolio'})).toBeVisible();
 await page.getByRole('button',{name:'Close invoice details',exact:true}).click();await expect(trigger).toBeFocused();await expect(page.getByRole('alert')).toHaveCount(0);
});

test('signed Portfolio amounts stay visible and only positive older buckets are highlighted',async({page})=>{
 await setupRegional(page);const accounts=regionalAccounts.filter(a=>a.hotel==='KAT'||a.hotel==='TSK').map(a=>({...a,open:a.hotel==='KAT'?-600:600,agingBuckets:a.agingBuckets!.map(b=>({...b,amount:a.hotel==='KAT'?-100:100,debit:a.hotel==='KAT'?0:100,credit:a.hotel==='KAT'?-100:0}))}));
 await page.route('**/api/portfolio**',r=>r.fulfill({json:{accounts,status:'connected',refresh:{running:false,hotels:[]}}}));await page.goto('/');
 const table=page.getByRole('table',{name:'Portfolio aging by hotel'});await expect(page.locator('.portfolio-total-amount>strong')).toHaveText('0');await expect(table.locator('tr[data-hotel=KAT]')).toContainText('-100');
  await expect(table.locator('tr[data-hotel=KAT] .portfolio-aged-amount')).toHaveCount(0);await expect(table.locator('tr[data-hotel=TSK] .portfolio-aged-amount')).toHaveCount(3);await expect(page.locator('.portfolio-hotel-share')).toHaveText(['—','—']);
 await page.getByRole('button',{name:'Show debit / credit',exact:true}).click();await expect(table.locator('tr[data-hotel=KAT]')).toContainText('Credit -100');
});
