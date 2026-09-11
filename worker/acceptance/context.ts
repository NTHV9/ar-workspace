import {backendRpc,type RefreshEnv,type RefreshParams} from '../refresh/backend';
import type {AcceptanceContext,AcceptanceEnv} from './routing';
export interface AcceptanceRuntime extends RefreshEnv,AcceptanceEnv{}
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export async function acceptanceEnvironment<T extends RefreshEnv&{AR_FINANCIAL?:RefreshEnv['AR_REFRESH']}>(base:T,actor:string,id:string):Promise<T&AcceptanceEnv>{
 if(base.ACCEPTANCE_ENABLED!=='true'||!uuid.test(actor)||!uuid.test(id))throw Error('acceptance_inactive');
 const raw=await backendRpc<AcceptanceContext&{error?:string}>(base,'ar_acceptance_context',{p_actor:actor,p_id:id});
 if(raw.error||raw.id!==id||raw.owner!==actor||typeof raw.sourceSha!=='string'||!/^[0-9a-f]{64}$/.test(raw.recipientHash)||!Number.isSafeInteger(raw.clockOffsetDays)||raw.clockOffsetDays<0||raw.clockOffsetDays>62)throw Error('acceptance_inactive');
 if(base.OPERATIONS_BUDGET_ENABLED!=='true')throw Error('acceptance_budgets_required');
 const scope={...raw},wrap=(binding:RefreshEnv['AR_REFRESH'])=>binding?{
  create:(options:{id:string;params:RefreshParams})=>binding.create({...options,params:{...options.params,acceptanceId:id,actorId:actor}}),
  get:(instanceId:string)=>binding.get(instanceId),
 }:undefined;
 return {...base,ACCEPTANCE:scope,OPERA_REFRESH_ENABLED:'false',AR_REFRESH:wrap(base.AR_REFRESH),AR_DOCUMENTS:wrap(base.AR_DOCUMENTS),AR_FINANCIAL:wrap(base.AR_FINANCIAL)};
}
export async function acceptanceRows(env:AcceptanceRuntime,table:string,query:string,limit=500,offset=0):Promise<unknown[]>{
 const scope=env.ACCEPTANCE;if(!scope)throw Error('acceptance_inactive');const entries=[...new URLSearchParams(query)];if(new Set(entries.map(([k])=>k)).size!==entries.length)throw Error('acceptance_invalid');
 const result=await backendRpc<unknown>(env,'ar_acceptance_read',{p_actor:scope.owner,p_id:scope.id,p_table:table,p_query:Object.fromEntries(entries),p_limit:limit,p_offset:offset});if(!Array.isArray(result))throw Error('acceptance_read_failed');return result;
}
