import {isHotelId,hotelInRegion,regionHotels,resolveRegion,type HotelId} from '../domain/hotels';
import type {Account,AgingBucket,RefreshState} from '../domain/portfolio';
import {agingBucketKey,agingRegion,type AgingComparisonRow,type AgingHotel} from './aging-model';
import type {AgingInvoicesResponse} from '../../worker/dashboard/aging-model';
import type {Source} from './data';

export interface AgingStatusTarget {key:string;title:string;hotel:AgingHotel;hotels:HotelId[];bucketLabel:string;query:string;sourceAmount:number|null;accountPublications:{hotel:string;accountId:string;accountType:string;sourceAt:string|null}[]}
export interface AgingCount {count:number|null;state:'ready'|'loading'|'unavailable'|'absent';reason?:string}
export type AgingStatusDimension='billing'|'followup'|'due';
export interface AgingStatusFilters {dimension:AgingStatusDimension;status:string;flag:string;page:number}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const decimal=(v:unknown)=>typeof v==='string'&&/^-?\d+(?:\.\d{1,2})?$/.test(v)&&Number.isSafeInteger(Math.round(Number(v)*100));
const nullableAmount=(v:unknown)=>v===null||decimal(v);
const nullableCount=(v:unknown)=>v===null||integer(v);
const stamp=(v:unknown)=>v===null||typeof v==='string'&&Number.isFinite(Date.parse(v));
const invalid=():never=>{throw Error('aging_invoice_response_invalid');};
function normalizedBucketKey(value:unknown):string|null{
 if(value===null)return null;if(typeof value!=='string')return invalid();
 let parts:unknown;try{parts=JSON.parse(value);}catch{return invalid();}
 if(!Array.isArray(parts)||parts.length!==4||typeof parts[0]!=='string'||!parts[0].trim()||!integer(parts[1])||parts[2]!==null&&(!integer(parts[2])||parts[2]<parts[1])||!integer(parts[3]))return invalid();
 return JSON.stringify(parts);
}
export function agingInvoicesResult(value:unknown):AgingInvoicesResponse{
 if(!object(value)||typeof value.asOfDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.asOfDate)||!Array.isArray(value.publications)||!Array.isArray(value.accounts)||!object(value.summary)||!Array.isArray(value.rows)||!integer(value.total)||typeof value.complete!=='boolean')return invalid();
 const hotels=new Set<string>(),accounts=new Set<string>(),invoices=new Set<string>();
 for(const p of value.publications){if(!object(p)||!isHotelId(p.hotel)||!stamp(p.sourceAt)||hotels.has(String(p.hotel)))return invalid();hotels.add(String(p.hotel));}
 for(const a of value.accounts){
  if(!object(a)||!isHotelId(a.hotel)||typeof a.accountId!=='string'||!a.accountId||typeof a.accountType!=='string'||!stamp(a.syncedAt)||typeof a.complete!=='boolean'||!integer(a.unverified)||!Array.isArray(a.buckets))return invalid();
  const id=JSON.stringify([a.hotel,a.accountId]);if(accounts.has(id))return invalid();accounts.add(id);const keys=new Set<string|null>();
  for(const b of a.buckets){if(!object(b)||!nullableCount(b.count)||!nullableAmount(b.amount)||!nullableAmount(b.creditAmount)||typeof b.complete!=='boolean'||b.complete&&(b.count===null||b.amount===null))return invalid();const key=normalizedBucketKey(b.key);if(keys.has(key))return invalid();keys.add(key);}
 }
 const s=value.summary;if(typeof s.complete!=='boolean'||!nullableCount(s.count)||!nullableAmount(s.amount)||!nullableAmount(s.creditAmount))return invalid();
 for(const dimension of ['billing','followup','due','flags']){
  if(!Array.isArray(s[dimension]))return invalid();const seen=new Set<string>();
  for(const m of s[dimension]){if(!object(m)||typeof m.key!=='string'||!m.key||typeof m.label!=='string'||!nullableCount(m.count)||!nullableAmount(m.amount)||seen.has(m.key))return invalid();seen.add(m.key);}
 }
 for(const r of value.rows){
  if(!object(r)||!isHotelId(r.hotel)||!['accountId','accountName','accountType','invoiceId','billingStatus','latestStage','latestStageLabel','dueStatus'].every(k=>typeof r[k]==='string')||!r.invoiceId||!decimal(r.open)||Number(r.open)===0||r.age!==null&&!integer(r.age)||r.dueDate!==null&&(typeof r.dueDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.dueDate))||typeof r.held!=='boolean'||typeof r.needsReview!=='boolean'||!['invoiceNo','folioNo','guest'].every(k=>r[k]===null||typeof r[k]==='string'))return invalid();
  if(Number(r.open)<0?['billingStatus','latestStage','dueStatus'].some(key=>r[key]!=='credit')||r.dueDate!==null:['billingStatus','latestStage','dueStatus'].some(key=>r[key]==='credit'))return invalid();
  const id=JSON.stringify([r.hotel,r.accountId,r.invoiceId]);if(invoices.has(id))return invalid();invoices.add(id);
 }
 if(value.rows.length>value.total)return invalid();
 const result=value as unknown as AgingInvoicesResponse;
 return {...result,accounts:result.accounts.map(a=>({...a,buckets:a.buckets.map(b=>({...b,key:normalizedBucketKey(b.key)}))}))};
}
export function agingPublicationMatches(data:AgingInvoicesResponse,refresh:RefreshState|undefined,hotel:AgingHotel|'All'|readonly HotelId[]){
 const wanted=Array.isArray(hotel)?hotel:isHotelId(hotel)?[hotel]:['KAT','TSK'];
 return wanted.every(h=>{const expected=refresh?.hotels.find(p=>p.hotel===h)?.last_success_at,actual=data.publications.find(p=>p.hotel===h)?.sourceAt;return !!expected&&!!actual&&Date.parse(expected)===Date.parse(actual);});
}
export function agingCountFor(row:Pick<AgingComparisonRow,'members'>,hotel:AgingHotel,bucket:AgingBucket|undefined,source:Source<AgingInvoicesResponse>,refresh?:RefreshState):AgingCount{
 const members=row.members.filter(a=>hotel==='Total'||a.hotel===hotel);
 if(!members.length)return {count:null,state:'absent'};
 if(!source.data)return {count:null,state:source.state==='loading'?'loading':'unavailable',reason:'Invoice counts are unavailable'};
 for(const h of new Set(members.map(a=>a.hotel))){if(!isHotelId(h)||!agingPublicationMatches(source.data,refresh,h))return {count:null,state:source.state==='loading'?'loading':'unavailable',reason:'Reload counts and saved data to use the same OPERA publication'};}
 const key=bucket?agingBucketKey(bucket):null;let count=0;
 for(const a of members){
  if(a.verification_state!=='verified'&&!(a.verification_state==='cleared'&&a.open===0))return {count:null,state:'unavailable',reason:'Account source verification is incomplete'};
  const account=source.data.accounts.find(r=>r.hotel===a.hotel&&r.accountId===a.id),cell=account?.buckets.find(b=>b.key===key);
  if(a.synced_at&&(!account?.syncedAt||Date.parse(a.synced_at)!==Date.parse(account.syncedAt)))return {count:null,state:source.state==='loading'?'loading':'unavailable',reason:'Reload counts and saved data to use the same account publication'};
  if(account?.accountType!==a.type||!cell?.complete||cell.count===null)return {count:null,state:'unavailable',reason:'Invoice verification or aging membership is incomplete'};
  count+=cell.count;
 }
 return Number.isSafeInteger(count)?{count,state:'ready'}:{count:null,state:'unavailable'};
}
export function agingStatusTarget(row:AgingComparisonRow,hotel:AgingHotel,bucket:AgingBucket|undefined,byType:boolean,columns:AgingBucket[]):AgingStatusTarget{
 const region=agingRegion(row.members),query=new URLSearchParams(region==='khao-lak'?{region}:{});if(hotel!=='Total')query.set('hotel',hotel);
 if(byType)query.set('type',row.key);else{
  const members=row.members.filter(a=>hotel==='Total'||a.hotel===hotel);
  const kat=members.filter(a=>a.hotel==='KAT'),tsk=members.filter(a=>a.hotel==='TSK');
  if(region==='phuket'&&kat.length<=1&&tsk.length<=1){if(kat[0])query.set('katAccount',kat[0].id);if(tsk[0])query.set('tskAccount',tsk[0].id);}
  else query.set('accounts',JSON.stringify(members.map(a=>[a.hotel,a.id])));
 }
 if(bucket)query.set('bucket',agingBucketKey(bucket));
 const cell=bucket?row.cells[columns.findIndex(b=>agingBucketKey(b)===agingBucketKey(bucket))]?.[hotel]:row.net[hotel];
 const hotels:HotelId[]=hotel!=='Total'?[hotel]:byType?[...regionHotels(region)]:regionHotels(region).filter(h=>row.members.some(a=>a.hotel===h)) as HotelId[];
 const accountPublications=row.members.filter(a=>hotel==='Total'||a.hotel===hotel).map(a=>({hotel:a.hotel,accountId:a.id,accountType:a.type,sourceAt:a.synced_at??null}));
 return {key:query.toString(),title:row.name,hotel,hotels,bucketLabel:bucket?.label??'All ages',query:query.toString(),sourceAmount:cell?.amount??null,accountPublications};
}
export function agingTargetPublicationMatches(data:AgingInvoicesResponse,target:AgingStatusTarget,refresh?:RefreshState){
 if(!agingPublicationMatches(data,refresh,target.hotels)||data.accounts.length!==target.accountPublications.length)return false;
 return target.accountPublications.every(expected=>{const actual=data.accounts.find(a=>a.hotel===expected.hotel&&a.accountId===expected.accountId);return !!actual&&actual.accountType===expected.accountType&&(!expected.sourceAt||!!actual.syncedAt&&Date.parse(expected.sourceAt)===Date.parse(actual.syncedAt));});
}
export function agingSourceRevision(revision:number,refresh?:RefreshState){return revision+(refresh?.hotels.reduce((n,h)=>n+(Date.parse(h.last_success_at??'')||0),0)??0);}
export function agingCatalogRevision(accounts:Account[]){return accounts.reduce((n,a)=>n+(Date.parse(a.synced_at??'')||0),0);}
export function agingDetailsResult(query:URLSearchParams){
 const hotel=query.get('hotel'),type=query.get('type'),kat=query.get('katAccount'),tsk=query.get('tskAccount'),bucket=query.get('bucket')?JSON.parse(query.get('bucket')!) as [string,number,number|null,number]:null;
 const members=query.has('accounts')?new Set((JSON.parse(query.get('accounts')!) as [string,string][]).map(pair=>JSON.stringify(pair))):null;
 const dimension=query.get('dimension'),status=query.get('status'),flag=query.get('flag');
 return (value:unknown)=>{
  const result=agingInvoicesResult(value);
  const inScope=(r:{hotel:string;accountId:string;accountType:string})=>hotelInRegion(r.hotel,resolveRegion(query))&&(!hotel||r.hotel===hotel)&&(!type||r.accountType===type)&&(!kat&&!tsk||r.hotel==='KAT'&&r.accountId===kat||r.hotel==='TSK'&&r.accountId===tsk)&&(!members||members.has(JSON.stringify([r.hotel,r.accountId])));
  if(result.accounts.some(r=>!inScope(r))||result.rows.length>Number(query.get('limit')??50))return invalid();
  for(const row of result.rows){
   if(!inScope(row)||bucket&&(row.age===null||row.age<bucket[1]||bucket[2]!==null&&row.age>bucket[2])||flag==='held'&&!row.held||flag==='needs_review'&&!row.needsReview)return invalid();
   const current=dimension==='billing'?row.billingStatus:dimension==='followup'?row.latestStage:dimension==='due'?row.dueStatus:null;
   if(status&&current!==status)return invalid();
  }
  return result;
 };
}
