import {boundedBody} from '../email/shared';

export interface BudgetBytes {storedBytes:number;egressBytes:number;databaseBytes:number}
export interface MeasuredBudgetBytes {storedBytes:number|null;egressBytes:number|null;databaseBytes:number|null}
export interface BudgetMeasurement {observedAt:{storedBytes:string|null;egressBytes:string|null;databaseBytes:string|null};periodStart:string;periodEnd:string;used:MeasuredBudgetBytes;headroom:MeasuredBudgetBytes}
export interface BudgetLimits extends BudgetBytes {safetyPercent:number;maxConcurrent:number;measurementMaxAgeSeconds:number}
export interface BudgetReservation {id:string;resource:string;state:'reserved'|'started'|'finished'|'released';reserved:BudgetBytes;actual:BudgetBytes|null;overrun:boolean}
export interface BudgetEnvironment {
 OPERATIONS_WRITE_HOLD?:string;
 SUPABASE_URL?:string;SUPABASE_SECRET_KEY?:string;OPERATIONS_BUDGET_ENABLED?:string;
 OPS_BUDGET_STORED_BYTES?:string;OPS_BUDGET_EGRESS_BYTES?:string;OPS_BUDGET_DATABASE_BYTES?:string;
 OPS_BUDGET_SAFETY_PERCENT?:string;OPS_BUDGET_MAX_CONCURRENT?:string;OPS_BUDGET_MEASUREMENT_SECONDS?:string;
}
export interface BudgetState {measurement:BudgetMeasurement|null;charged:BudgetBytes;activeReservations:number;blocked:boolean}
export type BudgetDecision={allowed:true}|{allowed:false;reason:string};
const dimensions=['storedBytes','egressBytes','databaseBytes'] as const;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const resourcePattern=/^[a-z][a-z0-9_]{0,63}$/;
const errors=new Set(['budget_invalid','budget_forbidden','budget_not_configured','budget_not_enabled','budget_unavailable','budget_usage_unverified','budget_measurement_stale','budget_period_closed','budget_storage_exceeded','budget_egress_exceeded','budget_database_exceeded','budget_headroom_exceeded','budget_concurrency_exceeded','budget_review_required','budget_conflict','budget_missing','budget_release_unsafe','budget_not_started','budget_invalid_response','budget_response_too_large']);
function object(v:unknown,code='budget_invalid'):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error(code);return v as Record<string,unknown>;}
function integer(value:unknown,code='budget_invalid'){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw Error(code);return value;}
function byteVector(value:unknown,nullable:false,code?:string):BudgetBytes;
function byteVector(value:unknown,nullable:true,code?:string):MeasuredBudgetBytes;
function byteVector(value:unknown,nullable:boolean,code='budget_invalid'):MeasuredBudgetBytes {
 const v=object(value,code);if(Object.keys(v).some(k=>!dimensions.includes(k as typeof dimensions[number])))throw Error(code);
 const get=(key:typeof dimensions[number])=>nullable&&v[key]===null?null:integer(v[key],code);
 return {storedBytes:get('storedBytes'),egressBytes:get('egressBytes'),databaseBytes:get('databaseBytes')};
}
function date(value:unknown,code='budget_invalid'){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(value)||!Number.isFinite(Date.parse(value)))throw Error(code);return value;}
function checkedMeasurement(value:unknown,code='budget_invalid'):BudgetMeasurement {
 const v=object(value,code),times=object(v.observedAt,code),periodStart=date(v.periodStart,code),periodEnd=date(v.periodEnd,code);
 if(Date.parse(periodStart)>=Date.parse(periodEnd))throw Error(code);
 const time=(key:typeof dimensions[number])=>{if(times[key]===null)return null;const value=date(times[key],code);if(Date.parse(value)<Date.parse(periodStart)||Date.parse(value)>=Date.parse(periodEnd))throw Error(code);return value;};
 const observedAt={storedBytes:time('storedBytes'),egressBytes:time('egressBytes'),databaseBytes:time('databaseBytes')};
 return {observedAt,periodStart,periodEnd,used:byteVector(v.used,true,code),headroom:byteVector(v.headroom,true,code)};
}
export function operationBudgetLimits(env:BudgetEnvironment):BudgetLimits {
 const read=(v:string|undefined,fallback:number,min:number,max:number)=>{if(v===undefined)return fallback;if(!/^[1-9][0-9]*$/.test(v)||!Number.isSafeInteger(Number(v))||Number(v)<min||Number(v)>max)throw Error('budget_not_configured');return Number(v);};
 return {storedBytes:read(env.OPS_BUDGET_STORED_BYTES,1073741824,1,17179869184),egressBytes:read(env.OPS_BUDGET_EGRESS_BYTES,2147483648,1,34359738368),databaseBytes:read(env.OPS_BUDGET_DATABASE_BYTES,268435456,1,1073741824),safetyPercent:read(env.OPS_BUDGET_SAFETY_PERCENT,20,20,90),maxConcurrent:read(env.OPS_BUDGET_MAX_CONCURRENT,4,1,16),measurementMaxAgeSeconds:read(env.OPS_BUDGET_MEASUREMENT_SECONDS,300,30,900)};
}
function checkedLimits(limits:BudgetLimits){
 return operationBudgetLimits({OPS_BUDGET_STORED_BYTES:String(limits.storedBytes),OPS_BUDGET_EGRESS_BYTES:String(limits.egressBytes),OPS_BUDGET_DATABASE_BYTES:String(limits.databaseBytes),OPS_BUDGET_SAFETY_PERCENT:String(limits.safetyPercent),OPS_BUDGET_MAX_CONCURRENT:String(limits.maxConcurrent),OPS_BUDGET_MEASUREMENT_SECONDS:String(limits.measurementMaxAgeSeconds)});
}
/** Explanation/UI projection only. Admission is always the atomic database RPC. */
export function assessOperationBudget(state:BudgetState,request:BudgetBytes,limits:BudgetLimits,now=Date.now()):BudgetDecision {
 const requested=byteVector(request,false),charged=byteVector(state.charged,false),config=checkedLimits(limits);
 integer(state.activeReservations);if(typeof state.blocked!=='boolean'||!Number.isFinite(now))throw Error('budget_invalid');
 const deny=(reason:string):BudgetDecision=>({allowed:false,reason});
 if(state.blocked)return deny('budget_review_required');
 if(!state.measurement)return deny('budget_usage_unverified');
 const m=checkedMeasurement(state.measurement),relevant=dimensions.filter(key=>requested[key]>0);
 if(relevant.some(key=>m.used[key]===null||m.headroom[key]===null||m.observedAt[key]===null))return deny('budget_usage_unverified');
 if(now<Date.parse(m.periodStart)||now>=Date.parse(m.periodEnd))return deny('budget_period_closed');
 for(const key of relevant){const observed=Date.parse(m.observedAt[key]!);if(observed>now||key!=='egressBytes'&&now-observed>config.measurementMaxAgeSeconds*1000)return deny('budget_measurement_stale');}
 if(state.activeReservations>=config.maxConcurrent)return deny('budget_concurrency_exceeded');
 const messages={storedBytes:'budget_storage_exceeded',egressBytes:'budget_egress_exceeded',databaseBytes:'budget_database_exceeded'};
 for(const key of relevant){
  const used=m.used[key]!,headroom=m.headroom[key]!,remainingCharge=charged[key]+requested[key],projected=used+remainingCharge;
  if(!Number.isSafeInteger(remainingCharge)||!Number.isSafeInteger(projected))throw Error('budget_invalid');
  const safeLimit=Math.floor(config[key]*(100-config.safetyPercent)/100),safeHeadroom=Math.floor(headroom*(100-config.safetyPercent)/100);
  if(projected>safeLimit)return deny(messages[key]);if(remainingCharge>safeHeadroom)return deny('budget_headroom_exceeded');
 }
 return {allowed:true};
}
function checkedReservation(value:unknown):BudgetReservation {
 const v=object(value,'budget_invalid_response');if(typeof v.id!=='string'||!uuid.test(v.id)||typeof v.resource!=='string'||!resourcePattern.test(v.resource)||!['reserved','started','finished','released'].includes(String(v.state))||typeof v.overrun!=='boolean')throw Error('budget_invalid_response');
 const reserved=byteVector(v.reserved,false,'budget_invalid_response'),actual=v.actual===null?null:byteVector(v.actual,false,'budget_invalid_response');
 if(v.state==='finished'&&actual===null||v.state!=='finished'&&actual!==null||v.state!=='finished'&&v.overrun)throw Error('budget_invalid_response');
 if(actual&&v.overrun!==dimensions.some(k=>actual[k]>reserved[k]))throw Error('budget_invalid_response');
 return {id:v.id,resource:v.resource,state:v.state as BudgetReservation['state'],reserved,actual,overrun:v.overrun};
}
function identity(actor:string,id?:string){if(!uuid.test(actor))throw Error('budget_forbidden');if(id!==undefined&&!uuid.test(id))throw Error('budget_invalid');}
function enabled(env:BudgetEnvironment){if(env.OPERATIONS_BUDGET_ENABLED!=='true')throw Error('budget_not_enabled');}
async function rpc(env:BudgetEnvironment,name:string,args:Record<string,unknown>):Promise<unknown>{
 if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)throw Error('budget_not_configured');let base:URL;
 try{base=new URL(env.SUPABASE_URL);}catch{throw Error('budget_not_configured');}
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('budget_not_configured');
 let response:Response;try{response=await fetch(base.origin+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'},body:JSON.stringify(args),redirect:'manual',signal:AbortSignal.timeout(20000)});}catch{throw Error('budget_unavailable');}
 if(!response.ok){await response.body?.cancel();throw Error('budget_unavailable');}
 let raw:Uint8Array;try{raw=await boundedBody(response,65536);}catch(e){throw Error(e instanceof Error&&e.message==='email_too_large'?'budget_response_too_large':'budget_unavailable');}
 let value:unknown;try{value=JSON.parse(new TextDecoder().decode(raw));}catch{throw Error('budget_unavailable');}
 if(value&&typeof value==='object'&&'error' in value)throw Error(typeof value.error==='string'&&errors.has(value.error)?value.error:'budget_unavailable');return value;
}
function receipt(value:unknown,id:string){const r=checkedReservation(value);if(r.id!==id)throw Error('budget_invalid_response');return r;}
export async function reserveOperationBudget(env:BudgetEnvironment,actor:string,input:{id:string;resource:string;bytes:BudgetBytes}):Promise<BudgetReservation>{
 enabled(env);identity(actor,input.id);if(typeof input.resource!=='string'||!resourcePattern.test(input.resource))throw Error('budget_invalid');const bytes=byteVector(input.bytes,false);
 if(!dimensions.some(k=>bytes[k]>0))throw Error('budget_invalid');
 const r=receipt(await rpc(env,'ar_operations_budget_reserve',{p_actor:actor,p_id:input.id,p_resource:input.resource,p_bytes:bytes,p_limits:operationBudgetLimits(env)}),input.id);
 if(r.resource!==input.resource||dimensions.some(k=>r.reserved[k]!==bytes[k]))throw Error('budget_invalid_response');return r;
}
export async function startOperationBudget(env:BudgetEnvironment,actor:string,id:string):Promise<{reservation:BudgetReservation;proceed:boolean}>{
 enabled(env);identity(actor,id);const v=object(await rpc(env,'ar_operations_budget_start',{p_actor:actor,p_id:id,p_limits:operationBudgetLimits(env)}),'budget_invalid_response');
 const reservation=receipt(v.reservation,id);if(typeof v.proceed!=='boolean'||v.proceed&&reservation.state!=='started')throw Error('budget_invalid_response');return {reservation,proceed:v.proceed};
}
export async function finishOperationBudget(env:BudgetEnvironment,actor:string,id:string,actual:BudgetBytes):Promise<BudgetReservation>{
 identity(actor,id);const measured=byteVector(actual,false),r=receipt(await rpc(env,'ar_operations_budget_finish',{p_actor:actor,p_id:id,p_actual:measured}),id);
 if(r.state!=='finished'||!r.actual||dimensions.some(k=>r.actual![k]!==measured[k]))throw Error('budget_invalid_response');return r;
}
export async function releaseOperationBudget(env:BudgetEnvironment,actor:string,id:string):Promise<BudgetReservation>{
 identity(actor,id);const r=receipt(await rpc(env,'ar_operations_budget_release',{p_actor:actor,p_id:id}),id);if(r.state!=='released')throw Error('budget_invalid_response');return r;
}
/** Service-only verified measurement ingestion. Null records uncertainty; it never becomes zero. */
export async function recordBudgetMeasurement(env:BudgetEnvironment,actor:string,measurement:BudgetMeasurement):Promise<BudgetMeasurement>{
 identity(actor);const input=checkedMeasurement(measurement);return checkedMeasurement(await rpc(env,'ar_operations_budget_measure',{p_actor:actor,p_measurement:input}),'budget_invalid_response');
}
/** Measures local object metadata and logical DB bytes; never reads provider credentials. */
export async function refreshLocalBudgetMeasurement(env:BudgetEnvironment,actor:string):Promise<BudgetMeasurement>{
 identity(actor);return checkedMeasurement(await rpc(env,'ar_operations_budget_refresh_local',{p_actor:actor}),'budget_invalid_response');
}
