import {test,expect,type Page} from '@playwright/test';
import {reviewPreviewPages} from '../fixtures/pdf-preview';

async function openStatement(page:Page,hotel='KAT',control=false){
 await page.goto(`/tests/browser/source-deletion/harness.html?hotel=${hotel}${control?'&control=1':''}`);
 await expect(page.getByRole('button',{name:'Edit original text: F002',exact:true})).toBeVisible();
 await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');
 return page.evaluate(async()=>{
  const f=(window as any).fixture,l=await f.loadSources(f.sources),runs=await f.detectText(l.project.pages[0],l.documents);
  const row=runs.find((r:any)=>r.text==='F002');
  const voucher=runs.filter((r:any)=>r.x>=328&&r.x+r.width<=410&&r.y>=row.y-.1&&r.y<row.y+40).sort((a:any,b:any)=>a.y-b.y);
  l.dispose();return voucher;
 });
}

async function saveProject(page:Page){
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await expect(page.getByText('Draft saved. Final review is still required.',{exact:true})).toBeVisible();
 return page.evaluate(()=>(window as any).fixture.project);
}

async function insertBelowLastRow(page:Page){
 await page.getByRole('button',{name:'Edit original text: F002',exact:true}).click();
 await page.getByRole('button',{name:'Add row below',exact:true}).click();
 await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(8);
 return saveProject(page);
}

async function deleteVoucher(page:Page,runs:any[]){
 for(const run of runs){
  await page.getByRole('button',{name:'Edit original text: '+run.text,exact:true}).click();
  await page.getByRole('button',{name:'Delete text box',exact:true}).click();
  await expect(page.getByRole('button',{name:'Edit original text: '+run.text,exact:true})).toHaveCount(0);
 }
 await expect(page.locator('.pdf-layer-target')).toHaveCount(0);
}

async function preservedDocumentProof(page:Page,exported=false){
 return page.evaluate(async(exported)=>{
  const f=(window as any).fixture,loaded=await f.loadSources(f.sources),original=loaded.project.pages[0];
  const project=f.restoreProject(f.project,loaded.project),changed=project.pages[0];
  const runs=await f.detectText(original,loaded.documents),barriers=await f.detectRowBarriers(original,loaded.documents);
  const before=document.createElement('canvas'),after=document.createElement('canvas');
  await f.renderPage(original,loaded.documents,before,3);
  let output:any;
  if(exported){output=await f.loadSources([{id:'exported',name:'Exported synthetic',kind:'statement',bytes:f.saved[0].bytes}]);await f.renderPage(output.project.pages[0],output.documents,after,3);}
  else await f.renderPage(changed,loaded.documents,after,3);
  const ink=(canvas:HTMLCanvasElement,rect:any)=>{
   const x=Math.max(0,Math.floor((rect.x-1)*3)),y=Math.max(0,Math.floor((rect.y-1)*3));
   const width=Math.min(canvas.width-x,Math.ceil((rect.width+2)*3)),height=Math.min(canvas.height-y,Math.ceil((rect.height+2)*3));
   const pixels=canvas.getContext('2d')!.getImageData(x,y,width,height).data;
   let count=0;for(let i=0;i<pixels.length;i+=4)if(Math.min(pixels[i],pixels[i+1],pixels[i+2])<190)count++;
   return count;
  };
  const last=runs.find((r:any)=>r.text==='F002');
  const isVoucher=(r:any)=>r.x>=328&&r.x+r.width<=410&&r.y>=last.y-.1&&r.y<last.y+40;
  const retained=runs.filter((r:any)=>!isVoucher(r)).map((r:any)=>{
   const mapped=f.mapSourceTextRect(r,changed.rowEdits??[],r.fontSize*.72);
   return {text:r.text,before:ink(before,r),after:mapped?ink(after,mapped):0};
  });
  const mappedFirst=f.mapSourceTextRect(last,changed.rowEdits??[],last.fontSize*.72);
  const voucherInk=ink(after,{x:328,y:mappedFirst.y,width:82,height:9});
  const total=barriers.filter((r:any)=>r.width>500&&r.height>20&&r.height<30).sort((a:any,b:any)=>b.y-a.y)[0];
  const mappedTotal=f.mapSourceRect(total,changed.rowEdits??[]);
  // Detected path bounds include .75pt of stroke margin. Sample the fill,
  // keeping both the border and its fractional-position antialiasing outside.
  const graySamples=mappedTotal?Array.from({length:24},(_,i)=>{
   const sample=after.getContext('2d')!.getImageData(40*3,Math.round((mappedTotal.y+2+i)*3),1,1).data;
   return Array.from(sample).slice(0,3);
  }):[];
  const gray=graySamples.length===24&&graySamples.every(sample=>sample[0]>210&&sample[0]<225&&sample[0]===sample[1]&&sample[1]===sample[2]);
  let hiddenText='',fontEntries=0,objectTypes:string[]=[],annotations=false,attachments=false,pages=0,hiddenNativeObjects=0,textStreams=0;
  if(exported){
   pages=output.project.pages.length;
   for(const p of output.project.pages){const content=await (await output.documents.get('exported').getPage(p.sourcePage)).getTextContent();hiddenText+=content.items.map((r:any)=>r.str??'').join('');}
   const doc=await f.PDFDocument.load(f.saved[0].bytes),pdfPage=doc.getPage(0),resources=pdfPage.node.Resources(),fonts=resources.lookup(f.PDFName.of('Font'));
   fontEntries=fonts?.keys().length??0;
   const objects=resources.lookup(f.PDFName.of('XObject'));
   objectTypes=objects.entries().map(([,ref]:any)=>doc.context.lookup(ref).dict.get(f.PDFName.of('Subtype')).toString());
   annotations=(pdfPage.node.Annots()?.size()??0)>0;attachments=doc.catalog.has(f.PDFName.of('Names'))||doc.catalog.has(f.PDFName.of('AF'));
   for(const [,object] of doc.context.enumerateIndirectObjects()){
    const dict=object.dict??object,type=dict.get?.(f.PDFName.of('Type'))?.toString(),subtype=dict.get?.(f.PDFName.of('Subtype'))?.toString();
    if(['/Font','/FontDescriptor','/EmbeddedFile'].includes(type)||subtype==='/Form')hiddenNativeObjects++;
    if(object instanceof f.PDFRawStream&&subtype!=='/Image'){
     const decoded=new TextDecoder().decode(f.decodePDFRawStream(object).decode());
     if(/(?:^|\s)(?:BT|Tj|TJ)(?=\s|$)/.test(decoded))textStreams++;
    }
   }
   after.id='source-deletion-export-proof';after.style.cssText='position:fixed;inset:0;z-index:9999;background:white;width:612px;height:792px';document.body.appendChild(after);
  }
  output?.dispose();loaded.dispose();return {retained,voucherInk,gray,total,mappedTotal,graySamples,hiddenText,fontEntries,objectTypes,annotations,attachments,pages,hiddenNativeObjects,textStreams};
 },exported);
}

function expectRetained(proof:Awaited<ReturnType<typeof preservedDocumentProof>>){
 expect(proof.gray,'Every interior scanline of Balance Due must remain gray: '+JSON.stringify({total:proof.total,mapped:proof.mappedTotal,samples:proof.graySamples})).toBe(true);
 expect(proof.voucherInk,'The first deleted Voucher run must not reappear as pixels').toBe(0);
 for(const run of proof.retained){
  expect(run.before,`Fixture must include visible native ink for ${run.text}`).toBeGreaterThan(0);
  expect(run.after/run.before,`Native ink retained for ${run.text}`).toBeGreaterThan(.72);
  expect(run.after/run.before,`Native ink is not duplicated for ${run.text}`).toBeLessThan(1.28);
 }
}

for(const hotel of ['KAT','TSK'])test(`${hotel}: clearing four wrapped Voucher runs inserts one normal row`,async({page})=>{
 await openStatement(page,hotel,true);
 const control=await insertBelowLastRow(page);
 const normal=control.pages[0].rowEdits.find((e:any)=>e.kind==='insert');
 const runs=await openStatement(page,hotel);
 expect(runs).toHaveLength(4);
 for(const run of runs){
  await page.getByRole('button',{name:'Edit original text: '+run.text,exact:true}).click();
  await page.getByRole('textbox',{name:'Layer text',exact:true}).fill('');
 }
 const project=await insertBelowLastRow(page),p=project.pages[0],insert=p.rowEdits.find((e:any)=>e.kind==='insert');
 expect.soft(insert.height,'Cleared source continuation lines must not size the new row').toBeCloseTo(normal.height,1);
 expect.soft(insert.y,'The row must start at the compacted one-line boundary').toBeCloseTo(normal.y,1);
 expect(p.layers.filter((l:any)=>l.tableRow)).toHaveLength(8);
 await page.locator('.pdf-page-scroll').evaluate(e=>e.scrollTop=100);
 await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');
 await page.screenshot({path:`evidence/pdf-source-deletion-${hotel.toLowerCase()}-cleared-insert-fixed.png`,animations:'disabled'});
 expectRetained(await preservedDocumentProof(page));
});

test('source deletion removes ghost targets, survives Undo/Redo and reload, and can restore original text',async({page})=>{
 const runs=await openStatement(page);
 await deleteVoucher(page,runs);
 const deleted=await saveProject(page);
 expect(deleted.pages[0].layers.filter((l:any)=>l.deleted)).toHaveLength(4);
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(page.locator('.pdf-layer-target')).toHaveCount(1);
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 await expect(page.locator('.pdf-layer-target')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Save draft',exact:true})).toBeDisabled();
 const redone=await page.evaluate(()=>(window as any).fixture.project);
 expect(redone.pages[0].layers).toEqual(deleted.pages[0].layers);
 await page.evaluate(()=>{const f=(window as any).fixture;f.reopen(JSON.parse(JSON.stringify(f.project)));});
 await expect(page.getByRole('button',{name:'Edit original text: F002',exact:true})).toBeVisible();
 await expect(page.locator('.pdf-layer-target')).toHaveCount(0);
 for(const run of runs)await expect(page.getByRole('button',{name:'Edit original text: '+run.text,exact:true})).toHaveCount(0);
 await page.locator('.pdf-differences button').filter({hasText:runs[0].text}).click();
 await page.getByRole('button',{name:'Restore original text',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Layer text',exact:true})).toHaveValue(runs[0].text);
 const restored=await saveProject(page),first=restored.pages[0].layers.find((l:any)=>l.original?.text===runs[0].text);
 expect(first.deleted).not.toBe(true);
 expect(first.text).toBe(runs[0].text);expect(first.sourceText).toBeTruthy();
 expect(first.fontSize).toBe(runs[0].fontSize);expect(first.color).toBe(runs[0].color);
 expect(first.original).toEqual({text:runs[0].text,x:runs[0].x,y:runs[0].y,width:runs[0].width,height:runs[0].height});
});

test('Delete text box removes an ordinary added object instead of leaving a source tombstone',async({page})=>{
 await openStatement(page);
 await page.getByRole('button',{name:'Text box',exact:true}).click();
 await page.getByRole('textbox',{name:'Layer text',exact:true}).fill('SYNTHETIC ADDED TEXT');
 await page.getByRole('button',{name:'Delete text box',exact:true}).click();
 await expect(page.locator('.pdf-layer-target')).toHaveCount(0);
 const project=await saveProject(page);expect(project.pages[0].layers).toEqual([]);
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(page.locator('.pdf-layer-target')).toHaveCount(1);
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 await expect(page.locator('.pdf-layer-target')).toHaveCount(0);
});

test('Remove empty lines compacts only cleared continuation bands and Undo restores their spacing',async({page})=>{
 const runs=await openStatement(page);
 for(const run of runs){await page.getByRole('button',{name:'Edit original text: '+run.text,exact:true}).click();await page.getByRole('textbox',{name:'Layer text',exact:true}).fill('');}
 await page.getByRole('button',{name:'Edit original text: F002',exact:true}).click();
 const before=await saveProject(page);
 await page.getByRole('button',{name:'Remove empty lines',exact:true}).click();
 const compact=await saveProject(page),edits=compact.pages[0].rowEdits??[];
 expect(edits.filter((e:any)=>e.kind==='delete').reduce((n:number,e:any)=>n+e.height,0)).toBeCloseTo(30,1);
 expectRetained(await preservedDocumentProof(page));
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 const undone=await saveProject(page);expect(undone.pages[0].rowEdits??[]).toEqual(before.pages[0].rowEdits??[]);
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 const redone=await saveProject(page);expect(redone.pages[0].rowEdits).toEqual(compact.pages[0].rowEdits);
});

test('compacting empty Voucher bands retains a surviving final continuation above the inserted row',async({page})=>{
 const runs=await openStatement(page);
 for(const run of runs.slice(0,-1)){await page.getByRole('button',{name:'Edit original text: '+run.text,exact:true}).click();await page.getByRole('textbox',{name:'Layer text',exact:true}).fill('');}
 const changed=await insertBelowLastRow(page),insert=changed.pages[0].rowEdits.find((e:any)=>e.kind==='insert');
 const retained=await page.evaluate(async(run)=>{
  const f=(window as any).fixture,loaded=await f.loadSources(f.sources),p=f.restoreProject(f.project,loaded.project).pages[0];
  const mapped=f.mapSourceTextRect(run,p.rowEdits??[],run.fontSize*.72);
  if(!mapped){loaded.dispose();return {mapped:false,ink:0,bottom:Infinity};}
  const canvas=document.createElement('canvas');await f.renderPage(p,loaded.documents,canvas,3);
  const pixels=canvas.getContext('2d')!.getImageData(Math.floor((mapped.x-1)*3),Math.floor((mapped.y-1)*3),Math.ceil((mapped.width+2)*3),Math.ceil((mapped.height+2)*3)).data;
  let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<190)ink++;
  const rebound=(await f.detectText(p,loaded.documents)).find((candidate:any)=>candidate.sourceText.runIndex===run.sourceText.runIndex);
  const inkBounds=f.measureLayerInk(f.createReplacementLayer(rebound,'retained-ink'));
  loaded.dispose();return {mapped:true,ink,bottom:mapped.y-run.y+inkBounds.y+inkBounds.height};
 },runs.at(-1));
 expect(retained.mapped).toBe(true);expect(retained.ink).toBeGreaterThan(5);expect(retained.bottom).toBeLessThan(insert.y+.5);
 await expect(page.getByRole('button',{name:'Edit original text: '+runs.at(-1).text,exact:true})).toBeVisible();
});

for(const hotel of ['KAT','TSK'])test(`${hotel}: deleted source text stays absent from strict exported PDF while rows, total and footer survive`,async({page})=>{
 test.setTimeout(60000);
 const runs=await openStatement(page,hotel);
 await deleteVoucher(page,runs);
 await insertBelowLastRow(page);
 await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();
 await reviewPreviewPages(page);
 await page.getByRole('checkbox').check();
 await page.getByRole('button',{name:'Save reviewed PDFs privately',exact:true}).click();
 await expect(page.getByRole('button',{name:'Saved',exact:true})).toBeVisible();
 const proof=await preservedDocumentProof(page,true);
 await page.locator('#source-deletion-export-proof').screenshot({path:`evidence/pdf-source-deletion-${hotel.toLowerCase()}-strict-export.png`,animations:'disabled'});
 expectRetained(proof);
 expect(proof.pages).toBe(1);expect(proof.hiddenText).toBe('');expect(proof.fontEntries).toBe(0);
 expect(proof.objectTypes).toEqual(['/Image']);expect(proof.annotations).toBe(false);expect(proof.attachments).toBe(false);
 expect(proof.hiddenNativeObjects).toBe(0);expect(proof.textStreams).toBe(0);
});

test('deleting an unsupported native text style still permits strict export',async({page})=>{
 await openStatement(page);
 const result=await page.evaluate(async()=>{
  const f=(window as any).fixture,loaded=await f.loadSources(f.unsupportedSources),p=loaded.project.pages[0],runs=await f.detectText(p,loaded.documents);
  p.layers=[f.createReplacementLayer(runs[0],'unsupported')];
  let blocked=false;try{await f.exportProject(loaded.project,f.unsupportedSources,loaded.documents);}catch{blocked=true;}
  loaded.project.pages[0]=f.deleteTextLayer(p,p.layers[0]);
  const files=await f.exportProject(loaded.project,f.unsupportedSources,loaded.documents),output=await f.loadSources([{id:'out',name:'out',kind:'invoice',bytes:files[0].bytes}]);
  const canvas=document.createElement('canvas');await f.renderPage(output.project.pages[0],output.documents,canvas,2);
  const pixels=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;
  let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<245)ink++;
  const result={unsupported:runs[0].unsupported,blocked,ink,pages:output.project.pages.length};output.dispose();loaded.dispose();return result;
 });
 expect(result).toEqual({unsupported:true,blocked:true,ink:0,pages:1});
});

test('deleting source text pushed beyond the physical sheet removes the empty overflow page',async({page})=>{
 await openStatement(page);
 const result=await page.evaluate(async()=>{
  const f=(window as any).fixture,loaded=await f.loadSources(f.overflowSources),original=loaded.project.pages[0],runs=await f.detectText(original,loaded.documents);
  const run=runs.find((r:any)=>r.text==='SYNTHETIC OVERFLOW DELETE');
  original.layers=[f.createReplacementLayer(run,'overflow-delete')];
  const pushed=f.applyFlowEdit(original,{id:'push',kind:'insert',y:100,height:120});loaded.project.pages[0]=pushed;
  const beforeFiles=await f.exportProject(loaded.project,f.overflowSources,loaded.documents),before=await f.PDFDocument.load(beforeFiles[0].bytes);
  const changed=f.deleteTextLayer(pushed,pushed.layers[0]);loaded.project.pages[0]=changed;
  const files=await f.exportProject(loaded.project,f.overflowSources,loaded.documents),output=await f.loadSources([{id:'out',name:'out',kind:'invoice',bytes:files[0].bytes}]);
  const canvas=document.createElement('canvas');await f.renderPage(output.project.pages[0],output.documents,canvas,2);
  const pixels=canvas.getContext('2d')!.getImageData(40,40,680,100).data;
  let headerInk=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<190)headerInk++;
  const result={beforePages:before.getPageCount(),afterPages:output.project.pages.length,deletedBelowSheet:changed.layers[0].y>changed.height,headerInk};output.dispose();loaded.dispose();return result;
 });
 expect(result.beforePages).toBe(2);expect(result.deletedBelowSheet).toBe(true);expect(result.afterPages).toBe(1);expect(result.headerInk).toBeGreaterThan(100);
});
