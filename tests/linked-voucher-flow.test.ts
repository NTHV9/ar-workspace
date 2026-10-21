import {mapSourceTextRect} from '../src/pdf/row-layout';
import {expect,it} from 'vitest';
import {editLinkedVoucher} from '../src/pdf/linked-voucher-flow';
import type {VoucherBindings} from '../src/pdf/linked-vouchers';
import type {VoucherField} from '../src/pdf/voucher-metadata';
import type {DetectedText,PdfProject} from '../src/pdf/types';
const field:VoucherField={hotel:'KAT',accountId:'A',invoiceId:'1',x:474,y:130,width:125,height:11,fontSize:8,bold:false,text:'ONE'};
const run=(text:string,x:number,y:number,width=60):DetectedText=>({text,x,y,width,height:10,fontSize:8,rotated:false});
const right=[run('INVOICE',384,110),run('Voucher No.',384,130),{...field,rotated:false,field:'voucher-number' as const},run('Room No.',384,146),run('101',474,146),run('LEFT ADDRESS',34,145,230),run('DATE',34,268),run('DESCRIPTION',100,268)];
const statement={...field,x:332,y:200,width:74,height:14};
const project:PdfProject={version:1,content:'both',delivery:'combined',pages:['S','I1','I2','OTHER'].map(id=>({id,sourceId:id,sourcePage:1,width:612,height:792,layers:[]}))};
const bindings:VoucherBindings=new Map([['S:1',[statement]],['I1:1',[field]],['I2:1',[field]],['OTHER:1',[{...field,invoiceId:'2'}]]]);
const ink={x:0,y:0,width:612,height:792,pixels:new Uint8Array(612*792)},headerInk=new Map([['I1:1',ink],['I2:1',ink]]);
const runs=new Map([['S:1',[run('DATE',34,180),run('DESCRIPTION',100,180),{...statement,rotated:false,field:'voucher-number' as const}]],['I1:1',right],['I2:1',right]]);
it('adds and removes a linked voucher line across invoice pages without moving left headers',()=>{
 const expanded=editLinkedVoucher(project,field,'ONE\nTWO',bindings,runs,headerInk);
 for(const p of expanded.pages.slice(1,3)){
  expect(p.layers.find(l=>l.original?.text==='ONE')?.text).toBe('ONE\nTWO');
  expect(mapSourceTextRect(right[3],p.rowEdits??[])?.y).toBe(mapSourceTextRect(right[4],p.rowEdits??[])?.y);
  expect(mapSourceTextRect(right[3],p.rowEdits??[])!.y).toBeGreaterThan(146);
  expect(p.layers.some(l=>l.original?.text==='LEFT ADDRESS')).toBe(false);
 }
 expect(expanded.pages[0].layers[0].text).toBe('ONE\nTWO');expect(expanded.pages[3]).toBe(project.pages[3]);
 const restored=editLinkedVoucher(expanded,field,'ONE',bindings,runs,headerInk);
 for(const p of restored.pages.slice(1,3))expect(mapSourceTextRect(right[3],p.rowEdits??[])?.y).toBeCloseTo(146);
 expect(project.pages.every(p=>p.layers.length===0)).toBe(true);
});
it('retains a tall Statement row when a short voucher grows within multiline guest space',()=>{
 const tall={...statement,height:43},b:VoucherBindings=new Map([['S:1',[tall]]]),r=new Map([['S:1',[{...tall,rotated:false,field:'voucher-number' as const}]]]);
 let p={...project,pages:[project.pages[0]]};
 for(const text of ['ONE\nTWO','ONE\nTWO\nTHREE','ONE']){p=editLinkedVoucher(p,tall,text,b,r);expect(p.pages[0].layers[0].height).toBe(43);expect(p.pages[0].rowEdits??[]).toHaveLength(0);}
});
