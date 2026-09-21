import {exceptionId,exceptionScope} from '../collection/exceptions';
import {regionalHotelScope} from '../hotels';
import {isCollectionStageKey} from '../../src/domain/collection-policy';
import {registerSortKeys,trackingStatuses,type RegisterCommand} from '../../src/register/model';
const invalid=():never=>{throw Error('register_invalid');};
const record=(v:unknown):Record<string,unknown>=>!v||typeof v!=='object'||Array.isArray(v)?invalid():v as Record<string,unknown>;
const str=(v:unknown,max:number)=>typeof v!=='string'||v.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v)?invalid():v.trim();
const integer=(v:unknown)=>!Number.isSafeInteger(v)||Number(v)<0||Number(v)>2147483647?invalid():Number(v);
const date=(v:unknown)=>v===null?null:typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!v.startsWith('0000-')&&Number.isFinite(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v?v:invalid();
export function parseRegisterSave(input:unknown):RegisterCommand {
 const v=record(input),values=record(v.values);if(Object.keys(v).some(k=>!['commandId','revision','workflowRevision','exceptionRevision','values'].includes(k))||Object.keys(values).some(k=>!['billingRequired','creditTerm','firstBillingDate','lastReminderStage','lastReminderDate','promisedDate','trackingStatus','ownerName','reportedReceived','note'].includes(k)))invalid();
 const billingRequired=values.billingRequired;if(billingRequired!==null&&typeof billingRequired!=='boolean')invalid();
 const creditTerm=values.creditTerm===null?null:integer(values.creditTerm);if(creditTerm!==null&&creditTerm>3650)invalid();
 const lastReminderStage=values.lastReminderStage===null?null:str(values.lastReminderStage,100);if(lastReminderStage!==null&&!isCollectionStageKey(lastReminderStage))invalid();
 const lastReminderDate=date(values.lastReminderDate);if((lastReminderStage===null)!==(lastReminderDate===null))invalid();
 const trackingStatus=str(values.trackingStatus,80);if(!(trackingStatuses as readonly string[]).includes(trackingStatus))invalid();
 const amount=values.reportedReceived===null?null:str(values.reportedReceived,20);if(amount!==null&&!/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/.test(amount))invalid();
 return {commandId:exceptionId(v.commandId),revision:integer(v.revision),workflowRevision:integer(v.workflowRevision),exceptionRevision:integer(v.exceptionRevision),values:{billingRequired:billingRequired as boolean|null,creditTerm,firstBillingDate:date(values.firstBillingDate),lastReminderStage,lastReminderDate,promisedDate:date(values.promisedDate),trackingStatus,ownerName:str(values.ownerName,160),reportedReceived:amount,note:str(values.note,4000)}};
}
export function parseRegisterQuery(url:URL){
 const q=url.searchParams;for(const k of q.keys())if(!['region','hotel','account','type','search','balance','visibility','billing','tracking','sort','direction','page','limit'].includes(k)||q.getAll(k).length!==1)invalid();
 const text=(key:string,max=200)=>{const value=q.get(key);return value===null||value===''?null:str(value,max);};
 const regional=regionalHotelScope(q,text('account'));
 const choice=(key:string,fallback:string,allowed:readonly string[])=>{const v=q.get(key)??fallback;return allowed.includes(v)?v:invalid();};
 const numeric=(key:string,fallback:number)=>q.has(key)&&!/^(0|[1-9]\d*)$/.test(q.get(key)!)?invalid():integer(Number(q.get(key)??fallback));
 const page=numeric('page',0),limit=numeric('limit',50);if(limit<1||limit>100||page*limit>2147483647)invalid();
 return {hotel:regional.reportHotel,account:text('account'),type:text('type'),search:text('search')??'',balance:choice('balance','open',['open','all','cleared','credit']),visibility:choice('visibility','visible',['visible','hidden','all']),billing:choice('billing','all',['all','required','not_required','unconfigured','unbilled','billed']),tracking:choice('tracking','all',['all',...trackingStatuses]),sort:choice('sort','account_name',registerSortKeys),direction:choice('direction','asc',['asc','desc']),offset:page*limit,limit};
}
export function parseRegisterVisibility(input:unknown){const v=record(input);if(Object.keys(v).some(k=>!['commandId','hidden','rows'].includes(k))||typeof v.hidden!=='boolean'||!Array.isArray(v.rows)||!v.rows.length||v.rows.length>100)invalid();const rows=(v.rows as unknown[]).map(x=>{const r=record(x);if(Object.keys(r).some(k=>!['hotel','accountId','invoiceId'].includes(k)))invalid();return exceptionScope(r.hotel,r.accountId,r.invoiceId);});if(new Set(rows.map(r=>JSON.stringify(r))).size!==rows.length)invalid();return {commandId:exceptionId(v.commandId),hidden:v.hidden,rows};}
