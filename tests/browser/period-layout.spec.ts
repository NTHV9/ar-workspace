import {test,expect} from '@playwright/test';
import {setupDashboard} from './fixtures/dashboard-period';

for(const width of [1280,390])test('period reading order and comparisons remain clear '+width,async({page})=>{
 const c=await setupDashboard(page,{balanceLift:10000000,creditAmount:-20,longStageLabel:'Final notice with additional account review'});
 await page.setViewportSize({width,height:width===1280?900:844});await page.goto('/?dashboard=1');
 await expect(page.getByTestId('dashboard-closing-count')).toHaveText('3 invoices');await expect(page.getByTestId('activity-invoice_entries-KAT')).toBeVisible();
 const closing=page.getByRole('region',{name:'Outstanding at period end',exact:true}),activity=page.getByRole('region',{name:'Activity in selected period',exact:true}),work=page.getByRole('region',{name:'Closing-date billing and follow-up details',exact:true});
 expect((await closing.boundingBox())!.y).toBeLessThan((await activity.boundingBox())!.y);expect((await activity.boundingBox())!.y).toBeLessThan((await work.boundingBox())!.y);
 await expect(work.getByRole('heading',{level:2})).toContainText('2026-09-12');await expect(activity).toHaveCount(1);await expect(page.getByRole('button',{name:'Refresh OPERA for this period',exact:true})).toHaveCount(1);
 expect(await page.locator('.dashboard-page').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 const clipped=await page.locator('.period-hotel-matrix .hotel-split b').evaluateAll(nodes=>nodes.some(node=>{const cell=node.closest('td')!.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(node);const text=range.getBoundingClientRect();return text.left<cell.left-1||text.right>cell.right+1||text.bottom>cell.bottom+1;}));expect(clipped).toBe(false);
 if(width===390){const rows=await page.locator('.dashboard-activity-table tbody tr').evaluateAll(nodes=>nodes.map(node=>({bottom:node.getBoundingClientRect().bottom,contentBottom:Math.max(...[...node.children].map(el=>{const r=document.createRange();r.selectNodeContents(el);return r.getBoundingClientRect().bottom;})),heading:node.querySelector('th')!.getBoundingClientRect().bottom,values:[...node.querySelectorAll('td')].map(td=>td.getBoundingClientRect().top)})));expect(rows.every(r=>r.contentBottom<=r.bottom+1&&r.values.every(top=>top>=r.heading)),JSON.stringify(rows)).toBe(true);}
 if(process.env.AR_PERIOD_LAYOUT_CAPTURE==='1'){
  await page.screenshot({path:`evidence/period-analysis-v2-top-${width}.png`,animations:'disabled'});
  await activity.screenshot({path:`evidence/period-analysis-v2-activity-${width}.png`,animations:'disabled'});
  await page.locator('.dashboard-activity-table').screenshot({path:`evidence/period-analysis-v2-table-${width}.png`,animations:'disabled'});
  await work.screenshot({path:`evidence/period-analysis-v2-work-${width}.png`,animations:'disabled'});
 }
 await page.getByTestId('activity-invoice_entries-TSK').click();await expect(page.getByRole('region',{name:'Dashboard invoice details'})).toContainText('TSK');
 expect(c.errors).toEqual([]);expect(c.unexpected).toEqual([]);
});

test('reloading the new composition keeps a single overview reader',async({page,baseURL})=>{
 const options={missingHistory:false},c=await setupDashboard(page,options);await page.goto('/?dashboard=1');await expect(page.getByTestId('activity-invoice_entries-KAT')).toBeVisible();
 // Activity controls render before the independent closing overview arrives.
 // Establish its completed initial read before counting a user-triggered reload.
 await expect(page.getByTestId('dashboard-closing-count')).toHaveText('2 invoices');
 // Development StrictMode replays mounting effects (also reproduced on the unchanged base).
 // Production still makes exactly one initial read; a manual reload adds one in either mode.
 if(baseURL?.startsWith('http://127.0.0.1'))expect(c.calls.filter(r=>r.path==='/api/dashboard/hotel-overview').length).toBeGreaterThan(0);
 else await expect.poll(()=>c.calls.filter(r=>r.path==='/api/dashboard/hotel-overview').length).toBe(1);
 const before=c.calls.filter(r=>r.path==='/api/dashboard/hotel-overview').length;
 await page.getByRole('button',{name:'Reload dashboard',exact:true}).click();await expect.poll(()=>c.calls.filter(r=>r.path==='/api/dashboard/hotel-overview').length).toBe(before+1);
 expect(c.calls.some(r=>r.path==='/api/financial/payments'||r.path==='/api/reports/activity'||r.path==='/api/dashboard/balances')).toBe(false);
 options.missingHistory=true;await page.getByRole('button',{name:'Yesterday',exact:true}).click();await expect(page.getByTestId('dashboard-closing-count')).toHaveText('— invoices');await expect(page.getByTestId('dashboard-invoice_entries-count')).toHaveText('7');
 await expect(page.getByRole('button',{name:'Yesterday',exact:true})).toHaveAttribute('aria-pressed','true');
});
