export type ExceptionAction='set_notes'|'hold'|'release'|'acknowledge_reopen';
export interface ExceptionScope {hotel:'KAT'|'TSK';accountId:string;invoiceId:string}
export interface ExceptionInput {commandId:string;revision:number;confirmed:true;action:ExceptionAction;reason:string;note?:string;dispute?:string;reviewDate?:string|null}
export interface InvoiceException extends ExceptionScope {revision:number;note:string;dispute:string;held:boolean;holdReason:string|null;holdReviewDate:string|null;needsReview:boolean;reviewReason:string|null;reopenedAt:string|null;updatedAt:string|null;source:{open:string|null;verification:string|null;collectionRole:string|null;verifiedAt:string|null}}
export interface ExceptionHistory {rows:{revision:number;action:string;reason:string;recordedAt:string;snapshot:InvoiceException;transition:{fromOpen:string;toOpen:string}|null}[];total:number}
const invalid=():never=>{throw Error('exception_invalid');};
export function exceptionId(value:unknown){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))return invalid();return value.toLowerCase();}
function object(value:unknown){if(!value||typeof value!=='object'||Array.isArray(value))return invalid();return value as Record<string,unknown>;}
function text(value:unknown,max:number){if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))return invalid();return value.trim();}
export function exceptionScope(hotel:unknown,account:unknown,invoice:unknown):ExceptionScope {const identity=(v:unknown)=>{if(typeof v!=='string'||!v||v.length>200||v.trim()!==v||/[\x00-\x1f\x7f]/.test(v))return invalid();return v;};if(hotel!=='KAT'&&hotel!=='TSK')return invalid();return {hotel,accountId:identity(account),invoiceId:identity(invoice)};}
export function parseExceptionCommand(value:unknown):ExceptionInput {
 const v=object(value);if(typeof v.action!=='string'||!['set_notes','hold','release','acknowledge_reopen'].includes(v.action))return invalid();const action=v.action as ExceptionAction;
 const allowed=['commandId','revision','confirmed','action','reason',...(action==='set_notes'?['note','dispute']:action==='hold'?['reviewDate']:[])];if(Object.keys(v).some(k=>!allowed.includes(k))||v.confirmed!==true||!Number.isSafeInteger(v.revision)||Number(v.revision)<0||Number(v.revision)>2147483647)return invalid();
 const reason=text(v.reason,1000);if(!reason)throw Error('exception_reason_required');const base:ExceptionInput={commandId:exceptionId(v.commandId),revision:Number(v.revision),confirmed:true,action,reason};
 if(action==='set_notes')return {...base,note:text(v.note,4000),dispute:text(v.dispute,4000)};
 if(action==='hold'){const d=v.reviewDate??null;if(d!==null&&(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||d.startsWith('0000-')||!Number.isFinite(Date.parse(d+'T00:00:00Z'))||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d))return invalid();return {...base,reviewDate:d as string|null};}
 return base;
}
export function exceptionPage(q:URLSearchParams){for(const key of q.keys())if(!['page','limit'].includes(key)||q.getAll(key).length!==1)return invalid();const read=(key:string,fallback:number)=>{const raw=q.get(key);if(raw===null)return fallback;if(!/^(0|[1-9][0-9]*)$/.test(raw))return invalid();const n=Number(raw);if(!Number.isSafeInteger(n))return invalid();return n;};const page=read('page',0),limit=read('limit',20);if(limit<1||limit>200||page*limit>2147483647)return invalid();return {offset:page*limit,limit};}
/** Provider/DB JSON is never forwarded wholesale to the browser. */
export function checkedException(value:unknown,scope:ExceptionScope):InvoiceException {
 try{const v=object(value),source=object(v.source);const str=(x:unknown)=>{if(typeof x!=='string')return invalid();return x;},nullable=(x:unknown)=>x===null?null:str(x),bool=(x:unknown)=>{if(typeof x!=='boolean')return invalid();return x;};
 if(v.hotel!==scope.hotel||v.accountId!==scope.accountId||v.invoiceId!==scope.invoiceId||!Number.isSafeInteger(v.revision)||Number(v.revision)<0)return invalid();const open=nullable(source.open);if(open!==null&&!/^-?(0|[1-9][0-9]*)\.[0-9]{2}$/.test(open))return invalid();
 return {...scope,revision:Number(v.revision),note:str(v.note),dispute:str(v.dispute),held:bool(v.held),holdReason:nullable(v.holdReason),holdReviewDate:nullable(v.holdReviewDate),needsReview:bool(v.needsReview),reviewReason:nullable(v.reviewReason),reopenedAt:nullable(v.reopenedAt),updatedAt:nullable(v.updatedAt),source:{open,verification:nullable(source.verification),collectionRole:nullable(source.collectionRole),verifiedAt:nullable(source.verifiedAt)}};
 }catch{throw Error('exception_unavailable');}
}
