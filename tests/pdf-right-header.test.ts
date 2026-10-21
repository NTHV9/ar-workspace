import {expect,it} from 'vitest';
import {reflowRightHeader} from '../src/pdf/right-header';
import {mapSourceTextRect} from '../src/pdf/row-layout';
import {createReplacementLayer,registerSourceStyle,releaseSourceStyles} from '../src/pdf/source-text';
import type {DetectedText,PdfProjectPage} from '../src/pdf/types';
const run=(text:string,x:number,y:number,width=60):DetectedText=>({text,x,y,width,height:10,fontSize:8,rotated:false});
const runs=[run('INVOICE',384,110),run('Voucher No.',384,130),run('VCH',474,130,125),run('Room No.',384,145),run(':',466,145,3),run('101',474,145),run('Date/Time',384,200),run('21/10/26',474,200),run('LEFT ADDRESS',34,145,220),run('Guest Name',34,245),run('LEFT GUEST',140,245),run('DATE',34,268),run('DESCRIPTION',100,268)];
const ink={x:0,y:0,width:612,height:792,pixels:new Uint8Array(612*792)};
const original=createReplacementLayer(runs[2],'voucher');
const page:PdfProjectPage={id:'p',sourceId:'s',sourcePage:1,width:612,height:792,layers:[original]};
it('moves right labels and values together while preserving every left-side source coordinate',()=>{
 let current=page;
 for(const delta of [10,10,-10,-10]){
  const before=current.layers.find(l=>l.id==='voucher')!,next={...before,height:before.height+delta};
  const result=reflowRightHeader(current,before,next,runs,ink)!;
  current={...result,layers:result.layers.map(l=>l.id===before.id?next:l)};
  const offset=next.height-original.height;
  for(const text of ['Room No.',':','101'])expect(mapSourceTextRect(runs.find(r=>r.text===text)!,current.rowEdits??[])?.y).toBe(145+offset);
  expect(current.layers.some(l=>l.original?.text.startsWith('LEFT'))).toBe(false);
  expect(mapSourceTextRect(runs[8],current.rowEdits??[])?.y).toBe(145);
 }
});
it('does not classify the left address as the invoice header',()=>{
 const left=createReplacementLayer(runs[8],'left');expect(reflowRightHeader({...page,layers:[left]},left,{...left,height:30},runs,ink)).toBeNull();
});
it('reclaims only its inserted table space after a large expansion is removed',()=>{
 const expanded={...original,height:original.height+90};
 const grown=reflowRightHeader(page,original,expanded,runs,ink)!;
 const edited={...grown,layers:grown.layers.map(l=>l.id===original.id?expanded:l)};
 expect(mapSourceTextRect(runs[11],edited.rowEdits??[])!.y).toBeGreaterThan(268);
 const restored=reflowRightHeader(edited,expanded,original,runs,ink)!;
 expect(mapSourceTextRect(runs[11],restored.rowEdits??[])?.y).toBe(268);
 expect(mapSourceTextRect(runs[8],restored.rowEdits??[])?.y).toBe(145);
});
it('uses the moved geometry when editing a second field below an expanded voucher',()=>{
 const arrival=run('Arrival',384,160),arrivalValue=run('04/09/26',474,160),all=[...runs,arrival,arrivalValue];
 const expanded={...original,height:50};const first=reflowRightHeader(page,original,expanded,all,ink)!;
 const mapped=mapSourceTextRect(runs[5],first.rowEdits??[])!,room={...createReplacementLayer(runs[5],'room'),x:mapped.x,y:mapped.y};
 const second=reflowRightHeader({...first,layers:[expanded,room]},room,{...room,height:22},all,ink)!;
 expect(mapSourceTextRect(arrival,second.rowEdits??[])?.y).toBe(mapSourceTextRect(arrivalValue,second.rowEdits??[])?.y);
 expect(mapSourceTextRect(arrival,second.rowEdits??[])!.y).toBeGreaterThan(room.y+22);
});
it('refuses to overwrite original artwork below the right-hand text band',()=>{
 const pixels=ink.pixels.slice();pixels[214*ink.width+400]=1;
 expect(()=>reflowRightHeader(page,original,{...original,height:20},runs,{...ink,pixels})).toThrow('cover artwork');
});
it('does not treat padding in an original text box as a verified erased glyph mask',()=>{
 const source={...runs[2],height:100,sourceText:{sourceId:'s',sourcePage:1,runIndex:2,scope:'header-padding'}};
 const sequence=[...source.text].map(unicode=>({unicode,fontChar:unicode,width:500,isInFont:true}));
 registerSourceStyle(source.sourceText,{font:'Arial',fontSize:8,bold:false,italic:false,color:'#000000',baseline:6,hScale:1,charSpacing:0,wordSpacing:0,glyphs:new Map(sequence.map(g=>[g.unicode,g])),sequence,supported:true,run:source});
 try{
  const selected={...createReplacementLayer(source,'padding'),height:10},pixels=ink.pixels.slice();pixels[214*ink.width+480]=1;
  expect(()=>reflowRightHeader({...page,layers:[selected]},selected,{...selected,height:20},runs.map((r,i)=>i===2?source:r),{...ink,pixels})).toThrow('cover artwork');
 }finally{releaseSourceStyles('header-padding');}
});
