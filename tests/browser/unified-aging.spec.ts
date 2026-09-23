import {test,expect} from '@playwright/test';
import {setupDashboard} from './fixtures/dashboard-period';
import {currentAgingAccounts} from './fixtures/current-aging';

for(const width of [1280,390])test(`unified Aging retains its layout and adds portfolio controls ${width}`,async({page})=>{
 const c=await setupDashboard(page);await page.setViewportSize({width,height:900});
 await page.goto('/?dashboard=1&dashboardView=aging');
 await expect(page.getByRole('heading',{name:'Aging',exact:true})).toBeVisible();
 const nav=page.getByRole('navigation',{name:'Main navigation'});
 await expect(nav.getByRole('button',{name:'Portfolio',exact:true})).toHaveCount(0);
 await expect(nav.getByRole('button',{name:'Aging',exact:true})).toHaveClass('active');
 await page.getByRole('combobox',{name:'Aging view',exact:true}).selectOption('accounts');
 const table=page.getByRole('table',{name:'Current source aging comparison',exact:true});
 await expect(table.locator('tbody[data-aging-group]')).toHaveCount(3);
 await expect(table).toContainText('Cedar');await expect(table).toContainText('Birch');
 await page.getByRole('searchbox',{name:'Search current aging',exact:true}).fill('Azure');
 await expect(table.locator('tbody[data-aging-group]')).toHaveCount(1);
 await page.getByText('Columns',{exact:true}).click();
 await page.getByRole('checkbox',{name:'Debit / credit',exact:true}).check();
 await page.getByText('Columns',{exact:true}).click();
 await expect(table).toContainText('Credit 20.00');
 await page.screenshot({path:`evidence/aging-clean-${width}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(table.getByRole('button',{name:'Open KAT account Azure Travel · Synthetic',exact:true})).toHaveText('KAT');
 await expect(page.getByRole('navigation',{name:'Dashboard views'})).toHaveCount(0);
 await table.getByRole('button',{name:'Open KAT account Azure Travel · Synthetic',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Azure Travel · Synthetic',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Back to aging',exact:true}).click();
 await expect(page.getByRole('searchbox',{name:'Search current aging',exact:true})).toHaveValue('Azure');
 await expect(table).toContainText('Credit 20.00');expect(c.errors).toEqual([]);
});

test('legacy Portfolio bookmarks use Aging with search and exposure and Dashboard stays separate',async({page})=>{
 await setupDashboard(page);
 await page.route('**/api/portfolio',r=>r.fulfill({json:{status:'connected',accounts:currentAgingAccounts.map(a=>({...a,over90:a.name.includes('Azure')?100:0})),refresh:{running:false,hotels:[]}}}));
 await page.goto('/?portfolio=1&search=Azure&aging=over90');
 await expect(page.getByRole('heading',{name:'Aging',exact:true})).toBeVisible();
 await expect(page.getByRole('combobox',{name:'Aging exposure',exact:true})).toHaveValue('over90');
 await expect(page.getByRole('searchbox',{name:'Search current aging',exact:true})).toHaveValue('Azure');
 await expect(page.getByRole('table',{name:'Current source aging comparison'}).locator('tbody[data-aging-group]')).toHaveCount(1);
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Dashboard',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Dashboard views',exact:true})).toHaveCount(0);
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Aging',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Aging',exact:true})).toBeVisible();
});
