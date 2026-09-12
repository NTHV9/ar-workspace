import {test,expect} from '@playwright/test';
import {setupDashboard} from './fixtures/dashboard-period';
for(const width of [1440,1280,390])test('deployed Aging shows every range without horizontal scrolling '+width,async({page})=>{
 const c=await setupDashboard(page);await page.setViewportSize({width,height:width===1440?900:width===1280?800:844});await page.goto('/?dashboard=1&dashboardView=aging');
 const table=page.getByRole('table',{name:'Current source aging comparison'});for(const range of ['0–30','31–60','61–90','91–120','121–150','151+'])await expect(table).toContainText(range);await expect(table.locator('tbody[data-aging-group]')).toHaveCount(2);
 expect(await table.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);expect(await page.locator('.dashboard-page').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);await page.screenshot({path:'evidence/aging-all-app-'+width+'.png',fullPage:true,animations:'disabled'});
 await table.getByRole('button',{name:'Agent · TSK · 151+',exact:true}).click();await table.getByRole('button',{name:'Azure Travel · Synthetic · TSK · 151+',exact:true}).click();const invoices=page.getByRole('table',{name:'Current aging invoices'});await expect(invoices).toContainText('INV-tsk-old');await expect(invoices).not.toContainText('INV-kat-parent');await expect(table).toContainText('0–30');await expect(page.getByRole('button',{name:'Compare 151+ days',exact:true})).toHaveAttribute('aria-pressed','true');expect(c.errors).toEqual([]);expect(c.unexpected).toEqual([]);
});
