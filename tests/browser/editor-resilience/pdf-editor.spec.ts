import {test,expect} from '@playwright/test';
import {reviewPreviewPages} from '../fixtures/pdf-preview';

test('sparse invoice rows provide all five editable columns',async({page})=>{
 await page.goto('/tests/browser/editor-resilience/harness.html');
 await page.getByRole('button',{name:'Edit original text: City Ledger',exact:true}).click();
 await page.getByRole('button',{name:'Add row below',exact:true}).click();
 await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(5);
 const continuation=await page.getByRole('button',{name:'Edit original text: Credit continuation',exact:true}).boundingBox(),cell=await page.locator('.pdf-layer-target.empty-cell').first().boundingBox();
 expect(cell!.y).toBeGreaterThan(continuation!.y+continuation!.height-.5);
 await expect(page.getByRole('alert')).toHaveCount(0);
});

for(const action of ['inline','sidebar','delete-box'])test(`clearing unsupported source text through ${action} exports without a font warning`,async({page})=>{
 await page.goto('/tests/browser/editor-resilience/harness.html');
 await page.getByRole('button',{name:'Edit original text: CLEAR THIS SPECIAL TEXT',exact:true}).click();
 if(action==='delete-box')await page.getByRole('button',{name:'Delete text box',exact:true}).click();
 else if(action==='sidebar')await page.getByRole('textbox',{name:'Layer text',exact:true}).fill('');
 else {const input=page.getByRole('textbox',{name:'Edit document text',exact:true});await input.press('ControlOrMeta+a');await input.press('Backspace');}
 await expect(page.getByRole('button',{name:'Use Arial for this text',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Final PDF preview',exact:true})).toBeVisible();
 await expect(page.locator('.pdf-final-sheet')).toHaveAttribute('data-render-state','ready');
});

test('dense but visibly separate native rows can be inserted and deleted',async({page})=>{
 await page.goto('/tests/browser/editor-resilience/harness.html?tight=1');
 const geometry=await page.evaluate(async()=>{const f=(window as any).fixture,l=await f.loadSources(f.sources),p=l.project.pages[0],runs=await f.detectText(p,l.documents),r=runs.find((r:any)=>r.text==='REF-001'),a=f.createReplacementLayer(r,'probe'),row=f.rowGeometry({...p,layers:[a]},a,runs);const proof={separable:row.separable,top:row.top,end:row.end,cells:row.cells.map((c:any)=>c.run.text),ink:runs.filter((r:any)=>r.y>130&&r.y<170).map((r:any)=>({text:r.text,y:r.y,ink:f.measureLayerInk(f.createReplacementLayer(r,'probe')),supported:f.sourceStyle(f.createReplacementLayer(r,'probe')).supported}))};l.dispose();return proof;});
 expect(geometry.separable,JSON.stringify(geometry)).toBe(true);
 await page.getByRole('button',{name:'Edit original text: REF-001',exact:true}).click();
 await page.getByRole('button',{name:'Add row below',exact:true}).click();
 await expect(page.locator('.pdf-layer-target.empty-cell')).toHaveCount(5);
 await expect(page.getByRole('alert')).toHaveCount(0);
 await page.getByRole('button',{name:'Edit original text: REF-002',exact:true}).click();
 await page.getByRole('button',{name:'Delete row',exact:true}).click();
 await expect(page.getByRole('button',{name:'Edit original text: REF-002',exact:true})).toHaveCount(0);
 await expect(page.getByRole('alert')).toHaveCount(0);
});

test('clearing a word in a dense invoice preserves every pixel of the next word',async({page})=>{
 await page.goto('/tests/browser/editor-resilience/harness.html?tight=1');
 await page.getByRole('button',{name:'Edit original text: REF-001',exact:true}).click();
 await page.getByRole('textbox',{name:'Layer text',exact:true}).fill('');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await expect(page.getByText('Draft saved. Final review is still required.',{exact:true})).toBeVisible();
 const proof=await page.evaluate(async()=>{
  const f=(window as any).fixture,l=await f.loadSources(f.sources),p=l.project.pages[0],runs=await f.detectText(p,l.documents),next=runs.find((r:any)=>r.text==='REF-002');
  const rect=f.measureLayerInk(f.createReplacementLayer(next,'probe')),before=document.createElement('canvas'),after=document.createElement('canvas');
  await f.renderPage(p,l.documents,before,4);await f.renderPage(f.project.pages[0],l.documents,after,4);
  const x=Math.floor(next.x*4),y=Math.floor(rect.y*4),w=Math.ceil(next.width*4),h=Math.ceil(rect.height*4);
  const a=before.getContext('2d')!.getImageData(x,y,w,h).data,b=after.getContext('2d')!.getImageData(x,y,w,h).data;
  let changed=0,ink=0;for(let i=0;i<a.length;i+=4){if(a[i]<230)ink++;if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])changed++;}
  l.dispose();return{changed,ink};
 });
 expect(proof.ink).toBeGreaterThan(0);expect(proof.changed).toBe(0);
});

test('new rows accept new characters in every cell and wrap before the next column',async({page})=>{
 await page.goto('/tests/browser/editor-resilience/harness.html');
 await page.getByRole('button',{name:'Edit original text: City Ledger',exact:true}).click();
 await page.getByRole('button',{name:'Add row below',exact:true}).click();
 const values=['04/09/26','Additional transfer with a long description that wraps safely','NEW-REF-Z','123.45','0.00'];
 for(const [index,value] of values.entries()){
  const input=page.getByRole('textbox',{name:'Edit document text',exact:true});
  await expect(input).toBeFocused();await input.fill(value);if(index<values.length-1)await input.press('Tab');
 }
 await expect(page.getByRole('alert')).toHaveCount(0);
 await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();
 await reviewPreviewPages(page);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Save reviewed PDFs privately',exact:true}).click();await expect(page.getByRole('button',{name:'Saved',exact:true})).toBeVisible();
 const result=await page.evaluate(()=>{const f=(window as any).fixture,cells=f.project.pages[0].layers.filter((l:any)=>l.tableRow).sort((a:any,b:any)=>a.x-b.x);return {values:cells.map((l:any)=>l.text),fonts:cells.map((l:any)=>l.font),plain:cells.every((l:any)=>!l.original&&!l.sourceText),inside:cells.every((l:any,i:number)=>!cells[i+1]||l.x+l.width<=cells[i+1].x),wrapped:cells[1].height>cells[0].height,exported:f.saved[0].bytes.length>0};});
 expect(result).toMatchObject({values,plain:true,inside:true,wrapped:true,exported:true});expect(result.fonts).toEqual(Array(5).fill('Arial'));
});

test('document controls place text at the clicked point and keep guides optional',async({page})=>{
 await page.goto('/tests/browser/editor-resilience/harness.html');
 await expect(page.locator('.pdf-workspace')).toHaveAttribute('data-guides','false');
 await page.getByRole('button',{name:'Document package',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Package',exact:true})).toBeHidden();
 await page.getByRole('button',{name:'Add text anywhere',exact:true}).click();
 await page.getByRole('button',{name:'Place text on page',exact:true}).click({position:{x:170,y:220}});
 const input=page.getByRole('textbox',{name:'Edit document text',exact:true});await expect(input).toBeFocused();await input.fill('FREE NOTE');await input.press('Escape');
 await expect(page.locator('.pdf-layer-target.selected')).toHaveCount(0);
 await page.getByRole('button',{name:'Show guides',exact:true}).click();await expect(page.locator('.pdf-workspace')).toHaveAttribute('data-guides','true');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByText('Draft saved. Final review is still required.',{exact:true})).toBeVisible();
 const note=await page.evaluate(()=>(window as any).fixture.project.pages[0].layers.find((l:any)=>l.text==='FREE NOTE'));
 expect(note).toMatchObject({kind:'text',text:'FREE NOTE'});expect(note.x).toBeGreaterThan(45);expect(note.y).toBeGreaterThan(70);
});

test('Undo clears a resolved Preview warning and original text can be exported again',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html?subset=1');
 await page.getByRole('button',{name:'Edit original text: D12345 - 1',exact:true}).click();
 await page.getByRole('textbox',{name:'Layer text',exact:true}).fill('abcdefgh');
 await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Page 1: choose a replacement font'})).toBeVisible();
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(page.getByRole('alert')).toHaveCount(0);
 await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Final PDF preview',exact:true})).toBeVisible();
});

test('a partial area selection expands to the whole word before it moves',async({page})=>{
 await page.goto('/tests/browser/editor-resilience/harness.html');
 const target=await page.getByRole('button',{name:'Edit original text: REF-001',exact:true}).boundingBox();expect(target).not.toBeNull();
 await page.getByRole('button',{name:'Move table / area',exact:true}).click();
 // Read coordinates again after the contextual tools change the page position.
 const paper=await page.locator('.pdf-paper').boundingBox(),scale=paper!.width/595;
 const x=paper!.x+310*scale,y=paper!.y+(842-700-8*.718)*scale;
 await page.mouse.move(x+2,y+1);await page.mouse.down();await page.mouse.move(x+target!.width*.6,y+target!.height*.8,{steps:3});await page.mouse.up();
 const area=page.getByRole('button',{name:'Move selected table or area',exact:true});await expect(area).toBeVisible();
 const bounds=await area.boundingBox();expect(bounds!.width).toBeGreaterThanOrEqual(target!.width-.5);
 await area.press('ArrowRight');await expect(page.getByRole('alert')).toHaveCount(0);
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByText('Draft saved. Final review is still required.',{exact:true})).toBeVisible();
 const edits=await page.evaluate(()=>(window as any).fixture.project.pages[0].rowEdits);expect(edits).toHaveLength(1);expect(edits[0]).toMatchObject({kind:'move',dx:1,dy:0});
});

for(const width of [1440,1280])test(`document editing controls remain usable at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/tests/browser/editor-resilience/harness.html');
 await page.getByRole('button',{name:'Document package',exact:true}).click();
 await page.getByRole('button',{name:'Edit original text: City Ledger',exact:true}).click();await page.getByRole('button',{name:'Add row below',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Edit document text',exact:true})).toBeFocused();
 await expect(page.locator('.pdf-paper .pdf-canvas')).toHaveAttribute('data-render-state','ready');
 await expect(page.getByRole('button',{name:'Add row below',exact:true})).toBeInViewport();
 await expect(page.getByRole('button',{name:'Open mandatory Preview',exact:true})).toBeInViewport();
 await page.screenshot({path:`.tmp/pdf-resilience-${width}.png`,animations:'disabled'});
});
