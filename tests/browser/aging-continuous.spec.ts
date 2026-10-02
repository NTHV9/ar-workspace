import {test,expect} from '@playwright/test';
import {currentAgingManyAccounts} from './fixtures/current-aging';
test('all Aging accounts are searchable and sortable without pagination and return to their row',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({json:{invoices:[]}}));
 await page.goto('/tests/browser/current-aging-harness.html?large=1');
 await page.getByLabel('Aging view',{exact:true}).selectOption('accounts');
 const table=page.getByRole('table',{name:'Current source aging comparison'}),rows=table.locator('tbody[data-aging-group]');
 await expect(rows).toHaveCount(new Set(currentAgingManyAccounts.map(a=>a.account_no)).size);
 await expect(page.getByRole('button',{name:'Next',exact:true})).toHaveCount(0);
 await page.getByLabel('Search current aging').fill('Extra');await expect(rows).toHaveCount(63);
 const target=table.locator('.aging-row-link').filter({hasText:'Extra 01'});await target.scrollIntoViewIfNeeded();const top=await target.evaluate(e=>e.getBoundingClientRect().top);
 await target.click();await page.getByRole('button',{name:'Back to all accounts',exact:true}).first().click();
 await expect(rows).toHaveCount(63);await expect(target).toBeFocused();expect(Math.abs(await target.evaluate(e=>e.getBoundingClientRect().top)-top)).toBeLessThan(3);
 await table.getByRole('button',{name:/^Matched Account/}).click();await expect(rows.first()).toContainText('Extra 63');
 await table.getByRole('button',{name:/^Matched Account/}).click();await expect(rows.first()).toContainText('Extra 01');
});
