import {test,expect} from '@playwright/test';
import {setupAgingStatus} from './fixtures/aging-invoice-status';

for(const width of [1440,1280,390])test(`Aging detail columns align and names retain insets at ${width}`,async({page})=>{
 const controls=await setupAgingStatus(page,{longNames:true});await page.setViewportSize({width,height:width===390?844:900});
 await page.goto('/?dashboard=1&dashboardView=aging');await page.getByRole('button',{name:'View invoice statuses for Agent · KAT · 91–120',exact:true}).click();
 const panel=page.locator('.aging-invoice-breakdown'),table=panel.getByRole('table',{name:'Aging invoice details'});await expect(table.locator('tbody tr')).toHaveCount(25);
 const layout=await table.evaluate(table=>{
  const heads=[...table.querySelectorAll('thead th')],cells=[...table.querySelectorAll('tbody tr:first-child td')];
  return {header:heads.map(c=>getComputedStyle(c).textAlign),body:cells.map(c=>getComputedStyle(c).textAlign),firstHeadInset:parseFloat(getComputedStyle(heads[0]).paddingLeft),firstCellInset:parseFloat(getComputedStyle(cells[0]).paddingLeft),lastInset:parseFloat(getComputedStyle(cells.at(-1)!).paddingRight),clipped:cells.some(c=>c.scrollWidth>c.clientWidth+1)};
 });
 expect(layout.header).toEqual(['left','left','center','right','left','left','left','left']);expect(layout.body).toEqual(layout.header);
 expect(layout.firstHeadInset).toBeGreaterThanOrEqual(16);expect(layout.firstCellInset).toBe(layout.firstHeadInset);expect(layout.lastInset).toBeGreaterThanOrEqual(16);expect(layout.clipped).toBe(false);
 expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 await expect(table.locator('tbody tr').first()).toContainText('Synthetic International Travel and Hospitality Services Company Limited');
 if(process.env.AR_AGING_LAYOUT_CAPTURE==='1')await panel.screenshot({path:`evidence/aging-details-refined-${width}.png`,animations:'disabled'});
 await panel.getByRole('button',{name:'Next',exact:true}).click();await expect(table.locator('tbody tr')).toHaveCount(5);await panel.getByRole('button',{name:'Previous',exact:true}).click();
 await panel.getByRole('button',{name:'Open invoice STATUS-0 · KAT',exact:true}).click();await expect(page.getByRole('button',{name:'Transaction date',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Bill date',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Transaction date',exact:true}).click();await expect(page.locator('.ledger th[aria-sort="ascending"]')).toContainText('Transaction date');
 if(process.env.AR_AGING_LAYOUT_CAPTURE==='1'&&width>1000){await page.locator('.ledger-panel').evaluate(e=>window.scrollTo(0,Math.max(0,e.getBoundingClientRect().top+window.scrollY-100)));await page.screenshot({path:`evidence/account-transaction-date-${width}.png`,animations:'disabled'});}
 expect(controls.errors).toEqual([]);expect(controls.unexpected).toEqual([]);
});
