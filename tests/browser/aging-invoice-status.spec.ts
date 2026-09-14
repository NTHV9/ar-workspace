import {test,expect} from '@playwright/test';
import {setupAgingStatus,statusBucket,statusRows} from './fixtures/aging-invoice-status';
const entry='/?dashboard=1&dashboardView=aging';
const countLabel='View invoice statuses for Agent · KAT · 91–120';
for(const width of [1440,1280,390])test('Aging retains current full-width layout and adds scoped invoice counts '+width,async({page})=>{
 const c=await setupAgingStatus(page);await page.setViewportSize({width,height:width===390?844:900});await page.goto(entry);
 const table=page.getByRole('table',{name:'Current source aging comparison'}),count=table.getByRole('button',{name:countLabel,exact:true});
 await expect(count).toHaveText('30 invoices');await expect(table.getByRole('button',{name:countLabel.replace('KAT','TSK'),exact:true})).toHaveText('2 invoices');await expect(table.getByRole('button',{name:countLabel.replace('KAT','Total'),exact:true})).toHaveText('32 invoices');
 for(const range of ['0–30','31–60','61–90','91–120','121–150','151+','Net open'])await expect(table).toContainText(range);
 expect(await table.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 if(width>1000){await expect(table.locator('thead th').last()).toContainText('Net open');await expect(table.locator('.aging-row-hotel')).toHaveText(['KAT','TSK','Total']);}else await expect(table.locator('thead th')).toHaveText(['Range · THB','KAT','TSK','Total']);
 const overview=page.getByRole('region',{name:'Current aging overview'});await expect(overview.getByLabel('Total open invoice count')).toHaveText('32 open invoices');await expect(overview.getByLabel('KAT open invoice count')).toHaveText('30 invoices');await expect(overview.getByLabel('TSK open invoice count')).toHaveText('2 invoices');if(process.env.AR_AGING_OVERVIEW_CAPTURE==='1')await overview.screenshot({path:`evidence/aging-overview-counts-${width}.png`,animations:'disabled'});
 const before=await table.boundingBox();await count.click();const panel=page.locator('.aging-invoice-breakdown');await expect(panel).toBeVisible();await expect(panel.locator('.aging-breakdown-total')).toContainText('30 open invoices');await expect(panel.locator('.aging-breakdown-total')).toContainText('3,000.00');
 const after=await table.boundingBox();expect(after!.width).toBeCloseTo(before!.width,0);expect(await panel.evaluate(e=>getComputedStyle(e).position)).not.toBe('fixed');
 await expect(panel.getByRole('table',{name:'Aging invoice details'}).locator('tbody tr')).toHaveCount(25);await panel.getByRole('button',{name:'Next',exact:true}).click();await expect(panel.locator('tbody tr')).toHaveCount(5);await expect(panel).toContainText('26–30 of 30');
 expect(c.queries.some(q=>q.get('hotel')==='KAT'&&q.get('type')==='Agent'&&q.get('bucket')===statusBucket&&q.get('page')==='1')).toBe(true);
 if(process.env.AR_AGING_STATUS_CAPTURE==='1')await page.screenshot({path:`evidence/aging-invoice-status-${width}.png`,fullPage:true,animations:'disabled'});
 await panel.getByRole('button',{name:'Close invoice details'}).click();await expect(panel).toHaveCount(0);await expect(count).toBeFocused();expect(c.errors).toEqual([]);expect(c.unexpected).toEqual([]);
});
test('Billing, latest Follow-Up and Due date independently filter the same positive roots',async({page})=>{
 const c=await setupAgingStatus(page);await page.goto(entry);await page.getByRole('button',{name:countLabel,exact:true}).click();const panel=page.locator('.aging-invoice-breakdown');
 await panel.locator('.aging-breakdown-facet').filter({has:page.getByText('Billed',{exact:true})}).click();await expect(panel.locator('tbody tr')).toHaveCount(8);
 await panel.getByRole('button',{name:'Latest Follow-Up',exact:true}).click();await panel.locator('.aging-breakdown-facet').filter({has:page.getByText('Follow-Up 2',{exact:true})}).click();await expect(panel.locator('tbody tr')).toHaveCount(statusRows.filter(r=>r.hotel==='KAT'&&r.latestStage==='Follow 2').length);await expect(panel.locator('.aging-breakdown-total')).toContainText('3,000.00');
 await panel.getByLabel('Needs attention').selectOption('held');await expect(panel.locator('tbody tr')).toHaveCount(statusRows.filter(r=>r.hotel==='KAT'&&r.latestStage==='Follow 2'&&r.held).length);
 await panel.getByLabel('Needs attention').selectOption('');await panel.getByRole('button',{name:'Due date',exact:true}).click();await panel.locator('.aging-breakdown-facet').filter({has:page.getByText('Past Due date',{exact:true})}).click();await expect(panel.locator('tbody tr')).toHaveCount(statusRows.filter(r=>r.hotel==='KAT'&&r.dueStatus==='past_due').length);
 await panel.getByLabel('Needs attention').selectOption('needs_review');await expect(panel.locator('tbody tr')).toHaveCount(statusRows.filter(r=>r.hotel==='KAT'&&r.dueStatus==='past_due'&&r.needsReview).length);expect(c.errors).toEqual([]);expect(c.unexpected).toEqual([]);
});
test('publication mismatch and failed reads hide unverified counts and recover by retry',async({page})=>{
 const c=await setupAgingStatus(page);c.setMode('mismatch');await page.goto(entry);const count=page.getByRole('button',{name:countLabel,exact:true});await expect(count).toHaveText('— invoices');await expect(page.getByLabel('Total open invoice count')).toHaveText('— open invoices');await count.click();const panel=page.locator('.aging-invoice-breakdown');await expect(panel).toContainText('do not match the current date or saved OPERA publication');await expect(panel.locator('tbody tr')).toHaveCount(0);
 c.setMode('error');await panel.getByRole('button',{name:'Reload invoices',exact:true}).click();await expect(panel).toContainText('could not be loaded');
 c.setMode('ready');await panel.getByRole('button',{name:'Reload invoices',exact:true}).click();await expect(panel.locator('.aging-breakdown-total')).toContainText('30 open invoices');await expect(panel.locator('tbody tr')).toHaveCount(25);expect(c.errors).toEqual([]);expect(c.unexpected).toEqual([]);
});
test('account status scope stays hotel-specific and original amount drill remains available',async({page})=>{
 const c=await setupAgingStatus(page);await page.goto(entry);const table=page.getByRole('table',{name:'Current source aging comparison'});await table.getByRole('button',{name:'Open accounts in Agent',exact:true}).click();await table.getByRole('button',{name:'View invoice statuses for Azure Travel · Synthetic · TSK · 91–120',exact:true}).click();const panel=page.locator('.aging-invoice-breakdown');await expect(panel.locator('tbody tr')).toHaveCount(2);expect(c.queries.some(q=>q.get('tskAccount')==='tsk-azure'&&q.get('hotel')==='TSK'&&!q.has('katAccount'))).toBe(true);
 await panel.getByRole('button',{name:'Latest Follow-Up',exact:true}).click();await panel.locator('.aging-breakdown-facet').filter({has:page.getByText('Follow-Up 1',{exact:true})}).click();await expect(panel.locator('tbody tr')).toHaveCount(1);
 await panel.getByRole('button',{name:'Open invoice STATUS-30 · TSK',exact:true}).click();await expect(page).toHaveURL(/account=tsk-azure/);await expect(page).toHaveURL(/property=TSK/);
 await page.goBack();await expect(page.getByRole('table',{name:'Current source aging comparison'})).toBeVisible();await expect(panel.getByRole('button',{name:'Latest Follow-Up',exact:true})).toHaveAttribute('aria-pressed','true');await expect(panel.locator('.aging-breakdown-facet').filter({has:page.getByText('Follow-Up 1',{exact:true})})).toHaveAttribute('aria-pressed','true');await expect(panel.locator('tbody tr')).toHaveCount(1);
 await page.getByRole('table',{name:'Current source aging comparison'}).getByRole('button',{name:'Azure Travel · Synthetic · KAT · 91–120',exact:true}).click();await expect(page.getByRole('table',{name:'Current aging invoices'})).toContainText('STATUS-0');expect(c.errors).toEqual([]);expect(c.unexpected).toEqual([]);
});

test('overview counts follow the Hotel and search scope without another source request',async({page})=>{
 const c=await setupAgingStatus(page);await page.goto(entry);await expect(page.getByLabel('Total open invoice count')).toHaveText('32 open invoices');
 await page.getByRole('button',{name:'KAT',exact:true}).click();await expect(page.getByLabel('Total open invoice count')).toHaveText('30 open invoices');await expect(page.getByLabel('KAT open invoice count')).toHaveText('30 invoices');await expect(page.getByLabel('TSK open invoice count')).toHaveCount(0);
 const before=c.queries.length;await page.getByLabel('Search current aging').fill('no-synthetic-match');await expect(page.getByLabel('Total open invoice count')).toHaveText('— open invoices');await page.getByLabel('Search current aging').fill('Agent');await expect(page.getByLabel('Total open invoice count')).toHaveText('30 open invoices');expect(c.queries.length).toBe(before);
});
