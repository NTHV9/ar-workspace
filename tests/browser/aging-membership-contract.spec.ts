import {test,expect} from '@playwright/test';
import {openDashboard} from './fixtures/dashboard-period';
import {setupAgingStatus,statusAccounts} from './fixtures/aging-invoice-status';
for(const offsetDays of [0,-1] as const)test('status and amount clicks share resolved membership '+offsetDays,async({page})=>{
 const rawAge=offsetDays===0?120:121;
 await setupAgingStatus(page,{rawAge,offsetDays});await openDashboard(page,'/?dashboard=1&dashboardView=aging');await page.getByLabel('Aging view',{exact:true}).selectOption('accounts');
 await page.getByRole('button',{name:'View invoice statuses for '+statusAccounts[0].name+' · KAT · 91–120',exact:true}).click();
 const popup=page.getByRole('table',{name:'Aging invoice details'});await expect(popup.locator('tbody tr')).toHaveCount(25);
 const firstPage=await popup.locator('tbody tr .aging-breakdown-invoice-link').allTextContents();
 await page.getByRole('button',{name:'Close invoice details'}).click();
 await page.getByRole('button',{name:statusAccounts[0].name+' · KAT · 91–120',exact:true}).click();

 const drill=page.getByRole('table',{name:'Current aging invoices'});await expect(drill.locator('tbody tr')).toHaveCount(30);
 const invoices=await drill.locator('.aging-invoice-link').allTextContents();expect(firstPage.every(no=>invoices.some(v=>v.trim()===no.trim()))).toBe(true);
 await expect(drill.locator('tbody tr').first()).toContainText('91–120');await expect(drill.locator('tbody tr').first()).toContainText('OPERA age '+rawAge);
 await expect(drill).not.toContainText('Accrual');
});
for(const accountPublication of ['missing','stale'] as const)test('amount drill rejects '+accountPublication+' account publication',async({page})=>{
 await setupAgingStatus(page,{accountPublication});await openDashboard(page,'/?dashboard=1&dashboardView=aging');await page.getByLabel('Aging view',{exact:true}).selectOption('accounts');
 await page.getByRole('button',{name:statusAccounts[0].name+' · KAT · 91–120',exact:true}).click();
 await expect(page.locator('.aging-invoice-drill')).toContainText('Invoice data is unavailable');await expect(page.getByRole('table',{name:'Current aging invoices'})).toHaveCount(0);
});

for(const width of [1440,390])test('final source synthetic Aging screenshot '+width,async({page})=>{
 await setupAgingStatus(page,{rawAge:121,offsetDays:-1});await page.setViewportSize({width,height:width===1440?900:844});await openDashboard(page,'/?dashboard=1&dashboardView=aging');
 const table=page.getByRole('table',{name:'Current source aging comparison'});await expect(table).toContainText('3,000.00');
 await page.screenshot({path:'.tmp/aging-membership-final-'+width+'.png',fullPage:true,animations:'disabled'});
});
