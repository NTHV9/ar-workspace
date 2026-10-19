import {test,expect} from '@playwright/test';
for(const fixture of ['sources','embeddedSources'])test(`${fixture}: opaque PDF.js source and transparent glyph matte allow ordinary multiline, moved and deleted edits at every render scale`,async({page})=>{
 await page.goto('/tests/browser/source-style/harness.html');await page.waitForFunction(()=>!!(window as any).fixture);
 const result=await page.evaluate(async(fixture)=>{
  const f=(window as any).fixture,loaded=await f.loadSources(f[fixture]),source=loaded.project.pages[0],runs=await f.detectText(source,loaded.documents),canvas=document.createElement('canvas'),out=[];
  try{for(const kind of ['multiline','moved','deleted']){
   const layer=f.createReplacementLayer(runs[0],kind);
   if(kind==='multiline'){layer.text=fixture==='sources'?'New Invoice 98765\n123':'Invoice 98765\n123';layer.width=Math.max(layer.width,f.measureLayerText(layer).naturalWidth);layer.height=f.measureLayerText(layer).height;}
   if(kind==='moved')layer.x+=30;
   if(kind==='deleted'){layer.deleted=true;layer.text='';}
   const current={...source,layers:[layer]};
   for(const scale of [.16,1.5,3]){const rendered=await f.renderPage(current,loaded.documents,canvas,scale);out.push({kind,scale,issues:rendered.issues.length});}
   const files=await f.exportProject({...loaded.project,pages:[current]},f[fixture],loaded.documents);out.push({kind,exported:files[0].bytes.length>0});
  }}finally{loaded.dispose();}
  return out;
 },fixture);
 expect(result.every((item:any)=>item.exported===true||item.issues===0)).toBe(true);
});
test('actual blue source raster stays blue with readable white replacement, while internal artwork is refused',async({page})=>{
 await page.goto('/tests/browser/native-background/harness.html');await page.waitForFunction(()=>!!(window as any).fixture);
 const result=await page.evaluate(async()=>{const f=(window as any).fixture,out:any={};
  for(const kind of ['blue','artwork']){const loaded=await f.loadSources(f[kind]),source=loaded.project.pages[0],runs=await f.detectText(source,loaded.documents),layer=f.createReplacementLayer(runs[0],kind),canvas=document.createElement('canvas');
   layer.text=kind==='blue'?'BILL':'';if(kind==='artwork')layer.deleted=true;
   const current={...source,layers:[layer],rowEdits:[{id:'force-raster',kind:'move',x:350,y:250,width:10,height:10,dx:1,dy:0}]};
   try{await f.renderPage(current,loaded.documents,canvas,1.5);const data=canvas.getContext('2d')!.getImageData(60,54,75,24).data;let white=0,blue=0;for(let i=0;i<data.length;i+=4){if(data[i]>220&&data[i+1]>220&&data[i+2]>220)white++;if(data[i]<40&&data[i+1]<80&&data[i+2]>100)blue++;}out[kind]={white,blue,exported:(await f.exportProject({...loaded.project,pages:[current]},f[kind],loaded.documents))[0].bytes.length>0};}
   catch(error){out[kind]={error:error instanceof Error?error.message:String(error)};}finally{loaded.dispose();}
  }return out;});
 expect(result.blue.exported).toBe(true);expect(result.blue.white).toBeGreaterThan(10);expect(result.blue.blue).toBeGreaterThan(500);expect(result.artwork.error).toMatch(/artwork/);expect(result.artwork.error).toMatch(/Restore original text/);
});
for(const merge of [false,true])test(`blue native replacement stays searchable through ${merge?'attached merged document map':'initial source'} export`,async({page})=>{
 await page.goto('/tests/browser/native-background/harness.html');await page.waitForFunction(()=>!!(window as any).fixture);
 const result=await page.evaluate(async(merge)=>{const f=(window as any).fixture,base={...f.blue[0],id:'original',invoiceId:'A'},attachment={...f.blue[0],id:'attached',kind:'attachment'},original=await f.loadSources([base]),addition=merge?await f.loadSources([attachment]):undefined;
  try{const documents=merge?new Map([...original.documents,...addition.documents]):original.documents,sources=merge?[base,attachment]:[base],pages=merge?[...original.project.pages,...addition.project.pages]:original.project.pages,target=pages[pages.length-1],runs=await f.detectText(target,documents),layer=f.createReplacementLayer(runs[0],'bill');layer.text='BILL';target.layers=[layer];
   const canvas=document.createElement('canvas');await f.renderPage(target,documents,canvas,1.5);
   const project={...original.project,pages,...(merge?{invoiceAttachments:[{sourceId:'attached',invoiceId:'A'}]}:{})},files=await f.exportProject(project,sources,documents),reopened=await f.loadSources([{id:'output',name:'Output',kind:'invoice',bytes:files[0].bytes}]);
   try{const last=reopened.project.pages[reopened.project.pages.length-1],text=(await f.detectText(last,reopened.documents)).map((run:any)=>run.text).join(' ');return {text,scope:runs[0].sourceText.scope};}finally{reopened.dispose();}
  }finally{addition?.dispose();original.dispose();}
 },merge);
 expect(result.text).toContain('BILL');expect(result.text).not.toContain('INVOICE');expect(result.scope).not.toBe('unregistered');
});
test('a page-level native refusal is cached across keystrokes without disabling safe raster editing',async({page})=>{
 await page.goto('/tests/browser/native-background/harness.html');await page.waitForFunction(()=>!!(window as any).fixture);
 const result=await page.evaluate(async()=>{const f=(window as any).fixture,OriginalWorker=window.Worker;let workers=0;window.Worker=class extends OriginalWorker{constructor(url:string|URL,options?:WorkerOptions){super(url,options);if(String(url).includes('native.worker'))workers++;}};
 const loaded=await f.loadSources(f.unsupported),source=loaded.project.pages[0],runs=await f.detectText(source,loaded.documents),canvas=document.createElement('canvas'),layer=f.createReplacementLayer(runs[0],'bill');source.layers=[layer];
 try{for(const text of ['BILL','FILL','BILL']){layer.text=text;await f.renderPage(source,loaded.documents,canvas,1.5);}return {workers};}finally{loaded.dispose();window.Worker=OriginalWorker;}
 });expect(result.workers).toBe(1);
});
