import { OperaError } from '../opera/client';
import type { OperaEnv } from '../opera/probe';
export interface RefreshParams { runId:string; hotel:string; accountId?:string }
export interface RefreshEnv extends OperaEnv {
  SUPABASE_URL?:string; SUPABASE_SECRET_KEY?:string;
  AR_REFRESH?:{create(options:{id:string;params:RefreshParams}):Promise<unknown>;get(id:string):Promise<{status():Promise<unknown>}>};
  OPERA_REFRESH_ENABLED?:string;
}
/** Admin key is server-only. No response body is propagated on failures. */
export async function backendRpc<T>(env:RefreshEnv,name:string,body:Record<string,unknown>):Promise<T> {
  if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)throw new OperaError('invalid_configuration',undefined,'database');
  const url=new URL(env.SUPABASE_URL);
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new OperaError('invalid_configuration');
  const response=await fetch(`${url.origin}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(!response.ok){await response.body?.cancel();throw new OperaError('provider_unavailable',response.status,`database_${name}`);}
  const text=await response.text();return (text?JSON.parse(text):null) as T;
}
export interface RefreshJob {id?:string;status:string;created:boolean}
export async function requestRefresh(env:RefreshEnv,hotel:string,accountId:string|null,reason:string) {
  if(!env.AR_REFRESH||!env.OPERA_CLIENT_ID||!env.OPERA_CLIENT_SECRET||!env.OPERA_APP_KEY)throw new OperaError('invalid_configuration');
  const job=await backendRpc<RefreshJob>(env,'ar_request_refresh',{p_hotel:hotel,p_account_id:accountId,p_reason:reason,p_stale_minutes:30});
  if(job.id&&['queued','running'].includes(job.status)) {
    try{await env.AR_REFRESH.create({id:job.id,params:{runId:job.id,hotel,accountId:accountId??undefined}});}
    catch{
      // A retry joins the durable instance with this exact database run ID.
      try{const instance=await env.AR_REFRESH.get(job.id);await instance.status();}catch{throw new OperaError('provider_unavailable',undefined,'workflow_dispatch');}
    }
  }
  return job;
}
