import {test,expect} from '@playwright/test';

test('Add row below is discoverable in the right panel before and after selecting a row',async({page})=>{
 await page.goto('/tests/browser/editor-resilience/harness.html');
 await expect(page.getByRole('button',{name:'Edit original text: City Ledger',exact:true})).toBeVisible();
 const add=page.locator('.pdf-review').getByRole('button',{name:'Add row below',exact:true});
 await expect(add).toBeVisible({timeout:1500});
 await expect(add).toBeDisabled();
 await expect(page.locator('.pdf-review')).toContainText('Select text in the row you want to change.');
 await page.getByRole('button',{name:'Edit original text: City Ledger',exact:true}).click();
 await expect(add).toBeEnabled();await add.click();
 await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(5);
 await expect(add).toBeEnabled();
 await page.getByRole('textbox',{name:'Edit document text',exact:true}).press('Escape');
 await expect(add).toBeVisible();await expect(add).toBeDisabled();
 await expect(page.getByRole('button',{name:'Add row below',exact:true})).toHaveCount(1);
});
