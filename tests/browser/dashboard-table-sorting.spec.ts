import {test,expect} from '@playwright/test';
import {setupDashboard,openDashboard} from './fixtures/dashboard-period';
import {currentAgingAccounts} from './fixtures/current-aging';

test('Dashboard recovers a failed later page without exposing a partial sorted list',async({page})=>{
 await setupDashboard(page,{large:true});let fail=true;
 await page.route('**/api/dashboard/balances**',r=>{const q=new URL(r.request().url()).searchParams;return fail&&q.get('page')==='1'?r.fulfill({status:503,json:{error:'synthetic_failure'}}):r.fallback();});
 await openDashboard(page,'/?dashboard=1&dashboardDetail=balance&dashboardMetric=open');
 const panel=page.getByRole('region',{name:'Dashboard invoice details'});
 await expect(panel.getByRole('alert')).toContainText('full list could not be verified');await expect(panel.locator('tbody tr')).toHaveCount(0);
 fail=false;await panel.getByRole('button',{name:'Retry details'}).click();await expect(panel.locator('tbody tr')).toHaveCount(62);
});

test('Dashboard appends long lists on scroll and sorts across rows not rendered yet',async({page})=>{
 await setupDashboard(page,{large:240});await openDashboard(page,'/?dashboard=1&dashboardDetail=balance&dashboardMetric=open');
 const panel=page.getByRole('region',{name:'Dashboard invoice details'});
 await expect(panel.locator('tbody tr')).toHaveCount(200);
 await panel.getByRole('button',{name:'Sort by Invoice',exact:true}).click();await panel.getByRole('button',{name:'Sort by Invoice',exact:true}).click();
 await expect(panel.locator('tbody tr').first()).toContainText('SYN-239');
 await panel.locator('.dashboard-detail-more').scrollIntoViewIfNeeded();await expect(panel.locator('tbody tr')).toHaveCount(241);
 await expect(panel.getByRole('button',{name:'Next',exact:true})).toHaveCount(0);
});

for(const width of [1440,390])test('Dashboard all records sort across source pages at '+width,async({page})=>{
 await setupDashboard(page,{large:true});await page.setViewportSize({width,height:900});
 await openDashboard(page,'/?dashboard=1&dashboardFrom=2026-09-01&dashboardTo=2026-09-12');
 await page.getByRole('button',{name:'View invoices',exact:true}).click();
 const panel=page.getByRole('region',{name:'Dashboard invoice details'}),rows=panel.locator('tbody tr');
 await expect(rows).toHaveCount(62);await expect(panel.getByRole('button',{name:'Next',exact:true})).toHaveCount(0);
 await panel.getByRole('button',{name:'Sort by Invoice',exact:true}).click();await expect(rows.first()).toContainText('INV-tsk-old');
 await panel.getByRole('button',{name:'Sort by Invoice',exact:true}).click();await expect(rows.first()).toContainText('SYN-60');
 await expect(panel.locator('th[aria-sort="descending"]')).toContainText('Invoice');
 for(const label of ['Account','Hotel','Guest','Entry date','Open · THB','Original','Billing','Due date','Latest Follow-Up'])await panel.getByRole('button',{name:'Sort by '+label,exact:true}).click();
 await panel.scrollIntoViewIfNeeded();await page.screenshot({path:`evidence/dashboard-continuous-sort-${width}.png`});
 expect(await page.locator('.dashboard-page').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
});

for(const width of [1440,390])test('signed Aging has named aligned bars while positive Aging retains its ring at '+width,async({page})=>{
 await setupDashboard(page);await page.setViewportSize({width,height:900});
 const accounts=currentAgingAccounts.map(a=>a.id==='tsk-azure'?{...a,open:999990,agingBuckets:a.agingBuckets!.map((b,i)=>({...b,amount:i===0?1000000:i===1?-10:0,debit:i===0?1000000:0,credit:i===1?-10:0}))}:a);
 await page.route('**/api/portfolio**',r=>r.fulfill({json:{status:'connected',accounts,refresh:{running:false,hotels:['KAT','TSK'].map(hotel=>({hotel,status:'succeeded',last_success_at:'2026-09-12T02:59:00Z'}))}}}));
 await page.route('**/api/dashboard/aging-invoices**',r=>{
  const q=new URL(r.request().url()).searchParams,scoped=accounts.filter(a=>!q.get('hotel')||a.hotel===q.get('hotel'));
  const inventory=scoped.map(a=>{const buckets=a.agingBuckets!.map(b=>({key:JSON.stringify([b.label,b.start,b.end,b.sequence]),count:b.amount===0?0:1,amount:b.amount.toFixed(2),creditAmount:Math.max(0,-b.amount).toFixed(2),complete:true}));return {hotel:a.hotel,accountId:a.id,accountType:a.type,syncedAt:'2026-09-12T02:59:00Z',complete:true,unverified:0,buckets:[...buckets,{key:null,count:buckets.reduce((n,b)=>n+b.count,0),amount:a.open.toFixed(2),creditAmount:buckets.reduce((n,b)=>n+Number(b.creditAmount),0).toFixed(2),complete:true}]};});
  return r.fulfill({json:{asOfDate:'2026-09-12',publications:['KAT','TSK'].map(hotel=>({hotel,sourceAt:'2026-09-12T02:59:00Z'})),accounts:inventory,summary:{complete:true,count:2,amount:'999990.00',creditAmount:'10.00',billing:[],followup:[],due:[],flags:[]},rows:[],total:0,complete:true}});
 });
 await openDashboard(page,'/?dashboard=1&dashboardView=aging&hotel=TSK');
 const overview=page.getByRole('region',{name:'Current aging overview'});
 await expect(overview).toHaveAttribute('data-chart-mode','signed');await expect(overview.locator('.aging-v4-signed-range')).toHaveCount(6);
 await expect(overview).toContainText('−<0.1%');await expect(overview).toContainText('-10.00');
 await overview.getByRole('button',{name:'Compare 31–60 days',exact:true}).click();await expect(overview.getByRole('button',{name:'Compare 31–60 days',exact:true})).toHaveAttribute('aria-pressed','true');
 await overview.scrollIntoViewIfNeeded();await page.screenshot({path:`evidence/aging-signed-readable-${width}.png`});
 expect(await overview.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await page.getByRole('button',{name:'KAT',exact:true}).click();
 // KAT's original synthetic data also contains credits; select a positive account type instead.
 await page.getByLabel('Current Account Type',{exact:true}).selectOption('Corporate');
 await expect(overview).toHaveAttribute('data-chart-mode','distribution');
});
