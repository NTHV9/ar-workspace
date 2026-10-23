import {it,expect} from 'vitest';
import {assertStationeryBlank,stationeryAllocation,type StationeryArtwork} from '../src/pdf/stationery-artwork';
import {reflowStationery} from '../src/pdf/layout-safety';
import {createReplacementLayer} from '../src/pdf/source-text';
import type {PdfProjectPage,DetectedText} from '../src/pdf/types';
const runs:DetectedText[]=[{text:'Address',x:20,y:40,width:90,height:10,fontSize:8,rotated:false},{text:'Second',x:20,y:54,width:70,height:10,fontSize:8,rotated:false},{text:'VAT',x:20,y:68,width:70,height:10,fontSize:8,rotated:false},{text:'Right column',x:140,y:54,width:50,height:10,fontSize:8,rotated:false}];
const anchor=createReplacementLayer(runs[0],'first'),page:PdfProjectPage={id:'p',sourceId:'s',sourcePage:1,width:200,height:200,layers:[anchor]},image={id:'image-0',x:0,y:0,width:200,height:120};
const proof=():StationeryArtwork=>({sourceId:'s',sourcePage:1,pageWidth:200,pageHeight:200,width:200,height:120,scale:1,pixels:new Uint8Array(200*120)});
it('blank image growth moves the bounded address/VAT column and keeps opposite column fixed',()=>{
 const result=reflowStationery(page,anchor,{...anchor,height:20},runs,[image],proof());
 expect(result.rowEdits).toHaveLength(1);expect(result.rowEdits![0]).toMatchObject({kind:'move',x:19.75,dx:0,dy:10});
 expect(result.rowEdits![0].kind==='move'&&result.rowEdits![0].width).toBeLessThan(100);
});
it.each([[22,55,'whole moved crop'],[22,83,'new destination'],[22,52,'new text growth']])('refuses pale image artwork at %s,%s in %s',(x,y)=>{
 const p=proof();p.pixels[Number(y)*200+Number(x)]=1;
 expect(()=>reflowStationery(page,anchor,{...anchor,height:20},runs,[image],p)).toThrow(/artwork/i);
});
it('keeps vector and opposite column collision checks with a blank image proof',()=>{
 expect(()=>reflowStationery(page,anchor,{...anchor,height:20},runs,[image,{id:'path-1',x:20,y:51,width:70,height:1}],proof())).toThrow(/artwork/i);
 expect(()=>reflowStationery(page,anchor,{...anchor,width:180,height:25},runs,[image],proof())).toThrow(/column|field/i);
});
it('missing, mismatched and out-of-grid proof fails closed',()=>{
 expect(()=>reflowStationery(page,anchor,{...anchor,height:20},runs,[image])).toThrow(/verified/i);
 expect(()=>assertStationeryBlank(page,{x:20,y:115,width:10,height:10},proof())).toThrow(/verified/i);
 expect(()=>assertStationeryBlank(page,{x:20,y:40,width:10,height:10},{...proof(),sourceId:'foreign'})).toThrow(/verified/i);
 expect(stationeryAllocation(2000,3000,1.5,1500,32*1024*1024)).toBeGreaterThan(64*1024*1024);
});
it('mapped proof checks original artwork after an earlier move and on shrink',()=>{
 const p=proof();p.pixels[70*200+22]=1;
 const moved={...page,rowEdits:[{id:'manual',kind:'move' as const,x:20,y:60,width:80,height:20,dx:0,dy:20}]};
 expect(()=>assertStationeryBlank(moved,{x:20,y:90,width:10,height:1},p)).toThrow(/artwork/i);
 const grown=reflowStationery(page,anchor,{...anchor,height:20},runs,[image],proof());
 const restored=reflowStationery(grown,{...anchor,height:20},anchor,runs,[image],proof());expect(restored.rowEdits).toHaveLength(2);
});
