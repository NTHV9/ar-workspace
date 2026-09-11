import {reviewPreviewPages} from './fixtures/pdf-preview';
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test('editor and final preview render at device resolution when zoomed',async({browser,baseURL})=>{
 test.setTimeout(60000);const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});const page=await context.newPage();
 try{
  await page.goto(baseURL+'/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible({timeout:30000});
  await page.getByLabel('Zoom',{exact:true}).selectOption('150');
  const sharp=async(selector:string)=>page.locator(selector).evaluate((c:HTMLCanvasElement)=>c.width>=c.getBoundingClientRect().width*devicePixelRatio-2);
  await expect.poll(()=>sharp('.pdf-paper canvas'),{timeout:2000}).toBe(true);
  await page.getByRole('button',{name:'Open mandatory Preview'}).click();await expect(page.getByRole('combobox',{name:'PDF page',exact:true}).locator('option')).toHaveCount(4);
  await expect.poll(()=>sharp('.pdf-final-sheet canvas:first-child'),{timeout:2000}).toBe(true);
  await page.getByLabel('Preview zoom').selectOption('200');await expect.poll(()=>sharp('.pdf-final-sheet canvas:first-child')).toBe(true);
  await page.locator('.pdf-final-sheet canvas').last().scrollIntoViewIfNeeded();await expect.poll(()=>sharp('.pdf-final-sheet canvas:last-child')).toBe(true);
 }finally{await context.close();}
});
test('oversized geometry cannot create an unreopenable saved draft',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Note',exact:true}).click();await page.getByText('Position & size',{exact:true}).click();const before=await page.getByRole('spinbutton',{name:'Layer x',exact:true}).inputValue();
 await page.getByRole('spinbutton',{name:'Layer x',exact:true}).fill('999999');await expect(page.getByRole('alert')).toContainText('was not applied');await expect(page.getByRole('spinbutton',{name:'Layer x',exact:true})).toHaveValue(before);
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toContainText('Draft saved');expect(await page.evaluate(()=>(window as any).pdfTest.draft.pages[0].layers[0].x)).toBe(Number(before));
});
test('source replacement exports opaque pages and preserves untouched multi-page invoices',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');
 await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Edit source text',exact:true}).click();
 await page.getByRole('button',{name:'Edit original text: CONFIDENTIAL ORIGINAL WORDING',exact:true}).click();
 await page.getByRole('textbox',{name:'Layer text',exact:true}).fill('REPLACED FOR OUTBOUND COPY');
 await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'PDF page',exact:true}).locator('option')).toHaveCount(4);
 await expect(page.getByRole('img',{name:'Final PDF page 1',exact:true})).toBeVisible();
 mkdirSync('evidence',{recursive:true});await page.getByRole('dialog',{name:'Final PDF preview'}).screenshot({path:'evidence/pdf-editor-final-preview.png'});
 await expect(page.getByRole('button',{name:'Save reviewed PDFs privately'})).toBeDisabled();
 await reviewPreviewPages(page);await page.getByRole('checkbox').check();
 await page.getByRole('button',{name:'Save reviewed PDFs privately'}).click();
 await expect(page.getByRole('button',{name:'Saved',exact:true})).toBeVisible();
 await page.evaluate(async()=>{const api=(window as any).pdfTest;const task=api.getDocument({data:api.saved.files[0].bytes.slice()});const pdf=await task.promise;const p=await pdf.getPage(1);const canvas=document.createElement('canvas');const viewport=p.getViewport({scale:1.25});canvas.width=viewport.width;canvas.height=viewport.height;await p.render({canvas,viewport}).promise;canvas.id='export-proof';canvas.style.cssText='position:fixed;inset:0;z-index:9999;background:white';document.body.appendChild(canvas);await task.destroy();});
 mkdirSync('evidence',{recursive:true});await page.locator('#export-proof').screenshot({path:'evidence/pdf-editor-edited-export.png'});
 const result=await page.evaluate(async()=>{const api=(window as any).pdfTest;const saved=api.saved;const task=api.getDocument({data:saved.files[0].bytes.slice()});const pdf=await task.promise;const content=[];for(let n=1;n<=pdf.numPages;n++){const p=await pdf.getPage(n);content.push((await p.getTextContent()).items.map((i:any)=>i.str||'').join(' '));}await task.destroy();return{count:pdf.numPages,text:content,edits:saved.project.pages[0].layers.length};});
 expect(result.count).toBe(4);expect(result.edits).toBe(1);expect(result.text[0]).toBe('');expect(result.text[1]).toContain('CONFIDENTIAL ORIGINAL WORDING');expect(result.text[2]).toContain('Page 2 of 2');
 const rasterWidths=await page.evaluate(async()=>{const api=(window as any).pdfTest,doc=await api.PDFDocument.load(api.saved.files[0].bytes);const objects=doc.getPage(0).node.Resources().lookup(api.PDFName.of('XObject'));return objects.entries().map(([,ref]:any)=>doc.context.lookup(ref).dict.get(api.PDFName.of('Width')).asNumber());});
 expect(Math.max(...rasterWidths)).toBeGreaterThanOrEqual(2480);

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
 await expect(page.getByRole('button',{name:'Save reviewed PDFs privately'})).toBeDisabled();await expect(page.getByRole('button',{name:'01-Statement.pdf'})).toHaveAttribute('data-reviewed','true');await page.getByRole('button',{name:'02-Invoice-A.pdf'}).click();await expect(page.getByRole('button',{name:'02-Invoice-A.pdf'})).toHaveAttribute('data-reviewed','false');await page.getByRole('button',{name:'03-Invoice-B.pdf'}).click();await expect(page.getByRole('button',{name:'03-Invoice-B.pdf'})).toHaveAttribute('data-reviewed','true');await reviewPreviewPages(page);await page.getByRole('checkbox').check();await expect(page.getByRole('button',{name:'Save reviewed PDFs privately'})).toBeEnabled();
});
test('workspace matches approved three-column layout at desktop and laptop',async({page})=>{
 mkdirSync('evidence',{recursive:true});for(const width of [1440,1100]){await page.setViewportSize({width,height:900});await page.goto('/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();await page.waitForFunction(()=>document.querySelectorAll('.pdf-canvas canvas').length===5);await page.screenshot({path:`evidence/pdf-editor-${width}.png`});expect(await page.locator('.pdf-workspace').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);}
});
test('export in flight locks edits until its exact preview is ready',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();
 await page.evaluate(()=>{const api=(window as any).pdfTest;const create=api.PDFDocument.create;api.PDFDocument.create=()=>new Promise(resolve=>{api.releaseExport=()=>{api.PDFDocument.create=create;resolve(create.call(api.PDFDocument));};});});
 await page.getByRole('button',{name:'Open mandatory Preview'}).click();await page.waitForFunction(()=>(window as any).pdfTest.releaseExport);
 await expect(page.locator('.pdf-layout')).toHaveAttribute('inert','');await page.evaluate(()=>(window as any).pdfTest.releaseExport());
 await expect(page.getByRole('dialog',{name:'Final PDF preview'})).toBeVisible();await expect(page.getByRole('button',{name:'Save reviewed PDFs privately'})).toBeDisabled();
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
 await page.getByRole('button',{name:'Text box',exact:true}).click();await page.getByRole('textbox',{name:'Layer text'}).fill('RECOVERED NOTE');await page.getByRole('button',{name:'Open mandatory Preview'}).click();await reviewPreviewPages(page);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Save reviewed PDFs privately'}).click();await expect(page.getByRole('button',{name:'Saved',exact:true})).toBeVisible();
 await page.evaluate(()=>{const api=(window as any).pdfTest;api.mount(JSON.parse(JSON.stringify(api.saved.project)));});await expect(page.getByRole('button',{name:'Move text layer'})).toBeVisible();await page.getByRole('button',{name:'Move text layer'}).click();await expect(page.getByRole('textbox',{name:'Layer text'})).toHaveValue('RECOVERED NOTE');
});
test('late source export and save completion do not mark newer work reviewed or saved',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();
 await page.evaluate(()=>{const api=(window as any).pdfTest;const create=api.PDFDocument.create;api.PDFDocument.create=()=>new Promise(resolve=>{api.releaseExport=()=>{api.PDFDocument.create=create;resolve(create.call(api.PDFDocument));};});});
 await page.getByRole('button',{name:'Open mandatory Preview'}).click();await page.waitForFunction(()=>(window as any).pdfTest.releaseExport);await page.evaluate(()=>{const api=(window as any).pdfTest;api.mount(undefined,[...api.sources]);});await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();await page.evaluate(()=>(window as any).pdfTest.releaseExport());await expect(page.getByRole('button',{name:'Open mandatory Preview'})).toBeEnabled();await expect(page.getByRole('dialog',{name:'Final PDF preview'})).toHaveCount(0);
 await page.evaluate(()=>{const api=(window as any).pdfTest;api.saveWait=new Promise(resolve=>api.releaseSave=resolve);});await page.getByRole('button',{name:'Open mandatory Preview'}).click();await reviewPreviewPages(page);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Save reviewed PDFs privately'}).click();await expect(page.getByRole('button',{name:'Close final preview'})).toBeDisabled();await expect(page.locator('.pdf-layout')).toHaveAttribute('inert','');await page.evaluate(()=>(window as any).pdfTest.releaseSave());await expect(page.getByRole('button',{name:'Saved',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close final preview'}).click();await expect(page.getByRole('button',{name:'Move note layer'})).toHaveCount(0);
});
test('failed final exported PDF rendering cannot be acknowledged or saved',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();
 await page.evaluate(async()=>{const api=(window as any).pdfTest;const result=await api.loadSources(api.sources);const prototype=Object.getPrototypeOf(result.documents.get('Statement'));result.dispose();prototype.getPage=()=>Promise.reject(new Error('Synthetic render failure'));});
 await page.getByRole('button',{name:'Open mandatory Preview'}).click();await expect(page.getByRole('alert')).toContainText('This PDF could not be opened');await expect(page.getByRole('checkbox')).toBeDisabled();await expect(page.getByRole('button',{name:'Save reviewed PDFs privately'})).toBeDisabled();await expect(page.locator('.pdf-final-sheet canvas')).toHaveCount(0);
});
test('draft save needs no final preview and dirty close offers explicit choices',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Note',exact:true}).click();await page.getByRole('textbox',{name:'Layer text'}).fill('DRAFT ONLY');await page.getByRole('button',{name:'Close PDF Workspace',exact:true}).click();
 await expect(page.getByRole('alertdialog',{name:'Unsaved PDF changes'})).toBeVisible();expect(await page.evaluate(()=>(window as any).pdfTest.closed)).toBeUndefined();await page.getByRole('button',{name:'Keep editing',exact:true}).click();
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toContainText('Draft saved. Final review is still required.');await expect(page.getByRole('dialog',{name:'Final PDF preview'})).toHaveCount(0);
 expect(await page.evaluate(()=>({text:(window as any).pdfTest.draft.pages[0].layers[0].text,final:(window as any).pdfTest.saved}))).toEqual({text:'DRAFT ONLY',final:null});await page.getByRole('button',{name:'Close PDF Workspace',exact:true}).click();expect(await page.evaluate(()=>(window as any).pdfTest.closed)).toBe(true);
});
test('a pending draft preserves the current edit and keeps the workspace open',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();await page.getByRole('button',{name:'Note',exact:true}).click();
 await page.evaluate(()=>{const api=(window as any).pdfTest;api.draftWait=new Promise(resolve=>api.releaseDraft=resolve);});await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await expect(page.locator('.pdf-layout')).toHaveAttribute('inert','');await page.evaluate(()=>(window as any).pdfTest.releaseDraft());
 await expect(page.getByRole('status')).toContainText('Draft saved');await expect(page.getByRole('textbox',{name:'Layer text'})).toHaveValue('Note');expect(await page.evaluate(()=>(window as any).pdfTest.closed)).toBeUndefined();await page.getByRole('button',{name:'Close PDF Workspace',exact:true}).click();expect(await page.evaluate(()=>(window as any).pdfTest.closed)).toBe(true);
});
test('save draft and close waits for confirmed persistence',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();await page.getByRole('button',{name:'Note',exact:true}).click();await page.getByRole('button',{name:'Close PDF Workspace',exact:true}).click();
 await page.evaluate(()=>{const api=(window as any).pdfTest;api.draftWait=new Promise(resolve=>api.releaseDraft=resolve);});await page.getByRole('button',{name:'Save draft and close'}).click();await expect(page.getByRole('heading',{name:'Save in progress'})).toBeVisible();expect(await page.evaluate(()=>(window as any).pdfTest.closed)).toBeUndefined();await page.evaluate(()=>(window as any).pdfTest.releaseDraft());await expect(page.getByRole('alertdialog')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).pdfTest.closed)).toBe(true);
});

test('direct source editing keeps source formatting and adds/removes text lines',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');
 const target=page.getByRole('button',{name:'Edit original text: CONFIDENTIAL ORIGINAL WORDING',exact:true});
 await expect(target).toBeVisible({timeout:3000});await target.click();
 const text=page.getByRole('textbox',{name:'Edit document text',exact:true});await expect(text).toBeFocused();
 await expect(page.getByRole('spinbutton',{name:'Font size',exact:true})).toHaveValue('13');await expect(page.getByLabel('Text color',{exact:true})).toHaveValue('#000000');
 await text.fill('First line');await text.press('End');await page.getByRole('button',{name:'Add text line',exact:true}).click();await text.pressSequentially('Second line');
 await expect(text).toHaveValue('First line\nSecond line');await page.getByText('Position & size',{exact:true}).click();await expect(page.getByRole('spinbutton',{name:'Layer height',exact:true})).not.toHaveValue('15');
 await page.getByRole('button',{name:'Remove text line',exact:true}).click();await expect(text).toHaveValue('First line');
 await page.getByRole('button',{name:'Bold',exact:true}).click();await expect(page.getByRole('button',{name:'Bold',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Restore original formatting',exact:true}).click();await expect(page.getByRole('button',{name:'Bold',exact:true})).toHaveAttribute('aria-pressed','false');await expect(text).toHaveValue('First line');
 await expect(page.locator('.pdf-differences')).toContainText('Page 1');
});

test('table row insertion creates editable cells, deletion reflows, and Undo restores the page',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await page.getByRole('button',{name:'Edit original text: SYNTHETIC ROW A',exact:true}).click();
 await page.getByRole('button',{name:'Add row below',exact:true}).click();await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(3);
 await page.locator('.pdf-layer-target.empty-cell .pdf-layer-move').nth(1).click();await page.getByRole('textbox',{name:'Layer text',exact:true}).fill('ADDED ROW');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();let snapshot=await page.evaluate(()=>(window as any).pdfTest.draft.pages[0]);
 expect(snapshot.rowEdits).toHaveLength(1);expect(snapshot.rowEdits[0].kind).toBe('insert');expect(snapshot.layers.some((l:any)=>l.text==='ADDED ROW'&&l.maskOriginal===false)).toBe(true);
 await page.getByRole('button',{name:'Delete row',exact:true}).click();await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(0);await page.getByRole('button',{name:'Save draft',exact:true}).click();snapshot=await page.evaluate(()=>(window as any).pdfTest.draft.pages[0]);expect(snapshot.rowEdits.map((e:any)=>e.kind)).toEqual(['insert','delete']);expect(snapshot.layers.some((l:any)=>l.text==='ADDED ROW')).toBe(false);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(2);await expect(page.locator('.pdf-differences')).toContainText('ADDED ROW');
});

test('native line and a selected table area can be dragged with exact page edits',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await expect(page.getByRole('button',{name:'Select page 4',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Move lines',exact:true}).click();const line=page.locator('.pdf-native-line').first();await expect(line).toBeVisible();let box=(await line.boundingBox())!;
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2+15,{steps:5});await page.mouse.up();
 await expect(page.locator('.pdf-differences')).toContainText('Moved line / area');await page.getByRole('button',{name:'Save draft',exact:true}).click();let snapshot=await page.evaluate(()=>(window as any).pdfTest.draft.pages[0]);expect(snapshot.rowEdits).toHaveLength(1);expect(snapshot.rowEdits[0].kind).toBe('move');expect(snapshot.rowEdits[0].dx).toBeGreaterThan(10);
 await page.getByRole('button',{name:'Move table / area',exact:true}).click();box=(await page.locator('.pdf-paper').boundingBox())!;const x=(n:number)=>box.x+n/595*box.width,y=(n:number)=>box.y+n/842*box.height;
 await page.mouse.move(x(38),y(280));await page.mouse.down();await page.mouse.move(x(553),y(370),{steps:8});await page.mouse.up();const selection=page.getByRole('button',{name:'Move selected table or area',exact:true});await expect(selection).toBeVisible();
 const selected=(await selection.boundingBox())!;await page.mouse.move(selected.x+selected.width/2,selected.y+selected.height/2);await page.mouse.down();await page.mouse.move(selected.x+selected.width/2,selected.y+selected.height/2+20,{steps:5});await page.mouse.up();
 await page.getByRole('button',{name:'Save draft',exact:true}).click();snapshot=await page.evaluate(()=>(window as any).pdfTest.draft.pages[0]);expect(snapshot.rowEdits).toHaveLength(2);expect(snapshot.rowEdits[1].width).toBeGreaterThan(500);expect(snapshot.rowEdits[1].dy).toBeGreaterThan(10);await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByRole('button',{name:'Move selected table or area',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Redo',exact:true}).click();await expect(page.getByRole('button',{name:'Move selected table or area',exact:true})).toHaveCount(0);
});

test('deleting a multiline row keeps the following row intact and pulls it up',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await page.getByRole('button',{name:'Edit original text: SYNTHETIC ROW A',exact:true}).click();await page.getByRole('textbox',{name:'Edit document text',exact:true}).fill('SYNTHETIC ROW A\nSYNTHETIC ROW A');
 const next=page.getByRole('button',{name:'Edit original text: SYNTHETIC ROW B',exact:true}),before=(await next.boundingBox())!.y;
 await page.getByRole('button',{name:'Delete row',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(next).toBeVisible();expect((await next.boundingBox())!.y).toBeLessThan(before);
 await page.getByRole('button',{name:'Save draft',exact:true}).click();const p=await page.evaluate(()=>(window as any).pdfTest.draft.pages[0]);expect(p.rowEdits.map((r:any)=>r.kind)).toEqual(['insert','delete']);expect(p.layers.some((l:any)=>l.text.includes('SYNTHETIC ROW A'))).toBe(false);
});

test('inserted cells retain row controls and clone all columns after a font change',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await page.getByRole('button',{name:'Edit original text: SYNTHETIC ROW A',exact:true}).click();await page.getByRole('button',{name:'Add row below',exact:true}).click();
 await page.locator('.pdf-layer-target.empty-cell .pdf-layer-move').nth(1).click();await page.getByRole('combobox',{name:'Text font',exact:true}).selectOption('Arial');await expect(page.getByRole('button',{name:'Add row below',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Add row below',exact:true}).click();await page.getByRole('button',{name:'Save draft',exact:true}).click();const p=await page.evaluate(()=>(window as any).pdfTest.draft.pages[0]);
 const rowIds=[...new Set(p.layers.map((l:any)=>l.tableRow).filter(Boolean))];expect(rowIds).toHaveLength(2);for(const id of rowIds)expect(p.layers.filter((l:any)=>l.tableRow===id)).toHaveLength(3);expect(p.layers.filter((l:any)=>l.tableRow===rowIds[1]&&l.kind==='text')).toHaveLength(1);
});



test('a page with only a native move exports its moved pixels without hidden source text',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await page.waitForFunction(()=>(window as any).pdfTest);
 const proof=await page.evaluate(async()=>{const api=(window as any).pdfTest,result=await api.loadSources(api.sources);try{const p=result.project.pages[0];p.rowEdits=[{id:'move',kind:'move',x:38,y:195,width:516,height:12,dx:0,dy:20}];const before=document.createElement('canvas'),after=document.createElement('canvas');await api.renderPage({...p,rowEdits:[]},result.documents,before,1);await api.renderPage(p,result.documents,after,1);const ink=(c:HTMLCanvasElement,y:number)=>{const pixels=c.getContext('2d')!.getImageData(40,y,510,5).data;let n=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<240||pixels[i+1]<240||pixels[i+2]<240)n++;return n;};const files=await api.exportProject(result.project,api.sources,result.documents),task=api.getDocument({data:files[0].bytes.slice()}),pdf=await task.promise;const text=(await (await pdf.getPage(1)).getTextContent()).items.map((x:any)=>x.str??'').join('');await task.destroy();return {before:ink(before,200),old:ink(after,200),moved:ink(after,220),text};}finally{result.dispose();}});
 expect(proof.before).toBeGreaterThan(100);expect(proof.old).toBe(0);expect(proof.moved).toBeGreaterThan(100);expect(proof.text).toBe('');
});

test('Preview defaults to a complete page and requires visiting every output sheet',async({page})=>{
 await page.setViewportSize({width:1280,height:800});await page.goto('/tests/browser/pdf-editor-harness.html');await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();
 const preview=page.getByRole('dialog',{name:'Final PDF preview',exact:true});await expect(preview.getByLabel('Preview zoom')).toHaveValue('fit-page');await expect(preview.locator('.pdf-final-sheet')).toHaveAttribute('data-render-state','ready');await expect(preview.getByRole('checkbox')).toBeDisabled();
 const full=await preview.locator('.pdf-final-sheet canvas').evaluate(canvas=>{const page=canvas.getBoundingClientRect(),view=canvas.closest('.pdf-final-viewport')!.getBoundingClientRect();return page.left>=view.left&&page.right<=view.right&&page.top>=view.top&&page.bottom<=view.bottom;});expect(full).toBe(true);
 await reviewPreviewPages(page);await expect(preview.getByRole('checkbox')).toBeEnabled();
});

test('typing directly on the document keeps the page visible and flows later content down',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await page.getByRole('button',{name:'Edit original text: SYNTHETIC ROW A',exact:true}).click();const inline=page.getByRole('textbox',{name:'Edit document text',exact:true});await expect(inline).toBeFocused();
 const before=(await page.getByRole('button',{name:'Edit original text: SYNTHETIC ROW B',exact:true}).boundingBox())!;
 await inline.press('End');await inline.press('Enter');await inline.pressSequentially('Extra content n');await expect(inline).toHaveValue('SYNTHETIC ROW A\nExtra content n');await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');
 await expect(page.locator('.pdf-paper .pdf-canvas-art canvas')).toBeVisible();expect((await page.getByRole('button',{name:'Edit original text: SYNTHETIC ROW B',exact:true}).boundingBox())!.y).toBeGreaterThan(before.y);
 await page.getByRole('button',{name:'Save draft',exact:true}).click();const p=await page.evaluate(()=>(window as any).pdfTest.draft.pages[0]);expect(p.rowEdits.some((r:any)=>r.kind==='insert')).toBe(true);expect(p.layers.find((l:any)=>l.text.includes('Extra content n')).textFlow.height).toBeGreaterThan(0);
});

test('dense invoice rows push lower content and footer onto a complete continuation sheet',async({page})=>{
 test.setTimeout(60000);await page.goto('/tests/browser/pdf-editor-harness.html');await page.waitForFunction(()=>(window as any).pdfTest.makeDense);await page.evaluate(()=>(window as any).pdfTest.makeDense());
 await page.getByRole('button',{name:'Edit original text: DENSE ROW 0',exact:true}).click();const next=page.getByRole('button',{name:'Edit original text: DENSE ROW 1',exact:true});const y=(await next.boundingBox())!.y;
 await page.getByRole('button',{name:'Add row below',exact:true}).click();await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(3);expect((await next.boundingBox())!.y).toBeGreaterThan(y);await expect(page.getByRole('alert')).toHaveCount(0);
 await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();const preview=page.getByRole('dialog',{name:'Final PDF preview'});await expect(preview.getByRole('combobox',{name:'PDF page',exact:true}).locator('option')).toHaveCount(2);await reviewPreviewPages(page);await preview.getByRole('checkbox').check();await preview.getByRole('button',{name:'Save reviewed PDFs privately',exact:true}).click();
 const result=await page.evaluate(async()=>{const api=(window as any).pdfTest,task=api.getDocument({data:api.saved.files[0].bytes.slice()}),pdf=await task.promise,p=await pdf.getPage(2),c=document.createElement('canvas'),v=p.getViewport({scale:1});c.width=v.width;c.height=v.height;await p.render({canvas:c,viewport:v}).promise;const pixels=c.getContext('2d')!.getImageData(0,0,c.width,60).data;let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<220)ink++;await task.destroy();return {count:pdf.numPages,ink};});expect(result.count).toBe(2);expect(result.ink).toBeGreaterThan(50);
});

test('one large multiline paste flows across sheets, and removing its lines safely closes the spacing',async({page})=>{
 test.setTimeout(60000);await page.goto('/tests/browser/pdf-editor-harness.html');await page.getByRole('button',{name:'Edit original text: SYNTHETIC ROW A',exact:true}).click();const input=page.getByRole('textbox',{name:'Edit document text',exact:true});const text=Array.from({length:85},(_,i)=>'SYNTHETIC LINE '+i).join('\n');
 await input.fill(text);await expect(input).toHaveValue(text);await page.getByRole('button',{name:'Save draft',exact:true}).click();const expanded=await page.evaluate(()=>(window as any).pdfTest.draft.pages[0]);expect(expanded.flowHeight).toBeGreaterThan(842);expect(expanded.layers.find((l:any)=>l.text===text)?.textFlow.height).toBeGreaterThan(842);
 await input.fill('SYNTHETIC ROW A');await page.getByRole('button',{name:'Save draft',exact:true}).click();const reduced=await page.evaluate(()=>(window as any).pdfTest.draft.pages[0]);expect(reduced.flowHeight).toBeCloseTo(842,4);expect(reduced.layers.find((l:any)=>l.text==='SYNTHETIC ROW A').textFlow).toBeUndefined();await expect(page.getByRole('button',{name:'Edit original text: SYNTHETIC ROW B',exact:true})).toBeVisible();
});
