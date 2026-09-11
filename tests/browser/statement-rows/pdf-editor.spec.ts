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
