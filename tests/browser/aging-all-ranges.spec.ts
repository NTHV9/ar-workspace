import {test,expect} from '@playwright/test';
const local='http://127.0.0.1:5191/tests/browser/current-aging-harness.html?visual=1';
for(const width of [1440,1280,390])test('all source ranges fit without horizontal scrolling at '+width,async({page})=>{
 await page.setViewportSize({width,height:width===1440?900:800});await page.goto(local);
 const table=page.getByRole('table',{name:'Current source aging comparison'});await expect(table).toContainText('151+');
 for(const range of ['0–30','31–60','61–90','91–120','121–150','151+'])await expect(table).toContainText(range);
 expect(await table.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 if(width>=1280)expect(await table.locator('strong').evaluateAll(elements=>elements.every(e=>e.scrollWidth<=e.clientWidth+1&&e.getBoundingClientRect().height<=parseFloat(getComputedStyle(e).lineHeight)+1))).toBe(true);
 await page.screenshot({path:'evidence/aging-all-ranges-'+width+'.png',fullPage:true,animations:'disabled'});expect(await page.locator('.current-aging').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
});

test('narrow all-range view can sort by property, measure and direction',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(local);
 await page.getByLabel('Sort hotel',{exact:true}).selectOption('KAT');await page.getByLabel('Sort measure',{exact:true}).selectOption({label:'61–90 days'});await page.getByRole('button',{name:'Toggle sort direction',exact:true}).click();
 const table=page.getByRole('table',{name:'Current source aging comparison'});await expect(table.locator('tbody[data-aging-group]').first().getByRole('button',{name:/Open accounts/})).toHaveText('Corporate');await expect(table).toContainText('151+');expect(await table.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
});
