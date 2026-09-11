import {useEffect,useRef,useState} from 'react';
import type {FinancialReport} from '../../worker/financial/model';
import type {RemittanceList} from '../remittance/model';
import {count,decimal,type AccountOption,type ActivitySummary,type CurrentSummary,type DashboardQueueRow,type ExternalSummary} from './model';

export interface Source<T> {state:'idle'|'loading'|'ready'|'error';data?:T}
export interface SummaryResult<T> {rows:unknown[];total:number;summary:T}
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
export function checkedSummary<T extends object=Record<string,unknown>>(value:unknown):SummaryResult<T>{
 if(!object(value)||!Array.isArray(value.rows)||count(value.total)===null||!object(value.summary))throw Error('dashboard_response_invalid');
 return {rows:value.rows,total:Number(value.total),summary:value.summary as T};
}
export const currentResult=(value:unknown)=>{const r=checkedSummary<CurrentSummary>(value);if(!Array.isArray(r.summary.hotels)||count(r.summary.invoices)===null||r.summary.hotels.some(h=>!object(h)||!['KAT','TSK'].includes(String(h.hotel))||count(h.accounts)===null||count(h.unverified_accounts)===null||decimal(h.open)===null||decimal(h.over90)===null||h.oldest_sync!==null&&(typeof h.oldest_sync!=='string'||!Number.isFinite(Date.parse(h.oldest_sync)))))throw Error('dashboard_response_invalid');return r;};
export const activityResult=(value:unknown)=>{const r=checkedSummary<ActivitySummary>(value);if(!Array.isArray(r.summary.kinds)||r.summary.kinds.some(k=>!object(k)||typeof k.kind!=='string'||count(k.invoices)===null||k.amount!==null&&decimal(k.amount)===null||k.stage_label!=null&&typeof k.stage_label!=='string'))throw Error('dashboard_response_invalid');return r;};
export const externalResult=(value:unknown)=>{const r=checkedSummary<ExternalSummary>(value);if(count(r.summary.records)===null||count(r.summary.firstBillingInvoices)===null)throw Error('dashboard_response_invalid');return r;};
export interface DashboardFinancial {summary:FinancialReport['summary'];coverage:Pick<FinancialReport['coverage'],'complete'|'lastSuccessAt'|'lastAttemptStatus'>}
export function financialResult(value:unknown):DashboardFinancial {
 const r=checkedSummary<FinancialReport['summary']>(value);if(!object(value)||!object(value.coverage)||typeof value.coverage.complete!=='boolean')throw Error('dashboard_response_invalid');
 const c=value.coverage;if(c.lastSuccessAt!==null&&(typeof c.lastSuccessAt!=='string'||!Number.isFinite(Date.parse(c.lastSuccessAt)))||c.lastAttemptStatus!==null&&!['queued','running','succeeded','failed'].includes(String(c.lastAttemptStatus)))throw Error('dashboard_response_invalid');
 return {summary:r.summary,coverage:{complete:c.complete as boolean,lastSuccessAt:c.lastSuccessAt as string|null,lastAttemptStatus:c.lastAttemptStatus as FinancialReport['coverage']['lastAttemptStatus']}};
}
export function remittanceResult(value:unknown):SummaryResult<RemittanceList['summary']> {const r=checkedSummary<RemittanceList['summary']>(value);if(count(r.summary.documents)===null)throw Error('dashboard_response_invalid');return r;}
export function queueResult(value:unknown):DashboardQueueRow[] {
 if(!object(value)||!Array.isArray(value.rows))throw Error('dashboard_response_invalid');const seen=new Set<string>();
 for(const row of value.rows){if(!object(row)||!['KAT','TSK'].includes(String(row.hotel))||typeof row.account_id!=='string'||typeof row.id!=='string'||typeof row.account_name!=='string'||typeof row.account_type!=='string'||typeof row.open!=='number'||!Number.isFinite(row.open)||decimal(row.open)===null||typeof row.transaction_date!=='string'||typeof row.collection_role!=='string'||typeof row.collection_selectable!=='boolean'||row.workflow!==null&&!object(row.workflow)||typeof row.verification_state!=='string'||!('workflow'in row))throw Error('dashboard_response_invalid');const key=JSON.stringify([row.hotel,row.account_id,row.id]);if(seen.has(key))throw Error('dashboard_duplicate_invoice');seen.add(key);}
 return value.rows as DashboardQueueRow[];
}
async function read(path:string,token:string,signal:AbortSignal):Promise<unknown>{const r=await fetch(path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});if(!r.ok)throw Error('dashboard_unavailable');return r.json();}
export function useSource<T>(path:string|null,token:string,revision:number,check:(value:unknown)=>T,retain=false):Source<T>{
 // A response belongs to one exact request and authenticated session. Retention never crosses that boundary.
 const key=JSON.stringify([path,token]),[stored,setStored]=useState<Source<T>&{key:string}>({key,state:path?'loading':'idle'});
 const checker=useRef(check);checker.current=check;
 useEffect(()=>{
  const controller=new AbortController();
  setStored(previous=>({key,state:path?'loading':'idle',data:retain&&path&&previous.key===key?previous.data:undefined}));
  if(path)void read(path,token,controller.signal).then(value=>checker.current(value)).then(data=>{
   if(!controller.signal.aborted)setStored({key,state:'ready',data});
  }).catch(()=>{if(!controller.signal.aborted)setStored(previous=>({key,state:'error',data:retain&&previous.key===key?previous.data:undefined}));});
  return()=>controller.abort();
 },[path,token,revision,key,retain]);
 return stored.key===key?stored:{state:path?'loading':'idle'};
}
export async function readDashboardOptions(token:string,signal:AbortSignal):Promise<AccountOption[]>{
 const all:AccountOption[]=[],seen=new Set<string>();let total:number|undefined;
 for(let page=0;;page++){
  const v=await read('/api/reports/options?limit=200&page='+page,token,signal);
  if(!object(v)||!Array.isArray(v.rows)||count(v.total)===null||Number(v.total)>50000||total!==undefined&&total!==v.total)throw Error('dashboard_options_incomplete');total=Number(v.total);
  for(const row of v.rows){if(!object(row)||!['KAT','TSK'].includes(String(row.hotel))||!['account_id','account_name','account_type'].every(key=>typeof row[key]==='string'))throw Error('dashboard_options_incomplete');const key=JSON.stringify([row.hotel,row.account_id]);if(seen.has(key))throw Error('dashboard_options_incomplete');seen.add(key);all.push({hotel:String(row.hotel),account_id:String(row.account_id),account_name:String(row.account_name),account_type:String(row.account_type)});}
  if(all.length===total)return all;if(all.length>total||!v.rows.length)throw Error('dashboard_options_incomplete');
 }
}
