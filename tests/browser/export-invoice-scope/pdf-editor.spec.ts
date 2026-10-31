import {test,expect} from '@playwright/test';

test('real PDF export keeps delivered invoice scope without opening Preview',async({page})=>{
 await page.goto('/tests/browser/flow-engine/harness.html');
 await page.waitForFunction(()=>!!(window as any).fixture);
 const result=await page.evaluate(async()=>{
  const f=(window as any).fixture;
  const sources=['a','b','c','d'].map(id=>({...f.sources[0],id,kind:'invoice',invoiceId:id,name:`Invoice ${id}.pdf`}));
  const loaded=await f.loadSources(sources);
  try{
   const project={...loaded.project,content:'invoices',pages:loaded.project.pages.filter((p:any)=>p.sourceId!=='a')};
   const separate=await f.exportProject({...project,delivery:'separate'},sources,loaded.documents);
   const combined=await f.exportProject({...project,delivery:'combined'},sources,loaded.documents);
   return {separate:await Promise.all(separate.map(async(file:any)=>({ids:file.invoiceIds,pages:(await f.PDFDocument.load(file.bytes)).getPageCount()}))),combined:combined[0].invoiceIds,combinedPages:(await f.PDFDocument.load(combined[0].bytes)).getPageCount()};
  }finally{loaded.dispose();}
 });
 expect(result).toEqual({separate:[{ids:['b'],pages:1},{ids:['c'],pages:1},{ids:['d'],pages:1}],combined:['b','c','d'],combinedPages:3});
});
