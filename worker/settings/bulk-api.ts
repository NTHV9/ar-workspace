import {parseBulkSelection} from '../../src/settings/bulk-model';
import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {boundedBody} from '../email/shared';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function bulkSettingsApi(request:Request,env:RefreshEnv,actor:string){
 try{
  const url=new URL(request.url);if(url.search)return json({error:'bulk_settings_invalid'},400);
  if(request.method==='GET'&&url.pathname==='/api/account-settings/bulk')return json(await backendRpc(env,'ar_bulk_settings_catalog',{p_actor:actor}));
  if(request.method!=='POST'||!['/api/account-settings/bulk/preview','/api/account-settings/bulk/apply'].includes(url.pathname))return json({error:'method_not_allowed'},405);
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'access_forbidden'},403);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'bulk_settings_invalid'},400);
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(request,256*1024))),selection=parseBulkSelection(value);
  const apply=url.pathname.endsWith('/apply');
  if(apply&&(typeof value.commandId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.commandId)))return json({error:'bulk_settings_invalid'},400);
  const result=await backendRpc<Record<string,unknown>>(env,apply?'ar_bulk_settings_apply':'ar_bulk_settings_preview',{p_actor:actor,p_input:selection,...apply?{p_command:value.commandId}:{}});
  return json(result,result.error?result.error==='access_forbidden'?403:409:200);
 }catch(error){const code=error instanceof Error?error.message:'';return json({error:code==='bulk_settings_invalid'||code==='settings_invalid'?'bulk_settings_invalid':'bulk_settings_unavailable'},code==='bulk_settings_invalid'||code==='settings_invalid'?400:503);}
}
