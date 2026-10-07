import {useEffect,useState} from 'react';
import {hotelInRegion,resolveRegion,regionHotels,type RegionId} from '../domain/hotels';
import {checkedSummary} from './data';
import {balancesResult,paidInvoicesResult} from './period-data';
import {decimal,count,addAmounts} from './model';
import type {PeriodDetail} from './PeriodBalances';
import {compareValues,type SortValue} from '../table-sort';

export type DetailKind=PeriodDetail['kind']|'balance_accounts';
/** Keep canonical Hotel sections while preserving the requested order inside each ledger. */
export function dashboardHotelGroups<T>(rows:T[],region:RegionId,hotelOf:(row:T)=>unknown,descending=false){
 const hotels=regionHotels(region);
 return (descending?[...hotels].reverse():hotels).map(hotel=>({hotel,rows:rows.filter(row=>hotelOf(row)===hotel)})).filter(group=>group.rows.length>0);
}
export type DetailRow=Record<string,unknown>;
export interface DetailData {rows:DetailRow[];total:number;complete:boolean}
export type DetailSortKey='hotel'|'account'|'invoice'|'folio'|'guest'|'date'|'amount'|'original'|'due'|'billing'|'latest';
export function detailIdentity(row:DetailRow,kind:DetailKind){
 const hotel=row.hotel,account=row.accountId??row.account_id,id=row.invoiceId??row.invoice_id??row.transactionId??row.id;
 if(typeof hotel!=='string'||typeof account!=='string'||!account||kind!=='balance_accounts'&&(typeof id!=='string'||!id))throw Error('dashboard_detail_identity');
 if(kind==='balance_accounts')return JSON.stringify([hotel,account]);
 if(kind==='sent'&&(typeof row.delivery_id!=='string'||!row.delivery_id))throw Error('dashboard_detail_identity');
 return JSON.stringify([hotel,account,id,...kind==='sent'?[row.delivery_id]:[]]);
}
function decode(value:unknown,kind:DetailKind):DetailData{
 if(kind==='balance_accounts'){const raw=value as Record<string,unknown>;const v=balancesResult({...raw,rows:[]});if(!Array.isArray(raw.rows)||raw.rows.some(r=>!r||typeof r!=='object'||typeof r.hotel!=='string'||typeof r.accountId!=='string'||!r.accountId||typeof r.accountName!=='string'||typeof r.accountType!=='string'||count(r.count)===null||r.amount!==null&&decimal(r.amount)===null||r.oldest!==null&&(!Number.isSafeInteger(r.oldest))||typeof r.verified!=='boolean'))throw Error('dashboard_accounts_invalid');return {rows:raw.rows,total:v.total,complete:v.complete};}
 if(kind==='balance'){const v=balancesResult(value);return {rows:v.rows as unknown as DetailRow[],total:v.total,complete:v.complete};}
 if(kind==='payment_invoices'){const v=paidInvoicesResult(value);return {rows:v.rows as unknown as DetailRow[],total:v.total,complete:v.complete};}
 const v=checkedSummary(value),coverage=(value as {coverage?:{complete?:boolean}}).coverage;
 if(v.rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw Error('dashboard_detail_invalid');
 return {rows:v.rows as DetailRow[],total:v.total,complete:kind==='sent'||coverage?.complete===true};
}
/** Fetch bounded API pages into a single view. Never silently deduplicate changed membership. */
export async function readDetailPages(path:string,kind:DetailKind,token:string,signal:AbortSignal,onProgress:(count:number,total:number)=>void,transport:typeof fetch=fetch):Promise<DetailData>{
 const [endpoint,search]=path.split('?'),query=new URLSearchParams(search),seen=new Set<string>(),rows:DetailRow[]=[];
 let total:number|undefined,fingerprint:string|undefined,complete=true;
 for(let page=0;;page++){
  signal.throwIfAborted();query.set('page',String(page));query.set('limit','50');
  const response=await transport(endpoint+'?'+query,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
  if(!response.ok)throw Error('dashboard_detail_unavailable');
  const value=await response.json(),data=decode(value,kind),raw=value as Record<string,unknown>;
  // These are source/summary facts, not page contents. A changed publication must restart the read.
  const nextFingerprint=JSON.stringify([raw.asOfDate,raw.mode,raw.capturedAt,raw.sourceAt,raw.coverage,raw.summary,raw.metrics,raw.stages,data.complete]);
  if(data.total>50000||total!==undefined&&data.total!==total||fingerprint!==undefined&&fingerprint!==nextFingerprint||data.rows.length>50)throw Error('dashboard_detail_changed');
  total=data.total;fingerprint=nextFingerprint;complete&&=data.complete;
  for(const row of data.rows){
   if(!hotelInRegion(row.hotel,resolveRegion(query))||query.has('hotel')&&row.hotel!==query.get('hotel')||query.has('account')&&(row.accountId??row.account_id)!==query.get('account')||query.has('type')&&(row.accountType??row.account_type)!==query.get('type'))throw Error('dashboard_detail_scope');
   if(kind==='balance'&&(query.has('ageMin')||query.has('ageMax'))&&(!Number.isSafeInteger(row.age)||query.has('ageMin')&&Number(row.age)<Number(query.get('ageMin'))||query.has('ageMax')&&Number(row.age)>Number(query.get('ageMax'))))throw Error('dashboard_detail_scope');
   const key=detailIdentity(row,kind);if(seen.has(key))throw Error('dashboard_detail_changed');seen.add(key);rows.push(row);
  }
  if(rows.length>total||rows.length<total&&data.rows.length!==50)throw Error('dashboard_detail_changed');
  onProgress(rows.length,total);
  if(rows.length===total)return {rows,total,complete};
 }
}
export function useDetailRows(path:string|null,kind:DetailKind,token:string,revision:number){
 const key=JSON.stringify([path,kind,token,revision]);
 type State={key:string;state:'loading'|'ready'|'error';data?:DetailData;loaded:number;total?:number};
 const [stored,setStored]=useState<State>({key,state:'loading',loaded:0});
 useEffect(()=>{
  const controller=new AbortController();setStored({key,state:'loading',loaded:0});
  if(path)void readDetailPages(path,kind,token,controller.signal,(loaded,total)=>{if(!controller.signal.aborted)setStored({key,state:'loading',loaded,total});}).then(data=>{if(!controller.signal.aborted)setStored({key,state:'ready',data,loaded:data.total,total:data.total});}).catch(()=>{if(!controller.signal.aborted)setStored({key,state:'error',loaded:0});});
  return()=>controller.abort();
 },[key,path,kind,token]);
 return stored.key===key?stored:{key,state:'loading' as const,loaded:0};
}
export function sortDetailRows(rows:DetailRow[],kind:DetailKind,key:DetailSortKey,descending:boolean){
 const numeric=(v:unknown)=>decimal(v)===null?null:Number(v);
 const text=(v:unknown):SortValue=>typeof v==='string'||typeof v==='number'?v:null;
 const value=(r:DetailRow):SortValue=>{
  switch(key){
   case 'hotel':return text(r.hotel);
   case 'account':return text(r.accountName??r.account_name);
   case 'invoice':return text(kind==='payments'?r.transactionId:r.invoiceNo??r.invoice_no);
   case 'folio':return text(r.folioNo??r.folio_no);
   case 'guest':return text(r.guest);
   case 'date':return text(kind==='sent'?r.sent_at??r.sent_date:r.transactionDate);
   case 'amount':return numeric(kind==='balance'?r.open:kind==='invoice_entries'?r.originalAmount:r.amount);
   case 'original':return numeric(kind==='balance'?r.original:kind==='invoice_entries'?r.openAmount:r.appliedAmount);
   case 'due':return text(r.dueDate);
   case 'billing':return r.billingRequired===false?'Not required':r.billingRequired===null?'Setup needed':r.firstBillingDate?'Billed':'Not billed';
   case 'latest':return text(r.latestStageLabel??r.latestStage??r.stage_label??r.kind);
  }
 };
 return [...rows].sort((a,b)=>compareValues(value(a),value(b),descending)||compareValues(detailIdentity(a,kind),detailIdentity(b,kind)));
}

/** Group only a fully fetched population, always preserving each hotel ledger. */
export function groupDetailAccounts(rows:DetailRow[],kind:PeriodDetail['kind']):DetailRow[]{
 const groups=new Map<string,DetailRow[]>();
 for(const row of rows){const key=JSON.stringify([row.hotel,row.accountId??row.account_id]);const group=groups.get(key);if(group)group.push(row);else groups.set(key,[row]);}
 return [...groups.values()].map(items=>{const r=items[0],values=items.map(i=>kind==='balance'?i.open:kind==='invoice_entries'?i.originalAmount:i.amount);return {hotel:r.hotel,accountId:r.accountId??r.account_id,accountName:r.accountName??r.account_name,accountNo:r.accountNo??r.account_no,accountType:r.accountType??r.account_type,count:items.length,amount:addAmounts(values.map(v=>decimal(v))),oldest:items.every(i=>Number.isSafeInteger(i.age))?Math.max(...items.map(i=>Number(i.age))):null};});
}
