import {test,expect} from '@playwright/test';

test('blank Voucher entry uses the native face, location and pixels in Preview/export',async({page})=>{
 await page.goto('/tests/browser/voucher-field/harness.html');
 const target=page.getByRole('button',{name:'Enter Voucher No.',exact:true});await expect(target).toBeVisible();
 await target.click();await page.getByRole('textbox',{name:'Edit document text',exact:true}).fill('87654321');
 await expect(page.getByText('Text overlaps another field. Add a row, move the box, or shorten the text.',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 const result=await page.evaluate(async()=>{
  const f=(window as any).fixture,loaded=await f.loadSources(f.sources),project=f.restoreProject(f.draft,loaded.project),field=project.pages[0].layers[0];
  const expected=await f.loadSources(await f.make('87654321')),a=document.createElement('canvas'),b=document.createElement('canvas');
  await f.renderPage(project.pages[0],loaded.documents,a,4);await f.renderPage(expected.project.pages[0],expected.documents,b,4);
  const aa=a.getContext('2d')!.getImageData(0,0,a.width,a.height).data,bb=b.getContext('2d')!.getImageData(0,0,b.width,b.height).data;let different=0,ink=0;
  for(let y=128*4;y<147*4;y++)for(let x=469*4;x<565*4;x++){const i=(y*a.width+x)*4;if(bb[i]<180)ink++;if(Math.abs(aa[i]-bb[i])+Math.abs(aa[i+1]-bb[i+1])+Math.abs(aa[i+2]-bb[i+2])>45)different++;}
  const exports=await f.exportProject(project,f.sources,loaded.documents);loaded.dispose();expected.dispose();return{field:{fontSize:field.fontSize,bold:field.bold,color:field.color,x:field.x,maskOriginal:field.maskOriginal},different,ink,exported:exports[0].bytes.length>0};
 });
 expect(result.field).toMatchObject({fontSize:8,bold:true,color:'#000000',x:472.5,maskOriginal:false});expect(result.ink).toBeGreaterThan(30);expect(result.different/result.ink).toBeLessThan(.06);expect(result.exported).toBe(true);
 await page.getByRole('button',{name:'Open mandatory Preview',exact:true}).click();await expect(page.getByRole('img',{name:'Final PDF page 1',exact:true})).toBeVisible();
});
test('changing Voucher font and reopening its target keeps a single entry',async({page})=>{
 await page.goto('/tests/browser/voucher-field/harness.html');const target=page.getByRole('button',{name:'Enter Voucher No.',exact:true});await target.click();
 await page.getByRole('textbox',{name:'Edit document text',exact:true}).fill('12345');await page.getByRole('combobox',{name:'Text font',exact:true}).selectOption('Arial');
 await target.press('Enter');await page.getByRole('textbox',{name:'Edit document text',exact:true}).fill('67890');await page.getByRole('button',{name:'Save draft',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).fixture.draft.pages[0].layers.length)).toBe(1);
 await page.evaluate(()=>{const f=(window as any).fixture;f.mount(f.draft);});await expect(target).toBeVisible();await target.press('Enter');await page.getByRole('textbox',{name:'Edit document text',exact:true}).fill('11223344');await page.getByRole('button',{name:'Save draft',exact:true}).click();expect(await page.evaluate(()=>(window as any).fixture.draft.pages[0].layers.length)).toBe(1);
});
test('deleting an original Voucher value leaves a blank reusable field',async({page})=>{
 await page.goto('/tests/browser/voucher-field/harness.html?filled=1');await page.getByRole('button',{name:'Edit original text: 87654321',exact:true}).click();await page.getByRole('button',{name:'Delete text box',exact:true}).click();
 const target=page.getByRole('button',{name:'Enter Voucher No.',exact:true});await expect(target).toBeVisible();await target.click();await expect(page.getByRole('textbox',{name:'Edit document text',exact:true})).toHaveValue('');
 await page.getByRole('textbox',{name:'Edit document text',exact:true}).fill('99887766');await page.getByRole('button',{name:'Save draft',exact:true}).click();expect(await page.evaluate(()=>(window as any).fixture.draft.pages[0].layers.length)).toBe(1);
});
test('clearing and deleting a Voucher entry always leaves one reusable empty field',async({page})=>{
 await page.goto('/tests/browser/voucher-field/harness.html');const target=page.getByRole('button',{name:'Enter Voucher No.',exact:true});await target.click();
 await page.getByRole('textbox',{name:'Edit document text',exact:true}).fill('12345678');await page.getByRole('textbox',{name:'Edit document text',exact:true}).fill('');
 await page.getByRole('button',{name:'Delete text box',exact:true}).click();await expect(target).toBeVisible();await target.click();await page.getByRole('textbox',{name:'Edit document text',exact:true}).fill('54321098');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();expect(await page.evaluate(()=>(window as any).fixture.draft.pages[0].layers.filter((l:any)=>!l.deleted).length)).toBe(1);
});
test('leaving the field empty keeps the original PDF text and prints no placeholder',async({page})=>{
 await page.goto('/tests/browser/voucher-field/harness.html');await page.getByRole('button',{name:'Enter Voucher No.',exact:true}).click();await page.getByRole('button',{name:'Save draft',exact:true}).click();
 const text=await page.evaluate(async()=>{const f=(window as any).fixture,l=await f.loadSources(f.sources),p=f.restoreProject(f.draft,l.project),files=await f.exportProject(p,f.sources,l.documents),task=f.getDocument({data:files[0].bytes});const doc=await task.promise;const text=(await(await doc.getPage(1)).getTextContent()).items.map((i:any)=>i.str||'').join(' ');await task.destroy();l.dispose();return text;});
 expect(text).toContain('UNCHANGED BODY');expect(text).not.toContain('Enter Voucher');
});
