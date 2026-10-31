import {describe,it,expect} from 'vitest';
import {deliveryGroups,deliveryInvoiceIds} from '../src/pdf/model';
import {createReviewHandoff} from '../src/pdf/review-handoff';
import type {PdfProject,PdfSourceDocument,PdfExportFile} from '../src/pdf/types';
import type {DocumentJob,DocumentExport} from '../worker/documents/jobs';

const sources:PdfSourceDocument[]=[
 {id:'s',kind:'statement',name:'Statement.pdf',invoiceIds:['a','b','c','d'],bytes:new Uint8Array()},
 ...['a','b','c','d'].map(id=>({id,kind:'invoice' as const,invoiceId:id,invoiceIds:['a','b','c','d'],name:'Same name.pdf',bytes:new Uint8Array()})),
 {id:'attached',kind:'attachment',name:'Scan.pdf',bytes:new Uint8Array()}
];
const project:PdfProject={version:1,content:'invoices',delivery:'separate',pages:['s','a','b','b','c','d'].map((sourceId,n)=>({id:String(n),sourceId,sourcePage:n===3?2:1,width:595,height:842,layers:[]}))};
const coverage=(p:PdfProject)=>deliveryGroups(p,sources).map(g=>deliveryInvoiceIds(p,g.pages,sources));

describe('exported attachment invoice scope',()=>{
 it('excludes the invoice whose entire source was removed, independent of repeated filenames',()=>{
  expect(coverage({...project,pages:project.pages.filter(p=>p.sourceId!=='a')})).toEqual([['b'],['c'],['d']]);
 });
 it('retains a multi-page invoice after only one page was removed',()=>{
  expect(coverage({...project,pages:project.pages.filter(p=>p.id!=='2')})).toEqual([['a'],['b'],['c'],['d']]);
 });
 it('unions delivered sources for one combined PDF instead of counting files',()=>{
  expect(coverage({...project,delivery:'combined',pages:project.pages.filter(p=>p.sourceId!=='a')})).toEqual([['b','c','d']]);
 });
 it('uses statement snapshot coverage rather than arbitrary invoice-source metadata',()=>{
  expect(coverage({...project,content:'statement'})).toEqual([['a','b','c','d']]);
 });
 it('keeps attached scans with their bound invoice and never treats their filename as identity',()=>{
  const p:PdfProject={...project,invoiceAttachments:[{sourceId:'attached',invoiceId:'b'}],pages:[...project.pages,{...project.pages[1],id:'scan',sourceId:'attached'}]};
  expect(coverage(p)).toEqual([['a'],['b'],['c'],['d']]);
 });
 it('freezes invoice scope with the exact uploaded receipt and replays it after a lost response',async()=>{
  const files=[{name:'Renamed.pdf',bytes:new Uint8Array([1]),invoiceIds:['b','c','d']}] as PdfExportFile[];
  const handoff=createReviewHandoff();let uploads=0;const calls:DocumentExport[][]=[];
  const upload=async()=>{uploads++;return {storage_key:'jobs/synthetic/exports/one.pdf',byte_count:1,sha256:'a'.repeat(64)};};
  const review=async(_revision:number,exports:DocumentExport[])=>{calls.push(exports);if(calls.length===1)throw Error('response lost');return {revision:1} as DocumentJob;};
  await expect(handoff(files,0,upload,review)).rejects.toThrow('response lost');
  await handoff(files,9,upload,review);
  expect(uploads).toBe(1);
  expect(calls[1]).toBe(calls[0]);
  expect(calls[1][0]).toMatchObject({name:'Renamed.pdf',invoice_ids:['b','c','d']});
 });
});
