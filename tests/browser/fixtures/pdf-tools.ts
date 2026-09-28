import type {Page} from '@playwright/test';
export async function choosePdfTool(page:Page,name:string){
 const button=page.getByRole('button',{name,exact:true,includeHidden:true});
 if(!await button.isVisible()){const menu=page.locator('details.pdf-tool-group').filter({has:button});await menu.locator('summary').click();}
 await button.click();
}
