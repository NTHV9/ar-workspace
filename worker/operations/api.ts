import {backendRpc,type RefreshEnv} from '../refresh/backend';
import type {RetentionEnvironment} from './retention';
import {operationBudgetLimits} from './budget';
import {reconcileStorageUpload} from './storage';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function operationsApi(request:Request,env:RefreshEnv&RetentionEnvironment,actor:string){
 const u=new URL(request.url);
 if(request.method!=='GET'&&request.headers.get('Origin')&&request.headers.get('Origin')!==u.origin)return json({error:'forbidden'},403);
 try{
  if(u.pathname==='/api/operations/retention'&&request.method==='GET'){
   if(env.RETENTION_ENABLED!=='true')return json({enabled:false});
   const page=Number(u.searchParams.get('page')??'0');if(!Number.isSafeInteger(page)||page<0)throw Error('retention_invalid');
   const value=await backendRpc<Record<string,unknown>>(env,'ar_retention_status',{p_actor:actor,p_offset:page*50});if(value.error)throw Error(String(value.error));return json({...value,enabled:true});
  }
  if(u.pathname==='/api/operations/status'&&request.method==='GET'){
   if(env.OPERATIONS_BUDGET_ENABLED!=='true')return json({enabled:false});
   const status=await backendRpc<Record<string,unknown>>(env,'ar_operations_status',{p_actor:actor,p_limits:operationBudgetLimits(env)});
   if(status.error)throw Error(String(status.error));return json({...status,enabled:true});
  }
  const match=/^\/api\/operations\/uploads\/([0-9a-f-]{36})\/reconcile$/.exec(u.pathname);
  if(match&&request.method==='POST'){
   if(env.OPERATIONS_BUDGET_ENABLED!=='true')throw Error('budget_not_enabled');
   return json(await reconcileStorageUpload(env,actor,match[1]));
  }
  return json({error:'not_found'},404);
 }catch(e){const code=e instanceof Error&&/^(budget|storage|retention)_[a-z_]+$/.test(e.message)?e.message:'operations_unavailable';return json({error:code},code.endsWith('_forbidden')?403:503);}
}
