import {test,expect} from '@playwright/test';
import type {Account} from '../../src/domain/portfolio';
import {setupRegional} from './fixtures/hotel-regions';
import {currentAgingAccounts} from './fixtures/current-aging';
import {agingFixtureStamp,agingFixtureInventory,agingFixtureRows,publishedAgingAccounts} from './fixtures/aging-published';

for(const width of [1440,390])test(`Khao Lak exact name/type groups preserve every invoice identity at ${width}`,async({page})=>{
 const controls=await setupRegional(page,false,true);
 const make=(hotel:string,id:string,name:string,amount:number):Account=>({...currentAgingAccounts[0],hotel,id,name,account_no:'SYN-COLLISION',type:'Agent',open:amount,over90:amount,items:amount?1:0,agingBuckets:currentAgingAccounts[0].agingBuckets!.map(b=>({...b,amount:b.sequence===5?amount:0,debit:b.sequence===5?amount:0,credit:0}))});
 let accounts=[make('TLKL','north','Synthetic North Travel',151),make('TLFO','south','Synthetic South Travel',200),{...make('TLFO','south-second','Synthetic South Travel',50),account_no:'SYN-OTHER'}, {...make('TSAN','south-cross','Synthetic South Travel',75),account_no:'OTHER-NO'},{...make('TLFO','south-zero','Synthetic South Travel',0),account_no:' syn-collision '}],stamp=agingFixtureStamp;
 const invoices=(a:Account)=>agingFixtureRows(a,stamp).map(r=>({...r,invoice_no:r.invoice_no+'-'+a.id}));
 const reads:string[]=[],queries:URLSearchParams[]=[],writes:string[]=[];
 const refresh=()=>({running:false,hotels:['TLKL','WAKL','TLFO','TSAN'].map(hotel=>({hotel,status:'succeeded',last_success_at:stamp}))});
 await page.route('**/api/refresh**',route=>route.fulfill({json:{...refresh(),jobs:[]}}));
 await page.route('**/api/portfolio**',route=>route.fulfill({json:{status:'connected',accounts:publishedAgingAccounts(accounts,stamp),refresh:refresh()}}));
 await page.route('**/api/invoice-exceptions/**',route=>route.fulfill({status:503,json:{error:'synthetic_exception_unavailable'}}));
 await page.route('**/api/accounts/**',route=>{
  const path=new URL(route.request().url()).pathname,parts=path.split('/'),a=accounts.find(a=>a.hotel===decodeURIComponent(parts[3])&&a.id===decodeURIComponent(parts[4]));reads.push(path);
  return a?route.fulfill({json:{synced_at:stamp,invoices:invoices(a)}}):route.fulfill({status:404});
 });
 await page.route('**/api/dashboard/aging-invoices**',route=>{
  const q=new URL(route.request().url()).searchParams;queries.push(q);
  const members=q.has('accounts')?JSON.parse(q.get('accounts')!) as [string,string][]:null;
  const selected=accounts.filter(a=>(!q.get('hotel')||q.get('hotel')===a.hotel)&&(!members||members.some(([h,id])=>h===a.hotel&&id===a.id)));
  const inventory=agingFixtureInventory(selected,stamp);
  const rows=selected.flatMap(a=>invoices(a).map(r=>({hotel:a.hotel,accountId:a.id,accountName:a.name,accountType:a.type,invoiceId:r.id,invoiceNo:r.invoice_no,folioNo:r.folio_no,guest:r.guest,open:r.open.toFixed(2),age:r.age,bucketKey:JSON.stringify(['151+',151,null,5]),billingStatus:'unbilled',latestStage:'none',latestStageLabel:'No Follow-Up sent',dueStatus:'awaiting_billing',dueDate:null,held:false,needsReview:false})));
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
 await expect(panel.getByRole('button',{name:'Open invoice SYN-TLKL-5-north · TLKL',exact:true})).toBeVisible();
 await panel.screenshot({path:`.tmp/aging-identity/status-${width}.png`,animations:'disabled'});
 expect(queries.some(q=>q.get('accounts')===JSON.stringify([['TLKL','north']])&&q.get('hotel')==='TLKL')).toBe(true);
 await panel.getByRole('button',{name:'Open invoice SYN-TLKL-5-north · TLKL',exact:true}).click();
 await expect(page).toHaveURL(/property=TLKL/);await expect(page).toHaveURL(/account=north/);
 await expect(page).toHaveURL(/focusInvoice=north-5/);await expect(page.getByLabel('Invoice ledger',{exact:true})).toContainText('SYN-TLKL-5-north');
 await page.locator('main').screenshot({path:`.tmp/aging-identity/invoice-${width}.png`,animations:'disabled'});
 expect(reads.every(path=>path==='/api/accounts/TLKL/north')).toBe(true);
 await page.goBack();await expect(table).toBeVisible();
 await expect(panel).toBeVisible();
 await panel.getByRole('button',{name:'Close invoice details'}).click();
 const pickerTrigger=table.getByRole('button',{name:'Choose TLFO account for Synthetic South Travel',exact:true});
 await pickerTrigger.click();
 const picker=page.getByRole('dialog',{name:'Choose account',exact:true});
 await expect(picker.locator('.hotel-choice')).toHaveCount(3);
 await expect(picker).toContainText('south');await expect(picker).toContainText('south-zero');
 await picker.getByRole('button',{name:'Cancel',exact:true}).click();await expect(pickerTrigger).toBeFocused();
 await pickerTrigger.click();await page.keyboard.press('Escape');await expect(pickerTrigger).toBeFocused();
 await pickerTrigger.click();await picker.locator('.hotel-choice').filter({hasText:'south-zero'}).click();
 await expect(page).toHaveURL(/account=south-zero(&|$)/);await expect(page).toHaveURL(/property=TLFO/);
 await page.goBack();await expect(table).toBeVisible();
 await table.getByRole('button',{name:'Open invoices for Synthetic South Travel',exact:true}).click();
 const allInvoices=page.getByRole('table',{name:'Current aging invoices'});
 await expect(allInvoices.locator('tbody tr')).toHaveCount(3);
 for(const invoice of ['SYN-TLFO-5-south','SYN-TLFO-5-south-second','SYN-TSAN-5-south-cross'])await expect(allInvoices).toContainText(invoice);
 await table.getByRole('button',{name:'View invoice statuses for Synthetic South Travel · Total · All ages',exact:true}).click();
 await expect(panel.locator('.aging-breakdown-total')).toContainText('3 open invoices');
 await expect(panel.locator('.aging-breakdown-total')).toContainText('325.00');
 await expect(panel).not.toContainText('SYN-TLKL-5-north');
 const expectedMembers=[['TLFO','south'],['TLFO','south-second'],['TSAN','south-cross'],['TLFO','south-zero']];
 expect(queries.some(q=>q.get('accounts')===JSON.stringify(expectedMembers)&&!q.get('hotel'))).toBe(true);
 for(const [hotel,id] of expectedMembers.slice(0,3)){
  const invoice=`SYN-${hotel}-5-${id}`;
  await panel.getByRole('button',{name:`Open invoice ${invoice} · ${hotel}`,exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`property=${hotel}`));await expect(page).toHaveURL(new RegExp(`account=${id}(&|$)`));await expect(page).toHaveURL(new RegExp(`focusInvoice=${id}-5(&|$)`));
  await expect(page.getByLabel('Invoice ledger',{exact:true})).toContainText(invoice);
  await page.goBack();await expect(panel).toContainText(invoice);
 }
 expect(new Set(reads)).toEqual(new Set(['/api/accounts/TLKL/north',...expectedMembers.map(([h,id])=>`/api/accounts/${h}/${id}`)]));
 await page.locator('.aging-comparison-frame').screenshot({path:`.tmp/aging-identity/name-group-${width}.png`,animations:'disabled'});
 // A new publication changes the selected reporting identity. The previous status target must disappear.
 accounts=accounts.map(a=>a.name==='Synthetic South Travel'?{...a,name:'Synthetic Revised Travel'}:a);stamp='2026-09-12T03:00:00Z';
 await page.getByRole('button',{name:'OPERA data status',exact:true}).click();await page.getByRole('button',{name:'Refresh OPERA',exact:true}).click();
 await expect(table).toContainText('Synthetic Revised Travel');await expect(panel).toHaveCount(0);
 await table.getByRole('button',{name:'Choose TLFO account for Synthetic Revised Travel',exact:true}).click();
 await expect(picker.locator('.hotel-choice')).toHaveCount(3);
 await picker.screenshot({path:`.tmp/aging-identity/picker-${width}.png`,animations:'disabled'});
 accounts=accounts.filter(a=>!['south-second','south-zero'].includes(a.id));stamp='2026-09-12T03:01:00Z';
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(picker).toHaveCount(0);
 await expect(table.getByRole('button',{name:'Open TLFO account Synthetic Revised Travel',exact:true})).toBeVisible();
 expect(writes).toEqual([]);expect(controls.errors).toEqual([]);expect(controls.unexpected).toEqual([]);
});
