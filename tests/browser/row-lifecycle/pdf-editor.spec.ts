import {test,expect} from '@playwright/test';
import {reviewPreviewPages} from '../fixtures/pdf-preview';

for(const embedded of [false,true])for(const column of [0,3])for(const value of ['', '123.45'])test(`insert then delete the new credit row from column ${column}, ${value?'filled':'empty'}, ${embedded?'embedded':'standard'} font`,async({page})=>{
 await page.goto('/tests/browser/editor-resilience/harness.html?credit=1&tight=1'+(embedded?'&embedded=1':''));
 await page.getByRole('button',{name:'Edit original text: City Ledger',exact:true}).click();
 await page.getByRole('button',{name:'Add row below',exact:true}).click();
 await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(5);
 if(column)await page.locator('.pdf-layer-target.empty-cell .pdf-layer-move').nth(column).click();
 if(value)await page.getByRole('textbox',{name:'Edit document text',exact:true}).fill(value);
 await page.getByRole('button',{name:'Delete row',exact:true}).click();
 await expect(page.getByRole('alert')).toHaveCount(0,{timeout:1500});
 await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(0,{timeout:1500});
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await expect(page.getByText('Draft saved. Final review is still required.',{exact:true})).toBeVisible();
 const proof=await page.evaluate(async()=>{
  const f=(window as any).fixture,p=f.project.pages[0],loaded=await f.loadSources(f.sources);
  const before=document.createElement('canvas'),after=document.createElement('canvas');
  await f.renderPage(loaded.project.pages[0],loaded.documents,before,3);await f.renderPage(p,loaded.documents,after,3);
  const a=before.getContext('2d')!.getImageData(0,0,before.width,before.height).data,b=after.getContext('2d')!.getImageData(0,0,before.width,before.height).data;
  let changed=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])changed++;
  loaded.dispose();return {changed,rows:p.layers.filter((l:any)=>l.tableRow).length,edits:p.rowEdits};
 });
 expect(proof.rows).toBe(0);expect(proof.changed,JSON.stringify(proof.edits)).toBe(0);
});

test('multiline rows survive reload and can be deleted out of order with Undo/Redo',async({page})=>{
 await page.goto('/tests/browser/editor-resilience/harness.html?credit=1&tight=1&embedded=1');
 await page.getByRole('button',{name:'Edit original text: City Ledger',exact:true}).click();await page.getByRole('button',{name:'Add row below',exact:true}).click();
 await page.getByRole('textbox',{name:'Edit document text',exact:true}).fill('FIRST\nSECOND\nTHIRD');
 await page.getByRole('button',{name:'Add row below',exact:true}).click();await expect(page.getByRole('button',{name:'Move text layer',exact:true})).toHaveCount(10);await expect(page.getByRole('textbox',{name:'Edit document text',exact:true})).toBeFocused();await page.getByRole('textbox',{name:'Edit document text',exact:true}).fill('KEEP');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByText('Draft saved. Final review is still required.',{exact:true})).toBeVisible();
 await page.evaluate(()=>{const f=(window as any).fixture;f.mount(JSON.parse(JSON.stringify(f.project)));});
 await expect(page.getByRole('button',{name:'Move text layer',exact:true})).toHaveCount(10);
 await page.getByRole('button',{name:'Move text layer',exact:true}).first().click();await page.getByRole('button',{name:'Delete row',exact:true}).click();
 await expect(page.getByRole('button',{name:'Move text layer',exact:true})).toHaveCount(5);await expect(page.getByRole('alert')).toHaveCount(0);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByRole('button',{name:'Move text layer',exact:true})).toHaveCount(10);
 await page.getByRole('button',{name:'Redo',exact:true}).click();await expect(page.getByRole('button',{name:'Move text layer',exact:true})).toHaveCount(5);
 await page.getByRole('button',{name:'Move text layer',exact:true}).first().click();await expect(page.getByRole('textbox',{name:'Layer text',exact:true})).toHaveValue('KEEP');
 await page.getByRole('button',{name:'Delete row',exact:true}).click();await expect(page.getByRole('button',{name:'Move text layer',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByText('Draft saved. Final review is still required.',{exact:true})).toBeVisible();
 const delta=await page.evaluate(()=>(window as any).fixture.project.pages[0].rowEdits.reduce((n:number,e:any)=>n+(e.kind==='insert'?e.height:e.kind==='delete'?-e.height:0),0));expect(delta).toBeCloseTo(0,7);
 await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();await expect(page.getByRole('dialog',{name:'Final PDF preview',exact:true})).toBeVisible();
});

test('selecting unchanged special-style text does not prevent Preview',async({page})=>{
 await page.goto('/tests/browser/editor-resilience/harness.html');
 await page.getByRole('button',{name:'Edit original text: CLEAR THIS SPECIAL TEXT',exact:true}).click();
 await expect(page.getByRole('alert')).toHaveCount(0);
 await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Final PDF preview',exact:true})).toBeVisible({timeout:1500});
});

test('deleting a new row keeps an independently placed note in its space',async({page})=>{
 await page.goto('/tests/browser/editor-resilience/harness.html?credit=1&tight=1');
 await page.getByRole('button',{name:'Edit original text: City Ledger',exact:true}).click();await page.getByRole('button',{name:'Add row below',exact:true}).click();await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(5);
 await page.getByRole('button',{name:'Add text anywhere',exact:true}).click();
 const cell=await page.locator('.pdf-layer-target.empty-cell').first().boundingBox(),paper=await page.locator('.pdf-paper').boundingBox();
 await page.getByRole('button',{name:'Place text on page',exact:true}).click({position:{x:cell!.x-paper!.x+4,y:cell!.y-paper!.y+2}});
 await expect(page.getByRole('textbox',{name:'Edit document text',exact:true})).toBeFocused();await page.getByRole('textbox',{name:'Edit document text',exact:true}).fill('KEEP NOTE');
 await page.getByRole('textbox',{name:'Edit document text',exact:true}).press('Escape');
 await page.locator('.pdf-layer-target.empty-cell .pdf-layer-move').nth(3).click();await page.getByRole('button',{name:'Delete row',exact:true}).click();
 await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByText('Row removed. Space containing other content was kept.',{exact:true})).toBeVisible();
 await expect(page.locator('.pdf-differences')).toContainText('KEEP NOTE');
 await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();await expect(page.getByRole('dialog',{name:'Final PDF preview',exact:true})).toBeVisible();
});

test('whitespace-only source edits need no replacement font',async({page})=>{
 await page.goto('/tests/browser/editor-resilience/harness.html');
 await page.getByRole('button',{name:'Edit original text: CLEAR THIS SPECIAL TEXT',exact:true}).click();
 await page.getByRole('textbox',{name:'Layer text',exact:true}).fill(' \n ');
 await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Final PDF preview',exact:true})).toBeVisible({timeout:1500});
});

test('an empty new row using a tall embedded source font can be deleted from Debit',async({page})=>{
 await page.goto('/tests/browser/editor-resilience/harness.html?credit=1&tight=1&embedded=1');
 await page.getByRole('button',{name:'Edit original text: City Ledger',exact:true}).click();
 await page.getByRole('button',{name:'Add row below',exact:true}).click();
 await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(5);
 await page.locator('.pdf-layer-target.empty-cell .pdf-layer-move').nth(3).click();
 await page.getByRole('button',{name:'Delete row',exact:true}).click();
 await expect(page.getByRole('alert')).toHaveCount(0,{timeout:1500});
 await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(0);
});

for(const action of ['add','delete'])test(`row tools after moving source text: ${action}`,async({page})=>{
 await page.goto('/tests/browser/editor-resilience/harness.html?credit=1');
 await page.getByRole('button',{name:'Edit original text: City Ledger',exact:true}).click();
 await page.getByText('Position & size',{exact:true}).click();await page.getByRole('spinbutton',{name:'Layer y',exact:true}).fill('300');
 if(action==='add'){
  await page.getByRole('button',{name:'Add row below',exact:true}).click();
  await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(1,{timeout:1500});
 }else{
  await page.getByRole('button',{name:'Delete row',exact:true}).click();
  await expect(page.getByRole('button',{name:'Edit original text: City Ledger',exact:true})).toHaveCount(0,{timeout:1500});
  await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();await expect(page.getByRole('dialog',{name:'Final PDF preview',exact:true})).toBeVisible();
 }
 await expect(page.getByRole('alert')).toHaveCount(0);
});

for(const width of [1440,1280])test(`insert/delete/review/export preserves the original one-page invoice at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/tests/browser/editor-resilience/harness.html?credit=1&tight=1&embedded=1');
 await page.getByRole('button',{name:'Edit original text: City Ledger',exact:true}).click();await page.getByRole('button',{name:'Add row below',exact:true}).click();
 await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(5);await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');
 await page.screenshot({path:`.tmp/pdf-row-lifecycle-added-${width}.png`,animations:'disabled'});
 await page.locator('.pdf-layer-target.empty-cell .pdf-layer-move').nth(3).click();await page.getByRole('button',{name:'Delete row',exact:true}).click();
 await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');
 await page.screenshot({path:`.tmp/pdf-row-lifecycle-deleted-${width}.png`,animations:'disabled'});
 await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();await reviewPreviewPages(page);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Save reviewed PDFs privately',exact:true}).click();await expect(page.getByRole('button',{name:'Saved',exact:true})).toBeVisible();
 const proof=await page.evaluate(async()=>{
  const f=(window as any).fixture,source=await f.loadSources(f.sources),output=await f.loadSources([{id:'out',name:'reviewed.pdf',kind:'invoice',bytes:f.saved[0].bytes}]);
  const before=document.createElement('canvas'),after=document.createElement('canvas');
  // The export embeds 300dpi pixels. Compare at that exact scale to avoid a
  // different PDF font rasterizer/sampling scale masquerading as a layout change.
  await f.renderPage(source.project.pages[0],source.documents,before,300/72);await f.renderPage(output.project.pages[0],output.documents,after,300/72);
  const a=before.getContext('2d')!.getImageData(0,0,before.width,before.height).data,b=after.getContext('2d')!.getImageData(0,0,after.width,after.height).data;
  let darkBefore=0,darkAfter=0;for(let i=0;i<a.length;i+=4)if(a[i]<180)darkBefore++;for(let i=0;i<b.length;i+=4)if(b[i]<180)darkAfter++;
  const result={pages:output.project.pages.length,width:after.width,height:after.height,sourceWidth:before.width,sourceHeight:before.height,ratio:darkAfter/darkBefore};source.dispose();output.dispose();return result;
 });
 expect(proof.pages).toBe(1);expect(proof.width).toBe(proof.sourceWidth);expect(proof.height).toBe(proof.sourceHeight);expect(proof.ratio).toBeGreaterThan(.97);expect(proof.ratio).toBeLessThan(1.03);
});
