import { probeOpera, type OperaEnv } from './opera/probe';
import { OperaError } from './opera/client';
import { backendRpc, requestRefresh, type RefreshEnv } from './refresh/backend';
import {documentApi} from './documents/api';
import {settingsApi} from './settings/api';
import {rendererProof} from './statement/proof';
interface Env extends OperaEnv,RefreshEnv { SUPABASE_URL?: string; SUPABASE_PUBLISHABLE_KEY?: string; COMMIT_SHA?: string; ASSETS?: { fetch(request: Request): Promise<Response> } }
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
  const settingsRequest=path.startsWith('/api/account-settings/')||path.startsWith('/api/invoice-history/');
  const rendererCheck=path==='/api/statement-renderer-proof'&&request.method==='GET';
  const operaProbe=path==='/api/opera/probe'&&request.method==='POST';
  const refreshRequest=path==='/api/refresh'&&['GET','POST'].includes(request.method);
  const collectionValidation=path==='/api/collection/validate-selection'&&request.method==='POST';
  const documentRequest=path==='/api/documents'||path.startsWith('/api/documents/');
  const pdfValidation=/^\/api\/pdf-validation\/([0-9a-f-]{36})\/(KAT|TSK)\/(pdf|json)$/.exec(path);
  if (request.method !== 'GET'&&!operaProbe&&!refreshRequest&&!collectionValidation&&!documentRequest&&!settingsRequest) return json({ error: 'method_not_allowed' }, 405);
  if (path === '/api/config') {
    let googleEnabled = false;
    if (env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY) {
      try {
        const response = await upstream(`${env.SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY } });
        if (response.ok) googleEnabled = (await response.json() as {external?:{google?:boolean}}).external?.google === true;
      } catch { /* Configuration stays fail-closed; no provider error details reach the client. */ }
    }
    const configuredBudget=Number(env.DOC_EDITOR_MAX_BYTES??67108864);
    return json({ supabaseUrl: env.SUPABASE_URL ?? null, publishableKey: env.SUPABASE_PUBLISHABLE_KEY ?? null, googleEnabled,documentEditorMaxBytes:Number.isSafeInteger(configuredBudget)&&configuredBudget>0&&configuredBudget<=536870912?configuredBudget:67108864 });
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
  if (!settingsRequest && !rendererCheck && !operaProbe && !refreshRequest && !collectionValidation && !pdfValidation && !documentRequest && path !== '/api/portfolio' && !/^\/api\/accounts\/[^/]+\/[^/]+$/.test(path)) return json({ error: 'not_found' }, 404);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return json({ error: 'supabase_unavailable' }, 503);
  const headers = { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: authorization };
  try {
    const auth = await upstream(`${env.SUPABASE_URL}/auth/v1/user`, { headers });
    if (!auth.ok) return json({ error: auth.status >= 500 ? 'auth_unavailable' : 'unauthorized' }, auth.status >= 500 ? 503 : 401);
    const user = await auth.json() as { id?:string;email?: string; email_confirmed_at?: string; is_anonymous?: boolean };
    if (user.email?.toLowerCase() !== 'ar@katathani.com' || !user.email_confirmed_at || user.is_anonymous) return json({ error: 'forbidden' }, 403);
    if(settingsRequest){if(!user.id)return json({error:'unauthorized'},401);return settingsApi(request,env,user.id);}
    if(rendererCheck)return new Response(new Uint8Array(await rendererProof()).buffer,{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    if(documentRequest){if(!user.id)return json({error:'unauthorized'},401);return documentApi(request,env,user.id,headers);}
    if(pdfValidation){
      const [,runId,hotel,extension]=pdfValidation;
      const response=await upstream(`${env.SUPABASE_URL}/storage/v1/object/authenticated/ar-working-files/validation/${runId}/${hotel}.${extension}`,{headers});
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
      const r=await upstream(`${env.SUPABASE_URL}/rest/v1/rpc/ar_validate_collection_selection`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({p_hotel:input.hotel,p_account_id:input.accountId,p_ids:input.ids})});
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
        const response = await upstream(`${env.SUPABASE_URL}/rest/v1/${table}?${query}&limit=500&offset=${offset}`, { headers });
        if (!response.ok) throw new Error('database_unavailable');
        const page = await response.json();
        if (!Array.isArray(page)) throw new Error('invalid_response');
        result.push(...page); if (page.length < 500) return result;
      }
    };
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
    return json({invoices:invoices.map(v=>{const row=v as {id:string};return {...row,workflow:byId.get(row.id)??null};}),source:'opera',workflow_source:'ar_workspace',workflow_status:workflowStatus,status:'connected'});
  } catch { return json({ error: 'supabase_unavailable' }, 503); }
}
export default {
  async fetch(request: Request, env: Env) {
    if (new URL(request.url).pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Application assets unavailable', { status: 503 });
  },
  async scheduled(_event:unknown,env:Env) {
    if(env.OPERA_REFRESH_ENABLED!=='true')return;
    for(const hotel of ['KAT','TSK'])await requestRefresh(env,hotel,null,'scheduled');
  },
};
