import {isCollectionStageKey} from '../../src/domain/collection-policy';
import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {agingStatusKeys,type AgingInvoicesResponse} from './aging-model';
const invalid=():never=>{throw Error('aging_invalid');};
export function parseAgingInvoicesQuery(url:URL){
 const q=url.searchParams;if(url.pathname!=='/api/dashboard/aging-invoices')invalid();
 const allowed=['hotel','type','katAccount','tskAccount','bucket','dimension','status','page','limit','details','flag','accounts'];
 for(const key of q.keys())if(!allowed.includes(key)||q.getAll(key).length!==1)invalid();
 const field=(key:string)=>{const v=q.get(key);if(v!==null&&(!v||v!==v.trim()||v.length>(key==='accounts'?50000:500)||/[\x00-\x1f\x7f]/.test(v)))invalid();return v;};
 const hotel=field('hotel'),type=field('type'),kat=field('katAccount'),tsk=field('tskAccount'),dimension=field('dimension'),status=field('status'),details=field('details'),flag=field('flag');
 if(hotel&&!['KAT','TSK'].includes(hotel)||hotel==='KAT'&&tsk||hotel==='TSK'&&kat||[type,kat,tsk].some(v=>v&&v.length>200)||details&&details!=='1')invalid();
 if(flag&&!['held','needs_review'].includes(flag))invalid();
 if(dimension&&!['billing','followup','due','flags'].includes(dimension)||Boolean(dimension)!==Boolean(status))invalid();
 if(status&&(dimension==='followup'?!['none','unknown','credit'].includes(status)&&!isCollectionStageKey(status):!(agingStatusKeys[dimension as keyof typeof agingStatusKeys] as readonly string[]).includes(status)))invalid();
 let accounts:unknown=null;const accountRaw=field('accounts');if(accountRaw){try{accounts=JSON.parse(accountRaw);}catch{invalid();}if(kat||tsk||!Array.isArray(accounts)||accounts.length<1||accounts.length>200)invalid();const seen=new Set<string>();for(const pair of accounts as unknown[]){if(!Array.isArray(pair)||pair.length!==2||!['KAT','TSK'].includes(pair[0])||hotel&&pair[0]!==hotel||typeof pair[1]!=='string'||!pair[1]||pair[1]!==pair[1].trim()||pair[1].length>200||/[\x00-\x1f\x7f]/.test(pair[1])||seen.has(JSON.stringify(pair)))invalid();seen.add(JSON.stringify(pair));}}
 let bucket:unknown=null;const raw=field('bucket');if(raw){try{bucket=JSON.parse(raw);}catch{invalid();}if(!Array.isArray(bucket)||bucket.length!==4||typeof bucket[0]!=='string'||!bucket[0]||bucket[0].length>200||!Number.isSafeInteger(bucket[1])||bucket[1]<0||bucket[2]!==null&&(!Number.isSafeInteger(bucket[2])||bucket[2]<bucket[1])||!Number.isSafeInteger(bucket[3])||bucket[3]<0)invalid();}
 const integer=(key:string,fallback:number,max:number)=>{const v=field(key);if(v&&!/^(0|[1-9][0-9]*)$/.test(v))invalid();const n=v===null?fallback:Number(v);if(!Number.isSafeInteger(n)||n>max)invalid();return n;};
 const page=integer('page',0,100000),limit=integer('limit',50,200);if(limit<1)invalid();
 return {p_hotel:hotel,p_type:type,p_kat_account:kat,p_tsk_account:tsk,p_bucket:bucket,p_dimension:dimension,p_status:status,p_details:details==='1',p_offset:page*limit,p_limit:limit,p_flag:flag,p_accounts:accounts};
}
export async function agingInvoicesApi(request:Request,env:RefreshEnv,actor:string){
 const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor))return json({error:'unauthorized'},401);
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 try{const args=parseAgingInvoicesQuery(new URL(request.url));const r=await backendRpc<AgingInvoicesResponse&{error?:string}>(env,'ar_aging_invoice_status',{p_actor:actor,...args});
 if(r?.error==='aging_forbidden')return json({error:r.error},403);if(r?.error==='aging_invalid')invalid();
 if(!r||r.error||!Array.isArray(r.accounts)||r.accounts.length>2000||!Array.isArray(r.rows)||r.rows.length>args.p_limit||!Array.isArray(r.publications)||!r.summary||typeof r.complete!=='boolean'||!Number.isSafeInteger(r.total)||r.total<0)throw Error('aging_unavailable');
 for(const a of r.accounts){if(!Array.isArray(a.buckets))throw Error('aging_unavailable');for(const b of a.buckets)if(b.key!==null)b.key=JSON.stringify(JSON.parse(b.key));}
 return json(r);
 }catch(e){const code=e instanceof Error&&e.message==='aging_invalid'?'aging_invalid':'aging_unavailable';return json({error:code},code==='aging_invalid'?400:503);}
}

