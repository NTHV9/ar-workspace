import {sweepTransientDocuments} from './operations/retention-sweep';
import {acceptanceApi} from './acceptance/api';
import {acceptanceCookie} from './acceptance/routing';
import {acceptanceEnvironment,acceptanceRows} from './acceptance/context';
import {writesHeld} from './operations/write-hold';
import {operationsApi} from './operations/api';
import {readManagedStorage} from './operations/storage';
import {observationsApi} from './reports/observations';
import {externalBillingApi} from './billing/api';
import {financialApi} from './financial/api';
import type {FinancialIngestionEnv} from './financial/refresh';
import {collectionPolicyApi} from './collection/policy-api';
import {invoiceExceptionsApi} from './collection/api';
import {driveApi,driveCallback} from './drive/api';
import {accountWorkspaceApi} from './accounts/workspace';
import {remittanceApi,type RemittanceApiEnv} from './remittance/api';
import type {DriveEnv} from './drive/shared';
import {reportsApi} from './reports/api';
import { probeOpera, type OperaEnv } from './opera/probe';
import { OperaError } from './opera/client';
import { backendRpc, requestRefresh, type RefreshEnv } from './refresh/backend';
import {documentApi} from './documents/api';
import {settingsApi} from './settings/api';
import {requestMailReconcile,gmailReconcileCron,type ReconcileEnv} from './email/reconcile';
import {emailApi} from './email/api';
import {gmailCallback} from './email/oauth';
import type {EmailEnv} from './email/shared';
import {rendererProof} from './statement/proof';
interface Env extends FinancialIngestionEnv,OperaEnv,RefreshEnv,EmailEnv,ReconcileEnv,DriveEnv,RemittanceApiEnv { SUPABASE_URL?: string; SUPABASE_PUBLISHABLE_KEY?: string; COMMIT_SHA?: string; ASSETS?: { fetch(request: Request): Promise<Response> } }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
async function upstream(url: string, options: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) throw new Error('upstream_redirect_rejected');
    return response;
  }
  finally { clearTimeout(timer); }
}
export async function handleApi(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if(path==='/api/gmail/callback')return request.method==='GET'?(new URL(request.url).searchParams.get('state')?.startsWith('d.')?driveCallback(request,env):gmailCallback(request,env)):json({error:'method_not_allowed'},405);
  const acceptanceRequest=path.startsWith('/api/acceptance/');
  const operationsRequest=path.startsWith('/api/operations/');
  const observationsRequest=path.startsWith('/api/observations/');
  const billingRequest=path==='/api/external-billing'||path.startsWith('/api/external-billing/');
  const financialRequest=path.startsWith('/api/financial/');
  const driveRequest=path.startsWith('/api/drive/');
  const policyRequest=path==='/api/collection-policy'||path.startsWith('/api/collection-policy/');
  const exceptionRequest=path.startsWith('/api/invoice-exceptions/');
  const accountWorkspaceRequest=path.startsWith('/api/account-workspace/');
  const remittanceRequest=path==='/api/remittances'||path.startsWith('/api/remittances/');
  const reportsRequest=path.startsWith('/api/reports/');
  const emailRequest=path.startsWith('/api/email/')||path.startsWith('/api/gmail/')||path==='/api/mail-reconciliation';
  const settingsRequest=path.startsWith('/api/account-settings/')||path.startsWith('/api/invoice-history/');
  const rendererCheck=path==='/api/statement-renderer-proof'&&request.method==='GET';
  const operaProbe=path==='/api/opera/probe'&&request.method==='POST';
  const refreshRequest=path==='/api/refresh'&&['GET','POST'].includes(request.method);
  const collectionValidation=path==='/api/collection/validate-selection'&&request.method==='POST';
  const documentRequest=path==='/api/documents'||path.startsWith('/api/documents/');
  const pdfValidation=/^\/api\/pdf-validation\/([0-9a-f-]{36})\/(KAT|TSK)\/(pdf|json)$/.exec(path);
  if (request.method !== 'GET'&&!operaProbe&&!refreshRequest&&!collectionValidation&&!documentRequest&&!settingsRequest&&!emailRequest&&!driveRequest&&!remittanceRequest&&!exceptionRequest&&!policyRequest&&!financialRequest&&!billingRequest&&!operationsRequest&&!acceptanceRequest) return json({ error: 'method_not_allowed' }, 405);
  if (path === '/api/config') {
    let googleEnabled = false;
    if (env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY) {
      try {
        const response = await upstream(`${env.SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY } });
        if (response.ok) googleEnabled = (await response.json() as {external?:{google?:boolean}}).external?.google === true;
      } catch { /* Configuration stays fail-closed; no provider error details reach the client. */ }
    }
    const configuredBudget=Number(env.DOC_EDITOR_MAX_BYTES??67108864);
    return json({ acceptanceSelected:!!request.headers.get('Cookie')?.includes('__Host-ar-acceptance='),writeHold:writesHeld(env),supabaseUrl: env.SUPABASE_URL ?? null, publishableKey: env.SUPABASE_PUBLISHABLE_KEY ?? null, googleEnabled,documentEditorMaxBytes:Number.isSafeInteger(configuredBudget)&&configuredBudget>0&&configuredBudget<=536870912?configuredBudget:67108864 });
  }
  if (path === '/api/health') {
    if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return json({ status: 'unavailable', supabase: 'not_configured', opera: 'not_connected', commit: env.COMMIT_SHA ?? 'development' }, 503);
    try {
      const response = await upstream(`${env.SUPABASE_URL}/rest/v1/rpc/ar_health`, { method: 'POST', headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' }, body: '{}' });
      const healthy = response.ok && await response.json() === 'ar-workspace-v1';
      let connected=false;
      if(healthy&&env.SUPABASE_SECRET_KEY){try{const state=await backendRpc<{hotels:{last_success_at:string|null}[]}>(env,'ar_refresh_status',{});connected=state.hotels.length===2&&state.hotels.every(h=>!!h.last_success_at);}catch{/* no false positive */}}
      return json({ status: healthy ? 'ok' : 'unavailable', supabase: healthy ? 'database_verified' : 'unavailable', opera: connected?'connected':'not_connected', commit: env.COMMIT_SHA ?? 'development' }, healthy ? 200 : 503);
    } catch { return json({ status: 'unavailable', supabase: 'unavailable', opera: 'not_connected' }, 503); }
  }
  if (!acceptanceRequest && !operationsRequest && !observationsRequest && !billingRequest && !financialRequest && !policyRequest && !exceptionRequest && !accountWorkspaceRequest && !remittanceRequest && !driveRequest && !reportsRequest && !emailRequest && !settingsRequest && !rendererCheck && !operaProbe && !refreshRequest && !collectionValidation && !pdfValidation && !documentRequest && path !== '/api/collection-queue' && path !== '/api/portfolio' && !/^\/api\/accounts\/[^/]+\/[^/]+$/.test(path)) return json({ error: 'not_found' }, 404);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return json({ error: 'supabase_unavailable' }, 503);
  const headers = { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: authorization };
  try {
    const auth = await upstream(`${env.SUPABASE_URL}/auth/v1/user`, { headers });
    if (!auth.ok) return json({ error: auth.status >= 500 ? 'auth_unavailable' : 'unauthorized' }, auth.status >= 500 ? 503 : 401);
    const user = await auth.json() as { id?:string;email?: string; email_confirmed_at?: string; is_anonymous?: boolean };
    if (user.email?.toLowerCase() !== 'ar@katathani.com' || !user.email_confirmed_at || user.is_anonymous) return json({ error: 'forbidden' }, 403);
    if(acceptanceRequest&&path==='/api/acceptance/exit'&&user.id)return acceptanceApi(request,env,user.id);
    if(writesHeld(env)&&request.method!=='GET'&&!/^\/api\/email\/deliveries\/[0-9a-f-]{36}\/(check|reviewed-match)$/.test(path))return json({error:'operations_write_hold',message:'New work is paused for recovery review. Saved data remains readable.'},503);
    if(acceptanceRequest){if(!user.id)return json({error:'unauthorized'},401);return acceptanceApi(request,env,user.id);}
    const acceptanceId=acceptanceCookie(request);if(acceptanceId){if(!user.id)return json({error:'unauthorized'},401);env=await acceptanceEnvironment(env,user.id,acceptanceId);if(operaProbe||path==='/api/gmail/connect'||path==='/api/drive/connect'||path==='/api/operations/recovery-sent')return json({error:'acceptance_action_unavailable'},409);}
    if(path==='/api/mail-reconciliation'){if(request.method==='GET')return json({...await backendRpc<Record<string,unknown>>(env,'ar_mail_reconcile_status',{}),enabled:env.GMAIL_RECONCILE_ENABLED==='true',intervalMinutes:15});if(request.method==='POST'){if(request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'forbidden'},403);return json(await requestMailReconcile(env,'manual'));}return json({error:'method_not_allowed'},405);}
    if(operationsRequest){if(!user.id)return json({error:'unauthorized'},401);return operationsApi(request,env,user.id);}
    if(driveRequest){if(!user.id)return json({error:'unauthorized'},401);return driveApi(request,env,user.id);}
    if(observationsRequest){if(!user.id)return json({error:'unauthorized'},401);return observationsApi(request,env,user.id);}
    if(billingRequest){if(!user.id)return json({error:'unauthorized'},401);return externalBillingApi(request,env,user.id);}
    if(financialRequest){if(!user.id)return json({error:'unauthorized'},401);return financialApi(request,env,user.id);}
    if(policyRequest){if(!user.id)return json({error:'unauthorized'},401);return collectionPolicyApi(request,env,user.id);}
    if(exceptionRequest){if(!user.id)return json({error:'unauthorized'},401);return invoiceExceptionsApi(request,env,user.id);}
    if(accountWorkspaceRequest){if(!user.id)return json({error:'unauthorized'},401);return accountWorkspaceApi(request,env,user.id);}
    if(remittanceRequest){if(!user.id)return json({error:'unauthorized'},401);return remittanceApi(request,env,user.id);}
    if(path.startsWith('/api/reports/')){if(!user.id)return json({error:'unauthorized'},401);return reportsApi(request,env,user.id);}
    if(emailRequest){if(!user.id)return json({error:'unauthorized'},401);return emailApi(request,env,user.id);}
    if(settingsRequest){if(!user.id)return json({error:'unauthorized'},401);return settingsApi(request,env,user.id);}
    if(rendererCheck)return new Response(new Uint8Array(await rendererProof()).buffer,{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    if(documentRequest){if(!user.id)return json({error:'unauthorized'},401);return documentApi(request,env,user.id,headers);}
    if(pdfValidation){
      const [,runId,hotel,extension]=pdfValidation;
      const response=await readManagedStorage(env,`validation/${runId}/${hotel}.${extension}`,extension==='pdf'?20971520:1048576,{headers});
      if(!response.ok){await response.body?.cancel();return json({error:'private_document_unavailable'},response.status===404?404:503);}
      return new Response(response.body,{headers:{'Content-Type':extension==='pdf'?'application/pdf':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
    if(collectionValidation){
      if(request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'forbidden'},403);
      if(!request.headers.get('Content-Type')?.includes('application/json')||!request.body)return json({error:'invalid_request'},400);
      const reader=request.body.getReader();let body='';let size=0;const decoder=new TextDecoder();
      try{while(true){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>16384){await reader.cancel();return json({error:'invalid_request'},413);}body+=decoder.decode(p.value,{stream:true});}}finally{reader.releaseLock();}
      let input;try{input=JSON.parse(body);}catch{return json({error:'invalid_request'},400);}
      if(!input||!['KAT','TSK'].includes(input.hotel)||typeof input.accountId!=='string'||!input.accountId||input.accountId.length>2000||!Array.isArray(input.ids)||input.ids.length<1||input.ids.length>100||input.ids.some((id:unknown)=>typeof id!=='string'||!id||id.length>2000)||new Set(input.ids).size!==input.ids.length)return json({error:'invalid_request'},400);
      // Ignore client-supplied roles/balances/eligibility. Recheck authoritative rows with user RLS.
      const r=await upstream(`${env.SUPABASE_URL}/rest/v1/rpc/${env.ACCEPTANCE?'ar_acceptance_selection':'ar_validate_collection_selection'}`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({...env.ACCEPTANCE?{p_id:env.ACCEPTANCE.id}:{},p_hotel:input.hotel,p_account_id:input.accountId,p_ids:input.ids})});
      if(!r.ok)return json({error:'selection_verification_unavailable'},503);
      const valid=await r.json()===true;return json({valid,...(!valid?{error:'selection_not_collectible'}:{})},valid?200:409);
    }
    if(refreshRequest){
      if(request.method==='GET')return json(await backendRpc(env,'ar_refresh_status',{}));
      const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'forbidden'},403);
      if(!request.headers.get('Content-Type')?.includes('application/json'))return json({error:'invalid_request'},400);
      const reader=request.body?.getReader();if(!reader)return json({error:'invalid_request'},400);
      let text='';let size=0;const decoder=new TextDecoder();
      try{while(true){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>1024){await reader.cancel();return json({error:'invalid_request'},413);}text+=decoder.decode(p.value,{stream:true});}}finally{reader.releaseLock();}
      let input:{hotel?:string;accountId?:string;reason?:string};try{input=JSON.parse(text);}catch{return json({error:'invalid_request'},400);}
      if(!input||!['All','KAT','TSK'].includes(input.hotel??'')||!['manual','open'].includes(input.reason??'')||(input.accountId!==undefined&&(typeof input.accountId!=='string'||!input.accountId.trim()||input.accountId.length>2000||input.hotel==='All')))return json({error:'invalid_request'},400);
      if(input.reason==='open'&&env.OPERA_REFRESH_ENABLED!=='true')return json({jobs:[],status:'not_enabled'});
      const hotels=input.hotel==='All'?['KAT','TSK']:[input.hotel!];
      const jobs=[];for(const hotel of hotels)jobs.push(await requestRefresh(env,hotel,input.accountId??null,input.reason!));
      return json({jobs});
    }
    if(operaProbe){
      const origin=request.headers.get('Origin');
      if(origin&&origin!==new URL(request.url).origin)return json({error:'forbidden'},403);
      const hotel=new URL(request.url).searchParams.get('hotel');
      if(!hotel||!['KAT','TSK'].includes(hotel))return json({error:'invalid_hotel'},400);
      try{return json(await probeOpera(env,hotel));}catch(e){return json({error:e instanceof OperaError?e.code:'opera_unavailable',stage:e instanceof OperaError?e.stage:undefined,upstreamStatus:e instanceof OperaError?e.upstreamStatus:undefined,providerMessage:e instanceof OperaError?e.providerMessage:undefined},503);}
    }
    const allRows = async (table: string, query: string) => {
      const result: unknown[] = [];
      for (let offset = 0; ; offset += 500) {
        let page:unknown;
        if(env.ACCEPTANCE)page=await acceptanceRows(env,table,query,500,offset);
        else{const response=await upstream(`${env.SUPABASE_URL}/rest/v1/${table}?${query}&limit=500&offset=${offset}`,{headers});if(!response.ok)throw Error('database_unavailable');page=await response.json();}

        if (!Array.isArray(page)) throw new Error('invalid_response');
        result.push(...page); if (page.length < 500) return result;
      }
    };
    const attachExceptions=async(rows:unknown[],filter='')=>{
      let status:'available'|'unavailable'='available';let exceptions:unknown[]=[];
      try{exceptions=await allRows('ar_invoice_exceptions','select=hotel,account_id,invoice_id,held,needs_review,dispute,reopened_at&order=hotel,account_id,invoice_id'+filter);}catch{status='unavailable';}
      const map=new Map(exceptions.map(value=>{const r=value as {hotel:string;account_id:string;invoice_id:string;held:boolean;needs_review:boolean;dispute:string;reopened_at:string|null};return [JSON.stringify([r.hotel,r.account_id,r.invoice_id]),r];}));
      return rows.map(value=>{const r=value as {hotel:string;account_id:string;id:string};const e=map.get(JSON.stringify([r.hotel,r.account_id,r.id]));return {...r,exception_status:status,exceptions:{held:e?.held??false,needsReview:e?.needs_review??false,dispute:e?.dispute??'',reopenedAt:e?.reopened_at??null}};});
    };
    if(path==='/api/collection-queue')return json({rows:await attachExceptions(await allRows('ar_collection_rows','select=*&order=hotel,account_id,id')),source:'saved_opera',asOf:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Bangkok'})});
    if (path === '/api/portfolio') {
      const accounts=await allRows('ar_accounts','select=*&order=hotel,id');
      const refresh=env.SUPABASE_SECRET_KEY?await backendRpc<{hotels:{last_success_at?:string|null}[];running:boolean}>(env,'ar_refresh_status',{}):{hotels:[],running:false};
      return json({accounts,source:'opera',status:refresh.hotels.some(h=>h.last_success_at)?'connected':'not_connected',refresh});
    }
    const [, , , hotel, id] = path.split('/');
    const query = `hotel=eq.${encodeURIComponent(decodeURIComponent(hotel))}&account_id=eq.${encodeURIComponent(decodeURIComponent(id))}`;
    const invoices=await allRows('ar_invoices',`select=*&${query}&open=neq.0&order=id`);
    let workflows:unknown[]=[];let workflowStatus='available';
    if(invoices.length)try{workflows=await allRows('ar_invoice_workflow',`select=*&${query}&order=invoice_id`);}catch{workflowStatus='unavailable';}
    const byId=new Map(workflows.map(w=>{const row=w as {invoice_id:string};return [row.invoice_id,row];}));
    return json({invoices:await attachExceptions(invoices.map(v=>{const row=v as {id:string};return {...row,workflow:byId.get(row.id)??null};}),'&'+query),source:'opera',workflow_source:'ar_workspace',workflow_status:workflowStatus,status:'connected'});
  } catch(e) { if(e instanceof Error&&/^acceptance_[a-z_]+$/.test(e.message))return json({error:e.message},409);return json({ error: 'supabase_unavailable' }, 503); }
}
export default {
  async fetch(request: Request, env: Env) {
    if (new URL(request.url).pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Application assets unavailable', { status: 503 });
  },
  async scheduled(event:{cron?:string},env:Env) {
    if(writesHeld(env))return;
    if(event.cron===gmailReconcileCron){if(env.GMAIL_RECONCILE_ENABLED==='true')await requestMailReconcile(env,'scheduled');try{await sweepTransientDocuments(env);}catch{/* Durable exact candidates retry on the next cron. */}return;}
    if(event.cron!=='0 0,12 * * *'||env.OPERA_REFRESH_ENABLED!=='true')return;
    for(const hotel of ['KAT','TSK'])await requestRefresh(env,hotel,null,'scheduled');
  },
};
