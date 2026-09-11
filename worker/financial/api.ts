import {backendRpc} from '../refresh/backend';
import {boundedBody} from '../email/shared';
import {financialWorkflow,requestFinancialHistory,type FinancialIngestionEnv,type FinancialHistoryRequest} from './refresh';
import type {FinancialReport,FinancialView} from './model';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const views:FinancialView[]=['invoice_entries','payments','applications','coverage','options'];
type Status={running:boolean;runs:{id:string;status:string;stepsVersion?:number}[]};
async function currentStatus(env:FinancialIngestionEnv,actor:string){
 let result=await backendRpc<Status>(env,'ar_financial_status',{p_actor:actor});
 if(!result||!Array.isArray(result.runs))throw Error('financial_unavailable');
 let changed=false;
 for(const run of result.runs.filter(r=>['queued','running'].includes(r.status))){
  // A missing/temporarily unreachable instance is not proof that its work stopped.
  let state:string|undefined;try{const workflow=financialWorkflow(env,run.stepsVersion);if(!workflow)continue;state=(await(await workflow.get(run.id)).status()).status;}catch{continue;}
  if(['complete','errored','terminated'].includes(state??'')){
   changed=await backendRpc<boolean>(env,'ar_financial_fail',{p_actor:actor,p_run_id:run.id,p_code:'financial_workflow_terminated'})||changed;
  }
 }
 if(changed)result=await backendRpc<Status>(env,'ar_financial_status',{p_actor:actor});
 return {...result,enabled:env.FINANCIAL_HISTORY_ENABLED==='true'&&/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$/.test(env.FINANCIAL_HISTORY_DATE_FILTER_PROOF??'')};
}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function financialFilters(url:URL){
 const q=url.searchParams;for(const key of q.keys())if(!['hotel','account','type','from','to','page','limit'].includes(key)||q.getAll(key).length!==1)throw Error('financial_invalid');
 const field=(key:string)=>{const value=q.get(key)||null;if(value&&(value.length>200||/[\x00-\x1f\x7f]/.test(value)))throw Error('financial_invalid');return value;};
 const hotel=field('hotel'),account=field('account'),type=field('type'),from=field('from'),to=field('to');
 const date=(v:string|null)=>v===null||/^\d{4}-\d{2}-\d{2}$/.test(v)&&!v.startsWith('0000-')&&Number.isFinite(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 if(hotel&&!['KAT','TSK'].includes(hotel)||account&&!hotel||(from===null)!==(to===null)||!date(from)||!date(to)||from&&to&&(from>to||(Date.parse(to)-Date.parse(from))/86400000>3660))throw Error('financial_invalid');
 const page=Number(q.get('page')??0),limit=Number(q.get('limit')??50);if(!Number.isSafeInteger(page)||page<0||!Number.isSafeInteger(limit)||limit<1||limit>200||page*limit>2147483647)throw Error('financial_invalid');
 return {p_hotel:hotel,p_account:account,p_type:type,p_from:from,p_to:to,p_offset:page*limit,p_limit:limit};
}
export async function financialApi(request:Request,env:FinancialIngestionEnv,actor:string){
 try{
  if(!uuid.test(actor))return json({error:'unauthorized'},401);
  const url=new URL(request.url),origin=request.headers.get('Origin');if(request.method!=='GET'&&(origin!==null&&origin!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site'))return json({error:'forbidden'},403);
  if(url.pathname==='/api/financial/status'&&request.method==='GET')return json(await currentStatus(env,actor));
  if(url.pathname==='/api/financial/refresh'&&request.method==='POST'){
   if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')throw Error('financial_invalid');
   let value:unknown;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(request,2048)));}catch(e){throw Error(e instanceof Error&&e.message==='email_too_large'?'financial_request_too_large':'financial_invalid');}
   if(!value||typeof value!=='object'||Array.isArray(value))throw Error('financial_invalid');const input=value as Record<string,unknown>;
   if(Object.keys(input).some(key=>!['commandId','hotel','reason','from','to'].includes(key))||!['manual','backfill','open'].includes(String(input.reason)))throw Error('financial_invalid');
   const receipt=await requestFinancialHistory(env,actor,input as unknown as FinancialHistoryRequest);
   if(receipt.status==='not_enabled')return json({...receipt,error:'financial_not_enabled'},503);
   if(receipt.id&&['queued','running'].includes(receipt.status)){
    const workflow=financialWorkflow(env,receipt.stepsVersion);if(!workflow)throw Error('financial_dispatch_unavailable');
    try{await workflow.create({id:receipt.id,params:{runId:receipt.id,hotel:receipt.hotel??String(input.hotel),financialHistory:true,actorId:actor}});}catch{try{await(await workflow.get(receipt.id)).status();}catch{throw Error('financial_dispatch_unavailable');}}
   }
   return json(receipt,receipt.status==='succeeded'?200:202);
  }
  const view=url.pathname.slice('/api/financial/'.length) as FinancialView;
  if(request.method!=='GET')return json({error:'method_not_allowed'},405);if(!views.includes(view))return json({error:'not_found'},404);
  const data=await backendRpc<FinancialReport>(env,'ar_financial_report',{p_actor:actor,p_view:view,...financialFilters(url)});
  if(!data||!Array.isArray(data.rows)||!Number.isSafeInteger(data.total)||!data.summary||!data.coverage)throw Error('financial_unavailable');return json(data);
 }catch(error){const code=error instanceof Error&&/^financial_[a-z_]+$/.test(error.message)?error.message:'financial_unavailable';return json({error:code},code==='financial_request_too_large'?413:/invalid/.test(code)?400:/conflict|lease_busy/.test(code)?409:/forbidden/.test(code)?403:503);}
}
