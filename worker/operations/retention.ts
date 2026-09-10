import {boundedBody} from '../email/shared';

export interface RetentionEnvironment {SUPABASE_URL?:string;SUPABASE_SECRET_KEY?:string;RETENTION_ENABLED?:string;RETENTION_SOURCE_MAX_AGE_SECONDS?:string;RETENTION_MAX_CONCURRENT?:string;RETENTION_LEASE_SECONDS?:string}
export interface RetentionInvoice {hotel:string;accountId:string;invoiceId:string;open:string|null;verified:boolean;collectionRole:string;verifiedAt:string|null;zeroSince:string|null;held:boolean;disputed:boolean;needsReview:boolean}
export interface RetentionSnapshot {owned:boolean;knownReferences:boolean;minimumEligibleAt:string;eligibleSince:string|null;pendingDocuments:boolean;pendingMail:boolean;links:RetentionInvoice[]}
export interface RetentionDecision {complete:boolean;due:boolean;reason:string;eligibleSince:string|null;dueAt:string|null}
interface TargetBase {objectId:string;owner:string;byteCount:number;sha256:string}
export type RetentionTarget=(TargetBase&{store:'supabase';bucket:'ar-working-files';key:string;updatedAt:string;etag:string|null})|(TargetBase&{store:'drive';parentId:string;archiveId:string;jobId:string;documentRevision:number;ordinal:number});
export interface RetentionItem {id:string;revision:number;state:'waiting'|'blocked'|'claimed'|'uncertain'|'deleted';reason:string|null;eligibleSince:string|null;dueAt:string|null;claimId:string|null;target:RetentionTarget}
export type RetentionInspection={state:'present';identityVerified:boolean}|{state:'absent'}|{state:'unknown'};
/** Adapters must prove exact object ID, ownership, byte receipt/hash and provider identity.
 * Absent means authenticated verified absence, not an ambiguous 404 or access failure.
 * Provider credentials/URLs never enter the enrollment API or the returned item model. */
export interface RetentionProvider {inspect(target:RetentionTarget):Promise<RetentionInspection>;remove(target:RetentionTarget):Promise<void>}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const driveId=/^[A-Za-z0-9_-]{10,200}$/;
const u='[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const storageKey=new RegExp(`^(?:remittances/${u}/${u}|jobs/${u}/(?:originals/${u}\\.pdf|exports/${u}\\.pdf|projects/${u}\\.json|email/${u}/${u}))$`);
const errorCodes=new Set(['retention_invalid','retention_forbidden','retention_missing','retention_not_configured','retention_not_enabled','retention_unavailable','retention_invalid_response','retention_unknown_source','retention_identity_mismatch','retention_no_links','retention_source_unknown','retention_source_open','retention_source_stale','retention_held','retention_pending_work','retention_pending_documents','retention_pending_mail','retention_waiting','retention_due','retention_claim_lost','retention_busy','retention_blocked','retention_references_changed','retention_observed_present','retention_observed_absent','retention_outcome_unknown']);
const failure=(reason:string):RetentionDecision=>({complete:false,due:false,reason,eligibleSince:null,dueAt:null});
function timestamp(v:unknown,code='retention_invalid'){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(v)||!Number.isFinite(Date.parse(v)))throw Error(code);return Date.parse(v);}
export function calendarMonthAfterThai(value:string):string {
 const local=new Date(timestamp(value)+7*3600000),day=local.getUTCDate();local.setUTCDate(1);local.setUTCMonth(local.getUTCMonth()+1);
 const lastDay=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth()+1,0)).getUTCDate();local.setUTCDate(Math.min(day,lastDay));return new Date(local.getTime()-7*3600000).toISOString();
}
export function retentionConfig(env:RetentionEnvironment){
 const read=(value:string|undefined,fallback:number,min:number,max:number)=>{if(value===undefined)return fallback;if(!/^[1-9][0-9]*$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)<min||Number(value)>max)throw Error('retention_not_configured');return Number(value);};
 return {sourceMaxAgeSeconds:read(env.RETENTION_SOURCE_MAX_AGE_SECONDS,1800,60,7200),maxConcurrent:read(env.RETENTION_MAX_CONCURRENT,2,1,8),leaseSeconds:read(env.RETENTION_LEASE_SECONDS,300,30,600)};
}
/** Explanation/test projection only. SQL rechecks source and work state before arming. */
export function retentionDecision(snapshot:RetentionSnapshot,now=Date.now(),sourceMaxAgeSeconds=1800):RetentionDecision {
 if(!Number.isFinite(now)||!Number.isSafeInteger(sourceMaxAgeSeconds)||sourceMaxAgeSeconds<60||sourceMaxAgeSeconds>7200)throw Error('retention_invalid');
 if(snapshot.owned!==true)return failure('retention_forbidden');if(snapshot.knownReferences!==true)return failure('retention_unknown_source');
 if(!Array.isArray(snapshot.links)||!snapshot.links.length)return failure('retention_no_links');
 if(snapshot.pendingDocuments!==false||snapshot.pendingMail!==false)return failure('retention_pending_work');
 let floor=timestamp(snapshot.minimumEligibleAt),stale=false;if(floor>now)return failure('retention_source_unknown');
 for(const link of snapshot.links){
  if(!['KAT','TSK'].includes(link.hotel)||!link.accountId||!link.invoiceId||link.verified!==true||!['standalone','parent'].includes(link.collectionRole)||link.open===null||!link.verifiedAt||!link.zeroSince)return failure('retention_source_unknown');
  if(link.open!=='0.00')return failure('retention_source_open');
  if(link.held!==false||link.disputed!==false||link.needsReview!==false)return failure('retention_held');
  const verified=timestamp(link.verifiedAt),zero=timestamp(link.zeroSince);
  if(verified>now||zero>now)return failure('retention_source_unknown');if(now-verified>sourceMaxAgeSeconds*1000)stale=true;floor=Math.max(floor,zero);
 }
 if(stale){const prior=snapshot.eligibleSince===null?null:timestamp(snapshot.eligibleSince);if(prior!==null&&prior>=floor&&prior<=now){const eligibleSince=new Date(prior).toISOString();return {complete:false,due:false,reason:'retention_source_stale',eligibleSince,dueAt:calendarMonthAfterThai(eligibleSince)};}return failure('retention_source_stale');}
 let since=snapshot.eligibleSince===null?now:timestamp(snapshot.eligibleSince);if(since>now)return failure('retention_source_unknown');if(since<floor)since=now;
 const eligibleSince=new Date(since).toISOString(),dueAt=calendarMonthAfterThai(eligibleSince),due=now>=Date.parse(dueAt);
 return {complete:true,due,reason:due?'retention_due':'retention_waiting',eligibleSince,dueAt};
}
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('retention_invalid_response');return v as Record<string,unknown>;}
function text(v:unknown){if(typeof v!=='string')throw Error('retention_invalid_response');return v;}
function integer(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER){if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)throw Error('retention_invalid_response');return v;}
function nullableTime(v:unknown){if(v===null)return null;timestamp(v,'retention_invalid_response');return text(v);}
function checkedTarget(value:unknown,actor:string):RetentionTarget {
 const v=object(value),base={objectId:text(v.objectId),owner:text(v.owner),byteCount:integer(v.byteCount,1,104857600),sha256:text(v.sha256)};
 if(base.owner!==actor||!uuid.test(base.owner)||!/^[0-9a-f]{64}$/.test(base.sha256))throw Error('retention_invalid_response');
 if(v.store==='supabase'){const key=text(v.key),updatedAt=text(v.updatedAt),etag=v.etag===null?null:text(v.etag);timestamp(updatedAt,'retention_invalid_response');if(!uuid.test(base.objectId)||v.bucket!=='ar-working-files'||!storageKey.test(key)||etag!==null&&!/^[A-Za-z0-9._"-]{1,200}$/.test(etag))throw Error('retention_invalid_response');return {...base,store:'supabase',bucket:'ar-working-files',key,updatedAt,etag};}
 if(v.store==='drive'){
  const parentId=text(v.parentId),archiveId=text(v.archiveId),jobId=text(v.jobId);if(!driveId.test(base.objectId)||!driveId.test(parentId)||!uuid.test(archiveId)||!uuid.test(jobId))throw Error('retention_invalid_response');
  return {...base,store:'drive',parentId,archiveId,jobId,documentRevision:integer(v.documentRevision,1,2147483647),ordinal:integer(v.ordinal,0,4000)};
 }
 throw Error('retention_invalid_response');
}
function checkedItem(value:unknown,actor:string,id?:string):RetentionItem {
 const v=object(value),itemId=text(v.id);if(!uuid.test(itemId)||id!==undefined&&itemId!==id||!['waiting','blocked','claimed','uncertain','deleted'].includes(String(v.state)))throw Error('retention_invalid_response');
 const claimId=v.claimId===null?null:text(v.claimId);if(claimId!==null&&!uuid.test(claimId))throw Error('retention_invalid_response');
 const reason=v.reason===null?null:text(v.reason);
 return {id:itemId,revision:integer(v.revision,1,2147483647),state:v.state as RetentionItem['state'],reason:reason===null?null:errorCodes.has(reason)?reason:'retention_blocked',eligibleSince:nullableTime(v.eligibleSince),dueAt:nullableTime(v.dueAt),claimId,target:checkedTarget(v.target,actor)};
}
function identity(actor:string,id?:string,claim?:string){if(!uuid.test(actor))throw Error('retention_forbidden');if(id!==undefined&&!uuid.test(id)||claim!==undefined&&!uuid.test(claim))throw Error('retention_invalid');}
async function rpc(env:RetentionEnvironment,name:string,args:Record<string,unknown>):Promise<unknown>{
 if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)throw Error('retention_not_configured');let base:URL;try{base=new URL(env.SUPABASE_URL);}catch{throw Error('retention_not_configured');}
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('retention_not_configured');
 let response:Response;try{response=await fetch(base.origin+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'},body:JSON.stringify(args),redirect:'manual',signal:AbortSignal.timeout(20000)});}catch{throw Error('retention_unavailable');}
 if(!response.ok){await response.body?.cancel();throw Error('retention_unavailable');}
 let v:unknown;try{v=JSON.parse(new TextDecoder().decode(await boundedBody(response,65536)));}catch{throw Error('retention_unavailable');}
 if(v&&typeof v==='object'&&'error'in v)throw Error(typeof v.error==='string'&&errorCodes.has(v.error)?v.error:'retention_unavailable');return v;
}
export async function enrollRetention(env:RetentionEnvironment,actor:string,store:'supabase'|'drive',objectId:string):Promise<RetentionItem>{
 identity(actor);if(store==='supabase'?!uuid.test(objectId):store==='drive'?!driveId.test(objectId):true)throw Error('retention_invalid');
 return checkedItem(await rpc(env,'ar_retention_enroll',{p_actor:actor,p_store:store,p_object_id:objectId,p_source_max_age:retentionConfig(env).sourceMaxAgeSeconds}),actor);
}
export async function retentionStatus(env:RetentionEnvironment,actor:string,id:string):Promise<RetentionItem>{
 identity(actor,id);return checkedItem(await rpc(env,'ar_retention_get',{p_actor:actor,p_id:id,p_source_max_age:retentionConfig(env).sourceMaxAgeSeconds}),actor,id);
}
export async function runRetentionItem(env:RetentionEnvironment,actor:string,id:string,claimId:string,providers:{supabase:RetentionProvider;drive:RetentionProvider}):Promise<RetentionItem>{
 if(env.RETENTION_ENABLED!=='true')throw Error('retention_not_enabled');identity(actor,id,claimId);const config=retentionConfig(env);
 const claim=object(await rpc(env,'ar_retention_claim',{p_actor:actor,p_id:id,p_claim:claimId,p_source_max_age:config.sourceMaxAgeSeconds,p_max_concurrent:config.maxConcurrent,p_lease_seconds:config.leaseSeconds}));
 let item=checkedItem(claim.item,actor,id);if(!['delete','reconcile','wait','busy','complete'].includes(String(claim.mode)))throw Error('retention_invalid_response');
 if(['wait','busy','complete'].includes(String(claim.mode)))return item;if(item.claimId!==claimId)throw Error('retention_invalid_response');
 const provider=providers[item.target.store];if(!provider||typeof provider.inspect!=='function'||typeof provider.remove!=='function')throw Error('retention_not_configured');
 const observe=async(outcome:'absent'|'present'|'unknown'|'identity_mismatch')=>checkedItem(await rpc(env,'ar_retention_observe',{p_actor:actor,p_id:id,p_claim:claimId,p_outcome:outcome,p_source_max_age:config.sourceMaxAgeSeconds}),actor,id);
 const inspect=async():Promise<RetentionInspection>=>{try{const v=await provider.inspect(item.target);if(v.state==='present'&&typeof v.identityVerified==='boolean'||v.state==='absent'||v.state==='unknown')return v;return {state:'unknown'};}catch{return {state:'unknown'};}};
 const before=await inspect();if(before.state==='absent')return observe('absent');if(before.state==='unknown')return observe('unknown');if(!before.identityVerified)return observe('identity_mismatch');
 if(claim.mode==='reconcile')return observe('present');
 const armed=object(await rpc(env,'ar_retention_arm',{p_actor:actor,p_id:id,p_claim:claimId,p_source_max_age:config.sourceMaxAgeSeconds}));
 const armedItem=checkedItem(armed.item,actor,id);if(typeof armed.proceed!=='boolean'||JSON.stringify(armedItem.target)!==JSON.stringify(item.target)||armed.proceed&&armedItem.claimId!==claimId)throw Error('retention_invalid_response');
 item=armedItem;if(!armed.proceed)return item;
 try{await provider.remove(item.target);}catch{/* The read-back, never this transport response, establishes absence. */}
 const after=await inspect();return observe(after.state==='absent'?'absent':after.state==='present'&&!after.identityVerified?'identity_mismatch':'unknown');
}
