import {test,expect} from '@playwright/test';
import {setupDashboard} from './fixtures/dashboard-period';
test('same-scope reload retains verified closing totals while pending and on failure',async({page})=>{
 await setupDashboard(page);await page.goto('/?dashboard=1');await expect(page.getByTestId('dashboard-closing-count')).toHaveText('2 invoices');
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 await page.route(/\/api\/dashboard\/(?:balances|hotel-overview)\?/,async route=>{await gate;await route.fulfill({status:503,json:{error:'synthetic_unavailable'}});});
 await page.getByRole('button',{name:'Reload dashboard',exact:true}).click();
 await expect(page.getByTestId('dashboard-closing-count')).toHaveText('2 invoices');
 await expect(page.getByText('Updating dashboard. Showing the last loaded balances.',{exact:true})).toBeVisible();release();
 await expect(page.getByText('Reload failed. Showing the last loaded balances; try again.',{exact:true})).toBeVisible();await expect(page.getByTestId('dashboard-closing-count')).toHaveText('2 invoices');
});
test('changing date or hotel does not retain another scope closing total',async({page})=>{
 await setupDashboard(page);await page.goto('/?dashboard=1');await expect(page.getByTestId('dashboard-closing-count')).toHaveText('2 invoices');
 await page.route(/\/api\/dashboard\/(?:balances|hotel-overview)\?/,route=>route.fulfill({status:503,json:{error:'synthetic_unavailable'}}));
 await page.getByRole('button',{name:'Yesterday',exact:true}).click();await expect(page.getByTestId('dashboard-closing-count')).toHaveText('— invoices');
 await page.getByRole('button',{name:'KAT',exact:true}).click();await expect(page.getByTestId('dashboard-closing-count')).toHaveText('— invoices');
});

test('modern charts retain billing basis and exact details',async({page})=>{
 await setupDashboard(page);
 // Fixed synthetic source rows: one billed required invoice and one unbilled required invoice.
 await page.goto('/?dashboard=1');await expect(page.getByRole('img',{name:'50% of billing-required invoices billed'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Closing-date follow-up stages'}).locator('.dashboard-stage-row').filter({hasText:'Final'})).toContainText('66.7% of open');
 await page.getByRole('button',{name:'View not yet billed',exact:true}).click();await expect(page.getByRole('region',{name:'Dashboard invoice details'})).toContainText('INV-kat-parent');
 await page.getByText('All status counts, amounts & percentages',{exact:true}).click();await expect(page.getByRole('region',{name:'Closing-date status breakdown'})).toContainText('Over 60 days · not billed');
});

for(const status of ['running','failed'] as const)test('verified totals remain readable with '+status+' OPERA freshness',async({page})=>{
 await setupDashboard(page,{freshness:status});await page.goto('/?dashboard=1');await expect(page.getByTestId('dashboard-closing-count')).toHaveText('2 invoices');
 await expect(page.getByText(status==='running'?'KAT refresh in progress. Showing the last verified publication.':'KAT refresh did not finish. Showing the last verified publication; retry the OPERA refresh.',{exact:true})).toBeVisible();
});

test('KPI accessible descriptions expose values and honor a hotel-scoped account',async({page})=>{
 await setupDashboard(page);await page.goto('/?dashboard=1&dashboardAccount='+encodeURIComponent(JSON.stringify(['KAT','kat-azure'])));
 const card=page.getByRole('button',{name:'View invoices',exact:true});await expect(card).toHaveAccessibleDescription(/1 invoices.*100\.00.*Open balance · KAT/);await expect(card).not.toContainText('Both hotels');
});
