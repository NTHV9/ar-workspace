import {test,expect,type Page} from '@playwright/test';
import {setupRegional} from './fixtures/hotel-regions';
import {regionHotels,type RegionId} from '../../src/domain/hotels';
const today='2026-09-12',sourceAt='2026-09-12T02:59:00Z';
const apiRequests=new WeakMap<Page,URL[]>();
test.beforeEach(async({page})=>{const reads:URL[]=[];apiRequests.set(page,reads);page.on('request',request=>{const url=new URL(request.url());if(url.pathname.startsWith('/api/'))reads.push(url);});});
test.afterEach(async({page})=>{
 const reads=apiRequests.get(page)??[];
 expect(reads.filter(url=>url.pathname.startsWith('/api/financial/')||url.pathname.startsWith('/api/observations/')||['/api/reports/activity','/api/external-billing','/api/dashboard/invoice-entries','/api/dashboard/payment-invoices'].includes(url.pathname)).map(url=>url.pathname)).toEqual([]);
 for(const url of reads.filter(url=>url.pathname==='/api/dashboard/hotel-overview')){expect(url.searchParams.get('segment')).toBe('balances');expect(url.searchParams.get('from')).toBe(today);expect(url.searchParams.get('to')).toBe(today);}
});
function currentOverview(region:RegionId,delta=0){
 const hotels=regionHotels(region),amounts=region==='phuket'?[600,1200]:[1800,2400,3000,3600];
 const part=(indices:number[])=>{
  const count=indices.length*6,amount=indices.reduce((sum,index)=>sum+amounts[index]+(index===0?delta:0),0).toFixed(2);
  return {balances:{asOfDate:today,mode:'current',capturedAt:sourceAt,sourceAt,complete:true,missingHotels:[],metrics:['open','billed','unbilled','not_required','setup','past_due','over60','over60_unbilled'].map(key=>({key,count:key==='open'||key==='setup'?count:0,amount:key==='open'||key==='setup'?amount:'0.00'})),stages:[],rows:[],total:count,unverified:0},activity:null,external:null,entries:null,payments:null,paid:null};
 };
 return {region,from:today,to:today,total:part(hotels.map((_,index)=>index)),hotels:hotels.map((hotel,index)=>({hotel,...part([index])}))};
}
async function currentFixture(page:Page,region:RegionId){
 const fixture=await setupRegional(page,false,true);let delta=0;
 await page.route('**/api/dashboard/hotel-overview?*',route=>route.fulfill({json:currentOverview(region,delta)}));
 return {...fixture,lift:(amount:number)=>{delta=amount;}};
}
async function openCurrent(page:Page,region:RegionId){await page.goto('/?dashboard=1&region='+region+'&dashboardFrom=2020-01-01&dashboardTo=2020-01-31');}
const amountFor=(region:RegionId)=>region==='phuket'?'1,800.00':'10,800.00';
for(const region of ['phuket','khao-lak'] as const)test(`${region}: pending and failed balance reloads retain the last verified current totals`,async({page})=>{
 const fixture=await currentFixture(page,region);await openCurrent(page,region);
 await expect(page.getByTestId('dashboard-closing-count')).toHaveText(region==='phuket'?'12 invoices':'24 invoices');
 await expect(page.getByTestId('dashboard-closing-amount')).toContainText(amountFor(region));
 let release=()=>{};const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/dashboard/hotel-overview?*',async route=>{await gate;await route.fulfill({status:503,json:{error:'synthetic_balance_unavailable'}});});
 try{
  await page.getByRole('button',{name:'Reload dashboard',exact:true}).click();
  await expect(page.getByText('Updating dashboard. Showing the last loaded balances.',{exact:true})).toBeVisible();
  await expect(page.getByTestId('dashboard-closing-amount')).toContainText(amountFor(region));
  release();await expect(page.getByText('Reload failed. Showing the last loaded balances; try again.',{exact:true})).toBeVisible();
  await expect(page.getByTestId('dashboard-closing-count')).toHaveText(region==='phuket'?'12 invoices':'24 invoices');
  await expect(page.getByTestId('dashboard-closing-amount')).toContainText(amountFor(region));
  const matrix=page.getByRole('region',{name:'Current balances by hotel comparison',exact:true});await expect(matrix.locator('tbody tr[data-hotel]')).toHaveCount(region==='phuket'?2:4);
  expect(fixture.errors).toEqual([]);
 }finally{release();}
});
for(const region of ['phuket','khao-lak'] as const)test(`${region}: a remounted current reader waits for source verification and sign-out clears private previews`,async({page})=>{
 await currentFixture(page,region);await openCurrent(page,region);await expect(page.getByTestId('dashboard-closing-amount')).toContainText(amountFor(region));
 expect(await page.evaluate(()=>sessionStorage.getItem('ar-period-preview-v1'))).toBeNull();
 let release=()=>{};const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/dashboard/hotel-overview?*',async route=>{await gate;await route.fallback();});
 try{
  await page.getByRole('button',{name:'Aging',exact:true}).click();await expect(page.getByRole('heading',{name:'Aging',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Dashboard',exact:true}).click();
  await expect(page.getByTestId('dashboard-closing-amount')).toHaveText('—');await expect(page.getByText('Loading current balances…',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>sessionStorage.getItem('ar-period-preview-v1'))).toBeNull();
  release();await expect(page.getByTestId('dashboard-closing-amount')).toContainText(amountFor(region));
  await page.reload();await expect(page.getByTestId('dashboard-closing-amount')).toContainText(amountFor(region));
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('button',{name:'Sign in with Google',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>sessionStorage.getItem('ar-period-preview-v1'))).toBeNull();
 }finally{release();}
});
for(const region of ['phuket','khao-lak'] as const)test(`${region}: a linked invoice edit refreshes current balance and Aging readers`,async({page})=>{
 const fixture=await currentFixture(page,region);await openCurrent(page,region);await expect(page.getByTestId('dashboard-closing-amount')).toContainText(amountFor(region));
 const requests=apiRequests.get(page)!;const before=requests.length;fixture.lift(50);
 await page.evaluate(()=>window.dispatchEvent(new Event('ar-invoice-changed')));
 await expect.poll(()=>requests.slice(before).filter(url=>url.pathname==='/api/dashboard/hotel-overview').length).toBeGreaterThan(0);
 await expect(page.getByTestId('dashboard-closing-amount')).toContainText(region==='phuket'?'1,850.00':'10,850.00');
 await expect(page.getByTestId('dashboard-closing-count')).toHaveText(region==='phuket'?'12 invoices':'24 invoices');
 await page.getByRole('button',{name:'Aging',exact:true}).click();await expect.poll(()=>requests.filter(url=>url.pathname==='/api/dashboard/aging-invoices').length).toBeGreaterThan(0);
 const aging=requests.filter(url=>url.pathname==='/api/dashboard/aging-invoices').length;
 await page.evaluate(()=>window.dispatchEvent(new Event('ar-invoice-changed')));
 await expect.poll(()=>requests.filter(url=>url.pathname==='/api/dashboard/aging-invoices').length).toBeGreaterThan(aging);expect(fixture.errors).toEqual([]);
});
