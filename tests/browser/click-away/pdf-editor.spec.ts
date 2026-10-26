import {test,expect} from '@playwright/test';

const inline=(page:import('@playwright/test').Page)=>page.getByRole('textbox',{name:'Edit document text',exact:true});

test('blank paper ends source-text editing, preserves the changed value and allows reopening',async({page})=>{
 await page.goto('/tests/browser/voucher-field/harness.html?filled=1');
 await page.getByRole('button',{name:'Edit original text: 87654321',exact:true}).click();
 await inline(page).fill('12345678');
 await expect(page.locator('.pdf-layer-target.selected')).toHaveCount(1);
 await page.locator('.pdf-paper').screenshot({path:'.tmp/pdf-click-away-before.png'});
 await page.locator('.pdf-paper').click({position:{x:8,y:8}});
 await expect(inline(page)).toHaveCount(0);
 await expect(page.locator('.pdf-layer-target.selected')).toHaveCount(0);
 await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');
 await page.locator('.pdf-paper').screenshot({path:'.tmp/pdf-click-away-after.png'});
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).fixture.draft.pages[0].layers.find((l:any)=>l.formField?.type==='voucher-number').text)).toBe('12345678');
 await page.locator('.pdf-layer-target .pdf-layer-move').click();
 await expect(inline(page)).toHaveValue('12345678');
 await expect(page.locator('.pdf-layer-target.selected')).toHaveCount(1);
});

test('blank workspace ends a new text box while preserving its saved PDF content',async({page})=>{
 await page.goto('/tests/browser/voucher-field/harness.html');
 await page.getByText('Add objects',{exact:true}).click();
 await page.getByRole('button',{name:'Text box',exact:true}).click();
 await inline(page).fill('Keep this added text');
 await page.locator('.pdf-page-scroll').click({position:{x:4,y:80}});
 await expect(inline(page)).toHaveCount(0);
 await expect(page.locator('.pdf-layer-target.selected')).toHaveCount(0);
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 const proof=await page.evaluate(async()=>{const f=(window as any).fixture,l=await f.loadSources(f.sources);try{const files=await f.exportProject(f.draft,f.sources,l.documents),task=f.getDocument({data:files[0].bytes});try{const doc=await task.promise;return {text:f.draft.pages[0].layers.find((l:any)=>l.kind==='text').text,pages:doc.numPages};}finally{await task.destroy();}}finally{l.dispose();}});
 expect(proof).toEqual({text:'Keep this added text',pages:1});
 await page.locator('.pdf-layer-target .pdf-layer-move').click();
 await expect(inline(page)).toHaveValue('Keep this added text');
});

test('format controls and another source target retain normal editing behavior',async({page})=>{
 await page.goto('/tests/browser/voucher-field/harness.html?filled=1');
 await page.getByRole('button',{name:'Edit original text: 87654321',exact:true}).click();
 await inline(page).fill('12345678');
 await inline(page).click();
 await expect(inline(page)).toHaveValue('12345678');
 await page.getByRole('combobox',{name:'Text font',exact:true}).selectOption('Arial');
 await expect(inline(page)).toHaveValue('12345678');
 await expect(page.locator('.pdf-layer-target.selected')).toHaveCount(1);
 await page.getByRole('button',{name:'Edit original text: UNCHANGED BODY',exact:true}).click();
 await expect(inline(page)).toHaveValue('UNCHANGED BODY');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).fixture.draft.pages[0].layers.some((l:any)=>l.text==='12345678'))).toBe(true);
});
