import {test,expect} from '@playwright/test';
import {setupRegional} from './fixtures/hotel-regions';
const regions={phuket:['KAT','TSK'],'khao-lak':['TLKL','WAKL','TLFO','TSAN']};
const matrices=['Closing balances by hotel','Activity by hotel','Payment amounts by hotel','Billing status by hotel','Latest Follow-Up by hotel'];
for(const [region,hotels] of Object.entries(regions))for(const width of [1280,390])test(`Period comparisons have room for ${region} at ${width}`,async({page})=>{
 const c=await setupRegional(page);await page.setViewportSize({width,height:1000});await page.goto('/?dashboard=1&region='+region);
 await expect(page.getByTestId('metric-open-'+hotels[0])).toBeVisible();
 if(process.env.AR_PERIOD_BEFORE==='1'){await page.screenshot({path:`.tmp/period-before-${region}-${width}.png`,fullPage:true});}
 for(const name of matrices){const table=page.getByRole('table',{name,exact:true});await expect(table).toBeVisible();await expect(table.locator('tbody tr[data-hotel]')).toHaveCount(hotels.length);}
 await expect(page.locator('.dashboard-kpi-card .hotel-split,.dashboard-activity-highlights>article .hotel-split')).toHaveCount(0);
 const first=page.getByTestId('metric-open-'+hotels[0]);await expect(first).toContainText(region==='phuket'?'600.00':'1,800.00');
 expect(c.regionalCalls.some(r=>['/api/dashboard/balances','/api/reports/activity','/api/financial/payments'].includes(r.path))).toBe(false);
 const before=c.regionalCalls.filter(r=>r.path==='/api/dashboard/hotel-overview').length;
 await page.getByRole('button',{name:'Reload dashboard',exact:true}).click();await expect.poll(()=>c.regionalCalls.filter(r=>r.path==='/api/dashboard/hotel-overview').length).toBe(before+1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 if(width===1280)for(const name of matrices){const table=page.getByRole('table',{name,exact:true});expect(await table.evaluate(e=>e.scrollWidth<=e.parentElement!.clientWidth+1)).toBe(true);}
 await page.screenshot({path:`.tmp/period-roomier-top-${region}-${width}.png`});
 await page.getByRole('region',{name:'Activity in selected period',exact:true}).screenshot({path:`.tmp/period-roomier-activity-${region}-${width}.png`});
 await page.getByRole('region',{name:'Closing-date billing and follow-up details',exact:true}).screenshot({path:`.tmp/period-roomier-work-${region}-${width}.png`});
 await first.click();await expect(page).toHaveURL(new RegExp('dashboardDetailHotel='+hotels[0]));await expect.poll(()=>c.regionalCalls.some(r=>r.path==='/api/dashboard/balances'&&r.query.get('hotel')===hotels[0])).toBe(true);expect(c.errors).toEqual([]);
});
