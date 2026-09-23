import {backendRpc,type RefreshEnv} from '../refresh/backend';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Only call after Supabase has verified this exact bearer token with /auth/v1/user. */
export async function googleSession(env:RefreshEnv,authorization:string,actor:string):Promise<boolean>{
 let claims:Record<string,unknown>;
 try{const part=authorization.slice(7).split('.')[1];claims=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/')));}catch{return false;}
 if(claims.sub!==actor||typeof claims.session_id!=='string'||!uuid.test(claims.session_id)||
  !Array.isArray(claims.amr)||!claims.amr.some(a=>a&&typeof a==='object'&&a.method==='oauth')||
  !claims.app_metadata||typeof claims.app_metadata!=='object'||!('providers' in claims.app_metadata)||!Array.isArray(claims.app_metadata.providers)||!claims.app_metadata.providers.includes('google'))return false;
 return await backendRpc(env,'ar_access_session_valid',{p_actor:actor,p_session:claims.session_id})===true;
}
