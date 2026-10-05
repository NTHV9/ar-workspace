import {isRegionId} from '../../src/domain/hotels';
import {boundedBody} from '../email/shared';
import {backendRpc} from '../refresh/backend';
import {syncTracker,trackerFile,validateTrackerSnapshot,previewTracker,confirmTrackerPreview,type TrackerEnv,type TrackerAdapter} from './service';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function trackerApi(request:Request,env:TrackerEnv,owner:string,adapter:TrackerAdapter){
 const url=new URL(request.url),region=url.searchParams.get('region'),actor=env.REQUEST_ACTOR??owner;
 if(!isRegionId(region)||url.searchParams.size!==1)return json({error:'tracker_invalid'},400);
 if(env.REQUEST_ACCESS&&!env.REQUEST_ACCESS.regions.includes(region))return json({error:'tracker_forbidden'},403);
 if(!['GET','POST'].includes(request.method))return json({error:'method_not_allowed'},405);
 try{
  const status=await backendRpc<Record<string,unknown>>(env,'ar_tracker_status',{p_actor:actor,p_region:region});
  if(request.method==='GET')return json({...status,available:env.TRACKER_SYNC_ENABLED==='true',writebackAvailable:region==='phuket'&&env.TRACKER_BLOB_CAS_ENABLED==='true'});
  if(env.TRACKER_SYNC_ENABLED!=='true')return json({error:'tracker_disabled'},409);
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'tracker_forbidden'},403);
  if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return json({error:'tracker_invalid'},400);
  const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(request,8192))) as Record<string,unknown>;
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['action','revision','conflictId','choice','previewId','snapshotHash','selectedFileId'].includes(k))||input.selectedFileId!==undefined&&input.action!=='connect')return json({error:'tracker_invalid'},400);
  if(input.action==='connect'){
   if(!Number.isSafeInteger(input.revision)||Number(input.revision)<0)return json({error:'tracker_invalid'},400);
   const target=trackerFile(env,region);if(!target||!/^[A-Za-z0-9_-]{20,200}$/.test(target))return json({error:'tracker_target_unconfigured'},409);
   if(input.selectedFileId!==undefined&&input.selectedFileId!==target)return json({error:'tracker_target_conflict'},409);
   // Connection proves current file/schema access; client cannot supply a target.
   validateTrackerSnapshot(await adapter.read(env,owner,region,target));
   return json(await backendRpc(env,'ar_tracker_connect',{p_actor:actor,p_region:region,p_file_id:target,p_revision:input.revision}));
  }
  if(input.action==='sync')return json(await syncTracker(env,actor,owner,region,adapter,true));
  if(input.action==='preview')return json(await previewTracker(env,actor,owner,region,adapter));
  if(input.action==='confirm_preview'&&typeof input.previewId==='string'&&/^[0-9a-f-]{36}$/.test(input.previewId)&&typeof input.snapshotHash==='string'&&/^[0-9a-f]{64}$/.test(input.snapshotHash))return json(await confirmTrackerPreview(env,actor,owner,region,adapter,input.previewId,input.snapshotHash));
  if(input.action==='resolve'&&typeof input.conflictId==='string'&&/^[0-9a-f-]{36}$/.test(input.conflictId)&&Number.isSafeInteger(input.revision)&&['keep_web','accept_sheet'].includes(String(input.choice)))return json(await backendRpc(env,'ar_tracker_resolve',{p_actor:actor,p_region:region,p_id:input.conflictId,p_revision:input.revision,p_choice:input.choice}));
  return json({error:'tracker_invalid'},400);
 }catch(error){const code=error instanceof Error&&/^(tracker_(authorization_required|forbidden|schema_unverified|target_conflict|preview_changed))$/.test(error.message)?error.message:'tracker_unavailable';return json({error:code},code==='tracker_forbidden'?403:['tracker_authorization_required','tracker_preview_changed'].includes(code)?409:503);}
}
