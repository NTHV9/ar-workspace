import {test,expect} from '@playwright/test';
test('left invoice address grows over a blank header image and Undo restores it',async({page})=>{
 await page.goto('/tests/browser/source-deletion/harness.html?header=1');
 await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');
 await page.getByRole('button',{name:'Edit original text: SYNTHETIC ADDRESS FIRST',exact:true}).click();
 const add=page.getByRole('button',{name:'Add row below',exact:true}),text=page.getByRole('textbox',{name:'Layer text',exact:true});
 await expect(add).toBeEnabled();await add.click();await expect(add).toBeEnabled();
 await expect(text).toHaveValue('SYNTHETIC ADDRESS FIRST\n');
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(text).toHaveValue('SYNTHETIC ADDRESS FIRST');
});

for(const kind of ['image-under-original-glyph','pale-destination-image','vector-rule','unsupported-header'])test(`left header proof refuses ${kind}`,async({page})=>{
 await page.goto('/tests/browser/stationery-header/harness.html');await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');const old=await page.locator('.pdf-paper .pdf-canvas').elementHandle();
 await page.evaluate(async kind=>{const f=(window as any).fixture,pdf=await f.PDFDocument.load(f.sources[0].bytes),sheet=pdf.getPage(0);
  if(kind==='unsupported-header'){const font=await pdf.embedFont('Helvetica');sheet.drawText('SYNTHETIC UNQUALIFIED',{x:50,y:622,size:8,font,opacity:.5});}
  else if(kind==='vector-rule')sheet.drawLine({start:{x:34,y:647},end:{x:150,y:647},thickness:1});
  else{const c=document.createElement('canvas');c.width=c.height=4;const ctx=c.getContext('2d')!;ctx.fillStyle=kind==='pale-destination-image'?'rgb(254,254,254)':'#000';ctx.fillRect(0,0,4,4);const image=await pdf.embedPng(c.toDataURL());sheet.drawImage(image,{x:50,y:792-(kind==='pale-destination-image'?167:146),width:4,height:4});}
  f.reopen(undefined,[{...f.sources[0],bytes:await pdf.save()}]);
 },kind);
 await page.waitForFunction(old=>!old!.isConnected,old);await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');
 await page.getByRole('button',{name:'Edit original text: SYNTHETIC ADDRESS FIRST',exact:true}).click();const add=page.getByRole('button',{name:'Add row below',exact:true});await expect(add).toBeEnabled();await add.click();await expect(add).toBeEnabled();
 await expect(page.getByRole('textbox',{name:'Layer text',exact:true})).toHaveValue('SYNTHETIC ADDRESS FIRST');await expect(page.getByRole('alert')).toContainText(/artwork|verified|field/i);
 if(kind==='unsupported-header'){const residual=await page.evaluate(async()=>{const f=(window as any).fixture,l=await f.loadSources(f.sources);let proof;try{const p=l.project.pages[0],runs=await f.detectText(p,l.documents),run=runs.find((r:any)=>r.unsupported);if(!run)throw Error('Unsupported synthetic fixture run was not detected');proof=await f.originalHeaderArtwork(p,l.documents);return {qualified:!!proof,runExists:true};}finally{proof?.release?.();l.dispose();}});expect(residual).toEqual({qualified:false,runExists:true});}
});
test('native-removal fallback cannot qualify a blank-looking header',async({page})=>{
 await page.route('**/*native.worker*',route=>route.abort());await page.goto('/tests/browser/stationery-header/harness.html');await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');
 await page.getByRole('button',{name:'Edit original text: SYNTHETIC ADDRESS FIRST',exact:true}).click();const add=page.getByRole('button',{name:'Add row below',exact:true});await expect(add).toBeEnabled();await add.click();await expect(page.getByRole('alert')).toContainText('not been verified');
});
test('left address growth preserves exact opposite-column pixels, VAT, Undo and strict export',async({page})=>{
 await page.goto('/tests/browser/stationery-header/harness.html');await page.getByRole('button',{name:'Edit original text: SYNTHETIC ADDRESS FIRST',exact:true}).click();const add=page.getByRole('button',{name:'Add row below',exact:true});await expect(add).toBeEnabled();await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.evaluate(()=>{const f=(window as any).fixture;f.before=structuredClone(f.project);});
 await add.click();await expect(add).toBeEnabled();await page.getByRole('button',{name:'Save draft',exact:true}).click();
 const result=await page.evaluate(async()=>{const f=(window as any).fixture,l=await f.loadSources(f.sources);try{const a=document.createElement('canvas'),b=document.createElement('canvas');await f.renderPage(f.before.pages[0],l.documents,a,1.5);await f.renderPage(f.project.pages[0],l.documents,b,1.5);const x=450,w=400,h=380,aa=a.getContext('2d')!.getImageData(x,0,w,h).data,bb=b.getContext('2d')!.getImageData(x,0,w,h).data;return {same:aa.every((v:number,i:number)=>v===bb[i]),files:(await f.exportProject(f.project,f.sources,l.documents)).length,columns:f.project.pages[0].rowEdits.map((e:any)=>({kind:e.kind,x:e.x,width:e.width}))};}finally{l.dispose();}});
 expect(result.same).toBe(true);expect(result.files).toBe(1);expect(result.columns).toHaveLength(1);expect(result.columns[0].x+result.columns[0].width).toBeLessThan(300);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByRole('textbox',{name:'Layer text',exact:true})).toHaveValue('SYNTHETIC ADDRESS FIRST');
});
test('unrequested right-column glyphs stay occupied in the residual proof',async({page})=>{
 await page.goto('/tests/browser/stationery-header/harness.html');await page.waitForFunction(()=>(window as any).fixture);
 const result=await page.evaluate(async()=>{const f=(window as any).fixture,l=await f.loadSources(f.sources);let proof;try{const p=l.project.pages[0],runs=await f.detectText(p,l.documents),right=runs.find((r:any)=>r.x>380&&r.y>125&&r.y<180);proof=await f.originalHeaderArtwork(p,l.documents);let blocked=false;try{f.assertStationeryBlank(p,right,proof);}catch{blocked=true;}return {qualified:!!proof,blocked};}finally{proof?.release?.();l.dispose();}});
 expect(result).toEqual({qualified:true,blocked:true});
});
