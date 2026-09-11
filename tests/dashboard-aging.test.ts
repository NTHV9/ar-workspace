import {describe,expect,it} from 'vitest';
import type {Account,AgingBucket} from '../src/domain/portfolio';
import {agingColumns,agingComparison,agingInvoiceEvidence,agingOverview,agingPercentage,parseAgingInvoices} from '../src/dashboard/aging-model';

const bucket=(amount:number,start=0,end:number|null=30):AgingBucket=>({label:end===null?`${start}+`:`${start}–${end}`,start,end,sequence:start,amount,debit:Math.max(0,amount),credit:Math.min(0,amount)});
const account=(hotel:string,id:string,amount:number,extra:Partial<Account>={}):Account=>({hotel,id,name:id,type:'Agent',account_no:'PAIR',open:amount,over90:0,items:1,verification_state:'verified',agingBuckets:[bucket(amount),bucket(0,31,null)],...extra});
const raw=(id:string,extra:Record<string,unknown>={})=>({id,hotel:'KAT',account_id:'a',invoice_no:id,folio_no:'folio',guest:'Synthetic guest',transaction_date:'2026-09-01',open:100,original:100,age:10,collection_role:'standalone',verification_state:'verified',...extra});

describe('current aging comparison',()=>{
 it('builds an overview from the complete filtered members with signed credit shares and exact hotel totals',()=>{
  const catalog=[account('KAT','a',80,{agingBuckets:[bucket(100),bucket(-20,31,null)]}),account('TSK','b',50)];
  const overview=agingOverview(catalog,'All',catalog);
  expect(overview.net).toMatchObject({KAT:{amount:80},TSK:{amount:50},Total:{amount:130}});
  expect(overview.cells[1].Total.amount).toBe(-20);
  expect(agingOverview(catalog,'KAT',catalog).net.Total.amount).toBe(80);
  expect(agingOverview(catalog,'All',[]).net.Total.amount).toBeNull();
 });
 it('leaves overview evidence unavailable for an unknown ledger or incompatible bucket schema',()=>{
  const catalog=[account('KAT','a',100),account('TSK','b',50,{agingBuckets:[bucket(50,0,60)]})];
  expect(agingOverview(catalog,'All',catalog).cells[0].Total.amount).toBeNull();
  const unverified=[catalog[0],{...catalog[1],verification_state:'missing'}];
  expect(agingOverview(unverified,'All',unverified).net.Total.amount).toBeNull();
 });
 it('pairs account numbers while keeping exact hotel ledgers and every source bucket',()=>{
  const catalog=[account('KAT','a',100),account('TSK','b',50)];
  const rows=agingComparison(catalog,'All','Agent');
  expect(rows).toHaveLength(1);expect(rows[0].members.map(a=>[a.hotel,a.id])).toEqual([['KAT','a'],['TSK','b']]);
  expect(rows[0].cells[0]).toMatchObject({KAT:{amount:100,state:'verified'},TSK:{amount:50,state:'verified'},Total:{amount:150,state:'verified'}});
  expect(agingColumns(catalog)).toHaveLength(2);
 });
 it('checks number ambiguity against the full catalog even when a type hides the duplicate',()=>{
  const catalog=[account('KAT','a',100),account('TSK','b',50),account('KAT','hidden',20,{type:'Corporate'})];
  expect(agingComparison(catalog,'All','Agent')).toHaveLength(2);
 });
 it('keeps missing, verified zero and unverified amounts distinct',()=>{
  const missing=agingComparison([account('KAT','a',100)],'All','Agent')[0];
  expect(missing.cells[0].TSK).toMatchObject({state:'absent',amount:null});
  const zero=agingComparison([account('KAT','a',100),account('TSK','b',0)],'All','Agent')[0];
  expect(zero.cells[0].TSK).toMatchObject({state:'verified',amount:0});
  const unknown=agingComparison([account('KAT','a',100),account('TSK','b',0,{verification_state:'missing'})],'All','Agent')[0];
  expect(unknown.cells[0].Total).toMatchObject({state:'unavailable',amount:null});
 });
 it('does not invent a bucket value from an incompatible or missing source schema',()=>{
  const rows=agingComparison([account('KAT','a',100),account('TSK','b',50,{agingBuckets:[bucket(50,0,60)]})],'All','Agent');
  expect(rows[0].cells[0].Total.amount).toBeNull();
 });
 it('excludes the other hotel without presenting it as verified zero',()=>{
  const rows=agingComparison([account('KAT','a',100),account('TSK','b',50)],'TSK','Agent');
  expect(rows[0].cells[0]).toMatchObject({KAT:{state:'outside',amount:null},Total:{amount:50}});
 });
 it('retains all types and rows without top-N truncation and uses stable cents',()=>{
  const catalog=Array.from({length:65},(_,i)=>account('KAT',`a${i}`,0.1,{account_no:`NO${i}`,type:`Type ${i}`}));
  expect(agingComparison(catalog,'All')).toHaveLength(65);
  expect(agingComparison(catalog.map(a=>({...a,type:'Agent'})),'All')[0].cells[0].Total.amount).toBe(6.5);
 });
 it('uses a positive net denominator and preserves signed credit percentages',()=>{
  expect(agingPercentage(-20,100)).toBe(-20);expect(agingPercentage(120,100)).toBe(120);
  expect(agingPercentage(0,0)).toBeNull();expect(agingPercentage(10,-100)).toBeNull();expect(agingPercentage(null,100)).toBeNull();
 });
});

describe('current aging invoice evidence',()=>{
 it('rejects cross-ledger and duplicate identities rather than displaying a partial invoice list',()=>{
  expect(()=>parseAgingInvoices({invoices:[raw('x',{hotel:'TSK'})]},account('KAT','a',100))).toThrow();
  expect(()=>parseAgingInvoices({invoices:[raw('x'),raw('x')]},account('KAT','a',100))).toThrow();
 });
 it('excludes children from the amount and assigns roots by source age, never a guessed aging label',()=>{
  const rows=parseAgingInvoices({invoices:[raw('parent',{collection_role:'parent'}),raw('child',{collection_role:'child',parent_invoice_id:'parent',open:40}),raw('unknown',{age:null,aging:'0–30',open:10}),raw('credit',{open:-20})]},account('KAT','a',100));
  const evidence=agingInvoiceEvidence(rows,bucket(90));
  expect(evidence.rows.map(r=>r.id)).toEqual(['parent','credit']);expect(evidence.amount).toBe(80);
  expect(evidence.excludedChildren).toBe(1);expect(evidence.unassigned).toHaveLength(1);
  expect(evidence.difference).toBe(10);expect(evidence.complete).toBe(false);
 });
 it('does not turn unknown relationship, unverified balance or absent parent into verified empty evidence',()=>{
  const rows=parseAgingInvoices({invoices:[raw('unknown',{collection_role:'unverified'}),raw('missing',{verification_state:'missing'}),raw('child',{collection_role:'child',parent_invoice_id:'absent'})]},account('KAT','a',100));
  const evidence=agingInvoiceEvidence(rows,bucket(0));
  expect(evidence.rows).toHaveLength(0);expect(evidence.complete).toBe(false);expect(evidence.unassigned).toHaveLength(3);
 });
 it('keeps ages in a source-schema gap and overlapping ranges unassigned',()=>{
  const invoices=parseAgingInvoices({invoices:[raw('gap',{age:60}),raw('overlap',{age:20})]},account('KAT','a',100));
  const evidence=agingInvoiceEvidence(invoices,bucket(0),[bucket(0),bucket(0,20,25),bucket(0,91,null)]);
  expect(evidence.rows).toHaveLength(0);expect(evidence.unassigned.map(i=>i.id)).toEqual(['gap','overlap']);expect(evidence.complete).toBe(false);
 });
 it('does not hide a child whose parent relationship or source is unverified',()=>{
  const invoices=parseAgingInvoices({invoices:[raw('root'),raw('parent',{collection_role:'parent'}),raw('not-parent',{collection_role:'child',parent_invoice_id:'root'}),raw('missing-child',{collection_role:'child',parent_invoice_id:'parent',verification_state:'missing'})]},account('KAT','a',100));
  const evidence=agingInvoiceEvidence(invoices,bucket(200));
  expect(evidence.amount).toBe(200);expect(evidence.excludedChildren).toBe(0);expect(evidence.unassigned.map(i=>i.id)).toEqual(['not-parent','missing-child']);
 });

 it('does not assign a bucket from the other hotel source schema',()=>{
  const invoices=parseAgingInvoices({invoices:[raw('i',{age:10,open:100})]},account('KAT','a',100));
  const evidence=agingInvoiceEvidence(invoices,bucket(100),[bucket(100,0,60)]);
  expect(evidence.rows).toEqual([]);expect(evidence.unassigned.map(i=>i.id)).toEqual(['i']);expect(evidence.amount).toBeNull();expect(evidence.difference).toBeNull();expect(evidence.complete).toBe(false);
  const empty=agingInvoiceEvidence([],bucket(0),[]);expect(empty.amount).toBeNull();expect(empty.complete).toBe(false);
 });
});
