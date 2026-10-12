import {test,expect} from '@playwright/test';
import type {Account} from '../../src/domain/portfolio';
import {setupRegional} from './fixtures/hotel-regions';
import {currentAgingAccounts} from './fixtures/current-aging';
import {agingFixtureStamp,agingFixtureInventory,agingFixtureRows,publishedAgingAccounts} from './fixtures/aging-published';

for(const width of [1440,390])test(`Khao Lak same-number identities drill to their own invoices at ${width}`,async({page})=>{
 const controls=await setupRegional(page,false,true);
 const make=(hotel:string,id:string,name:string,amount:number):Account=>({...currentAgingAccounts[0],hotel,id,name,account_no:'SYN-COLLISION',type:'Agent',open:amount,over90:amount,items:amount?1:0,agingBuckets:currentAgingAccounts[0].agingBuckets!.map(b=>({...b,amount:b.sequence===5?amount:0,debit:b.sequence===5?amount:0,credit:0}))});
 let accounts=[make('TLKL','north','Synthetic North Travel',151),make('TLFO','south','Synthetic South Travel',200),make('TSAN','south-zero','Synthetic South Travel',0)],stamp=agingFixtureStamp;
 const reads:string[]=[],queries:URLSearchParams[]=[],writes:string[]=[];
 const refresh=()=>({running:false,hotels:['TLKL','WAKL','TLFO','TSAN'].map(hotel=>({hotel,status:'succeeded',last_success_at:stamp}))});
 await page.route('**/api/refresh**',route=>route.fulfill({json:{...refresh(),jobs:[]}}));
 await page.route('**/api/portfolio**',route=>route.fulfill({json:{status:'connected',accounts:publishedAgingAccounts(accounts,stamp),refresh:refresh()}}));
 await page.route('**/api/invoice-exceptions/**',route=>route.fulfill({status:503,json:{error:'synthetic_exception_unavailable'}}));
 await page.route('**/api/accounts/**',route=>{
  const path=new URL(route.request().url()).pathname,parts=path.split('/'),a=accounts.find(a=>a.hotel===decodeURIComponent(parts[3])&&a.id===decodeURIComponent(parts[4]));reads.push(path);
  return a?route.fulfill({json:{synced_at:stamp,invoices:agingFixtureRows(a,stamp)}}):route.fulfill({status:404});
 });
 await page.route('**/api/dashboard/aging-invoices**',route=>{
  const q=new URL(route.request().url()).searchParams;queries.push(q);
  const members=q.has('accounts')?JSON.parse(q.get('accounts')!) as [string,string][]:null;
  const selected=accounts.filter(a=>(!q.get('hotel')||q.get('hotel')===a.hotel)&&(!members||members.some(([h,id])=>h===a.hotel&&id===a.id)));
  const inventory=agingFixtureInventory(selected,stamp);
  const rows=selected.flatMap(a=>agingFixtureRows(a,stamp).map(r=>({hotel:a.hotel,accountId:a.id,accountName:a.name,accountType:a.type,invoiceId:r.id,invoiceNo:r.invoice_no,folioNo:r.folio_no,guest:r.guest,open:r.open.toFixed(2),age:r.age,bucketKey:JSON.stringify(['151+',151,null,5]),billingStatus:'unbilled',latestStage:'none',latestStageLabel:'No Follow-Up sent',dueStatus:'awaiting_billing',dueDate:null,held:false,needsReview:false})));
  return route.fulfill({json:{...inventory,publications:refresh().hotels.map(h=>({hotel:h.hotel,sourceAt:stamp})),summary:{...inventory.summary,billing:[{key:'unbilled',label:'Not billed',count:rows.length,amount:inventory.summary.amount}]},rows:q.get('details')==='1'?rows:[],total:rows.length}});
 });
 await page.route('**/api/**',route=>{
  if(route.request().method()!=='GET'&&new URL(route.request().url()).pathname!=='/api/refresh'){
   writes.push(new URL(route.request().url()).pathname);return route.fulfill({status:405});
  }
  return route.fallback();
 });
 await page.setViewportSize({width,height:900});await page.goto('/?dashboard=1&dashboardView=aging&region=khao-lak');
 const table=page.getByRole('table',{name:'Current source aging comparison'});
 await page.getByLabel('Aging view',{exact:true}).selectOption('accounts');
 await expect(table.locator('tbody[data-aging-group]')).toHaveCount(2);
 await expect(table).toContainText('Synthetic North Travel');await expect(table).toContainText('Synthetic South Travel');
 const count=table.getByRole('button',{name:'View invoice statuses for Synthetic North Travel · TLKL · 151+',exact:true});
 await expect(count).toHaveText('1 invoice');await count.click();
 const panel=page.locator('.aging-invoice-breakdown');
 await expect(panel.getByRole('button',{name:'Open invoice SYN-TLKL-5 · TLKL',exact:true})).toBeVisible();
 await panel.screenshot({path:`.tmp/aging-identity/status-${width}.png`,animations:'disabled'});
 expect(queries.some(q=>q.get('accounts')===JSON.stringify([['TLKL','north']])&&q.get('hotel')==='TLKL')).toBe(true);
 await panel.getByRole('button',{name:'Open invoice SYN-TLKL-5 · TLKL',exact:true}).click();
 await expect(page).toHaveURL(/property=TLKL/);await expect(page).toHaveURL(/account=north/);
 await expect(page).toHaveURL(/focusInvoice=north-5/);await expect(page.getByLabel('Invoice ledger',{exact:true})).toContainText('SYN-TLKL-5');
 await page.locator('main').screenshot({path:`.tmp/aging-identity/invoice-${width}.png`,animations:'disabled'});
 expect(reads.every(path=>path==='/api/accounts/TLKL/north')).toBe(true);
 await page.goBack();await expect(table).toBeVisible();
 await expect(panel).toBeVisible();
 await panel.getByRole('button',{name:'Close invoice details'}).click();
 await table.getByRole('button',{name:'View invoice statuses for Synthetic South Travel · TLFO · 151+',exact:true}).click();
 await expect(panel).toContainText('SYN-TLFO-5');await expect(panel).not.toContainText('SYN-TLKL-5');
 await panel.getByRole('button',{name:'Open invoice SYN-TLFO-5 · TLFO',exact:true}).click();
 await expect(page).toHaveURL(/property=TLFO/);await expect(page).toHaveURL(/account=south/);await expect(page).toHaveURL(/focusInvoice=south-5/);
 await expect(page.getByLabel('Invoice ledger',{exact:true})).toContainText('SYN-TLFO-5');
 expect([...new Set(reads)]).toEqual(['/api/accounts/TLKL/north','/api/accounts/TLFO/south']);
 await page.goBack();await expect(panel).toContainText('SYN-TLFO-5');
 await page.locator('.aging-comparison-frame').screenshot({path:`.tmp/aging-identity/identity-${width}.png`,animations:'disabled'});
 // A new publication changes the selected reporting identity. The previous status target must disappear.
 accounts=accounts.map(a=>a.name==='Synthetic South Travel'?{...a,name:'Synthetic Revised Travel'}:a);stamp='2026-09-12T03:00:00Z';
 await page.getByRole('button',{name:'OPERA data status',exact:true}).click();await page.getByRole('button',{name:'Refresh OPERA',exact:true}).click();
 await expect(table).toContainText('Synthetic Revised Travel');await expect(panel).toHaveCount(0);
 expect(writes).toEqual([]);expect(controls.errors).toEqual([]);expect(controls.unexpected).toEqual([]);
});




