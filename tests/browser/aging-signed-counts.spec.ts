import {test,expect} from '@playwright/test';
import {setupAgingStatus} from './fixtures/aging-invoice-status';
const entry='/?dashboard=1&dashboardView=aging';
for(const width of [1280,390])test('signed Aging counts include credits in totals, ranges and detail '+width,async({page})=>{
 const c=await setupAgingStatus(page,{credits:'mixed'});await page.setViewportSize({width,height:900});await page.goto(entry);
 await expect(page.getByLabel('Total open invoice count')).toHaveText('34 open invoices');await expect(page.getByLabel('KAT open invoice count')).toHaveText('31 invoices');await expect(page.getByLabel('TSK open invoice count')).toHaveText('3 invoices');
 await page.getByRole('button',{name:'View invoice statuses for Agent · Total · 91–120',exact:true}).click();const panel=page.locator('.aging-invoice-breakdown');
 await expect(panel.locator('.aging-breakdown-total')).toContainText('34 open invoices');await expect(panel.locator('.aging-breakdown-total')).toContainText('3,050.00');
 for(const dimension of ['Billing','Latest Follow-Up','Due date']){
  await panel.getByRole('button',{name:dimension,exact:true}).click();const credit=panel.locator('.aging-breakdown-facet').filter({has:page.getByText('Credit',{exact:true})});await expect(credit).toContainText('2 invoices');await expect(credit).toContainText('-฿150.00');await credit.click();await expect(panel.locator('tbody tr')).toHaveCount(2);await expect(panel.getByRole('table')).toContainText('CREDIT-KAT');await expect(panel.getByRole('table')).toContainText('CREDIT-TSK');
 }
 if(process.env.AR_AGING_SIGNED_CAPTURE==='1')await panel.screenshot({path:`evidence/aging-signed-counts-${width}.png`,animations:'disabled'});
 expect(c.errors).toEqual([]);expect(c.unexpected).toEqual([]);
});
for(const mode of ['only','zero'] as const)test('signed Aging preserves counts for '+mode+' net balances',async({page})=>{
 await setupAgingStatus(page,{credits:mode});await page.goto(entry);await expect(page.getByLabel('Total open invoice count')).toHaveText('2 open invoices');await page.getByRole('button',{name:'View invoice statuses for Agent · Total · All ages',exact:true}).click();const panel=page.locator('.aging-invoice-breakdown');await expect(panel.locator('.aging-breakdown-total')).toContainText('2 open invoices');await expect(panel.locator('.aging-breakdown-total')).toContainText(mode==='only'?'-฿150.00':'0.00');await expect(panel).not.toContainText('NaN');await expect(panel).not.toContainText('Infinity');
});
