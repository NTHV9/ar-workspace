import { OperaError } from '../opera/client';
import type { OperaEnv } from '../opera/probe';
export interface RefreshParams { runId:string; hotel:string; accountId?:string; validateOnly?:boolean; historyAudit?:boolean; historyAuditOffset?:number; historyAuditLimit?:number; pdfProbe?:boolean }
export interface RefreshEnv extends OperaEnv {
  SUPABASE_URL?:string; SUPABASE_SECRET_KEY?:string;
  AR_REFRESH?:{create(options:{id:string;params:RefreshParams}):Promise<unknown>;get(id:string):Promise<{status():Promise<{status?:string}>}>};
  OPERA_REFRESH_ENABLED?:string;
  REFRESH_STALE_MINUTES?:string;
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
export interface PreviousInvoice {id:string;invoice_no:string|null;open:number}
export async function previousInvoices(env:RefreshEnv,hotel:string,accountId:string):Promise<PreviousInvoice[]> {
  if(!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY)throw new OperaError('invalid_configuration');
  const results:PreviousInvoice[]=[];
  for(let offset=0;;offset+=500){
    const query=new URLSearchParams({select:'id,invoice_no,open',hotel:`eq.${hotel}`,account_id:`eq.${accountId}`,open:'neq.0',order:'id',limit:'500',offset:String(offset)});
    const response=await fetch(`${env.SUPABASE_URL}/rest/v1/ar_invoices?${query}`,{headers:{apikey:env.SUPABASE_SECRET_KEY},redirect:'manual',signal:AbortSignal.timeout(20000)});
    if(!response.ok){await response.body?.cancel();throw new OperaError('provider_unavailable',response.status,'database_previous_invoices');}
    const rows=await response.json() as PreviousInvoice[];if(!Array.isArray(rows))throw new OperaError('invalid_response');results.push(...rows);if(rows.length<500)return results;
  }
}
export async function requestRefresh(env:RefreshEnv,hotel:string,accountId:string|null,reason:string,recovery=0):Promise<RefreshJob> {
  if(!env.AR_REFRESH||!env.OPERA_CLIENT_ID||!env.OPERA_CLIENT_SECRET||!env.OPERA_APP_KEY)throw new OperaError('invalid_configuration');
  const staleMinutes=Number(env.REFRESH_STALE_MINUTES??30);
  if(!Number.isSafeInteger(staleMinutes)||staleMinutes<1||staleMinutes>2147483647)throw new OperaError('invalid_configuration');
  const job=await backendRpc<RefreshJob>(env,'ar_request_refresh',{p_hotel:hotel,p_account_id:accountId,p_reason:reason,p_stale_minutes:staleMinutes});
  if(job.id&&['queued','running'].includes(job.status)) {
    const canonical=await backendRpc<{hotel:string;account_id:string|null}>(env,'ar_refresh_job',{p_run_id:job.id});
    try{await env.AR_REFRESH.create({id:job.id,params:{runId:job.id,hotel:canonical.hotel,accountId:canonical.account_id??undefined}});}
    catch{
      // A retry joins the durable instance with this exact database run ID.
      try{
        const instance=await env.AR_REFRESH.get(job.id);const state=await instance.status();
        if(['complete','errored','terminated'].includes(state.status??'')){
          await backendRpc(env,'ar_fail_refresh',{p_run_id:job.id,p_error_code:'workflow_terminated'});
          if(recovery===0)return requestRefresh(env,hotel,accountId,reason,1);
          throw new OperaError('provider_unavailable');
        }
      }catch{throw new OperaError('provider_unavailable',undefined,'workflow_dispatch');}
    }
  }
  return job;
}
