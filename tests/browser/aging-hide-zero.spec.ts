import {test,expect,type Page} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {setupRegional,regionalAccounts} from './fixtures/hotel-regions';
import {regionHotels,resolveRegion,hotelInRegion,type RegionId} from '../../src/domain/hotels';
import type {Account} from '../../src/domain/portfolio';

async function setup(page:Page,region:RegionId,{extra=0,unavailable=false,delayed=false}={}){
 const base=await setupRegional(page),hotels=regionHotels(region),at='2026-09-12T02:59:00Z';
 const make=(hotel:string,key:string,name:string,open:number,items:number):Account=>{const a=regionalAccounts.find(a=>a.hotel===hotel)!;return {...a,id:key+'-'+hotel,account_no:key,name,type:'Agent',open,items,over90:0,agingBuckets:a.agingBuckets!.map((b,i)=>({...b,amount:i===0?open:0,debit:i===0?Math.max(0,open):0,credit:i===0?Math.max(0,-open):0}))};};
 const accounts=[make(hotels[0],'empty','Empty synthetic',0,0),make(hotels[0],'active','Active synthetic',100,1),make(hotels[1],'credit','Credit synthetic',-50,1),make(hotels[0],'offset','Offset invoices synthetic',0,2),make(hotels[0],'unknown','Unknown counts synthetic',0,0),make(hotels[0],'mixed','Mixed hotels synthetic',0,0),make(hotels[1],'mixed','Mixed hotels synthetic',200,1),make(hotels[0],'cross','Cross-hotel offset synthetic',100,0),make(hotels[1],'cross','Cross-hotel offset synthetic',-100,0),...hotels.map(h=>make(h,'shared-empty','Shared empty synthetic',0,0)),...Array.from({length:extra},(_,i)=>make(hotels[0],'empty-'+i,'Extra empty '+i,0,0))];
 await page.route('**/api/portfolio*',r=>r.fulfill({json:{accounts,status:'connected',refresh:{running:false,hotels:hotels.map(hotel=>({hotel,status:'succeeded',last_success_at:at}))}}}));
 let reads=0,release:()=>void=()=>{};const gate=delayed?new Promise<void>(resolve=>{release=resolve;}):Promise.resolve();
 await page.route('**/api/dashboard/aging-invoices*',async r=>{reads++;await gate;if(unavailable)return r.fulfill({status:503,json:{error:'unavailable'}});
  const q=new URL(r.request().url()).searchParams,scoped=accounts.filter(a=>hotelInRegion(a.hotel,resolveRegion(q))&&(!q.get('hotel')||q.get('hotel')===a.hotel));
  return r.fulfill({json:{asOfDate:'2026-09-12',publications:hotels.map(hotel=>({hotel,sourceAt:at})),complete:false,accounts:scoped.map(a=>({hotel:a.hotel,accountId:a.id,accountType:a.type,syncedAt:at,complete:a.account_no!=='unknown',unverified:a.account_no==='unknown'?1:0,buckets:[null,...a.agingBuckets!.map(b=>JSON.stringify([b.label,b.start,b.end,b.sequence]))].map(key=>({key,count:a.account_no==='unknown'?null:a.items,amount:a.open.toFixed(2),creditAmount:Math.max(0,-a.open).toFixed(2),complete:a.account_no!=='unknown'}))})),summary:{complete:false,count:null,amount:null,creditAmount:null,billing:[],followup:[],due:[],flags:[]},rows:[],total:scoped.reduce((n,a)=>n+a.items,0)}});
 });
 return {...base,reads:()=>reads,release};
}
for(const region of ['phuket','khao-lak'] as const)for(const width of [1440,1280,390])test(`hide zero accounts is reversible and scoped in ${region} at ${width}`,async({page})=>{
 const c=await setup(page,region);await page.setViewportSize({width,height:900});await page.goto(`/?region=${region}&dashboard=1&dashboardView=aging`);
 await page.getByLabel('Current Account Type',{exact:true}).selectOption('Agent');const table=page.getByRole('table',{name:'Current source aging comparison'}),toggle=page.getByRole('checkbox',{name:'Hide ยอด 0',exact:true});
 await expect(table.getByRole('button',{name:`View invoice statuses for Empty synthetic · ${regionHotels(region)[0]} · All ages`,exact:true})).toHaveText('0 invoices');await expect(toggle).not.toBeChecked();await expect(table.locator('tbody[data-aging-group]')).toHaveCount(8);
 const before=await page.getByRole('region',{name:'Current aging overview',exact:true}).innerText(),reads=c.reads();
 await toggle.check();await expect(table.locator('tbody[data-aging-group]')).toHaveCount(6);await expect(table.getByRole('button',{name:'Open invoices for Empty synthetic',exact:true})).toHaveCount(0);await expect(table.getByRole('button',{name:'Open invoices for Shared empty synthetic',exact:true})).toHaveCount(0);
 for(const name of ['Active synthetic','Credit synthetic','Offset invoices synthetic','Unknown counts synthetic','Mixed hotels synthetic','Cross-hotel offset synthetic'])await expect(table.getByRole('button',{name:'Open invoices for '+name,exact:true})).toBeVisible();
 expect(await page.getByRole('region',{name:'Current aging overview',exact:true}).innerText()).toBe(before);expect(c.reads()).toBe(reads);expect(await table.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 mkdirSync('.tmp/aging-hide-zero',{recursive:true});await page.screenshot({path:`.tmp/aging-hide-zero/${region}-${width}.png`});
 await toggle.uncheck();await expect(table.locator('tbody[data-aging-group]')).toHaveCount(8);expect(c.reads()).toBe(reads);expect(c.errors).toEqual([]);
});
test('keeps unknown rows while counts load and hides only after proof arrives',async({page})=>{
 const c=await setup(page,'phuket',{delayed:true});await page.goto('/?dashboard=1&dashboardView=aging');await page.getByLabel('Current Account Type',{exact:true}).selectOption('Agent');const table=page.getByRole('table',{name:'Current source aging comparison'});await page.getByRole('checkbox',{name:'Hide ยอด 0',exact:true}).check();await expect(table.locator('tbody[data-aging-group]')).toHaveCount(8);c.release();await expect(table.locator('tbody[data-aging-group]')).toHaveCount(6);
});
test('keeps all rows when invoice verification cannot be loaded',async({page})=>{
 await setup(page,'khao-lak',{unavailable:true});await page.goto('/?region=khao-lak&dashboard=1&dashboardView=aging');await page.getByLabel('Current Account Type',{exact:true}).selectOption('Agent');await expect(page.getByRole('button',{name:'Retry invoice counts',exact:true})).toBeVisible();await page.getByRole('checkbox',{name:'Hide ยอด 0',exact:true}).check();await expect(page.getByRole('table',{name:'Current source aging comparison'}).locator('tbody[data-aging-group]')).toHaveCount(8);
});
test('resets pagination and retains the preference when returning from Period analysis',async({page})=>{
 await setup(page,'khao-lak',{extra:27});await page.goto('/?region=khao-lak&dashboard=1&dashboardView=aging');await page.getByLabel('Current Account Type',{exact:true}).selectOption('Agent');await expect(page.getByRole('table',{name:'Current source aging comparison'}).getByRole('button',{name:'View invoice statuses for Active synthetic · TLKL · All ages',exact:true})).toHaveText('1 invoice');
 await page.locator('.aging-pagination').getByRole('button',{name:'Next',exact:true}).click();await expect(page.locator('.aging-pagination')).toContainText('page 2 of 2');await page.getByRole('checkbox',{name:'Hide ยอด 0',exact:true}).check();await expect(page.locator('.aging-pagination')).toContainText('page 1 of 1');
 await page.getByRole('button',{name:'Period analysis',exact:true}).click();await page.getByRole('button',{name:'Current Aging · Khao Lak',exact:true}).click();await expect(page.getByRole('checkbox',{name:'Hide ยอด 0',exact:true})).toBeChecked();await expect(page.locator('.aging-pagination')).toContainText('6 matched accounts');
});
