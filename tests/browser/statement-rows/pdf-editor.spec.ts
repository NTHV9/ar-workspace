import {test,expect} from '@playwright/test';
for(const cell of ['F001','F002'])test('Statement insertion keeps wrapped text and Balance Due intact: '+cell,async({page})=>{
 await page.goto('/tests/browser/statement-rows/harness.html');await page.getByRole('button',{name:'Edit original text: '+cell,exact:true}).click();await page.getByRole('button',{name:'Add row below',exact:true}).click();await page.getByRole('button',{name:'Save draft',exact:true}).click();
 const edit=await page.evaluate(()=>(window as any).fixture.project.pages[0].rowEdits[0]);
 // Actual generator: first wrapped row ends at242pt; second ends at256pt.
 // The cut belongs in whitespace after every line, before next text/grey bar.
 expect(edit.y).toBeGreaterThan(cell==='F001'?237:251);expect(edit.y).toBeLessThan(cell==='F001'?244:256);
 await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(8);
});


test('continuation selection inserts after the whole row and preserves native pixels',async({page})=>{
 await page.goto('/tests/browser/statement-rows/harness.html');await page.getByRole('button',{name:'Edit original text: Longname',exact:true}).click();await page.getByRole('button',{name:'Add row below',exact:true}).click();await page.getByRole('button',{name:'Save draft',exact:true}).click();
 const result=await page.evaluate(async()=>{const f=(window as any).fixture,p=f.project.pages[0],edit=p.rowEdits[0],l=await f.loadSources(f.sources),canvas=document.createElement('canvas');await f.renderPage(p,l.documents,canvas,4);const pixels=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;const gray=(y:number)=>pixels[(Math.round(y*4)*canvas.width+40*4)*4];const allGray=Array.from({length:24},(_,i)=>gray(257+edit.height+i)).every(v=>v>210&&v<225);l.dispose();return {y:edit.y,allGray,count:p.layers.filter((v:any)=>v.tableRow).length};});
 expect(result.y).toBeGreaterThan(237);expect(result.y).toBeLessThan(244);expect(result.allGray).toBe(true);expect(result.count).toBe(8);
});

test('last row insertion can be edited, repeated and deleted without splitting the total bar',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto('/tests/browser/statement-rows/harness.html');await page.getByRole('button',{name:'Edit original text: F002',exact:true}).click();await page.getByRole('button',{name:'Add row below',exact:true}).click();await page.locator('.pdf-layer-target.empty-cell .pdf-layer-move').nth(2).click();await page.getByRole('textbox',{name:'Edit document text',exact:true}).fill('ADDED ROW');await page.getByRole('button',{name:'Add row below',exact:true}).click();await page.getByRole('button',{name:'Save draft',exact:true}).click();
 const result=await page.evaluate(async()=>{const f=(window as any).fixture,p=f.project.pages[0],delta=p.rowEdits.reduce((n:number,e:any)=>n+e.height,0),l=await f.loadSources(f.sources),c=document.createElement('canvas');await f.renderPage(p,l.documents,c,4);const pixels=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;const at=(y:number)=>pixels[(Math.round(y*4)*c.width+40*4)*4];const gray=Array.from({length:24},(_,i)=>at(257+delta+i)).every(v=>v>210&&v<225);const bottom=Math.max(...p.layers.filter((v:any)=>v.tableRow).map((v:any)=>v.y+v.height));l.dispose();return {gray,bottom,totalTop:256+delta,rows:new Set(p.layers.map((v:any)=>v.tableRow).filter(Boolean)).size};});expect(result.gray).toBe(true);expect(result.bottom).toBeLessThan(result.totalTop);expect(result.rows).toBe(2);
 await page.locator('.pdf-page-scroll').evaluate(e=>e.scrollTop=160);await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');await page.screenshot({path:'evidence/pdf-statement-added-rows-1440.png',animations:'disabled'});
 await page.getByRole('button',{name:'Delete row',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByRole('button',{name:'Edit original text: F002',exact:true})).toBeVisible();
});

test('a longer wrapped continuation stays with its row for TSK too',async({page})=>{
 await page.goto('/tests/browser/statement-rows/harness.html?hotel=TSK&guest=Example%2C%20Verylongfamilyname');await page.getByRole('button',{name:'Edit original text: Verylongfamilyname',exact:true}).click();await page.getByRole('button',{name:'Add row below',exact:true}).click();await page.getByRole('button',{name:'Save draft',exact:true}).click();const edit=await page.evaluate(()=>(window as any).fixture.project.pages[0].rowEdits[0]);expect(edit.y).toBeGreaterThan(237);expect(edit.y).toBeLessThan(244);await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(8);
});

test('selecting a third source line still inserts below the complete row',async({page})=>{
 await page.goto('/tests/browser/statement-rows/harness.html?guest=Example%2C%20Verylongfamilyname%20ExtraWords');await page.getByRole('button',{name:'Edit original text: ExtraWords',exact:true}).click();await page.getByRole('button',{name:'Add row below',exact:true}).click();await page.getByRole('button',{name:'Save draft',exact:true}).click();const edit=await page.evaluate(()=>(window as any).fixture.project.pages[0].rowEdits[0]);expect(edit.y).toBeGreaterThan(247);expect(edit.y).toBeLessThan(254);await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(8);
});


test('header newline leaves opposite header fixed and Whiteout is directly available',async({page})=>{
 await page.goto('/tests/browser/statement-rows/harness.html',{waitUntil:'domcontentloaded'});
 const right=page.getByRole('button',{name:'Edit original text: 11/09/26',exact:true});const before=await right.boundingBox();
 await page.getByRole('button',{name:'Edit original text: SYNTHETIC ROW TEST',exact:true}).click();
 await page.getByRole('textbox',{name:'Edit document text',exact:true}).fill('SYNTHETIC ROW TEST\n1 Example Street\nExample Town');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 const after=await right.boundingBox();expect(after!.y).toBeCloseTo(before!.y,1);
 expect(await page.evaluate(()=>(window as any).fixture.project.pages[0].rowEdits??[])).toHaveLength(0);
 await expect(page.getByRole('button',{name:'Whiteout',exact:true})).toBeVisible();
 await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');
 await page.screenshot({path:'evidence/pdf-independent-header-lines-1440.png',animations:'disabled'});
 await page.getByRole('button',{name:'Whiteout',exact:true}).click();
 await expect(page.getByRole('button',{name:'Move whiteout layer',exact:true})).toBeVisible();
});


test('newline in a Statement item still expands the whole row',async({page})=>{
 await page.goto('/tests/browser/statement-rows/harness.html');
 const lower=page.getByRole('button',{name:'Edit original text: F002',exact:true});const before=await lower.boundingBox();
 await page.getByRole('button',{name:'Edit original text: F001',exact:true}).click();
 await page.getByRole('textbox',{name:'Edit document text',exact:true}).fill('F001\nEXTRA\nLINE');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 expect((await lower.boundingBox())!.y).toBeGreaterThan(before!.y);
 expect(await page.evaluate(()=>(window as any).fixture.project.pages[0].rowEdits.some((e:any)=>e.kind==='insert'))).toBe(true);
});

test('standalone Add row below preserves opposite column pixels, source whiteout and Undo',async({page})=>{
 await page.goto('/tests/browser/statement-rows/harness.html');
 await page.getByRole('button',{name:'Whiteout',exact:true}).click();
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await page.evaluate(()=>{const f=(window as any).fixture;f.before=structuredClone(f.project);});
 await page.getByRole('button',{name:'Edit source text',exact:true}).click();
 await page.getByRole('button',{name:'Edit original text: SYNTHETIC ROW TEST',exact:true}).click();
 await page.getByRole('button',{name:'Add row below',exact:true}).click();
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 const proof=await page.evaluate(async()=>{
  const f=(window as any).fixture,l=await f.loadSources(f.sources),before=f.before.pages[0],after=f.project.pages[0];
  const a=document.createElement('canvas'),b=document.createElement('canvas');await f.renderPage(before,l.documents,a,2);await f.renderPage(after,l.documents,b,2);
  const left=a.getContext('2d')!.getImageData(650,0,500,350).data,right=b.getContext('2d')!.getImageData(650,0,500,350).data;
  const same=left.every((v:number,i:number)=>v===right[i]);l.dispose();
  return {same,rowEdits:after.rowEdits??[],whiteoutBefore:before.layers.filter((v:any)=>v.kind==='whiteout'),whiteoutAfter:after.layers.filter((v:any)=>v.kind==='whiteout'),text:after.layers.find((v:any)=>v.kind==='replacement').text,tableRows:after.layers.filter((v:any)=>v.tableRow).length};
 });
 expect(proof.same).toBe(true);expect(proof.rowEdits).toEqual([]);expect(proof.whiteoutAfter).toEqual(proof.whiteoutBefore);expect(proof.text).toBe('SYNTHETIC ROW TEST\n');expect(proof.tableRows).toBe(0);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByRole('textbox',{name:'Edit document text',exact:true})).toHaveValue('SYNTHETIC ROW TEST');
});

async function syntheticCcitt(width=64,height=64){
 const {PDFDocument,PDFName}=await import('pdf-lib');const doc=await PDFDocument.create(),sheet=doc.addPage([595,842]);
 // A Group 4 horizontal run followed by vertical-zero rows and EOFB.
 const bits='0010011010100000011110000110111'+'1'.repeat(63)+'000000000001000000000001';
 const padded=bits+'0'.repeat((8-bits.length%8)%8),data=Uint8Array.from(padded.match(/.{8}/g)!.map(s=>parseInt(s,2)));
 const image=doc.context.register(doc.context.stream(data,{Type:'XObject',Subtype:'Image',Width:width,Height:height,ColorSpace:'DeviceGray',BitsPerComponent:1,Filter:'CCITTFaxDecode',DecodeParms:doc.context.obj({K:-1,Columns:width,Rows:height,BlackIs1:true})}));
 sheet.node.set(PDFName.of('Resources'),doc.context.obj({XObject:{Scan:image}}));sheet.node.addContentStream(doc.context.register(doc.context.stream('q 400 0 0 400 40 40 cm /Scan Do Q')));return [...await doc.save()];
}

test('synthetic CCITT scan renders and survives a native PDF copy using shipped decoders',async({page})=>{
 await page.goto('/tests/browser/statement-rows/harness.html');await page.waitForFunction(()=>(window as any).fixture);
 const ink=await page.evaluate(async bytes=>{
  const f=(window as any).fixture,source={id:'scan',name:'Synthetic scan.pdf',kind:'invoice',bytes:Uint8Array.from(bytes)},l=await f.loadSources([source]);
  const count=async(p:any,documents:any)=>{const c=document.createElement('canvas');await f.renderPage(p,documents,c,1);const a=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<a.length;i+=4)if(a[i]<200)n++;return n;};
  const original=await count(l.project.pages[0],l.documents),files=await f.exportProject(l.project,[source],l.documents),copy=await f.loadSources([{...source,bytes:files[0].bytes}]),exported=await count(copy.project.pages[0],copy.documents);l.dispose();copy.dispose();return {original,exported};
 },await syntheticCcitt());expect(ink.original).toBeGreaterThan(1000);expect(ink.exported).toBe(ink.original);
});

test('missing decoder and oversized source image reject instead of showing a blank successful page',async({page})=>{
 await page.context().route('**/pdfjs/*/wasm/**',route=>route.abort());
 await page.goto('/tests/browser/statement-rows/harness.html');await page.waitForFunction(()=>(window as any).fixture);
 for(const [index,bytes] of [await syntheticCcitt(),await syntheticCcitt(6000,6000)].entries()){
  const error=await page.evaluate(async bytes=>{const f=(window as any).fixture;let l:any;try{l=await f.loadSources([{id:'scan',name:'Synthetic scan.pdf',kind:'invoice',bytes:Uint8Array.from(bytes)}]);await f.renderPage(l.project.pages[0],l.documents,document.createElement('canvas'),1);return '';}catch(e){return e instanceof Error?e.message:String(e);}finally{l?.dispose();}},bytes);
  expect(error,'synthetic image case '+index).toMatch(/decode|maximum allowed size|image/i);
 }
});
