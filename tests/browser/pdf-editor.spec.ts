import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
test('source replacement exports opaque pages and preserves untouched multi-page invoices',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');
 await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Edit source text',exact:true}).click();
 await page.getByRole('button',{name:'Edit original text: CONFIDENTIAL ORIGINAL WORDING',exact:true}).click();
 await page.getByRole('textbox',{name:'Layer text',exact:true}).fill('REPLACED FOR OUTBOUND COPY');
 await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();
 await expect(page.locator('.pdf-final-pages canvas')).toHaveCount(4);
 await expect(page.getByRole('img',{name:'Final PDF page 1',exact:true})).toBeVisible();
 mkdirSync('evidence',{recursive:true});await page.getByRole('dialog',{name:'Final PDF preview'}).screenshot({path:'evidence/pdf-editor-final-preview.png'});
 await expect(page.getByRole('button',{name:'Save reviewed PDFs privately'})).toBeDisabled();
 await page.getByRole('checkbox').check();
 await page.getByRole('button',{name:'Save reviewed PDFs privately'}).click();
 await expect(page.getByRole('button',{name:'Saved',exact:true})).toBeVisible();
 await page.evaluate(async()=>{const api=(window as any).pdfTest;const task=api.getDocument({data:api.saved.files[0].bytes.slice()});const pdf=await task.promise;const p=await pdf.getPage(1);const canvas=document.createElement('canvas');const viewport=p.getViewport({scale:1.25});canvas.width=viewport.width;canvas.height=viewport.height;await p.render({canvas,viewport}).promise;canvas.id='export-proof';canvas.style.cssText='position:fixed;inset:0;z-index:9999;background:white';document.body.appendChild(canvas);await task.destroy();});
 mkdirSync('evidence',{recursive:true});await page.locator('#export-proof').screenshot({path:'evidence/pdf-editor-edited-export.png'});
 const result=await page.evaluate(async()=>{const api=(window as any).pdfTest;const saved=api.saved;const task=api.getDocument({data:saved.files[0].bytes.slice()});const pdf=await task.promise;const content=[];for(let n=1;n<=pdf.numPages;n++){const p=await pdf.getPage(n);content.push((await p.getTextContent()).items.map((i:any)=>i.str||'').join(' '));}await task.destroy();return{count:pdf.numPages,text:content,edits:saved.project.pages[0].layers.length};});
 expect(result.count).toBe(4);expect(result.edits).toBe(1);expect(result.text[0]).toBe('');expect(result.text[1]).toContain('CONFIDENTIAL ORIGINAL WORDING');expect(result.text[2]).toContain('Page 2 of 2');
});
test('whiteout removes visible source pixels, while text, shapes, image and page edits survive export',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();
 const result=await page.evaluate(async()=>{
  const api=(window as any).pdfTest;const loaded=await api.loadSources(api.sources);const first=loaded.project.pages[0];
  const common={x:40,y:135,width:360,height:30,text:'',color:'#173a62',fill:'#ffffff',font:'Arial',fontSize:14,bold:false,italic:false};
  first.layers=[{...common,id:'mask',kind:'whiteout'},{...common,id:'shape',kind:'shape',y:200,fill:'#ff0000',width:50,height:50},{...common,id:'text',kind:'text',y:270,text:'Visible replacement'}];
  const imageCanvas=document.createElement('canvas');imageCanvas.width=10;imageCanvas.height=10;const ctx=imageCanvas.getContext('2d')!;ctx.fillStyle='#0000ff';ctx.fillRect(0,0,10,10);first.layers.push({...common,id:'image',kind:'image',x:150,y:200,width:50,height:50,image:imageCanvas.toDataURL()});
  loaded.project.content='statement';const files=await api.exportProject(loaded.project,api.sources,loaded.documents);const task=api.getDocument({data:files[0].bytes.slice()});const pdf=await task.promise;const p=await pdf.getPage(1);const canvas=document.createElement('canvas');const viewport=p.getViewport({scale:1});canvas.width=viewport.width;canvas.height=viewport.height;await p.render({canvas,viewport}).promise;const context=canvas.getContext('2d')!;const mask=context.getImageData(42,140,310,20).data;const red=Array.from(context.getImageData(65,220,1,1).data);const blue=Array.from(context.getImageData(170,220,1,1).data);const text=(await p.getTextContent()).items.length;await task.destroy();loaded.dispose();return{white:Array.from(mask).every((v:any)=>v===255),red,blue,text};
 });
 expect(result.white).toBe(true);expect(result.red).toEqual([255,0,0,255]);expect(result.blue).toEqual([0,0,255,255]);expect(result.text).toBe(0);
});
test('page operations undo and separate delivery require review of each file',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Add blank page'}).click();await expect(page.getByRole('button',{name:'Select page 5',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByRole('button',{name:'Select page 5',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Statement + each Invoice',exact:true}).click();await page.getByRole('button',{name:'Open mandatory Preview'}).click();await expect(page.getByRole('checkbox')).toBeDisabled();
 await expect(page.getByRole('button',{name:'Save reviewed PDFs privately'})).toBeDisabled();await expect(page.getByRole('button',{name:'01-Statement.pdf'})).toHaveAttribute('data-reviewed','true');await page.getByRole('button',{name:'02-Invoice-A.pdf'}).click();await expect(page.getByRole('button',{name:'02-Invoice-A.pdf'})).toHaveAttribute('data-reviewed','true');await page.getByRole('button',{name:'03-Invoice-B.pdf'}).click();await expect(page.getByRole('button',{name:'03-Invoice-B.pdf'})).toHaveAttribute('data-reviewed','true');await page.getByRole('checkbox').check();await expect(page.getByRole('button',{name:'Save reviewed PDFs privately'})).toBeEnabled();
});
test('workspace matches approved three-column layout at desktop and laptop',async({page})=>{
 mkdirSync('evidence',{recursive:true});for(const width of [1440,1100]){await page.setViewportSize({width,height:900});await page.goto('/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();await page.waitForFunction(()=>document.querySelectorAll('.pdf-canvas canvas').length===5);await page.screenshot({path:`evidence/pdf-editor-${width}.png`});expect(await page.locator('.pdf-workspace').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);}
});
test('late export cannot reopen a preview after a newer edit',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();
 await page.evaluate(()=>{const api=(window as any).pdfTest;const create=api.PDFDocument.create;api.PDFDocument.create=()=>new Promise(resolve=>{api.releaseExport=()=>{api.PDFDocument.create=create;resolve(create.call(api.PDFDocument));};});});
 await page.getByRole('button',{name:'Open mandatory Preview'}).click();await page.waitForFunction(()=>(window as any).pdfTest.releaseExport);
 await page.getByRole('button',{name:'Note',exact:true}).click();await page.getByRole('textbox',{name:'Layer text'}).fill('NEWER EDIT');await page.evaluate(()=>(window as any).pdfTest.releaseExport());
 await expect(page.getByRole('button',{name:'Open mandatory Preview'})).toBeEnabled();await expect(page.getByRole('dialog',{name:'Final PDF preview'})).toHaveCount(0);await expect(page.getByRole('textbox',{name:'Layer text'})).toHaveValue('NEWER EDIT');
});
test('late image upload cannot restore a stale project',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();
 await page.evaluate(()=>{const Native=window.FileReader;window.FileReader=class extends Native {readAsDataURL(file:Blob){(window as any).pdfTest.releaseImage=()=>super.readAsDataURL(file);}};});
 await page.getByLabel('Add image',{exact:true}).setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMZkAAAAASUVORK5CYII=','base64')});
 await page.getByRole('button',{name:'Note',exact:true}).click();await page.evaluate(()=>(window as any).pdfTest.releaseImage());
 await expect(page.getByRole('alert')).toContainText('Image selection interrupted');await expect(page.getByRole('button',{name:'Move note layer'})).toHaveCount(1);await expect(page.getByRole('button',{name:'Move image layer'})).toHaveCount(0);
});
test('saved edit project reopens with matching source bytes',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Text box',exact:true}).click();await page.getByRole('textbox',{name:'Layer text'}).fill('RECOVERED NOTE');await page.getByRole('button',{name:'Open mandatory Preview'}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Save reviewed PDFs privately'}).click();await expect(page.getByRole('button',{name:'Saved',exact:true})).toBeVisible();
 await page.evaluate(()=>{const api=(window as any).pdfTest;api.mount(JSON.parse(JSON.stringify(api.saved.project)));});await expect(page.getByRole('button',{name:'Move text layer'})).toBeVisible();await page.getByRole('button',{name:'Move text layer'}).click();await expect(page.getByRole('textbox',{name:'Layer text'})).toHaveValue('RECOVERED NOTE');
});
test('late source export and save completion do not mark newer work reviewed or saved',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();
 await page.evaluate(()=>{const api=(window as any).pdfTest;const create=api.PDFDocument.create;api.PDFDocument.create=()=>new Promise(resolve=>{api.releaseExport=()=>{api.PDFDocument.create=create;resolve(create.call(api.PDFDocument));};});});
 await page.getByRole('button',{name:'Open mandatory Preview'}).click();await page.waitForFunction(()=>(window as any).pdfTest.releaseExport);await page.evaluate(()=>{const api=(window as any).pdfTest;api.mount(undefined,[...api.sources]);});await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();await page.evaluate(()=>(window as any).pdfTest.releaseExport());await expect(page.getByRole('button',{name:'Open mandatory Preview'})).toBeEnabled();await expect(page.getByRole('dialog',{name:'Final PDF preview'})).toHaveCount(0);
 await page.evaluate(()=>{const api=(window as any).pdfTest;api.saveWait=new Promise(resolve=>api.releaseSave=resolve);});await page.getByRole('button',{name:'Open mandatory Preview'}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Save reviewed PDFs privately'}).click();await page.getByRole('button',{name:'Close final preview'}).click();await page.getByRole('button',{name:'Note',exact:true}).click();await page.evaluate(()=>(window as any).pdfTest.releaseSave());await expect(page.getByRole('button',{name:'Open mandatory Preview'})).toBeEnabled();await expect(page.getByRole('status')).toHaveCount(0);await expect(page.getByRole('button',{name:'Move note layer'})).toHaveCount(1);
});
test('failed final exported PDF rendering cannot be acknowledged or saved',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();
 await page.evaluate(async()=>{const api=(window as any).pdfTest;const result=await api.loadSources(api.sources);const prototype=Object.getPrototypeOf(result.documents.get('Statement'));result.dispose();prototype.getPage=()=>Promise.reject(new Error('Synthetic render failure'));});
 await page.getByRole('button',{name:'Open mandatory Preview'}).click();await expect(page.getByRole('alert')).toContainText('Final PDF could not be rendered');await expect(page.getByRole('checkbox')).toBeDisabled();await expect(page.getByRole('button',{name:'Save reviewed PDFs privately'})).toBeDisabled();await expect(page.locator('.pdf-final-pages canvas')).toHaveCount(0);
});
test('draft save needs no final preview and dirty close offers explicit choices',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Note',exact:true}).click();await page.getByRole('textbox',{name:'Layer text'}).fill('DRAFT ONLY');await page.getByRole('button',{name:'Close PDF Workspace',exact:true}).click();
 await expect(page.getByRole('alertdialog',{name:'Unsaved PDF changes'})).toBeVisible();expect(await page.evaluate(()=>(window as any).pdfTest.closed)).toBeUndefined();await page.getByRole('button',{name:'Keep editing',exact:true}).click();
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toContainText('Draft saved. Final review is still required.');await expect(page.getByRole('dialog',{name:'Final PDF preview'})).toHaveCount(0);
 expect(await page.evaluate(()=>({text:(window as any).pdfTest.draft.pages[0].layers[0].text,final:(window as any).pdfTest.saved}))).toEqual({text:'DRAFT ONLY',final:null});await page.getByRole('button',{name:'Close PDF Workspace',exact:true}).click();expect(await page.evaluate(()=>(window as any).pdfTest.closed)).toBe(true);
});
test('stale draft completion does not mark newer edits saved or close the workspace',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();await page.getByRole('button',{name:'Note',exact:true}).click();
 await page.evaluate(()=>{const api=(window as any).pdfTest;api.draftWait=new Promise(resolve=>api.releaseDraft=resolve);});await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('textbox',{name:'Layer text'}).fill('NEWER UNSAVED EDIT');await page.evaluate(()=>(window as any).pdfTest.releaseDraft());
 await expect(page.getByRole('button',{name:'Save draft',exact:true})).toBeEnabled();await expect(page.getByRole('status')).toHaveCount(0);await page.getByRole('button',{name:'Close PDF Workspace',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();expect(await page.evaluate(()=>(window as any).pdfTest.closed)).toBeUndefined();await page.getByRole('button',{name:'Discard changes and close'}).click();expect(await page.evaluate(()=>(window as any).pdfTest.closed)).toBe(true);
});
test('save draft and close waits for confirmed persistence',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();await page.getByRole('button',{name:'Note',exact:true}).click();await page.getByRole('button',{name:'Close PDF Workspace',exact:true}).click();
 await page.evaluate(()=>{const api=(window as any).pdfTest;api.draftWait=new Promise(resolve=>api.releaseDraft=resolve);});await page.getByRole('button',{name:'Save draft and close'}).click();await expect(page.getByRole('heading',{name:'Save in progress'})).toBeVisible();expect(await page.evaluate(()=>(window as any).pdfTest.closed)).toBeUndefined();await page.evaluate(()=>(window as any).pdfTest.releaseDraft());await expect(page.getByRole('alertdialog')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).pdfTest.closed)).toBe(true);
});
