import {expect,it} from 'vitest';
import {restoreProject} from '../src/pdf/model';
import {fitLayerOnPage} from '../src/pdf/page-bounds';
import type {PdfLayer,PdfProject} from '../src/pdf/types';

const original:PdfProject={version:1,content:'invoices',delivery:'combined',pages:[{id:'page',sourceId:'invoice',sourcePage:1,width:612,height:792,layers:[]}]};
const layer:PdfLayer={id:'edit',kind:'text',x:40,y:40,width:120,height:24,text:'VISIBLE',font:'Arial',fontSize:12,bold:false,italic:false,color:'#000000',fill:'#ffffff'};
const project=(change:Partial<PdfLayer>):PdfProject=>({...original,pages:[{...original.pages[0],layers:[{...layer,...change}]}]});

for(const change of [{x:1000},{y:900},{x:-30},{y:-5},{x:600,width:40},{y:780,height:30}])it(`rejects saved edits clipped by the physical page ${JSON.stringify(change)}`,()=>{
 expect(()=>restoreProject(project(change),original)).toThrow();
});
it('rejects a replacement that would mask the original but paint the replacement outside the page',()=>{
 expect(()=>restoreProject(project({kind:'replacement',x:1000,original:{text:'ORIGINAL',x:40,y:40,width:100,height:24}}),original)).toThrow();
});
it('accepts an edit exactly inside the page edge and an edit on a valid continued flow page',()=>{
 expect(restoreProject(project({x:492,y:768}),original).pages[0].layers[0].x).toBe(492);
 const continued=project({y:810});continued.pages[0].flowHeight=900;
 expect(restoreProject(continued,original).pages[0].layers[0].y).toBe(810);
});
it('limits positions to the page without shrinking or changing text',()=>{
 expect(fitLayerOnPage(original.pages[0],{...layer,x:1000,y:-50})).toMatchObject({x:492,y:0,width:120,height:24,text:'VISIBLE'});
});
it('limits numeric sizes and preserves the aspect ratio of oversized images',()=>{
 expect(fitLayerOnPage(original.pages[0],{...layer,width:1000,height:1000})).toMatchObject({x:0,y:0,width:612,height:792});
 const image=fitLayerOnPage(original.pages[0],{...layer,kind:'image',width:1224,height:1000,x:40,y:40});
 expect(image.width).toBe(612);expect(image.height).toBe(500);expect(image.x).toBe(0);expect(image.y).toBe(40);
});
