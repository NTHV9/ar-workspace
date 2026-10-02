import {test,expect,type Page} from '@playwright/test';
import {setupRegional} from './fixtures/hotel-regions';
import {openDashboard} from './fixtures/dashboard-period';
import {syntheticManagement} from '../fixtures/management-dashboard';
import {resolveRegion} from '../../src/domain/hotels';
async function managementFixture(page:Page){
 const fixture=await setupRegional(page),queries:URLSearchParams[]=[];
 await page.route('**/api/dashboard/management?*',async route=>{
  const q=new URL(route.request().url()).searchParams;queries.push(q);
  const data=syntheticManagement(resolveRegion(q),q.get('from')!,q.get('to')!);
  if(q.get('type')){data.types.forEach(t=>t.type=q.get('type')!);data.accountsOver60!.forEach(a=>a.accountType=q.get('type')!);}
  await route.fulfill({json:data});
 });
 await page.route('**/api/dashboard/balances?*',async route=>{
  const q=new URL(route.request().url()).searchParams,hotel=q.get('hotel')??'KAT',accountId=q.get('account')??'tour';
  await route.fulfill({json:{asOfDate:q.get('asOf'),mode:'snapshot',capturedAt:'2026-09-12T12:00:00Z',sourceAt:'2026-09-12T12:00:00Z',complete:true,missingHotels:[],unverified:0,total:1,metrics:[],stages:[],rows:[{hotel,accountId,accountName:'Synthetic Tour Company',accountType:'OTA',invoiceId:'invoice-61',invoiceNo:'SYN-61',folioNo:'SYN-F61',guest:'Synthetic Guest',transactionDate:'2026-07-13',open:'200.00',original:'250.00',age:61,billingRequired:true,firstBillingDate:null,dueDate:null,latestStage:null,latestSentAt:null,verified:true}]}});
 });return {fixture,queries};
}
for(const region of ['phuket','khao-lak'] as const)for(const width of [1440,1280,390])test(`CFO report ${region} at ${width}: signed totals, period billing and continuous aged accounts`,async({page})=>{
 await page.setViewportSize({width,height:900});const {fixture}=await managementFixture(page);
 await openDashboard(page,'/?dashboard=1&region='+region+'&dashboardFrom=2026-09-01&dashboardTo=2026-09-12&dashboardDateMode=range');
 const report=page.getByRole('region',{name:'Management summary',exact:true});await expect(report.getByRole('button',{name:'View outstanding',exact:true})).toContainText(region==='phuket'?'2,000.00':'4,000.00');
 await page.locator('.management-exact-figures>summary').click();
 const aging=page.getByRole('region',{name:'Hotel aging summary',exact:true});await expect(aging).toContainText('180.00');await expect(aging).toContainText('61–90 not billed');
 const cohort=page.getByRole('region',{name:'Period invoice billing summary',exact:true});await expect(cohort).toContainText(region==='phuket'?'2,400.00':'4,800.00');await expect(cohort).toContainText('Billing not required');
 await page.locator('.management-exact-figures>summary').click();
 await expect(page.getByRole('region',{name:'Accounts over 60 days',exact:true}).locator('tbody tr')).toHaveCount(region==='phuket'?4:8);
 await expect(page.locator('.management-more')).not.toHaveAttribute('open','');
 if(width===390)for(const label of ['View billed · still open','View not yet billed','View invoice age over 60 days'])await expect(page.getByRole('button',{name:label,exact:true}).locator('small').last()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(fixture.errors).toEqual([]);
 if(width===390){expect(await page.locator('.management-period-glance dd').evaluateAll(cells=>cells.every(cell=>getComputedStyle(cell).whiteSpace==='nowrap'))).toBe(true);}
 if(width===1440){const glance=page.getByRole('region',{name:'Period billing at a glance',exact:true});await expect(glance).toContainText(region==='phuket'?'1,600.00':'3,200.00');const bounds=await glance.boundingBox();expect(bounds!.y+bounds!.height).toBeLessThan(900);}
 await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,0);});await page.screenshot({path:`.impeccable/review/flow-dashboard-${region}-${width}.png`,animations:'disabled'});
 if(width===1440)await page.screenshot({path:`.impeccable/review/flow-dashboard-${region}-full-1440.png`,fullPage:true,animations:'disabled'});
});
test('CFO Account search/sort and scoped invoice drill preserve report selection',async({page})=>{
 const {queries}=await managementFixture(page);await openDashboard(page,'/?dashboard=1&dashboardFrom=2026-09-01&dashboardTo=2026-09-12');
 const list=page.getByRole('region',{name:'Accounts over 60 days',exact:true});await expect(list.locator('tbody tr')).toHaveCount(4);
 await list.getByRole('button',{name:'Sort by Oldest · days',exact:true}).click();await expect(list.locator('tbody tr').first()).toContainText('Synthetic Lake Travel');
 const search=page.getByRole('searchbox',{name:'Search accounts over 60 days',exact:true});await search.fill('KAT tour');await expect(list.locator('tbody tr')).toHaveCount(1);
 await list.getByRole('button',{name:'Synthetic Tour Company',exact:true}).click();const details=page.getByRole('region',{name:'Dashboard invoice details',exact:true});await expect(details).toContainText('SYN-61');
 expect(new URL(page.url()).searchParams.get('dashboardDetailAccount')).toBe('tour');expect(new URL(page.url()).searchParams.get('dashboardDetailHotel')).toBe('KAT');
 await details.getByRole('button',{name:'Close details',exact:true}).click();await expect(search).toHaveValue('KAT tour');await expect(list.locator('tbody tr')).toHaveCount(1);expect(queries).toHaveLength(1);
});
test('unknown aged coverage is visible and never becomes an empty verified list',async({page})=>{
 await managementFixture(page);await page.route('**/api/dashboard/management?*',async route=>{const q=new URL(route.request().url()).searchParams,data=syntheticManagement('phuket',q.get('from')!,q.get('to')!);data.agesComplete=false;data.accountsOver60=null;data.hotels.forEach(h=>{h.over60=null;h.over90=null;h.unbilled61=null;h.bands.forEach(b=>{b.amount=null;b.count=null;});});await route.fulfill({json:data});});
 await openDashboard(page,'/?dashboard=1');await expect(page.getByText('The full aged Account list could not be verified.',{exact:false})).toBeVisible();await expect(page.getByText('No open invoices are over 60 days old.',{exact:true})).toHaveCount(0);
});

test('closed mobile report filters expose active type and its count',async({page})=>{
 await page.setViewportSize({width:390,height:900});await managementFixture(page);await openDashboard(page,'/?dashboard=1');
 const disclosure=page.getByRole('button',{name:/^Report filters/});await expect(disclosure).toBeVisible();await disclosure.click();
 await page.getByRole('combobox',{name:'Period account type',exact:true}).selectOption('Agent');await expect(disclosure).toContainText('Agent');await disclosure.click();
 await expect(disclosure).toContainText('Report filters · 1');await expect(disclosure).toContainText('Agent · All accounts');await expect(page.getByRole('combobox',{name:'Period account type',exact:true})).not.toBeVisible();
});


test('visual Dashboard exposes exact billing progress and priority-account drill',async({page})=>{
 await managementFixture(page);await openDashboard(page,'/?dashboard=1');
 await expect(page.getByRole('img',{name:'80.0% of billing-required invoice value billed',exact:true})).toBeVisible();
 const attention=page.getByRole('region',{name:'Priority accounts',exact:true});await expect(attention.locator('li')).toHaveCount(3);
 await attention.getByRole('button',{name:/Synthetic Tour Company/}).first().click();
 await expect(page.getByRole('region',{name:'Dashboard invoice details',exact:true})).toContainText('SYN-61');expect(new URL(page.url()).searchParams.get('dashboardDetailAccount')).toBe('tour');
});
test('hotel chart keyboard selection shows exact source figures and opens the selected hotel',async({page})=>{
 await managementFixture(page);await openDashboard(page,'/?dashboard=1');
 const chart=page.getByRole('region',{name:'Hotel aging chart',exact:true});const range=chart.getByRole('button',{name:/TSK · 61–90 days/});await range.focus();await range.press('Enter');
 await expect(chart.locator('footer')).toContainText('TSK · 61–90 days');await expect(chart.locator('footer')).toContainText('180.00');
 await chart.getByRole('button',{name:'View hotel invoices',exact:true}).click();expect(new URL(page.url()).searchParams.get('dashboardDetailHotel')).toBe('TSK');
});


for(const width of [1440,1280,390])test(`million-scale Dashboard has visible exact totals and usable priority rows at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await managementFixture(page);
 await page.route('**/api/dashboard/management?*',async route=>{const q=new URL(route.request().url()).searchParams,data=syntheticManagement('phuket',q.get('from')!,q.get('to')!);const scale=(v:any)=>{if(v&&typeof v==='object')for(const k of Object.keys(v)){if(['amount','creditAmount','unbilledAmount'].includes(k)&&typeof v[k]==='string')v[k]=(Number(v[k])*100000).toFixed(2);else scale(v[k]);}};scale(data);data.accountsOver60!.forEach(a=>a.accountName='Synthetic International Travel and Hospitality Reservation Services '+a.hotel);await route.fulfill({json:data});});
 await openDashboard(page,'/?dashboard=1');await page.evaluate(()=>document.fonts.ready);
 await expect(page.getByRole('button',{name:'View outstanding',exact:true})).toContainText('200,000,000.00 THB');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 if(width>600){const last=page.getByRole('region',{name:'Priority accounts',exact:true}).locator('li').nth(2);const box=await last.boundingBox();expect(box!.y+box!.height).toBeLessThan(900);}
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`.impeccable/review/flow-dashboard-millions-${width}.png`,animations:'disabled'});
});


test('billing legend responds to keyboard and touch selection without changing financial scope',async({page})=>{
 const {queries}=await managementFixture(page);await openDashboard(page,'/?dashboard=1');
 const notBilled=page.getByRole('button',{name:'Show not billed share',exact:true});await notBilled.focus();await notBilled.press('Enter');await expect(notBilled).toHaveAttribute('aria-pressed','true');await expect(page.locator('.billing-ring-unbilled')).toHaveAttribute('stroke-dasharray','20 100');await expect(page.getByRole('img',{name:'20.0% of billing-required invoice value not billed',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Show billed share',exact:true}).click();await expect(page.getByRole('img',{name:'80.0% of billing-required invoice value billed',exact:true})).toBeVisible();expect(queries).toHaveLength(1);
});
