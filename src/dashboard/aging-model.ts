import {aggregateAccounts,sourceAging,validSourceBucket,type Account,type AgingBucket} from '../domain/portfolio';

export type AgingHotel='TSK'|'KAT'|'Total';
export const agingHotels:AgingHotel[]=['KAT','TSK','Total'];
export interface AgingCell {state:'verified'|'absent'|'outside'|'unavailable';amount:number|null;debit:number|null;credit:number|null}
export interface AgingComparisonRow {key:string;name:string;members:Account[];cells:Record<AgingHotel,AgingCell>[];net:Record<AgingHotel,AgingCell>}
export interface AgingInvoice {id:string;hotel:string;accountId:string;invoiceNo:string;folioNo:string;guest:string;date:string;open:number|null;age:number|null;role:string;verified:boolean;parentId:string|null}
const unavailable=(state:AgingCell['state']='unavailable'):AgingCell=>({state,amount:null,debit:null,credit:null});
const cents=(n:number)=>Math.round(n*100);
const sum=(values:number[])=>{const total=values.reduce((s,n)=>s+cents(n),0);return Number.isSafeInteger(total)?total/100:null;};
export const agingBucketKey=(bucket:AgingBucket)=>JSON.stringify([bucket.label,bucket.start,bucket.end,bucket.sequence]);
const verifiedAccount=(a:Account)=>a.verification_state==='verified'||a.verification_state==='cleared'&&a.open===0;

/** Keep the published bucket identities. A schema difference is an unavailable cell, never a guessed range. */
export function agingColumns(catalog:Account[]):AgingBucket[]{
 const columns=new Map<string,AgingBucket>();
 for(const a of catalog)for(const bucket of a.agingBuckets??[])if(validSourceBucket(bucket))columns.set(agingBucketKey(bucket),{...bucket,amount:0,debit:0,credit:0});
 return [...columns.values()].sort((a,b)=>a.sequence-b.sequence||(a.start??0)-(b.start??0)||a.label.localeCompare(b.label));
}
function hotelCell(members:Account[],hotel:string,scope:string,bucket?:AgingBucket):AgingCell{
 if(scope!=='All'&&scope!==hotel)return unavailable('outside');
 const rows=members.filter(a=>a.hotel===hotel);
 if(!rows.length)return unavailable('absent');
 if(rows.some(a=>!verifiedAccount(a)))return unavailable();
 if(!bucket){const amount=sum(rows.map(a=>a.open));return amount===null?unavailable():{state:'verified',amount,debit:null,credit:null};}
 const source=sourceAging(rows,hotel).find(b=>agingBucketKey(b)===agingBucketKey(bucket));
 if(!source)return unavailable();
 // sourceAging is the shared source-schema authority; sum original cents to avoid floating point drift.
 const originals=rows.map(a=>a.agingBuckets!.find(b=>agingBucketKey(b)===agingBucketKey(bucket))!);
 const amount=sum(originals.map(b=>b.amount)),debit=sum(originals.map(b=>b.debit)),credit=sum(originals.map(b=>b.credit));
 return amount===null||debit===null||credit===null?unavailable():{state:'verified',amount,debit,credit};
}
function cells(members:Account[],scope:string,bucket?:AgingBucket):Record<AgingHotel,AgingCell>{
 const TSK=hotelCell(members,'TSK',scope,bucket),KAT=hotelCell(members,'KAT',scope,bucket);
 const included=[TSK,KAT].filter(c=>c.state!=='outside'&&c.state!=='absent');
 let Total=unavailable(included.length?'unavailable':'absent');
 if(included.length&&included.every(c=>c.state==='verified')){
  const amount=sum(included.map(c=>c.amount!));
  Total={state:amount===null?'unavailable':'verified',amount,debit:bucket?sum(included.map(c=>c.debit!)):null,credit:bucket?sum(included.map(c=>c.credit!)):null};
 }
 return {TSK,KAT,Total};
}
/** An omitted type lists types. A selected type lists matched accounts, checked against the complete catalog. */
export function agingComparison(catalog:Account[],hotel:string,type?:string):AgingComparisonRow[]{
 const scoped=catalog.filter(a=>(hotel==='All'||a.hotel===hotel)&&(type===undefined||a.type===type));
 const columns=agingColumns(catalog);
 return aggregateAccounts(scoped,type===undefined,catalog).map(row=>({key:row.key,name:row.name,members:row.members,net:cells(row.members,hotel),cells:columns.map(bucket=>cells(row.members,hotel,bucket))}));
}
/** Overview uses every filtered ledger, independent of table pagination and column visibility. */
export function agingOverview(catalog:Account[],hotel:string,members:Account[]){
 const scoped=members.filter(a=>hotel==='All'||a.hotel===hotel);
 return {members:scoped,net:cells(scoped,hotel),cells:agingColumns(catalog).map(bucket=>cells(scoped,hotel,bucket))};
}
export function agingPercentage(amount:number|null,denominator:number|null):number|null{
 return amount!==null&&denominator!==null&&Number.isFinite(amount)&&Number.isFinite(denominator)&&denominator>0?amount/denominator*100:null;
}
/** One signed amount scale: credits grow below zero, never as positive debt. */
export function agingAmountScale(values:(number|null)[]){
 const known=values.filter((value):value is number=>value!==null&&Number.isFinite(value));
 const minimum=Math.min(0,...known),maximum=Math.max(0,...known),span=maximum-minimum||1,zero=-minimum/span*100||0;
 return {zero,bars:values.map(value=>value===null||!Number.isFinite(value)?null:{bottom:value<0?(value-minimum)/span*100:zero,height:Math.abs(value)/span*100})};
}
const decimal=(value:unknown):number|null=>{
 if(typeof value!=='number'&&(typeof value!=='string'||!/^[-+]?\d+(?:\.\d+)?$/.test(value)))return null;
 const n=Number(value);return Number.isFinite(n)&&Number.isSafeInteger(cents(n))?n:null;
};
/** The protected account endpoint returns every nonzero row. Reject malformed/foreign/duplicate identities as a whole. */
export function parseAgingInvoices(value:unknown,account:Account):AgingInvoice[]{
 if(!value||typeof value!=='object'||!Array.isArray((value as {invoices?:unknown}).invoices))throw Error('Invoice response is unavailable');
 const seen=new Set<string>();
 return (value as {invoices:unknown[]}).invoices.map(value=>{
  if(!value||typeof value!=='object')throw Error('Invoice response is unavailable');
  const row=value as Record<string,unknown>;
  if(typeof row.id!=='string'||!row.id||row.hotel!==account.hotel||row.account_id!==account.id||seen.has(row.id))throw Error('Invoice membership could not be verified');
  seen.add(row.id);
  const text=(key:string)=>typeof row[key]==='string'?row[key] as string:'';
  return {id:row.id,hotel:account.hotel,accountId:account.id,invoiceNo:text('invoice_no'),folioNo:text('folio_no'),guest:text('guest'),date:text('transaction_date'),open:decimal(row.open),age:typeof row.age==='number'&&Number.isSafeInteger(row.age)&&row.age>=0?row.age:null,role:text('collection_role'),verified:row.verification_state==='verified'||row.verification_state==='cleared'&&decimal(row.open)===0,parentId:typeof row.parent_invoice_id==='string'?row.parent_invoice_id:null};
 });
}
export function agingInvoiceEvidence(invoices:AgingInvoice[],bucket:AgingBucket,sourceBuckets?:AgingBucket[]){
 const roots=invoices.filter(i=>i.verified&&i.open!==null&&['parent','standalone'].includes(i.role)&&!i.parentId);
 const rootIds=new Set(roots.filter(i=>i.role==='parent').map(i=>i.id));
 const children=invoices.filter(i=>i.verified&&i.open!==null&&i.role==='child'&&i.parentId&&rootIds.has(i.parentId));
 const excluded=new Set(children);
 const contains=(b:AgingBucket,i:AgingInvoice)=>i.age!==null&&b.start!==null&&i.age>=b.start&&(b.end===null||i.age<=b.end);
 const bucketKnown=sourceBuckets===undefined||sourceBuckets.some(b=>validSourceBucket(b)&&agingBucketKey(b)===agingBucketKey(bucket));
 const unknownAge=(i:AgingInvoice)=>!bucketKnown||i.age===null||sourceBuckets!==undefined&&sourceBuckets.filter(b=>validSourceBucket(b)&&contains(b,i)).length!==1;
 const unassigned=invoices.filter(i=>!excluded.has(i)&&(!roots.includes(i)||unknownAge(i)));
 const rows=roots.filter(i=>!unknownAge(i)&&contains(bucket,i));
 const amount=bucketKnown?sum(rows.map(i=>i.open!)):null;
 return {rows,amount,unassigned,excludedChildren:children.length,complete:bucketKnown&&unassigned.length===0,difference:amount===null?null:sum([bucket.amount,-amount])};
}
