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
 const aging=page.getByRole('region',{name:'Hotel aging summary',exact:true});await expect(aging).toContainText('180.00');await expect(aging).toContainText('Over 60 not billed');
 const cohort=page.getByRole('region',{name:'Period invoice billing summary',exact:true});await expect(cohort).toContainText(region==='phuket'?'2,400.00':'4,800.00');await expect(cohort).toContainText('Billing not required');
 await page.locator('.management-exact-figures>summary').click();
 await expect(page.getByRole('region',{name:'Accounts over 60 days',exact:true}).locator('tbody tr')).toHaveCount(region==='phuket'?4:8);
 await expect(page.locator('.management-more')).not.toHaveAttribute('open','');
 if(width===390)for(const label of ['View billed · still open','View unbilled invoices over 60 days','View invoices over 60 days'])await expect(page.getByRole('button',{name:label,exact:true}).locator('small').last()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(fixture.errors).toEqual([]);
 if(width===390){expect(await page.locator('.management-period-glance dd').evaluateAll(cells=>cells.every(cell=>cell.scrollWidth<=cell.clientWidth+1))).toBe(true);}
 if(width===1440){const glance=page.getByRole('region',{name:'Period billing at a glance',exact:true});await expect(glance).toContainText(region==='phuket'?'1,600.00':'3,200.00');const bounds=await glance.boundingBox();expect(bounds!.y+bounds!.height).toBeLessThan(900);const agingBox=await page.getByRole('region',{name:'Hotel aging chart',exact:true}).boundingBox();expect(Math.abs(bounds!.width-agingBox!.width)).toBeLessThan(2);expect(Math.abs(bounds!.height-agingBox!.height)).toBeLessThan(2);}
 await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,0);});await page.screenshot({path:`.impeccable/review/balanced-dashboard-${region}-${width}.png`,animations:'disabled'});
 if(width===1440)await page.screenshot({path:`.impeccable/review/balanced-dashboard-${region}-full-1440.png`,fullPage:true,animations:'disabled'});
});
test('CFO Account search/sort and scoped invoice drill preserve report selection',async({page})=>{
 const {queries}=await managementFixture(page);await openDashboard(page,'/?dashboard=1&dashboardFrom=2026-09-01&dashboardTo=2026-09-12');
 const list=page.getByRole('region',{name:'Accounts over 60 days',exact:true});await expect(list.locator('tbody tr')).toHaveCount(4);
 const firstScope=[...queries[0].entries()].sort(([a],[b])=>a.localeCompare(b));
 await list.getByRole('button',{name:'Sort by Oldest · days',exact:true}).click();await expect(list.locator('tbody tr').first()).toContainText('Synthetic Lake Travel');
 const search=page.getByRole('searchbox',{name:'Search accounts over 60 days',exact:true});await search.fill('KAT tour');await expect(list.locator('tbody tr')).toHaveCount(1);
 await list.getByRole('button',{name:'Synthetic Tour Company',exact:true}).click();const details=page.getByRole('region',{name:'Dashboard invoice details',exact:true});await expect(details).toContainText('SYN-61');
 expect(new URL(page.url()).searchParams.get('dashboardDetailAccount')).toBe('tour');expect(new URL(page.url()).searchParams.get('dashboardDetailHotel')).toBe('KAT');
 await details.getByRole('button',{name:'Close details',exact:true}).click();await expect(search).toHaveValue('KAT tour');await expect(list.locator('tbody tr')).toHaveCount(1);expect(queries.length).toBeGreaterThan(0);for(const query of queries)expect([...query.entries()].sort(([a],[b])=>a.localeCompare(b))).toEqual(firstScope);
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
 const chart=page.getByRole('region',{name:'Hotel aging chart',exact:true});await chart.getByRole('button',{name:'TSK',exact:true}).click();const range=chart.getByRole('button',{name:/TSK · 61–90 days/});await range.focus();await range.press('Enter');
 await expect(chart.locator('footer')).toContainText('TSK · 61–90 days');await expect(chart.locator('footer')).toContainText('180.00');
 await chart.getByRole('button',{name:'View hotel invoices',exact:true}).click();expect(new URL(page.url()).searchParams.get('dashboardDetailHotel')).toBe('TSK');
});


for(const width of [1440,1280,390])test(`million-scale Dashboard has visible exact totals and usable priority rows at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await managementFixture(page);
 await page.route('**/api/dashboard/management?*',async route=>{const q=new URL(route.request().url()).searchParams,data=syntheticManagement('phuket',q.get('from')!,q.get('to')!);const scale=(v:any)=>{if(v&&typeof v==='object')for(const k of Object.keys(v)){if(['amount','creditAmount','unbilledAmount'].includes(k)&&typeof v[k]==='string')v[k]=(Number(v[k])*100000).toFixed(2);else scale(v[k]);}};scale(data);data.accountsOver60!.forEach(a=>a.accountName='Synthetic International Travel and Hospitality Reservation Services '+a.hotel);await route.fulfill({json:data});});
 await openDashboard(page,'/?dashboard=1');await page.evaluate(()=>document.fonts.ready);
 await expect(page.getByRole('button',{name:'View outstanding',exact:true})).toContainText('200,000,000.00 THB');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 // Variant 3 keeps the aged-unbilled measure in the first view; long Account names may extend the priority list.
 if(width>600){const metric=page.getByRole('button',{name:'View unbilled invoices over 60 days',exact:true});const box=await metric.boundingBox();expect(box!.y+box!.height).toBeLessThan(900);}
 const priority=page.getByRole('region',{name:'Priority accounts',exact:true}).locator('li');
 for(const row of await priority.all()){const name=await row.locator('b').boundingBox(),value=await row.locator('strong').boundingBox();expect(name!.x+name!.width).toBeLessThanOrEqual(value!.x);}
 await priority.nth(2).scrollIntoViewIfNeeded();await expect(priority.nth(2).getByRole('button')).toBeVisible();
 await page.locator('.management-billing-other summary').click();
 for(const row of await page.locator('.billing-other-row').all()){const label=await row.locator(':scope>span').boundingBox(),value=await row.locator(':scope>strong').boundingBox();expect(label!.x+label!.width).toBeLessThanOrEqual(value!.x);}
 await page.locator('.management-billing-other summary').click();
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`.impeccable/review/balanced-dashboard-millions-${width}.png`,animations:'disabled'});
});


test('billing legend responds to keyboard and touch selection without changing financial scope',async({page})=>{
 const {queries}=await managementFixture(page);await openDashboard(page,'/?dashboard=1');
 const notBilled=page.getByRole('button',{name:'Show not billed share',exact:true});await notBilled.focus();await notBilled.press('Enter');await expect(notBilled).toHaveAttribute('aria-pressed','true');await expect(page.locator('.billing-ring-unbilled')).toHaveAttribute('stroke-dasharray','20 100');await expect(page.getByRole('img',{name:'20.0% of billing-required invoice value not billed',exact:true})).toBeVisible();
 const firstScope=[...queries[0].entries()].sort(([a],[b])=>a.localeCompare(b));
 await page.getByRole('button',{name:'Show billed share',exact:true}).click();await expect(page.getByRole('img',{name:'80.0% of billing-required invoice value billed',exact:true})).toBeVisible();
 // Publication/auth refresh may repeat a read; legend selection must retain every scope parameter.
 expect(queries.length).toBeGreaterThan(0);for(const query of queries)expect([...query.entries()].sort(([a],[b])=>a.localeCompare(b))).toEqual(firstScope);
});


test('both aged indicators retain amount/count and unbilled drill scope',async({page})=>{
 await managementFixture(page);await openDashboard(page,'/?dashboard=1');
 const aged=page.getByRole('button',{name:'View invoices over 60 days',exact:true}),unbilled=page.getByRole('button',{name:'View unbilled invoices over 60 days',exact:true});
 await expect(aged).toContainText('440.00');await expect(aged).toContainText('4 invoices');await expect(unbilled).toContainText('400.00');await expect(unbilled).toContainText('2 invoices');
 await unbilled.click();expect(new URL(page.url()).searchParams.get('dashboardMetric')).toBe('over60_unbilled');await expect(page.getByRole('region',{name:'Dashboard invoice details',exact:true})).toContainText('SYN-61');
});
test('unknown age coverage keeps both aged metric amounts unavailable',async({page})=>{
 await managementFixture(page);await page.route('**/api/dashboard/management?*',async route=>{const q=new URL(route.request().url()).searchParams,data=syntheticManagement('phuket',q.get('from')!,q.get('to')!);data.agesComplete=false;data.accountsOver60=null;await route.fulfill({json:data});});await openDashboard(page,'/?dashboard=1');
 for(const name of ['View invoices over 60 days','View unbilled invoices over 60 days']){const metric=page.getByRole('button',{name,exact:true});await expect(metric).toBeDisabled();await expect(metric.locator('strong')).toHaveText('—');}
});
test('negative hotel ranges render below zero and retain signed inspection',async({page})=>{
 await managementFixture(page);await page.route('**/api/dashboard/management?*',async route=>{const q=new URL(route.request().url()).searchParams,data=syntheticManagement('phuket',q.get('from')!,q.get('to')!);data.hotels[0].bands[0].amount='-20.00';data.hotels[0].amount='280.00';data.hotels[0].creditAmount='-40.00';data.hotels[1].credits=0;data.hotels[1].creditAmount='0.00';data.types[0].amount='1280.00';for(const m of data.metrics){if(m.key==='open')m.amount='1280.00';if(m.key==='billed'){m.amount='120.00';m.count=4;}if(m.key==='unbilled'){m.amount='400.00';m.count=2;}if(m.key==='not_required')m.count=3;if(m.key==='setup')m.count=4;}data.openBalanceBreakdown!.positive={amount:'1320.00',count:13};data.openBalanceBreakdown!.credit={amount:'-40.00',count:1};await route.fulfill({json:data});});await openDashboard(page,'/?dashboard=1');
 await page.getByRole('group',{name:'Aging hotel'}).getByRole('button',{name:'KAT',exact:true}).click();const credit=page.locator('.management-age-range').filter({has:page.locator('.is-credit')}).first();await expect(credit).toHaveAttribute('aria-label',/KAT.*credit/);expect((await credit.boundingBox())!.height).toBeGreaterThan(0);await credit.focus();await expect(page.locator('.management-chart-selection')).toContainText('-฿20.00');
});

for(const width of [1280,661,390])test(`age ranges and large billing totals stay readable at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await managementFixture(page);
 await page.route('**/api/dashboard/management?*',async route=>{const q=new URL(route.request().url()).searchParams,data=syntheticManagement('phuket',q.get('from')!,q.get('to')!);const scale=(v:any)=>{if(v&&typeof v==='object')for(const k of Object.keys(v)){if(['amount','creditAmount','unbilledAmount'].includes(k)&&typeof v[k]==='string')v[k]=(Number(v[k])*10000).toFixed(2);else scale(v[k]);}};scale(data);await route.fulfill({json:data});});await openDashboard(page,'/?dashboard=1');
 const chart=page.getByRole('region',{name:'Hotel aging chart',exact:true});await expect(chart.getByRole('heading',{name:'Invoice Aging',exact:true})).toBeVisible();await expect(chart.locator('.management-age-range')).toHaveCount(6);
 for(const row of await chart.locator('.management-age-range').all()){const box=await row.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);}
 await chart.getByRole('button',{name:'KAT',exact:true}).click();await expect(chart.getByRole('button',{name:/KAT.*121.*0.00/})).toBeVisible();
 const billing=page.getByRole('region',{name:'Period billing at a glance',exact:true});await expect(billing).toContainText('24,000,000.00');await billing.locator('summary').click();await expect(billing).toContainText('Billing not required');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:`.impeccable/review/balanced-expanded-${width}.png`,fullPage:true,animations:'disabled'});
});

for(const width of [1920,1280,661,390])test(`balanced overview aligns cards and panels with seven Account types at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await managementFixture(page);
 await page.route('**/api/dashboard/management?*',async route=>{
  const q=new URL(route.request().url()).searchParams,data=syntheticManagement('phuket',q.get('from')!,q.get('to')!);
  data.types=['OTA','CCR','BTA','PTA','OTH','REN','DRF'].map((type,i)=>({type,amount:[1000,500,200,150,100,70,-20][i].toFixed(2),count:[4,2,2,2,2,1,1][i],over60:i===0?4:0}));
  await route.fulfill({json:data});
 });await openDashboard(page,'/?dashboard=1');
 await expect(page.locator('.management-type-list>div')).toHaveCount(7);
 const cards=await page.locator('.management-summary-grid>.management-total').all();expect(cards).toHaveLength(4);
 const boxes=await Promise.all(cards.map(card=>card.boundingBox()));
 expect(Math.max(...boxes.map(b=>b!.width))-Math.min(...boxes.map(b=>b!.width))).toBeLessThan(2);
 for(let i=0;i<boxes.length;i+=width>1050?4:2){const row=boxes.slice(i,i+(width>1050?4:2));expect(Math.max(...row.map(b=>b!.height))-Math.min(...row.map(b=>b!.height))).toBeLessThan(2);expect(Math.max(...row.map(b=>b!.y))-Math.min(...row.map(b=>b!.y))).toBeLessThan(2);}
 if(width>1050)for(const selector of ['.management-primary-panels','.management-secondary-panels']){const panes=await page.locator(selector+'>section').all(),bounds=await Promise.all(panes.map(pane=>pane.boundingBox()));expect(Math.abs(bounds[0]!.width-bounds[1]!.width)).toBeLessThan(2);expect(Math.abs(bounds[0]!.height-bounds[1]!.height)).toBeLessThan(2);expect(Math.abs(bounds[0]!.y-bounds[1]!.y)).toBeLessThan(2);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`.impeccable/review/balanced-real-density-${width}.png`,fullPage:true,animations:'disabled'});
});
