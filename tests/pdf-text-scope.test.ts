import {it,expect} from 'vitest';
import {tableTextFlows} from '../src/pdf/text-scope';
import type {PdfProjectPage,PdfLayer,DetectedText} from '../src/pdf/types';
const page:PdfProjectPage={id:'p',sourceId:'s',sourcePage:1,width:595,height:842,layers:[]};
const text=(text:string,y:number,x=40):DetectedText=>({text,y,x,width:90,height:10,fontSize:8,rotated:false});
const layer=(y:number):PdfLayer=>({id:'l',kind:'text',x:40,y,width:100,height:12,text:'x',color:'#000000',fill:'#ffffff',font:'Arial',fontSize:8,bold:false,italic:false});
it.each(['Balance Due','TOTAL (THB)'])('flows table items, independently edits headers and closing fields: %s',end=>{
 const runs=[text('Date',200),text('Description',200,110),text(end,300)];
 expect(tableTextFlows(page,layer(80),runs)).toBe(false);
 expect(tableTextFlows(page,layer(225),runs)).toBe(true);
 expect(tableTextFlows(page,layer(350),runs)).toBe(false);
 expect(tableTextFlows(page,{...layer(225),tableRow:'inserted'},[])).toBe(true);
});
it('recognizes tables after source rows have moved and rejects unrelated heading words',()=>{
 const runs=[text('Date',200),text('Description',200,110)];
 expect(tableTextFlows({...page,rowEdits:[{id:'e',kind:'insert',y:100,height:50}]},layer(225),runs)).toBe(false);
 expect(tableTextFlows({...page,rowEdits:[{id:'e',kind:'insert',y:100,height:50}]},layer(275),runs)).toBe(true);
 expect(tableTextFlows(page,layer(275),[text('Date',200),text('Description',100)])).toBe(false);
});
