export interface AcceptanceContext {id:string;owner:string;recipientHash:string;sourceSha:string;clockOffsetDays:number;driveFolderId?:string}
export interface AcceptanceEnv {ACCEPTANCE?:AcceptanceContext;ACCEPTANCE_ENABLED?:string}
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
// Credentials are never copied into the disposable business schema. Existing
// grants may refresh there; OAuth setup is not part of the acceptance workspace.
const shared=(name:string)=>name.startsWith('ar_acceptance_')||name.startsWith('ar_gmail_connection_')||name.startsWith('ar_drive_connection_')||name==='ar_financial_service_actor'||name==='ar_statement_template'||name==='ar_health';
export function acceptanceRpc(env:AcceptanceEnv,name:string,args:unknown):{name:string;args:unknown}{
 if(!env.ACCEPTANCE||shared(name))return {name,args};const scope=env.ACCEPTANCE;
 if(!uuid.test(scope.id)||!uuid.test(scope.owner)||!/^ar_[a-z0-9_]+$/.test(name)||!args||typeof args!=='object'||Array.isArray(args))throw Error('acceptance_invalid');
 return {name:'ar_acceptance_rpc',args:{p_actor:scope.owner,p_id:scope.id,p_name:name,p_args:args}};
}
export function workingBucket(env:AcceptanceEnv){return env.ACCEPTANCE?'ar-acceptance-files':'ar-working-files';}
export function acceptanceCookie(request:Request){
 const values=(request.headers.get('Cookie')??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith('__Host-ar-acceptance='));
 if(!values.length)return null;if(values.length!==1)throw Error('acceptance_invalid');const id=values[0].slice('__Host-ar-acceptance='.length);if(!uuid.test(id))throw Error('acceptance_invalid');return id;
}
export const acceptanceCookieHeader=(id:string|null)=>{if(id!==null&&!uuid.test(id))throw Error('acceptance_invalid');return `__Host-ar-acceptance=${id??''}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${id===null?0:21600}`;};
export function acceptanceLimits<T extends AcceptanceEnv>(env:T):T&{OPS_BUDGET_STORED_BYTES?:string;OPS_BUDGET_EGRESS_BYTES?:string}{
 return env.ACCEPTANCE?{...env,OPS_BUDGET_STORED_BYTES:'16777216',OPS_BUDGET_EGRESS_BYTES:'67108864'}:env;
}
