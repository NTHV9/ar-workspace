import {expect,type Page} from '@playwright/test';

export async function reviewPreviewPages(page:Page){
 const preview=page.getByRole('dialog',{name:'Final PDF preview',exact:true});
 const files=preview.locator('.pdf-preview-files button');
 await expect(preview).toBeVisible();await expect(files.first()).toBeVisible();
 for(let file=0;file<await files.count();file++){
  await files.nth(file).click();await expect(preview.locator('.pdf-final-sheet')).toHaveAttribute('data-render-state','ready');
  const select=preview.getByRole('combobox',{name:'PDF page',exact:true});const count=await select.locator('option').count();
  for(let index=0;index<count;index++){
   await select.selectOption({value:String(index)});
   await expect(preview.getByRole('img',{name:`Final PDF page ${index+1}`,exact:true})).toBeVisible();
   await expect(preview.locator('.pdf-final-sheet')).toHaveAttribute('data-render-state','ready');
  }
 }
 await expect(preview.getByRole('checkbox'),JSON.stringify(await preview.locator('.pdf-final-viewer').evaluate(e=>({index:e.getAttribute('data-page-index'),viewed:e.getAttribute('data-viewed'),count:e.getAttribute('data-count'),state:e.querySelector('.pdf-final-sheet')?.getAttribute('data-render-state')})))).toBeEnabled();
}
