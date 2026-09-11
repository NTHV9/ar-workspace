import {test,expect} from '@playwright/test';
test('Helvetica9 new ordinary glyph, resilient editor and strict export',async({page})=>{
 await page.goto('/tests/browser/flow-engine/harness.html');await page.waitForFunction(()=>!!(window as any).fixture);
 const result=await page.evaluate(async()=>{
  const f=(window as any).fixture,l=await f.loadSources(f.sources),p=l.project.pages[0],runs=await f.detectText(p,l.documents);
  const layer=f.createReplacementLayer(runs[0],'append');layer.text+='n';layer.width=100;
  const metrics=f.measureLayerText(layer);p.layers=[layer];const canvas=document.createElement('canvas');await f.renderPage(p,l.documents,canvas);
  layer.text+='不可';const issues=await f.renderPage(p,l.documents,canvas,2,{tolerant:true});
  const original=document.createElement('canvas');await f.renderPage({...p,layers:[]},l.documents,original,2);
  const a=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data,b=original.getContext('2d')!.getImageData(0,0,original.width,original.height).data;
  const preserved=a.every((v:number,i:number)=>v===b[i]);let blocked=false;try{await f.exportProject(l.project,f.sources,l.documents);}catch{blocked=true;}
  l.dispose();return {unsupported:metrics.unsupported,preserved,issueCount:issues.issues.length,blocked};
 });expect(result).toEqual({unsupported:false,preserved:true,issueCount:1,blocked:true});
});
test('high resolution physical sheet export retains pushed bottom content and native sheet size',async({page})=>{
 await page.goto('/tests/browser/flow-engine/harness.html');await page.waitForFunction(()=>!!(window as any).fixture);
 const result=await page.evaluate(async()=>{
  const f=(window as any).fixture,l=await f.loadSources(f.sources);l.project.pages[0]=f.applyFlowEdit(l.project.pages[0],{id:'insert',kind:'insert',y:100,height:80});
  const files=await f.exportProject(l.project,f.sources,l.documents),reloaded=await f.loadSources([{id:'out',kind:'statement',name:'out',bytes:files[0].bytes}]);
  const last=reloaded.project.pages[1],canvas=document.createElement('canvas');await f.renderPage(last,reloaded.documents,canvas,2);
  const pixels=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<200)ink++;
  const native=await f.PDFDocument.load(files[0].bytes);const {PDFName}=f;const dimensions=native.getPages().map((p:any)=>{const dict=p.node.Resources().lookup(PDFName.of('XObject'));const stream=dict.lookup(dict.keys()[0]);return [stream.dict.get(PDFName.of('Width')).asNumber(),stream.dict.get(PDFName.of('Height')).asNumber()];});
  const sizes=reloaded.project.pages.map((p:any)=>[p.width,p.height]);reloaded.dispose();l.dispose();return{sizes,ink,dimensions};
 });expect(result.sizes).toEqual([[400,300],[400,300]]);expect(result.ink).toBeGreaterThan(100);expect(result.dimensions).toEqual([[1667,1250],[1667,1250]]);
});


test('actual engine continues grid lines and protects a native image at pagination boundary',async({page})=>{
 await page.goto('/tests/browser/flow-engine/harness.html');await page.waitForFunction(()=>!!(window as any).fixture&&!!(window as any).imageSources);
 const result=await page.evaluate(async()=>{
  const f=(window as any).fixture,sources=(window as any).imageSources,l=await f.loadSources(sources);l.project.pages[0]=f.applyFlowEdit(l.project.pages[0],{id:'i',kind:'insert',y:100,height:30});
  const canvas=document.createElement('canvas');await f.renderPage(l.project.pages[0],l.documents,canvas,2);const pixels=canvas.getContext('2d')!.getImageData(40,200,1,60).data;let lineInk=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<150)lineInk++;
  const files=await f.exportProject(l.project,sources,l.documents),out=await f.loadSources([{id:'out',name:'out',kind:'statement',bytes:files[0].bytes}]);await f.renderPage(out.project.pages[1],out.documents,canvas,2);
  const image=canvas.getContext('2d')!.getImageData(241,1,78,78).data;let imageInk=0;for(let i=0;i<image.length;i+=4)if(image[i]<150)imageInk++;out.dispose();l.dispose();return{lineInk,imageInk};
 });expect(result.lineInk).toBeGreaterThan(55);expect(result.imageInk).toBeGreaterThan(5900);
});
test('source typing wraps words and long tokens while exposing natural field width',async({page})=>{
 await page.goto('/tests/browser/flow-engine/harness.html');await page.waitForFunction(()=>!!(window as any).fixture);
 const result=await page.evaluate(async()=>{const f=(window as any).fixture,l=await f.loadSources(f.sources),p=l.project.pages[0],runs=await f.detectText(p,l.documents),layer=f.createReplacementLayer(runs[0],'x');layer.width=50;layer.text='ordinary words repeated and ABCDEFGHIJKLMNOPQRSTUVWXYZ';const metrics=f.measureLayerText(layer);layer.height=metrics.height;p.layers=[layer];await f.renderPage(p,l.documents,document.createElement('canvas'));l.dispose();return {natural:metrics.naturalWidth,width:metrics.width,lines:metrics.lines.length,unsupported:metrics.unsupported};});
 expect(result.natural).toBeGreaterThan(50);expect(result.width).toBeLessThanOrEqual(50);expect(result.lines).toBeGreaterThan(2);expect(result.unsupported).toBe(false);
});
test('an unresolved edit preserves its own source and does not poison other edits',async({page})=>{
 await page.goto('/tests/browser/flow-engine/harness.html');await page.waitForFunction(()=>!!(window as any).fixture);
 const result=await page.evaluate(async()=>{const f=(window as any).fixture,l=await f.loadSources(f.sources),p=l.project.pages[0],runs=await f.detectText(p,l.documents),a=document.createElement('canvas'),b=document.createElement('canvas');await f.renderPage(p,l.documents,a,2);const bad=f.createReplacementLayer(runs[0],'bad'),good=f.createReplacementLayer(runs[1],'good');bad.text+='不可';good.text='CHANGED';good.width=100;p.layers=[bad,good];const report=await f.renderPage(p,l.documents,b,2,{tolerant:true});const pixels=(c:HTMLCanvasElement,y:number,h:number)=>c.getContext('2d')!.getImageData(0,y,c.width,h).data;const top=pixels(a,0,100),editedTop=pixels(b,0,100),bottom=pixels(a,500,100),editedBottom=pixels(b,500,100);l.dispose();return{issues:report.issues.length,topSame:top.every((v:number,i:number)=>v===editedTop[i]),bottomChanged:bottom.some((v:number,i:number)=>v!==editedBottom[i])};});expect(result).toEqual({issues:1,topSame:true,bottomChanged:true});
});
