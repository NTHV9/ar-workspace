import {test,expect} from '@playwright/test';
import {setupDashboard} from './fixtures/dashboard-period';

for(const width of [1280,390])test('billing status indicators explains real positive inventory and keeps drilldown '+width,async({page})=>{
 const c=await setupDashboard(page,{creditAmount:-20,balanceLift:10000000,overlappingSetup:true});await page.setViewportSize({width,height:width===1280?1000:844});await page.goto('/?dashboard=1');
 await expect(page.getByTestId('dashboard-closing-count')).toHaveText('3 invoices');const graph=page.getByRole('group',{name:'Billing status for 2 positive invoices',exact:true});await expect(graph).toBeVisible();
 const blocks=page.locator('.period-billing-category-track i');await expect(blocks).toHaveCount(4);expect(await blocks.evaluateAll(nodes=>nodes.map(n=>parseFloat((n as HTMLElement).style.width)))).toEqual([50,50,0,100]);
 const primary=page.locator('.dashboard-kpi-card.primary');expect(await primary.locator('.dashboard-kpi strong').evaluate(e=>getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');
 expect(await page.locator('.dashboard-page').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 const clipped=await primary.locator('strong,b,small').evaluateAll(nodes=>nodes.some(el=>{if(!el.getClientRects().length)return false;const range=document.createRange();range.selectNodeContents(el);const r=range.getBoundingClientRect(),box=el.closest('article')!.getBoundingClientRect();return r.left<box.left-1||r.right>box.right+1;}));expect(clipped).toBe(false);
 if(process.env.AR_PERIOD_EMPHASIS_CAPTURE==='1'){await page.screenshot({path:`evidence/period-emphasis-top-${width}.png`,animations:'disabled'});await page.locator('.dashboard-period-balances').screenshot({path:`evidence/period-emphasis-balances-${width}.png`,animations:'disabled'});await page.locator('.dashboard-activity-highlights').screenshot({path:`evidence/period-emphasis-activity-${width}.png`,animations:'disabled'});}
 await page.getByRole('button',{name:/^View not billed invoices in billing status/}).click();const detail=page.getByRole('region',{name:'Dashboard invoice details',exact:true});await expect(detail).toContainText('INV-kat-parent');await expect(detail).not.toContainText('INV-kat-credit');expect(c.errors).toEqual([]);expect(c.unexpected).toEqual([]);
});
test('missing or zero billing populations never display a fabricated percentage',async({page})=>{
 const options={creditOnly:true,creditAmount:-50,missingHistory:false};await setupDashboard(page,options);await page.goto('/?dashboard=1');await expect(page.getByRole('group',{name:'Billing status for 0 positive invoices'})).toBeVisible();await expect(page.locator('.period-billing-category-track i')).toHaveCount(0);await expect(page.locator('.period-billing-category-share')).toHaveText(['—','—','—','—']);
 options.missingHistory=true;await page.getByRole('button',{name:'Yesterday',exact:true}).click();await expect(page.getByRole('group',{name:'Billing status percentages unavailable',exact:true})).toBeVisible();await expect(page.locator('.period-billing-category-track i')).toHaveCount(0);
});
