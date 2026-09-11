import {thaiToday,nextCollectionAction,type QueueInvoice} from '../domain/collection';
import type {CollectionPolicy} from '../domain/collection-policy';
import {amountToSatang,satangToAmount} from '../remittance/money';

export interface DashboardScope {hotel:string;day:string;from:string;to:string;type:string;account:string}
export interface AccountOption {hotel:string;account_id:string;account_name:string;account_type:string}
export interface ActivityKind {kind:string;invoices:number;amount:number|null;stage_label?:string|null}
export interface ActivitySummary {kinds:ActivityKind[];invoices:number;messages:number;missingAmounts:number}
export interface ExternalSummary {records:number;invoices:number;firstBillingInvoices:number;amount:string|null;unknownAmounts:number}
export interface CurrentSummary {invoices:number;amount:number|null;unverified:number;hotels:{hotel:string;accounts:number;open:number;over90:number;oldest_sync:string|null;unverified_accounts:number}[]}
export type DashboardQueueRow=QueueInvoice&{account_name:string;account_type:string};
export const validDay=(day:string)=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&!day.startsWith('0000')&&Number.isFinite(Date.parse(day))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;
export function accountIdentity(value:string):[string,string]|null {
 try{const v:unknown=JSON.parse(value);return Array.isArray(v)&&v.length===2&&['KAT','TSK'].includes(v[0])&&typeof v[1]==='string'&&v[1].length>0&&v[1].length<=200&&!/[\x00-\x1f\x7f]/.test(v[1])?[v[0],v[1]]:null;}catch{return null;}
}
export function dashboardScope(params:URLSearchParams,hotel:string,today=thaiToday()):DashboardScope {
 const identity=accountIdentity(params.get('dashboardAccount')??'');
 const to=params.get('dashboardTo')??params.get('dashboardDay')??today,from=params.get('dashboardFrom')??params.get('dashboardDay')??to;
 return {hotel:['KAT','TSK'].includes(hotel)?hotel:'All',day:to,from,to,type:(params.get('dashboardType')??'').slice(0,200),account:identity&&(hotel==='All'||identity[0]===hotel)?JSON.stringify(identity):''};
}
export function scopeQuery(scope:DashboardScope,dated=false){
 const q=new URLSearchParams(),identity=accountIdentity(scope.account);
 if(identity){q.set('hotel',identity[0]);q.set('account',identity[1]);}else if(scope.hotel!=='All')q.set('hotel',scope.hotel);
 if(scope.type)q.set('type',scope.type);if(dated){q.set('from',scope.from);q.set('to',scope.to);}return q;
}
export function count(value:unknown):number|null{return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;}
export function decimal(value:unknown):string|null {
 if(typeof value==='number'){if(!Number.isFinite(value)||!Number.isSafeInteger(Math.round(value*100))||Math.abs(value-Math.round(value*100)/100)>1e-8)return null;value=value.toFixed(2);}
 if(typeof value!=='string'||value.length>40||! /^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(value))return null;
 return satangToAmount(amountToSatang(value));
}
export function addAmounts(values:unknown[]):string|null {
 const normalized=values.map(decimal);if(normalized.some(v=>v===null))return null;return satangToAmount(normalized.reduce((total,v)=>total+amountToSatang(v!),0n));
}
const billingKinds=new Set(['First billing','Rebilling','Billing classification unavailable','No verified send']);
export function activityTotals(activity:ActivitySummary|undefined,external:ExternalSummary|undefined){
 const kinds=activity&&Array.isArray(activity.kinds)&&activity.kinds.every(k=>typeof k.kind==='string'&&count(k.invoices)!==null)?activity.kinds:null;
 const first=kinds?.find(k=>k.kind==='First billing'),repeat=kinds?.find(k=>k.kind==='Rebilling'),unknown=kinds?.find(k=>k.kind==='Billing classification unavailable');
 const emailFirst=kinds?first?.invoices??0:null,externalFirst=count(external?.firstBillingInvoices);
 const reminders=kinds?.filter(k=>!billingKinds.has(k.kind))??null;
 const sumCount=(values:number[])=>count(values.reduce((n,v)=>n+v,0));
 return {emailFirst,emailFirstAmount:kinds?first?decimal(first.amount):'0.00':null,emailRepeat:kinds?repeat?.invoices??0:null,emailRepeatAmount:kinds?repeat?decimal(repeat.amount):'0.00':null,externalFirst,firstBilled:emailFirst!==null&&externalFirst!==null&&!unknown?.invoices?sumCount([emailFirst,externalFirst]):null,
  reminderCount:reminders?sumCount(reminders.map(k=>k.invoices)):null,reminderAmount:reminders?addAmounts(reminders.map(k=>k.amount)):null,reminders,
  emailBillingCount:kinds?sumCount(kinds.filter(k=>billingKinds.has(k.kind)&&k.kind!=='No verified send').map(k=>k.invoices)):null,
  emailBillingAmount:kinds?addAmounts(kinds.filter(k=>billingKinds.has(k.kind)&&k.kind!=='No verified send').map(k=>k.amount)):null,
  firstBillingUnclassified:!!unknown?.invoices};
}
export const workKinds=['urgent','billing','collection','review','held','setup'] as const;
export type WorkKind=typeof workKinds[number];
export function queueTotals(rows:DashboardQueueRow[]|undefined,scope:DashboardScope,policy:CollectionPolicy|null,today=thaiToday()){
 if(!rows)return null;const identity=accountIdentity(scope.account);
 const totals=Object.fromEntries(workKinds.map(k=>[k,{count:0,amount:0n}])) as Record<WorkKind,{count:number;amount:bigint}>;
 for(const row of rows){
  if(scope.hotel!=='All'&&row.hotel!==scope.hotel||scope.type&&row.account_type!==scope.type||identity&&(row.hotel!==identity[0]||row.account_id!==identity[1]))continue;
  const action=nextCollectionAction(row,today,policy);if(!action)continue;
  // Urgency is independent of a hold/reopen review, exactly as in Collections.
  // These are filter views, not disjoint buckets to add into a debt total.
  const keys:WorkKind[]=action.urgent?['urgent']:[];
  const actionKey:WorkKind|null=action.stage==='Billing'?'billing':action.stage==='Needs review'?'review':action.stage==='On hold'?'held':action.stage==='Setup needed'?'setup':action.stage!=='Urgent'&&action.ready?'collection':null;
  if(actionKey)keys.push(actionKey);
  for(const key of keys){const value=decimal(row.open);if(value===null)throw Error('dashboard_invalid_amount');totals[key].count++;totals[key].amount+=amountToSatang(value);}
 }
 return Object.fromEntries(workKinds.map(k=>[k,{count:totals[k].count,amount:satangToAmount(totals[k].amount)}])) as Record<WorkKind,{count:number;amount:string}>;
}

export function validPeriod(scope:Pick<DashboardScope,'from'|'to'>,today=thaiToday()){return validDay(scope.from)&&validDay(scope.to)&&scope.from<=scope.to&&scope.to<=today&&Date.parse(scope.to)-Date.parse(scope.from)<=3660*86400000;}
export function periodPreset(key:'today'|'yesterday'|'month'|'previous-month',today=thaiToday()){
 const d=new Date(today+'T00:00:00Z'),ymd=(date:Date)=>date.toISOString().slice(0,10);
 if(key==='today')return{from:today,to:today};if(key==='yesterday'){d.setUTCDate(d.getUTCDate()-1);return{from:ymd(d),to:ymd(d)};}
 if(key==='month')return{from:today.slice(0,8)+'01',to:today};d.setUTCDate(0);return{from:ymd(d).slice(0,8)+'01',to:ymd(d)};
}

export function historyChunks(from:string,to:string){
 if(!validDay(from)||!validDay(to)||from>to||Date.parse(to)-Date.parse(from)>3660*86400000)return[];
 const result:{from:string;to:string}[]=[];let day=from;
 while(day<=to){const end=new Date(Date.parse(day)+364*86400000).toISOString().slice(0,10),last=end<to?end:to;result.push({from:day,to:last});day=new Date(Date.parse(last)+86400000).toISOString().slice(0,10);}
 return result;
}
