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
 });
 await page.route('**/api/dashboard/balance-accounts?*',async route=>{const q=new URL(route.request().url()).searchParams,hotels=q.get('hotel')?[q.get('hotel')!]:['KAT','TSK'];await route.fulfill({json:{asOfDate:q.get('asOf'),mode:'snapshot',complete:true,missingHotels:[],unverified:0,total:hotels.length,metrics:[],stages:[],rows:hotels.map(hotel=>({hotel,accountId:'tour',accountNo:'SYN-TOUR',accountName:'Synthetic Tour Company',accountType:'OTA',count:1,amount:'200.00',oldest:61,verified:true}))}});});return {fixture,queries};
}
for(const region of ['phuket','khao-lak'] as const)for(const width of [1440,1280,390])test(`CFO report ${region} at ${width}: signed totals, outstanding billing and continuous aged accounts`,async({page})=>{
 await page.setViewportSize({width,height:900});const {fixture}=await managementFixture(page);
 await openDashboard(page,'/?dashboard=1&region='+region+'&dashboardFrom=2026-09-01&dashboardTo=2026-09-12&dashboardDateMode=range');
 const report=page.getByRole('region',{name:'Management summary',exact:true});await expect(report.getByRole('button',{name:'View outstanding',exact:true})).toContainText(region==='phuket'?'2,000.00':'4,000.00');
 await page.locator('.management-exact-figures>summary').click();
 const aging=page.getByRole('region',{name:'Hotel aging summary',exact:true});await expect(aging).toContainText('180.00');await expect(aging).toContainText('61+ days not billed');
 const cohort=page.getByRole('region',{name:'Period invoice billing summary',exact:true});await expect(cohort).toContainText(region==='phuket'?'2,400.00':'4,800.00');await expect(cohort).toContainText('Billing not required');
 await page.locator('.management-exact-figures>summary').click();
 await page.locator('.management-account-disclosure>summary').click();
 await expect(page.getByRole('region',{name:'Accounts with invoices 61+ days old',exact:true}).locator('[data-dashboard-account]')).toHaveCount(region==='phuket'?4:8);
 await expect(page.locator('.management-more')).not.toHaveAttribute('open','');
 if(width===390)for(const label of ['View billed · still open','View unbilled invoices 61+ days old','View invoices 61+ days old'])await expect(page.getByRole('button',{name:label,exact:true}).locator('small').last()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(fixture.errors).toEqual([]);
 if(width===390){expect(await page.locator('.management-period-glance dd').evaluateAll(cells=>cells.every(cell=>cell.scrollWidth<=cell.clientWidth+1))).toBe(true);}
 if(width===1440){const glance=page.getByRole('region',{name:'Outstanding billing progress',exact:true});await expect(glance).toContainText(region==='phuket'?'240.00':'480.00');const bounds=await glance.boundingBox();expect(bounds!.y+bounds!.height).toBeLessThan(900);const agingBox=await page.getByRole('region',{name:'Hotel aging chart',exact:true}).boundingBox();expect(Math.abs(bounds!.width-agingBox!.width)).toBeLessThan(2);expect(Math.abs(bounds!.height-agingBox!.height)).toBeLessThan(2);}
 await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,0);});await page.screenshot({path:`.tmp/dashboard-hotel-comparison/visual/account-first-dashboard-${region}-${width}.png`,animations:'disabled'});
 if(width===1440)await page.screenshot({path:`.tmp/dashboard-hotel-comparison/visual/account-first-dashboard-${region}-full-1440.png`,fullPage:true,animations:'disabled'});
});
test('CFO Account search/sort and scoped invoice drill preserve report selection',async({page})=>{
 const {queries}=await managementFixture(page);await openDashboard(page,'/?dashboard=1&dashboardFrom=2026-09-01&dashboardTo=2026-09-12');
 await page.locator('.management-account-disclosure>summary').click();
 const list=page.getByRole('region',{name:'Accounts with invoices 61+ days old',exact:true});await expect(list.locator('[data-dashboard-account]')).toHaveCount(4);await expect(list.locator('[data-dashboard-comparison-row]')).toHaveCount(2);
 await expect(page.locator('.billing-legend-unbilled button')).toBeEnabled();const firstScope=[...queries[0].entries()].sort(([a],[b])=>a.localeCompare(b));
 await list.getByRole('combobox',{name:'Account comparison sort',exact:true}).selectOption('oldest');await expect(list.locator('tbody tr:not(.dashboard-hotel-group-heading)').first()).toContainText('Synthetic Lake Travel');
 const search=page.getByRole('searchbox',{name:'Search accounts with invoices 61+ days old',exact:true});await search.fill('KAT tour');await expect(list.locator('[data-dashboard-comparison-row]')).toHaveCount(1);await expect(list.locator('[data-dashboard-account]')).toHaveCount(2);
 await list.getByRole('button',{name:/^Open Synthetic Tour Company · KAT · Account /}).click();const details=page.getByRole('region',{name:'Dashboard invoice details',exact:true});await expect(details).toContainText('SYN-61');
 expect(new URL(page.url()).searchParams.get('dashboardDetailAccount')).toBe('tour');expect(new URL(page.url()).searchParams.get('dashboardDetailHotel')).toBe('KAT');
 await details.getByRole('button',{name:'Close details',exact:true}).click();await expect(search).toHaveValue('KAT tour');await expect(list.locator('[data-dashboard-comparison-row]')).toHaveCount(1);await expect(list.locator('[data-dashboard-account]')).toHaveCount(2);expect(queries.length).toBeGreaterThan(0);for(const query of queries)expect([...query.entries()].sort(([a],[b])=>a.localeCompare(b))).toEqual(firstScope);
});
test('unknown aged coverage is visible and never becomes an empty verified list',async({page})=>{
 await managementFixture(page);await page.route('**/api/dashboard/management?*',async route=>{const q=new URL(route.request().url()).searchParams,data=syntheticManagement('phuket',q.get('from')!,q.get('to')!);data.agesComplete=false;data.accountsOver60=null;data.hotels.forEach(h=>{h.over60=null;h.over90=null;h.unbilled61=null;h.bands.forEach(b=>{b.amount=null;b.count=null;});});await route.fulfill({json:data});});
 await openDashboard(page,'/?dashboard=1');await page.locator('.management-account-disclosure>summary').click();await expect(page.getByText('The full aged Account list could not be verified.',{exact:false})).toBeVisible();await expect(page.getByText('No open invoices are 61+ days old.',{exact:true})).toHaveCount(0);
});

test('closed mobile report filters expose active type and its count',async({page})=>{
 await page.setViewportSize({width:390,height:900});await managementFixture(page);await openDashboard(page,'/?dashboard=1');
 const disclosure=page.getByRole('button',{name:/^Report filters/});await expect(disclosure).toBeVisible();await disclosure.click();
 await page.getByRole('combobox',{name:'Period account type',exact:true}).selectOption('Agent');await expect(disclosure).toContainText('Agent');await disclosure.click();
 await expect(disclosure).toContainText('Report filters · 1');await expect(disclosure).toContainText('Agent · All accounts');await expect(page.getByRole('combobox',{name:'Period account type',exact:true})).not.toBeVisible();
});


test('visual Dashboard exposes exact billing progress and priority-account drill',async({page})=>{
 await managementFixture(page);await openDashboard(page,'/?dashboard=1');
 await expect(page.getByRole('img',{name:'19.4% of outstanding billing-required value billed',exact:true})).toBeVisible();
 const attention=page.getByRole('region',{name:'Priority accounts',exact:true});await expect(attention.locator('li')).toHaveCount(4);
 await attention.getByRole('button',{name:/Synthetic Tour Company/}).first().click();
 await expect(page.getByRole('region',{name:'Dashboard invoice details',exact:true})).toContainText('SYN-61');expect(new URL(page.url()).searchParams.get('dashboardDetailAccount')).toBe('tour');
});
test('hotel chart keyboard selection shows exact source figures and opens the selected hotel',async({page})=>{
 await managementFixture(page);await openDashboard(page,'/?dashboard=1');
 const chart=page.getByRole('region',{name:'Hotel aging chart',exact:true});await chart.getByRole('button',{name:'TSK',exact:true}).click();const range=chart.getByRole('button',{name:/TSK · 61–90 days/});await range.focus();await range.press('Enter');
 await expect(chart.locator('footer')).toContainText('TSK · 61–90 days');await expect(chart.locator('footer')).toContainText('180.00');
 await chart.getByRole('button',{name:'View hotel accounts',exact:true}).click();expect(new URL(page.url()).searchParams.get('dashboardDetailHotel')).toBe('TSK');
});


for(const width of [1440,1280,390])test(`million-scale Dashboard has visible exact totals and usable priority rows at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await managementFixture(page);
 await page.route('**/api/dashboard/management?*',async route=>{const q=new URL(route.request().url()).searchParams,data=syntheticManagement('phuket',q.get('from')!,q.get('to')!);const scale=(v:any)=>{if(v&&typeof v==='object')for(const k of Object.keys(v)){if(['amount','creditAmount','unbilledAmount'].includes(k)&&typeof v[k]==='string')v[k]=(Number(v[k])*100000).toFixed(2);else scale(v[k]);}};scale(data);data.accountsOver60!.forEach(a=>a.accountName='Synthetic International Travel and Hospitality Reservation Services '+a.hotel);await route.fulfill({json:data});});
 await openDashboard(page,'/?dashboard=1');await page.evaluate(()=>document.fonts.ready);
 const exactOutstanding=page.getByRole('button',{name:'View outstanding',exact:true});await expect(exactOutstanding.locator('strong')).toHaveText('฿200,000,000.00');await expect(exactOutstanding.locator('.management-exact-total')).toHaveCount(0);expect(await exactOutstanding.locator('strong').evaluate(figure=>figure.scrollWidth<=figure.clientWidth+1&&figure.scrollHeight<=figure.clientHeight+1)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 // Variant 3 keeps the aged-unbilled measure in the first view; long Account names may extend the priority list.
 if(width>600){const metric=page.getByRole('button',{name:'View unbilled invoices 61+ days old',exact:true});const box=await metric.boundingBox();expect(box!.y+box!.height).toBeLessThan(900);}
 const priority=page.getByRole('region',{name:'Priority accounts',exact:true}).locator('li');
 for(const row of await priority.all()){const name=await row.locator('b').boundingBox(),value=await row.locator('strong').boundingBox();expect(name!.x+name!.width<=value!.x+1||name!.y+name!.height<=value!.y+1).toBe(true);}
 await priority.nth(2).scrollIntoViewIfNeeded();await expect(priority.nth(2).getByRole('button')).toBeVisible();

 for(const row of await page.locator('.billing-other-row').all()){const label=await row.locator(':scope>span').boundingBox(),value=await row.locator(':scope>strong').boundingBox();expect(label!.x+label!.width).toBeLessThanOrEqual(value!.x);}

 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`.tmp/dashboard-hotel-comparison/visual/account-first-dashboard-millions-${width}.png`,animations:'disabled'});
});


test('billing values open accounts without changing report scope',async({page})=>{
 const {queries}=await managementFixture(page);await openDashboard(page,'/?dashboard=1');
 await expect(page.locator('.billing-legend-unbilled button')).toBeEnabled();const firstScope=[...queries[0].entries()].sort(([a],[b])=>a.localeCompare(b));await page.locator('.billing-legend-unbilled button').click();
 const panel=page.getByRole('region',{name:'Dashboard invoice details',exact:true});await expect(panel).toContainText('Synthetic Tour Company');expect(new URL(page.url()).searchParams.get('dashboardMetric')).toBe('unbilled');
 for(const query of queries)expect([...query.entries()].sort(([a],[b])=>a.localeCompare(b))).toEqual(firstScope);
});

test('both aged indicators retain amount/count and unbilled drill scope',async({page})=>{
 await managementFixture(page);await openDashboard(page,'/?dashboard=1');
 const aged=page.getByRole('button',{name:'View invoices 61+ days old',exact:true}),unbilled=page.getByRole('button',{name:'View unbilled invoices 61+ days old',exact:true});
 await expect(aged).toContainText('440.00');await expect(aged).toContainText('4 invoices');await expect(unbilled).toContainText('400.00');await expect(unbilled).toContainText('2 invoices');
 await unbilled.click();expect(new URL(page.url()).searchParams.get('dashboardMetric')).toBe('over60_unbilled');await expect(page.getByRole('region',{name:'Dashboard invoice details',exact:true})).toContainText('Synthetic Tour Company');
});
test('unknown age coverage keeps both aged metric amounts unavailable',async({page})=>{
 await managementFixture(page);await page.route('**/api/dashboard/management?*',async route=>{const q=new URL(route.request().url()).searchParams,data=syntheticManagement('phuket',q.get('from')!,q.get('to')!);data.agesComplete=false;data.accountsOver60=null;await route.fulfill({json:data});});await openDashboard(page,'/?dashboard=1');
 for(const name of ['View invoices 61+ days old','View unbilled invoices 61+ days old']){const metric=page.getByRole('button',{name,exact:true});await expect(metric).toBeDisabled();await expect(metric.locator('strong')).toHaveText('—');}
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
 const billing=page.getByRole('region',{name:'Outstanding billing progress',exact:true});await expect(billing).toContainText('2,400,000.00');await expect(billing).toContainText('Billing not required');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:`.tmp/dashboard-hotel-comparison/visual/account-first-expanded-${width}.png`,fullPage:true,animations:'disabled'});
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
 const columns=width>1050?4:width>480?2:1;for(let i=0;i<boxes.length;i+=columns){const row=boxes.slice(i,i+columns);expect(Math.max(...row.map(b=>b!.height))-Math.min(...row.map(b=>b!.height))).toBeLessThan(2);expect(Math.max(...row.map(b=>b!.y))-Math.min(...row.map(b=>b!.y))).toBeLessThan(2);}
 if(width>1050)for(const selector of ['.management-primary-panels']){const panes=await page.locator(selector+'>section').all(),bounds=await Promise.all(panes.map(pane=>pane.boundingBox()));expect(Math.abs(bounds[0]!.width-bounds[1]!.width)).toBeLessThan(2);expect(Math.abs(bounds[0]!.height-bounds[1]!.height)).toBeLessThan(2);expect(Math.abs(bounds[0]!.y-bounds[1]!.y)).toBeLessThan(2);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`.tmp/dashboard-hotel-comparison/visual/account-first-real-density-${width}.png`,fullPage:true,animations:'disabled'});
});

test('account-first drill carries exact aging range into matching invoices and returns to accounts',async({page})=>{
 const {fixture}=await managementFixture(page),seen:URLSearchParams[]=[];
 await page.route('**/api/dashboard/balances?*',async route=>{const q=new URL(route.request().url()).searchParams;seen.push(q);await route.fulfill({json:{asOfDate:q.get('asOf'),mode:'snapshot',complete:true,missingHotels:[],unverified:0,total:1,metrics:[],stages:[],rows:[{hotel:q.get('hotel'),accountId:q.get('account'),accountName:'Synthetic Tour Company',accountType:'OTA',invoiceId:'age-61',invoiceNo:'ONLY-61',open:'200.00',original:'200.00',age:61,verified:true}]}});});
 await openDashboard(page,'/?dashboard=1&dashboardFrom=2026-09-01&dashboardTo=2026-09-12');const chart=page.getByRole('region',{name:'Hotel aging chart'});await chart.getByRole('button',{name:'TSK',exact:true}).click();await chart.getByRole('button',{name:/TSK.*61.*90 days/}).click();await chart.getByRole('button',{name:'View hotel accounts',exact:true}).click();
 const panel=page.getByRole('region',{name:'Dashboard invoice details'});await expect(panel.locator('tbody tr:not(.dashboard-hotel-group-heading)')).toHaveCount(1);await expect(panel).toContainText('200.00');await panel.getByRole('button',{name:/^Open Synthetic Tour Company · TSK · Account /}).click();await expect(panel).toContainText('ONLY-61');expect(seen.at(-1)?.get('ageMin')).toBe('61');expect(seen.at(-1)?.get('ageMax')).toBe('90');expect(seen.at(-1)?.get('hotel')).toBe('TSK');expect(seen.at(-1)?.get('account')).toBe('tour');await panel.getByRole('button',{name:'Back to accounts'}).click();await expect(panel.locator('tbody tr:not(.dashboard-hotel-group-heading)')).toHaveCount(1);await expect(panel.getByRole('button',{name:/^Open Synthetic Tour Company · TSK · Account /})).toBeVisible();expect(fixture.errors).toEqual([]);
});
test('period-exempt new invoices do not replace outstanding billing progress',async({page})=>{
 await managementFixture(page);await page.route('**/api/dashboard/management?*',async route=>{const q=new URL(route.request().url()).searchParams,data=syntheticManagement('phuket',q.get('from')!,q.get('to')!);for(const c of data.cohort){c.count=['issued','not_required'].includes(c.key)?40:0;c.amount=['issued','not_required'].includes(c.key)?'400.00':'0.00';}data.metrics.find(m=>m.key==='billed')!.amount='12420000.00';data.metrics.find(m=>m.key==='billed')!.count=319;data.metrics.find(m=>m.key==='unbilled')!.amount='3350000.00';data.metrics.find(m=>m.key==='unbilled')!.count=87;await route.fulfill({json:data});});await openDashboard(page,'/?dashboard=1');const billing=page.getByRole('region',{name:'Outstanding billing progress'});await expect(billing).toContainText('12,420,000.00');await expect(billing).toContainText('319 invoices');await expect(billing).toContainText('3,350,000.00');await expect(billing).toContainText('87 invoices');await expect(billing).toContainText('Outstanding as of');await expect(billing).not.toContainText('No billing due');await expect(billing).toContainText('Credits');await expect(billing).toContainText('may overlap');
});
test('the first aging range retains future-base entries and carries only the upper bound',async({page})=>{
 await managementFixture(page);await openDashboard(page,'/?dashboard=1');const chart=page.getByRole('region',{name:'Hotel aging chart'});await chart.getByRole('button',{name:/All hotels.*Up to 30 days/}).click();await chart.getByRole('button',{name:'View accounts',exact:true}).click();const q=new URL(page.url()).searchParams;expect(q.has('dashboardAgeMin')).toBe(false);expect(q.get('dashboardAgeMax')).toBe('30');await expect(page.getByRole('region',{name:'Dashboard invoice details'})).toContainText('Age up to 30 days');
});
for(const unknown of [false,true])test(`billing does not draw a false completion ring when ${unknown?'unknown':'zero'}`,async({page})=>{
 await managementFixture(page);await page.route('**/api/dashboard/management?*',async route=>{const q=new URL(route.request().url()).searchParams,data=syntheticManagement('phuket',q.get('from')!,q.get('to')!);if(unknown)data.complete=false;else for(const m of data.metrics)if(['billed','unbilled','setup'].includes(m.key)){m.amount='0.00';m.count=0;}await route.fulfill({json:data});});await openDashboard(page,'/?dashboard=1');const billing=page.getByRole('region',{name:'Outstanding billing progress'});await expect(billing.getByRole('img')).toHaveCount(0);await expect(billing).toContainText(unknown?'Billing progress unavailable':'No outstanding billing-required value');
});
test('searching and clearing a long account list restores continuous scrolling',async({page})=>{
 await managementFixture(page);await page.route('**/api/dashboard/balance-accounts?*',async route=>{const q=new URL(route.request().url()).searchParams,limit=Number(q.get('limit')),start=Number(q.get('page'))*limit;await route.fulfill({json:{asOfDate:q.get('asOf'),mode:'snapshot',complete:true,missingHotels:[],unverified:0,total:250,metrics:[],stages:[],rows:Array.from({length:250},(_,i)=>({hotel:'KAT',accountId:String(i),accountNo:'SYN-'+i,accountName:'Synthetic account '+i,accountType:'OTA',count:1,amount:'100.00',oldest:61,verified:true})).slice(start,start+limit)}});});await openDashboard(page,'/?dashboard=1');await page.getByRole('button',{name:'View outstanding',exact:true}).click();const panel=page.getByRole('region',{name:'Dashboard invoice details'});await expect(panel.locator('tbody tr:not(.dashboard-hotel-group-heading)')).toHaveCount(200);await expect(panel.locator('.dashboard-comparison-controls')).toContainText('250 comparison rows');await expect(panel.locator('.dashboard-comparison-controls')).toContainText('250 accounts');await expect(panel.locator('.dashboard-detail-more')).toContainText('200 of 250 comparison rows');await panel.getByRole('searchbox',{name:'Search detail accounts'}).fill('Synthetic account 249');await expect(panel.locator('tbody tr:not(.dashboard-hotel-group-heading)')).toHaveCount(1);await expect(panel.locator('.dashboard-comparison-controls')).toContainText('1 comparison row');await expect(panel.locator('[data-dashboard-account]')).toContainText('100.00');await panel.getByRole('searchbox',{name:'Search detail accounts'}).fill('');await expect(panel.locator('tbody tr:not(.dashboard-hotel-group-heading)')).toHaveCount(200);await panel.locator('.dashboard-detail-more').scrollIntoViewIfNeeded();await expect(panel.locator('tbody tr:not(.dashboard-hotel-group-heading)')).toHaveCount(250);
});

test('Account matrix aligns Hotel cells and preserves the counterpart when searching one ledger',async({page})=>{
 await managementFixture(page);await page.route('**/api/dashboard/balance-accounts?*',async route=>{const q=new URL(route.request().url()).searchParams;await route.fulfill({json:{asOfDate:q.get('asOf'),mode:'snapshot',complete:true,missingHotels:[],unverified:0,total:4,metrics:[],stages:[],rows:[['TSK','same','200.00'],['KAT','same','100.00'],['TSK','other','300.00'],['KAT','other','20.00']].map(([hotel,accountId,amount])=>({hotel,accountId,accountNo:hotel+'-'+accountId,accountName:accountId==='same'?'Identical synthetic account':'Other synthetic account',accountType:'OTA',count:1,amount,oldest:61,verified:true}))}});});
 await openDashboard(page,'/?dashboard=1');await page.getByRole('button',{name:'View outstanding',exact:true}).click();const panel=page.getByRole('region',{name:'Dashboard invoice details'}),matrix=panel.getByRole('region',{name:'Dashboard account details',exact:true});await expect(matrix.locator('[data-dashboard-comparison-row]')).toHaveCount(2);await expect(matrix.locator('[data-dashboard-account]')).toHaveCount(4);await expect(matrix.locator('thead th[data-hotel="KAT"]')).toContainText('Katathani Phuket Beach Resort');await matrix.getByRole('combobox',{name:'Account comparison sort',exact:true}).selectOption('amount');await matrix.getByRole('button',{name:'Change account comparison sort direction'}).click();await expect(matrix.locator('tbody tr').first()).toContainText('Other synthetic account');await matrix.getByRole('combobox',{name:'Account comparison sort hotel',exact:true}).selectOption('TSK');await expect(matrix.locator('tbody tr').first()).toContainText('Identical synthetic account');await panel.getByRole('searchbox',{name:'Search detail accounts'}).fill('KAT-same');await expect(matrix.locator('[data-dashboard-comparison-row]')).toHaveCount(1);await expect(matrix.locator('[data-dashboard-account]')).toHaveCount(2);await expect(matrix.locator('tbody td[data-hotel="TSK"]')).toContainText('200.00');await matrix.locator('tbody td[data-hotel="KAT"]').getByRole('button').click();await expect(panel).toContainText('SYN-61');await expect(panel.locator('header')).toContainText('KAT');await panel.getByRole('button',{name:'Back to accounts'}).click();await expect(matrix.locator('[data-dashboard-account]')).toHaveCount(2);await expect(panel.getByRole('searchbox',{name:'Search detail accounts'})).toHaveValue('KAT-same');await expect(matrix.getByRole('combobox',{name:'Account comparison sort hotel',exact:true})).toHaveValue('TSK');
});
test('expanded aged Account matrix compares names horizontally and sorts the selected Hotel',async({page})=>{
 await managementFixture(page);await openDashboard(page,'/?dashboard=1');await page.locator('.management-account-disclosure>summary').click();const matrix=page.getByRole('region',{name:'Accounts with invoices 61+ days old',exact:true});await expect(matrix.locator('[data-dashboard-comparison-row]')).toHaveCount(2);await expect(matrix.locator('[data-dashboard-account]')).toHaveCount(4);await expect(matrix.locator('thead th[data-hotel]')).toHaveCount(2);await matrix.getByRole('combobox',{name:'Account comparison sort',exact:true}).selectOption('oldest');await expect(matrix.locator('tbody tr').first()).toContainText('Synthetic Lake Travel');await page.getByRole('searchbox',{name:'Search accounts with invoices 61+ days old',exact:true}).fill('KAT tour');await expect(matrix.locator('[data-dashboard-comparison-row]')).toHaveCount(1);await expect(matrix.locator('[data-dashboard-account]')).toHaveCount(2);await expect(matrix.locator('tbody td[data-hotel="KAT"]')).toContainText('200.00');await expect(matrix.locator('tbody td[data-hotel="TSK"]')).toContainText('200.00');
});
test('mobile Account comparison scrolls Hotels while keeping Account names and exact ledger drills',async({page})=>{
 await page.setViewportSize({width:390,height:900});await managementFixture(page);await openDashboard(page,'/?dashboard=1&region=khao-lak');await page.locator('.management-account-disclosure>summary').click();
 const matrix=page.getByRole('region',{name:'Accounts with invoices 61+ days old',exact:true}),scroll=matrix.locator('.dashboard-comparison-scroll'),name=matrix.locator('tbody th').first();await expect(matrix.locator('thead th[data-hotel]')).toHaveCount(4);await scroll.scrollIntoViewIfNeeded();
 expect(await scroll.evaluate(element=>element.scrollWidth>element.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);const before=await name.boundingBox();await scroll.evaluate(element=>{element.scrollLeft=element.scrollWidth-element.clientWidth;});await expect.poll(async()=>Math.abs((await name.boundingBox())!.x-before!.x)).toBeLessThan(2);
 const finalHotel=matrix.locator('tbody td[data-hotel="TSAN"]').first();await expect(finalHotel).toContainText('20.00');const sticky=await name.boundingBox(),viewport=await scroll.evaluate(element=>{const rect=element.getBoundingClientRect();return {right:rect.left+element.clientLeft+element.clientWidth};});for(const target of [finalHotel.locator('strong'),matrix.locator('thead th[data-hotel="TSAN"]')]){const rect=await target.boundingBox();expect(rect!.x).toBeGreaterThanOrEqual(sticky!.x+sticky!.width-1);expect(rect!.x+rect!.width).toBeLessThanOrEqual(viewport.right+1);}await expect(finalHotel.getByRole('button')).toBeVisible();await page.evaluate(()=>document.fonts.ready);await matrix.screenshot({path:'.tmp/dashboard-hotel-comparison/visual/account-comparison-mobile.png',animations:'disabled'});await finalHotel.getByRole('button').click();const detail=page.getByRole('region',{name:'Dashboard invoice details',exact:true});await expect(detail).toContainText('SYN-61');expect(new URL(page.url()).searchParams.get('dashboardDetailHotel')).toBe('TSAN');expect(new URL(page.url()).searchParams.get('dashboardDetailAccount')).toBe('lake');
});
test('ambiguous names stay separate ledgers while null, missing and signed cells stay distinct',async({page})=>{
 await managementFixture(page);await page.route('**/api/dashboard/balance-accounts?*',async route=>{const q=new URL(route.request().url()).searchParams;await route.fulfill({json:{asOfDate:q.get('asOf'),mode:'snapshot',complete:false,missingHotels:[],unverified:1,total:4,metrics:[],stages:[],rows:[{hotel:'KAT',accountId:'a',accountName:'Repeated',amount:'10.00'},{hotel:'KAT',accountId:'b',accountName:'Repeated',amount:'20.00'},{hotel:'TSK',accountId:'a',accountName:'Repeated',amount:'-30.00'},{hotel:'TSK',accountId:'null',accountName:'Unknown amount',amount:null}].map(row=>({...row,accountNo:'NO-'+row.hotel+'-'+row.accountId,accountType:'OTA',count:1,oldest:61,verified:row.amount!==null}))}});});await openDashboard(page,'/?dashboard=1');await page.getByRole('button',{name:'View outstanding',exact:true}).click();const panel=page.getByRole('region',{name:'Dashboard invoice details'}),matrix=panel.getByRole('region',{name:'Dashboard account details',exact:true});await expect(matrix.locator('[data-dashboard-comparison-row]')).toHaveCount(4);await expect(matrix.locator('[data-dashboard-account]')).toHaveCount(4);await expect(matrix).toContainText('Separate ledger');await expect(matrix).toContainText('Unavailable');await expect(matrix).toContainText('-\u0e3f30.00');await expect(matrix.getByLabel('No matching Account in KAT within this scope',{exact:true})).not.toHaveCount(0);await panel.getByRole('searchbox',{name:'Search detail accounts'}).fill('NO-KAT-a');await expect(matrix.locator('[data-dashboard-comparison-row]')).toHaveCount(1);await expect(matrix.locator('[data-dashboard-account]')).toHaveCount(1);await expect(matrix).toContainText('Separate ledger');
});
for(const kind of ['payments','sent'] as const)test(`${kind} detail records retain an explicit Hotel group after choosing an Account`,async({page})=>{
 await managementFixture(page);await page.route(kind==='payments'?'**/api/financial/payments?*':'**/api/reports/activity?*',async route=>{const q=new URL(route.request().url()).searchParams;await route.fulfill({json:{total:2,summary:{amount:'30.00'},coverage:{complete:true},rows:[10,20].map(value=>({hotel:q.get('hotel'),accountId:q.get('account'),accountName:'Synthetic record account',accountType:'OTA',invoiceId:'invoice-'+value,invoiceNo:'INVOICE-'+value,transactionId:'PAY-'+value,delivery_id:'delivery-'+value,sent_at:'2026-09-12T03:00:00Z',sent_date:'2026-09-12',amount:value.toFixed(2),appliedAmount:value.toFixed(2),unallocatedAmount:'0.00'}))}});});
 await openDashboard(page,'/?dashboard=1&dashboardDetail='+kind+'&dashboardDetailHotel=KAT&dashboardDetailAccount=same');const panel=page.getByRole('region',{name:'Dashboard invoice details'});await expect(panel.locator('[data-dashboard-record]')).toHaveCount(2);await expect(panel.locator('tbody[aria-label="KAT detail records"] .dashboard-hotel-group-heading')).toContainText('Katathani Phuket Beach Resort');await expect(panel.locator('.dashboard-hotel-group-heading')).toContainText('2 records');await expect(panel.locator('.dashboard-hotel-group-heading')).toContainText('30.00');await expect(panel.getByRole('button',{name:'Next',exact:true})).toHaveCount(0);
});
test('Dashboard comparison tables retain separate Hotel rows or columns with full Hotel names',async({page})=>{
 await managementFixture(page);await openDashboard(page,'/?dashboard=1');await page.locator('.management-exact-figures>summary').click();await expect(page.getByRole('region',{name:'Hotel aging summary',exact:true})).toContainText('Katathani Phuket Beach Resort');await expect(page.getByRole('region',{name:'Period invoice billing summary',exact:true}).locator('thead')).toContainText('The Shore at Katathani');await page.locator('.management-more>summary').click();const matrix=page.getByRole('region',{name:'Closing balances by hotel comparison',exact:true});await expect(matrix.locator('tbody tr[data-hotel="KAT"] th')).toContainText('Katathani Phuket Beach Resort');await expect(matrix.locator('tbody tr[data-hotel="TSK"] th')).toContainText('The Shore at Katathani');await page.locator('.dashboard-balance-breakdown>summary').click();const status=page.getByRole('region',{name:'Closing-date status breakdown',exact:true});await expect(status.locator('thead th[data-hotel]')).toHaveCount(2);await expect(status.locator('thead th[data-hotel="KAT"]')).toContainText('Katathani Phuket Beach Resort');await expect(status.locator('tbody tr').first().locator('td[data-hotel]')).toHaveCount(2);await expect(page.getByRole('region',{name:'Period invoice and billing activity',exact:true}).locator('thead')).toContainText('The Shore at Katathani');
});
