import {test,expect} from '@playwright/test';
import {setupDashboard} from './fixtures/dashboard-period';
for(const width of [1280,390])test(`account name opens all ages and returns to the same list position ${width}`,async({page})=>{
 await setupDashboard(page);await page.setViewportSize({width,height:850});await page.goto('/?dashboard=1&dashboardView=aging');
 await page.getByRole('combobox',{name:'Aging view',exact:true}).selectOption('accounts');
 const name=page.getByRole('table',{name:'Current source aging comparison'}).getByRole('button',{name:'Open invoices for Azure Travel · Synthetic',exact:true});
 await name.scrollIntoViewIfNeeded();const before=await name.boundingBox();await name.click();
 await expect(page.getByRole('combobox',{name:'Invoice aging bucket',exact:true})).toHaveValue('all');
 const invoices=page.getByRole('table',{name:'Current aging invoices'});
 await expect(invoices).toContainText('INV-kat-parent');await expect(invoices).toContainText('INV-kat-old');await expect(invoices).toContainText('INV-tsk-old');
 await expect(invoices).not.toContainText('INV-kat-child');
 await expect(page.locator('.aging-reconciliation')).toHaveCount(0);
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 const back=page.getByRole('button',{name:'Back to all accounts',exact:true});await expect(back).toBeInViewport();
 expect(await invoices.locator('tbody td').first().evaluate(e=>parseFloat(getComputedStyle(e).paddingLeft))).toBeGreaterThanOrEqual(20);
 await page.screenshot({path:`evidence/aging-account-return-${width}.png`,fullPage:false});
 await back.click();await expect(page.getByRole('combobox',{name:'Aging view',exact:true})).toHaveValue('accounts');
 await expect(name).toBeFocused();expect(Math.abs((await name.boundingBox())!.y-before!.y)).toBeLessThan(4);
 // Clicking a specific amount still deliberately opens that age range.
 await page.getByRole('button',{name:'Azure Travel · Synthetic · TSK · 151+',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Invoice aging bucket',exact:true})).not.toHaveValue('all');
 await expect(invoices).toContainText('INV-tsk-old');await expect(invoices).not.toContainText('INV-kat-parent');
});
