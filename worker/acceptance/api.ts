import {backendRpc,type RefreshEnv,requestRefresh} from '../refresh/backend';
import type {DriveEnv} from '../drive/shared';
import {boundedBody} from '../email/shared';
import {acceptanceCookie,acceptanceCookieHeader} from './routing';
import {acceptanceEnvironment} from './context';
import {prepareAcceptance} from './lifecycle';
import {sweepRetention} from '../operations/retention-sweep';
const json=(value:unknown,status=200,headers:Record<string,string>={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}});
export async function acceptanceApi(request:Request,env:RefreshEnv&DriveEnv,actor:string){
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'forbidden'},403);
 const path=new URL(request.url).pathname;
 try{
  if(path==='/api/acceptance/exit'&&request.method==='POST')return json({exited:true},200,{'Set-Cookie':acceptanceCookieHeader(null)});
  if(env.ACCEPTANCE_ENABLED!=='true')return json({error:'acceptance_inactive'},409);
  if(request.method==='GET'&&path==='/api/acceptance/status'){const id=acceptanceCookie(request);if(!id)return json({active:false});const context=await acceptanceEnvironment(env,actor,id);const info=await backendRpc<{fixture_revision:number}>(env,'ar_acceptance_setup',{p_actor:actor,p_id:id});const fixture=await backendRpc<{invoices:unknown[]}>(env,'ar_acceptance_fixture',{p_actor:actor,p_id:id});return json({active:true,id,clockOffsetDays:context.ACCEPTANCE?.clockOffsetDays,revision:info.fixture_revision,invoices:fixture.invoices});}
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  const data=JSON.parse(new TextDecoder().decode(await boundedBody(request,4096))) as Record<string,unknown>;if(!data||typeof data!=='object'||Array.isArray(data))throw Error('acceptance_invalid');
  if(path==='/api/acceptance/prepare'){if(typeof data.id!=='string')throw Error('acceptance_invalid');return json(await prepareAcceptance(env,actor,data.id));}
  if(path==='/api/acceptance/enter'){if(typeof data.id!=='string')throw Error('acceptance_invalid');const scoped=await acceptanceEnvironment(env,actor,data.id);await requestRefresh(scoped,'KAT',null,'manual');return json({entered:true},200,{'Set-Cookie':acceptanceCookieHeader(data.id)});}
  const id=acceptanceCookie(request);if(!id)throw Error('acceptance_inactive');const scoped=await acceptanceEnvironment(env,actor,id);
  if(path==='/api/acceptance/refresh'){return json(await requestRefresh(scoped,'KAT',null,'manual'));}
  if(path==='/api/acceptance/source'){if(typeof data.invoiceId!=='string'||typeof data.open!=='number'||!Number.isInteger(data.revision))throw Error('acceptance_invalid');return json(await backendRpc(env,'ar_acceptance_source_change',{p_actor:actor,p_id:id,p_revision:data.revision,p_invoice:data.invoiceId,p_open:data.open}));}
  if(path==='/api/acceptance/clock'){if(!Number.isInteger(data.days))throw Error('acceptance_invalid');return json(await backendRpc(env,'ar_acceptance_clock',{p_actor:actor,p_id:id,p_days:data.days}));}
  if(path==='/api/acceptance/retention'){return json(await sweepRetention({...scoped,RETENTION_ENABLED:'true'}));}
  return json({error:'not_found'},404);
 }catch(e){const code=e instanceof Error&&/^(acceptance|budget|drive)_[a-z_]+$/.test(e.message)?e.message:'acceptance_unavailable';return json({error:code},409);}
}
