import {isCollectionStageKey} from '../../src/domain/collection-policy';
import {regionalHotelScope,resultMatchesHotelScope} from '../hotels';
import {backendRpc,type RefreshEnv} from '../refresh/backend';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const modes=['activity','current','options'];
const kinds=['First billing','Rebilling','Billing classification unavailable','Friendly','Follow 1','Follow 2','Follow 3','Final','No verified send'];
export function parseReportQuery(url:URL){
 const q=url.searchParams,mode=url.pathname.split('/')[3];
 const invalid=()=>{throw Error('reports_invalid');};
 if(url.pathname!==`/api/reports/${mode}`||!modes.includes(mode))invalid();
 for(const key of q.keys())if(!['region','hotel','account','type','invoice','kind','from','to','page','limit'].includes(key)||q.getAll(key).length!==1)invalid();
 const field=(key:string,max=200)=>{const value=q.get(key)||null;if(value&&(value.length>max||/[\u0000-\u001f]/.test(value)))invalid();return value;};
 const hotel=field('hotel'),account=field('account'),type=field('type'),invoice=field('invoice'),kind=field('kind');
 const regional=(()=>{try{return regionalHotelScope(q,account);}catch{return invalid();}})();
 if(invoice&&(!account||!regional.hotel)||kind&&!kinds.includes(kind)&&!isCollectionStageKey(kind))invalid();
 const date=(key:string)=>{const value=field(key,10);if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value))invalid();return value;};
 const from=date('from'),to=date('to');if(from&&to&&from>to)invalid();
 const page=Number(q.get('page')??0),limit=Number(q.get('limit')??50);
 if(!Number.isSafeInteger(page)||page<0||page>10000000||!Number.isSafeInteger(limit)||limit<1||limit>200)invalid();
 return {p_mode:mode,p_hotel:regional.reportHotel,p_account:account,p_type:type,p_from:from,p_to:to,p_offset:page*limit,p_limit:limit,p_invoice:invoice,p_kind:kind};
}
/** Called only after Worker session validation; the RPC independently verifies the actor and owner. */
export async function reportsApi(request:Request,env:RefreshEnv,actor:string){
 if(!actor)return json({error:'unauthorized'},401);
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 try{
  const url=new URL(request.url),params=parseReportQuery(url),regional=regionalHotelScope(url.searchParams,params.p_account);
  const result=await backendRpc<Record<string,unknown>>(env,'ar_reports_read',{p_actor:actor,...params});
  if(result?.error==='reports_forbidden')return json({error:'reports_forbidden'},403);
  if(result?.error==='reports_invalid')return json({error:'reports_invalid'},400);
  if(!result||!Array.isArray(result.rows)||!Number.isSafeInteger(result.total)||Number(result.total)<0||params.p_mode!=='options'&&(!result.summary||typeof result.summary!=='object')||!resultMatchesHotelScope(result,regional.region,regional.hotel))throw Error('reports_unavailable');
  return json(result);
 }catch(error){return json({error:error instanceof Error&&error.message==='reports_invalid'?'reports_invalid':'reports_unavailable'},error instanceof Error&&error.message==='reports_invalid'?400:503);}
}
