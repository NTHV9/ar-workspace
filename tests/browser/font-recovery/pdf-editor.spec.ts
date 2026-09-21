import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {reviewPreviewPages} from '../fixtures/pdf-preview';

for(const width of [1440,1280])test(`subset-font Preview error reopens the affected text and offers an explicit replacement at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto('/tests/browser/pdf-editor-harness.html?subset=1');
 await page.getByRole('button',{name:'Edit original text: D12345 - 1',exact:true}).click();
 await page.getByRole('textbox',{name:'Layer text',exact:true}).fill('abcdefgh');
 await page.getByRole('button',{name:'Select page 1',exact:true}).click();
 await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Page 1: choose a replacement font'})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Layer text',exact:true})).toHaveValue('abcdefgh',{timeout:1500});
 await expect(page.getByRole('combobox',{name:'Text font',exact:true})).toBeVisible();
 await expect(page.getByRole('combobox',{name:'Text font',exact:true})).toHaveValue('__source__');
 await expect(page.getByRole('button',{name:'Use Arial for this text',exact:true})).toBeVisible();
 await page.screenshot({path:`.tmp/font-recovery-warning-${width}.png`,fullPage:true});
});

test('explicit replacement font can render the same new characters',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html?subset=1');
 await page.getByRole('button',{name:'Edit original text: D12345 - 1',exact:true}).click();
 await page.getByRole('textbox',{name:'Layer text',exact:true}).fill('abcdefgh');
 await page.getByRole('combobox',{name:'Text font',exact:true}).selectOption('Arial');
 await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Final PDF preview',exact:true})).toBeVisible();
 await expect(page.locator('.pdf-final-sheet')).toHaveAttribute('data-render-state','ready');
});

test('recovery locates another page, is undoable, and preserves reviewed export and source bytes',async({page})=>{
 test.setTimeout(45000);
 await page.goto('/tests/browser/pdf-editor-harness.html?subset=1');await expect(page.getByRole('button',{name:'Select page 1',exact:true})).toBeVisible();
 await page.evaluate(()=>(window as any).pdfTest.makeSubset(2));await page.getByRole('button',{name:'Select page 2',exact:true}).click();
 const before=await page.evaluate(async()=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',(window as any).pdfTest.subsetSources[0].bytes))));
 await page.getByRole('button',{name:'Edit original text: D12345 - 1',exact:true}).click();await page.getByRole('textbox',{name:'Layer text',exact:true}).fill('abcdefgh');
 await page.getByRole('button',{name:'Select page 1',exact:true}).click();await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Page 2: choose a replacement font'})).toBeVisible();await expect(page.locator('.pdf-page-controls')).toContainText('Source page 2 of 2');
 await page.getByRole('button',{name:'Use Arial for this text',exact:true}).click();await expect(page.getByRole('combobox',{name:'Text font',exact:true})).toHaveValue('Arial');await expect(page.getByRole('textbox',{name:'Layer text',exact:true})).toHaveValue('abcdefgh');
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByRole('combobox',{name:'Text font',exact:true})).toHaveValue('__source__');await expect(page.getByRole('button',{name:'Use Arial for this text',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Redo',exact:true}).click();await expect(page.getByRole('combobox',{name:'Text font',exact:true})).toHaveValue('Arial');
 await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();await expect(page.getByRole('button',{name:'Save reviewed PDFs privately',exact:true})).toBeDisabled();
 await reviewPreviewPages(page);await expect(page.getByRole('checkbox')).toHaveCount(0);await page.getByRole('button',{name:'Save reviewed PDFs privately',exact:true}).click();await expect(page.getByRole('button',{name:'Saved',exact:true})).toBeVisible();
 const {rendered,...result}=await page.evaluate(async()=>{
  const f=(window as any).pdfTest,l=f.saved.project.pages[1].layers[0],task=f.getDocument({data:f.saved.files[0].bytes.slice()}),pdf=await task.promise,text=[];
  for(let n=1;n<=pdf.numPages;n++)text.push((await(await pdf.getPage(n)).getTextContent()).items.map((x:any)=>x.str??'').join(' '));
  const outputPage=await pdf.getPage(2),canvas=document.createElement('canvas'),viewport=outputPage.getViewport({scale:1.5});canvas.width=viewport.width;canvas.height=viewport.height;await outputPage.render({canvas,viewport}).promise;const rendered=canvas.toDataURL('image/png').split(',')[1];
  const count=pdf.numPages;await task.destroy();return{rendered,count,text,font:l.font,bold:l.bold,color:l.color,value:l.text,sourceRef:l.sourceText??null,original:l.original.text,sourceHash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',f.subsetSources[0].bytes)))};
 });
 expect(result).toMatchObject({count:2,font:'Arial',bold:true,color:'#000000',value:'abcdefgh',sourceRef:null,original:'D12345 - 1',sourceHash:before});expect(result.text[0]).toContain('D12345 - 1');expect(result.text[1]).toBe('');
 writeFileSync('.tmp/font-recovery-export-page2.png',Buffer.from(rendered,'base64'));
});

test('characters already available in the subset retain the original font',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html?subset=1');await page.getByRole('button',{name:'Edit original text: D12345 - 1',exact:true}).click();await page.getByRole('textbox',{name:'Layer text',exact:true}).fill('D54321 - 1');
 await expect(page.getByRole('combobox',{name:'Text font',exact:true})).toHaveValue('__source__');await expect(page.getByRole('button',{name:'Use Arial for this text',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();await expect(page.getByRole('dialog',{name:'Final PDF preview',exact:true})).toBeVisible();await expect(page.locator('.pdf-final-sheet')).toHaveAttribute('data-render-state','ready');
});
