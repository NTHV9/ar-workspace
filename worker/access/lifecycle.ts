import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {boundedBody} from '../email/shared';
import {validInitialPassword} from '../../src/access/identity';
import {isRegionId} from '../../src/domain/hotels';
import {authProvider,providerUser} from './auth-provider';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface Command {commandId:string;kind:'create'|'delete';memberId:string;authUserId:string|null;authEmail:string;dispatched:boolean;state:'pending'|'complete';result:unknown;member:Record<string,unknown>|null}
function command(value:unknown):Command {const v=value as Command;if(!v||!uuid.test(v.commandId)||!uuid.test(v.memberId)||v.authUserId!==null&&!uuid.test(v.authUserId)||typeof v.authEmail!=='string'||!['create','delete'].includes(v.kind)||!['pending','complete'].includes(v.state)||typeof v.dispatched!=='boolean')throw Error('access_auth_unavailable');return v;}
async function readInput(request:Request){if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')throw Error('access_invalid');const v:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(request,8192)));if(!v||typeof v!=='object'||Array.isArray(v))throw Error('access_invalid');return v as Record<string,unknown>;}
function keys(v:Record<string,unknown>,allowed:string[]){if(Object.keys(v).some(k=>!allowed.includes(k)))throw Error('access_invalid');}
function regions(value:unknown){if(!Array.isArray(value)||value.length<1||value.length>2||value.some(r=>!isRegionId(r))||new Set(value).size!==value.length)throw Error('access_invalid');return value;}
const response=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const pending=(c:Command,needsCleanup=false)=>({state:'pending',kind:c.kind,commandId:c.commandId,member:c.member,needsCleanup});
async function finishCreation(env:RefreshEnv,actor:string,c:Command,password?:string){
 if(c.state==='complete')return c.result;
 if(!c.authUserId||c.member?.setupState!=='creating'||c.member.pendingCommand!==c.commandId)throw Error('access_lifecycle_pending');
 let existing=await providerUser(env,c.authUserId);
 if(existing){if(existing.email.toLowerCase()!==c.authEmail||!existing.email_confirmed_at||existing.app_metadata?.ar_create_command!==c.commandId)throw Error('access_auth_unverified');return backendRpc(env,'ar_access_create_finish',{p_actor:actor,p_command:c.commandId});}
 if(c.dispatched)return pending(c,true);
 if(password===undefined)return pending(c);
 const claimed=await backendRpc<unknown>(env,'ar_access_create_dispatch',{p_actor:actor,p_command:c.commandId});if(claimed===false)return pending(c);if(claimed!==true)throw Error('access_auth_unverified');
 // A dispatched creation is never repeated. Only its exact provider identity is reconciled.
 try{await authProvider(env,'/admin/users','POST',{id:c.authUserId,email:c.authEmail,password,email_confirm:true,role:'authenticated',app_metadata:{ar_create_command:c.commandId}});}catch{return pending({...c,dispatched:true});}
 existing=await providerUser(env,c.authUserId);
 if(!existing||existing.email.toLowerCase()!==c.authEmail||!existing.email_confirmed_at||existing.app_metadata?.ar_create_command!==c.commandId)return pending({...c,dispatched:true});
 return backendRpc(env,'ar_access_create_finish',{p_actor:actor,p_command:c.commandId});
}
async function finishDeletion(env:RefreshEnv,actor:string,c:Command){
 if(c.state==='complete')return c.result;
 if(c.member?.setupState!=='deleting'||c.member.pendingCommand!==c.commandId)throw Error('access_lifecycle_pending');
 if(c.authUserId){
  const existing=await providerUser(env,c.authUserId);
  if(existing){if(existing.email.toLowerCase()!==c.authEmail)throw Error('access_auth_unverified');
   try{await authProvider(env,'/admin/users/'+c.authUserId,'DELETE',{should_soft_delete:false});}catch{return pending(c);}
   if(await providerUser(env,c.authUserId))return pending(c);
  }
 }
 return backendRpc(env,'ar_access_delete_finish',{p_actor:actor,p_command:c.commandId});
}
export async function lifecycleApi(request:Request,env:RefreshEnv,actor:string):Promise<Response|null>{
 const u=new URL(request.url),path=u.pathname;if(u.searchParams.size&&path.startsWith('/api/access/users/'))throw Error('access_invalid');
 let result:unknown;
 if(path==='/api/access/users/create'&&request.method==='POST'){return response({error:'google_sign_in_required'},410); }else{
  const action=/^\/api\/access\/users\/([0-9a-f-]{36})\/(edit|delete)$/.exec(path),check=/^\/api\/access\/users\/commands\/([0-9a-f-]{36})\/check$/.exec(path);
  if(check&&request.method==='POST'){
   const c=command(await backendRpc(env,'ar_access_command_get',{p_actor:actor,p_command:check[1]}));result=c.kind==='create'?await finishCreation(env,actor,c):await finishDeletion(env,actor,c);
  }else if(action&&request.method==='POST'){
   if(!uuid.test(action[1]))throw Error('access_invalid');const v=await readInput(request);keys(v,action[2]==='delete'?['commandId','revision','confirmed']:['commandId','revision','displayName','regions','active']);if(typeof v.commandId!=='string'||!uuid.test(v.commandId)||!Number.isSafeInteger(v.revision)||Number(v.revision)<1)throw Error('access_invalid');
   if(action[2]==='edit'){if(typeof v.displayName!=='string'||!v.displayName.trim()||v.displayName.length>100||/[\u0000-\u001f]/.test(v.displayName)||typeof v.active!=='boolean')throw Error('access_invalid');result=await backendRpc(env,'ar_access_staff_save',{p_actor:actor,p_command:v.commandId,p_member:action[1],p_email:null,p_display_name:v.displayName,p_regions:regions(v.regions),p_active:v.active,p_revision:v.revision});}
   else{if(v.confirmed!==true)throw Error('access_delete_confirmation');const c=command(await backendRpc(env,'ar_access_delete_begin',{p_actor:actor,p_command:v.commandId,p_member:action[1],p_revision:v.revision}));result=await finishDeletion(env,actor,c);}
  }else return null;
 }
 return response(result,result&&typeof result==='object'&&'state'in result&&result.state==='pending'?202:200);
}
