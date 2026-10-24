import {test,expect} from '@playwright/test';
import {choosePdfTool} from '../fixtures/pdf-tools';
test('line drag keeps the pointer-down coordinate frame when helper content reflows',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await choosePdfTool(page,'Move lines');
 const line=page.getByRole('button',{name:/^Move line /}).first();await expect(line).toBeVisible();
 const paper=(await page.locator('.pdf-paper').boundingBox())!,box=(await line.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+20,y+15,{steps:5});await page.mouse.up();
 await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Save draft',exact:true}).click();
 const edit=await page.evaluate(()=>(window as any).pdfTest.draft.pages[0].rowEdits.at(-1));
 expect(edit.kind).toBe('move');expect(edit.dx).toBeCloseTo(20/paper.width*595,1);expect(edit.dy).toBeCloseTo(15/paper.height*842,1);
});
test('repeated native line nudges use distinct commands and retain Undo and strict export',async({page})=>{
 await page.goto('/tests/browser/pdf-editor-harness.html');await choosePdfTool(page,'Move lines');
 await page.getByRole('button',{name:/^Move line /}).first().press('Enter');const area=page.getByRole('button',{name:'Move selected table or area',exact:true});
 await area.press('Shift+ArrowDown');await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeEnabled();
 const afterFirst=await area.getAttribute('style');await area.press('Shift+ArrowDown');await expect(area).not.toHaveAttribute('style',afterFirst!);
 await page.getByRole('button',{name:'Save draft',exact:true}).click();const proof=await page.evaluate(async()=>{const f=(window as any).pdfTest,p=f.draft,loaded=await f.loadSources(f.sources);try{return {ids:p.pages[0].rowEdits.map((e:any)=>e.id),files:(await f.exportProject(p,f.sources,loaded.documents)).length};}finally{loaded.dispose();}});
 expect(proof.ids).toHaveLength(2);expect(new Set(proof.ids).size).toBe(2);expect(proof.files).toBe(1);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(area).toHaveCount(0);await page.getByRole('button',{name:'Save draft',exact:true}).click();expect(await page.evaluate(()=>(window as any).pdfTest.draft.pages[0].rowEdits.length)).toBe(1);
});
test('occupied next-row move is refused while a blank horizontal nudge remains available',async({page})=>{
 await page.goto('/tests/browser/editor-resilience/harness.html');await page.waitForFunction(()=>(window as any).fixture);
 const rect=await page.evaluate(async()=>{const f=(window as any).fixture,l=await f.loadSources(f.sources);try{const r=(await f.detectText(l.project.pages[0],l.documents)).find((r:any)=>r.text==='REF-001');return {x:r.x,y:r.y,width:r.width,height:r.height};}finally{l.dispose();}});
 await choosePdfTool(page,'Move table / area');for(const [label,key] of [['Left','x'],['Top','y'],['Width','width'],['Height','height']] as const)await page.getByLabel(label,{exact:true}).fill(String(rect[key]));await page.getByRole('button',{name:'Select area',exact:true}).click();const area=page.getByRole('button',{name:'Move selected table or area',exact:true}),before=await area.getAttribute('style');
 await area.press('Shift+ArrowDown');await expect(page.getByRole('alert')).toContainText(/occupied|overlap/i);await expect(area).toHaveAttribute('style',before!);await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeDisabled();
 await area.press('ArrowRight');await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeEnabled();await expect(area).not.toHaveAttribute('style',before!);
});
for(const width of [1440,1280])test(`native movement keeps paper and visible selection stable at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/tests/browser/pdf-editor-harness.html');await choosePdfTool(page,'Move lines');const line=page.getByRole('button',{name:/^Move line /}).first(),paper=page.locator('.pdf-paper'),before=(await paper.boundingBox())!,box=(await line.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2;
 await page.mouse.move(x,y);await page.mouse.down();const during=(await paper.boundingBox())!;expect(during.y).toBeCloseTo(before.y,1);expect(during.width).toBeCloseTo(before.width,1);
 await page.mouse.move(x+20,y+15,{steps:5});const moved=(await paper.boundingBox())!;expect(moved.y).toBeCloseTo(before.y,1);await page.mouse.up();await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeEnabled();const after=(await paper.boundingBox())!,area=(await page.getByRole('button',{name:'Move selected table or area',exact:true}).boundingBox())!;expect(after.y).toBeCloseTo(before.y,1);expect(after.width).toBeCloseTo(before.width,1);expect(area.x-box.x).toBeCloseTo(20,0);expect(area.y-box.y).toBeCloseTo(15,0);
});
for(const width of [1440,1280])test(`area selection keeps its bounds controls and paper stable at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/tests/browser/pdf-editor-harness.html');await choosePdfTool(page,'Move table / area');const paper=page.locator('.pdf-paper'),before=(await paper.boundingBox())!,sx=before.width/595,sy=before.height/842;
 await page.mouse.move(before.x+20*sx,before.y+10*sy);await page.mouse.down();await page.mouse.move(before.x+40*sx,before.y+25*sy,{steps:3});expect((await paper.boundingBox())!.y).toBeCloseTo(before.y,1);await page.mouse.up();await expect(page.getByRole('button',{name:'Move selected table or area',exact:true})).toBeVisible();await expect(page.getByRole('group',{name:'Area bounds · PDF points'})).toBeVisible();expect((await paper.boundingBox())!.y).toBeCloseTo(before.y,1);
});
