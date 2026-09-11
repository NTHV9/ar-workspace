import {test,expect} from '@playwright/test';
test('native extraction retains black, bold, italic and colored text',async({page})=>{
 await page.goto('/tests/browser/source-style/harness.html');await page.waitForFunction(()=>!!(window as any).fixture);
 const runs=await page.evaluate(async()=>{const f=(window as any).fixture,l=await f.loadSources(f.sources),r=await f.detectText(l.project.pages[0],l.documents);l.dispose();return r;});
 expect(runs.map((r:any)=>r.color)).toEqual(['#000000','#000000','#b21a33']);expect(runs.map((r:any)=>r.bold)).toEqual([false,true,false]);expect(runs.map((r:any)=>r.italic)).toEqual([false,false,true]);
});
for(const fixture of ['sources','embeddedSources'])test(`${fixture} replacement retains pixels and reloads safely`,async({page})=>{
 await page.goto('/tests/browser/source-style/harness.html');await page.waitForFunction(()=>!!(window as any).fixture);
 const result=await page.evaluate(async(fixture)=>{
  const f=(window as any).fixture,l=await f.loadSources(f[fixture]),p=l.project.pages[0],runs=await f.detectText(p,l.documents),a=document.createElement('canvas'),b=document.createElement('canvas');
  await f.renderPage(p,l.documents,a,3);p.layers=runs.map((r:any,i:number)=>f.createReplacementLayer(r,String(i)));await f.renderPage(p,l.documents,b,3);
  const aa=a.getContext('2d')!.getImageData(0,0,a.width,a.height).data,bb=b.getContext('2d')!.getImageData(0,0,b.width,b.height).data;let difference=0,ink=0;
  for(let i=0;i<aa.length;i+=4){if(aa[i]<250||aa[i+1]<250||aa[i+2]<250)ink++;if(Math.abs(aa[i]-bb[i])+Math.abs(aa[i+1]-bb[i+1])+Math.abs(aa[i+2]-bb[i+2])>30)difference++;}
  const layer=p.layers[0];layer.text=fixture==='sources'?'New Invoice 98765\n123':'Invoice 98765\n123';layer.width=Math.max(layer.width,f.measureLayerText(layer).naturalWidth);const m=f.measureLayerText(layer);layer.height=m.height;await f.renderPage(p,l.documents,b,3);
  const serialized=JSON.parse(JSON.stringify(p));l.dispose();const next=await f.loadSources(f[fixture]);await f.renderPage(serialized,next.documents,b,3);serialized.layers[0].text='\u4e0d\u53ef';let missing=false;try{await f.renderPage(serialized,next.documents,b,3);}catch{missing=true;}next.dispose();return{difference,ink,missing,lines:m.lines.length};
 },fixture);
 expect(result.difference/result.ink).toBeLessThan(.06);expect(result.missing).toBe(true);expect(result.lines).toBe(2);
});
test('runtime font references stay isolated and private source state is released on dispose',async({page})=>{
 await page.goto('/tests/browser/source-style/harness.html');await page.waitForFunction(()=>!!(window as any).fixture);
 const result=await page.evaluate(async()=>{const f=(window as any).fixture,a=await f.loadSources(f.sources),b=await f.loadSources(f.sources);const ra=await f.detectText(a.project.pages[0],a.documents),rb=await f.detectText(b.project.pages[0],b.documents),la=f.createReplacementLayer(ra[0],'a'),lb=f.createReplacementLayer(rb[0],'b');const distinct=la.sourceText.scope!==lb.sourceText.scope;a.dispose();const disposed=f.measureLayerText(la).unsupported,live=f.measureLayerText(lb).unsupported;b.dispose();return{distinct,disposed,live};});
 expect(result).toEqual({distinct:true,disposed:true,live:false});
});

test('trimmed repeated runs retain their own operator style without skipping subsequent runs',async({page})=>{
 await page.goto('/tests/browser/source-style/harness.html');await page.waitForFunction(()=>!!(window as any).fixture);
 const runs=await page.evaluate(async()=>{const f=(window as any).fixture,l=await f.loadSources(f.repeatedSources),runs=await f.detectText(l.project.pages[0],l.documents);l.dispose();return runs;});
 expect(runs.map((r:any)=>r.unsupported)).toEqual([false,false]);expect(runs.map((r:any)=>r.color)).toEqual(['#000000','#ff0000']);
});
