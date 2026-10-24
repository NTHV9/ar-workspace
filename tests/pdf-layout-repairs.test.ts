import {expect,it} from 'vitest';
import {reflowStationery,assertMoveDestinationClear,assertRasterDestinationClear} from '../src/pdf/layout-safety';
import {fitImage,resizeImage} from '../src/pdf/image-geometry';
import {createReplacementLayer} from '../src/pdf/source-text';
import {mapSourceTextRect} from '../src/pdf/row-layout';
import {sourceFragments} from '../src/pdf/flow';
import {deliveryGroups} from '../src/pdf/model';
import {differencePages} from '../src/pdf/difference-pages';
import type {DetectedText,PdfProjectPage,PdfRowEdit,PdfSourceDocument,PdfProject} from '../src/pdf/types';
const run=(text:string,x:number,y:number,width=110):DetectedText=>({text,x,y,width,height:12,fontSize:10,rotated:false});
const runs=[run('Company',40,80),run('Suite 2',40,96),run('VAT 123',40,112),run('Reference',350,80),run('Date',350,96),run('DATE',40,180),run('DESCRIPTION',120,180)];
const anchor=createReplacementLayer(runs[0],'address');
const page:PdfProjectPage={id:'p',sourceId:'s',sourcePage:1,width:595,height:842,layers:[anchor]};
it('spaces same-column address/VAT fields and keeps reference/date stationary through repeated grow/shrink',()=>{
 let current=page;
 for(const delta of [14,14,-14,-14]){
  const selected=current.layers[0],next={...selected,height:selected.height+delta};
  current=reflowStationery(current,selected,next,runs,[]);
  current={...current,layers:current.layers.map(l=>l.id===selected.id?next:l)};
  const offset=current.layers[0].height-anchor.height;
  expect(mapSourceTextRect(runs[1],current.rowEdits??[])?.y).toBe(96+offset);
  expect(mapSourceTextRect(runs[2],current.rowEdits??[])?.y).toBe(112+offset);
  expect(mapSourceTextRect(runs[3],current.rowEdits??[])?.y).toBe(80);
  expect(mapSourceTextRect(runs[4],current.rowEdits??[])?.y).toBe(96);
 }
 expect(page.rowEdits).toBeUndefined();
});
it('refuses address growth into a table/footer or ambiguous partial column',()=>{
 expect(()=>reflowStationery(page,anchor,{...anchor,height:100},runs,[])).toThrow(/overlap|space|column/i);
 expect(()=>reflowStationery(page,anchor,{...anchor,height:40},[...runs,run('Cross-column',125,110,260)],[])).toThrow(/overlap|column/i);
});
it('moves existing replacement fields with source masks and restores original address and source pixels',()=>{
 const suite=createReplacementLayer(runs[1],'suite'),imported={...page,layers:[anchor,suite]};
 const expanded={...anchor,text:'Company\nBuilding A',height:anchor.height+14};
 const flowed=reflowStationery(imported,anchor,expanded,runs,[]);
 const grown={...flowed,layers:flowed.layers.map(l=>l.id===anchor.id?expanded:l)};
 expect(grown.layers.find(l=>l.id==='suite')?.y).toBe(suite.y+14);
 expect(grown.layers.find(l=>l.id==='suite')?.original).toEqual(suite.original);
 const restored=reflowStationery(grown,expanded,anchor,runs,[]);
 expect(restored.layers.find(l=>l.id==='suite')?.y).toBe(suite.y);
 expect(mapSourceTextRect(runs[2],restored.rowEdits??[])?.y).toBe(runs[2].y);
 for(const target of [runs[1],runs[2]])expect(sourceFragments(restored).some(f=>f.x<=target.x&&f.y<=target.y&&f.x+f.width>=target.x+target.width&&f.y+f.height>=target.y+target.height&&Math.abs(f.sx-f.x)<.01&&Math.abs(f.sy-f.y)<.01)).toBe(true);
 expect(imported.layers[1]).toEqual(suite);
});
it('refuses expansion onto artwork even when no same-column field follows',()=>{
 expect(()=>reflowStationery(page,anchor,{...anchor,height:40},[runs[0]],[{x:40,y:104,width:130,height:10}])).toThrow(/overlap|occupied/i);
});
it('does not pull fields upward when shrinking a manually enlarged box without owned spacing',()=>{
 const manual={...anchor,height:50};
 const unchanged=reflowStationery({...page,layers:[manual]},manual,anchor,runs,[]);
 expect(mapSourceTextRect(runs[1],unchanged.rowEdits??[])?.y).toBe(96);
});
const move:Extract<PdfRowEdit,{kind:'move'}>={id:'m',kind:'move',x:30,y:170,width:510,height:120,dx:0,dy:60};
it('refuses occupied table destinations without altering the source project',()=>{
 const text=[run('Row',40,200),run('Balance Due',350,320)];
 expect(()=>assertMoveDestinationClear(page,move,text,[])).toThrow(/occupied/i);
 expect(page.rowEdits).toBeUndefined();
 expect(()=>assertMoveDestinationClear(page,move,[text[0]],[])).not.toThrow();
});
it('includes layers/artwork, checks the newly covered portion of intersecting graphics',()=>{
 expect(()=>assertMoveDestinationClear(page,move,[],[{x:350,y:325,width:80,height:12}])).toThrow(/occupied/i);
 expect(()=>assertMoveDestinationClear(page,move,[],[{x:30,y:275,width:510,height:60}])).toThrow(/occupied/i);
 expect(()=>assertMoveDestinationClear({...page,layers:[{...anchor,id:'note',kind:'note',x:350,y:325}]},move,[],[])).toThrow(/occupied/i);
 expect(()=>assertMoveDestinationClear(page,move,[],[{x:30,y:175,width:510,height:100}])).not.toThrow();
});
it('accepts white scanner pixels but refuses painted destination pixels outside the source intersection',()=>{
 const smallMove:Extract<PdfRowEdit,{kind:'move'}>={id:'m',kind:'move',x:0,y:0,width:10,height:10,dx:0,dy:5};
 const pixels=new Uint8ClampedArray(20*20*4).fill(255),raster={data:pixels,width:20,height:20};
 pixels.set([0,0,0,255],(6*20+5)*4);
 expect(()=>assertRasterDestinationClear(smallMove,raster,{scale:1})).not.toThrow();
 pixels.set([0,0,0,255],(12*20+5)*4);
 expect(()=>assertRasterDestinationClear(smallMove,raster,{scale:1})).toThrow(/occupied/i);
});
it('checks destination ink using the actual renderer scale after the large-page pixel cap',()=>{
 const pageWidth=5000,scale=Math.sqrt(20_000_000/(pageWidth*pageWidth));
 const width=Math.ceil(pageWidth*scale),height=width;
 const pixels=new Uint8ClampedArray(width*height*4).fill(255),raster={data:pixels,width,height};
 const largeMove:Extract<PdfRowEdit,{kind:'move'}>={id:'large',kind:'move',x:0,y:0,width:100,height:100,dx:4800,dy:4800};
 expect(()=>assertRasterDestinationClear(largeMove,raster,{scale})).not.toThrow();
 const x=Math.floor(4850*scale),y=Math.floor(4850*scale);
 pixels.set([0,0,0,255],(y*width+x)*4);
 expect(()=>assertRasterDestinationClear(largeMove,raster,{scale})).toThrow(/occupied/i);
});
it('preserves a portrait PNG aspect on insert and ordinary width/height resize',()=>{
 const initial=fitImage(1240,1754,210,250);
 expect(initial.width/initial.height).toBeCloseTo(1240/1754);
 expect(initial.height).toBe(250);
 expect(resizeImage(initial,{width:100},500,500).height).toBeCloseTo(100*1754/1240);
 expect(resizeImage(initial,{height:100},500,500).width).toBeCloseTo(100*1240/1754);
 expect(()=>fitImage(0,1754,210,250)).toThrow();
});
it('Differences follows thumbnail/export order after attachment binding and content filtering',()=>{
 const sources=['statement','invoice','invoice','attachment'].map((kind,i)=>({id:String(i),name:String(i),kind,bytes:new Uint8Array()})) as PdfSourceDocument[];
 const project:PdfProject={version:1,content:'both',delivery:'combined',pages:sources.map(s=>({...page,id:s.id,sourceId:s.id})),invoiceAttachments:[{sourceId:'3',invoiceId:'1'}]};
 const visible=deliveryGroups(project,sources).flatMap(g=>g.pages);
 expect(differencePages(project,sources).map(p=>p.id)).toEqual(['0','1','3','2']);
 expect(differencePages(project,sources)).toEqual(visible);
 expect(differencePages({...project,content:'invoices'},sources).map(p=>p.id)).toEqual(['1','3','2']);
});
it('permits growth beyond an existing whiteout overlap but rejects new whiteout coverage',()=>{
 const whiteout={...anchor,id:'whiteout',kind:'whiteout' as const,text:'',x:90,y:70,width:210,height:15};
 const target={...page,layers:[anchor,whiteout]};
 expect(()=>reflowStationery(target,anchor,{...anchor,height:24},[runs[0]],[])).not.toThrow();
 expect(()=>reflowStationery({...target,layers:[anchor,{...whiteout,y:96}]},anchor,{...anchor,height:24},[runs[0]],[])).toThrow(/overlap/i);
});
it.each([.75,1,2])('does not mistake a partially covered source boundary pixel for artwork at scale %s',scale=>{
 const edit:Extract<PdfRowEdit,{kind:'move'}>={id:'line',kind:'move',x:2,y:2.25,width:10,height:1.5,dx:0,dy:1};
 const pixels=new Uint8ClampedArray(20*20*4).fill(255),raster={data:pixels,width:20,height:20};
 const x=Math.floor(5*scale),sourceEdge=Math.floor((edit.y+edit.height)*scale),destinationEdge=Math.ceil((edit.y+edit.height)*scale);
 pixels.set([0,0,0,255],(sourceEdge*20+x)*4);
 expect(()=>assertRasterDestinationClear(edit,raster,{scale})).not.toThrow();
 pixels.set([0,0,0,255],(destinationEdge*20+x)*4);
 expect(()=>assertRasterDestinationClear(edit,raster,{scale})).toThrow(/occupied/i);
});
