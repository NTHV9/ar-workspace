import {afterEach,expect,it,vi} from 'vitest';
import {agingInvoicesApi,parseAgingInvoicesQuery} from '../worker/dashboard/aging-api';
const actor='00000000-0000-4000-8000-000000000001',env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
const url=(q='')=>new URL('https://app.test/api/dashboard/aging-invoices?'+q);
afterEach(()=>vi.unstubAllGlobals());
it('validates source bucket, exact hotel accounts, independent filters and paging',()=>{
 expect(parseAgingInvoicesQuery(url('katAccount=A&tskAccount=B&bucket='+encodeURIComponent('["91 - 120",91,120,4]')+'&dimension=followup&status=Follow+2&flag=held&details=1&page=2&limit=30'))).toMatchObject({p_kat_account:'A',p_tsk_account:'B',p_bucket:['91 - 120',91,120,4],p_dimension:'followup',p_status:'Follow 2',p_flag:'held',p_details:true,p_offset:60,p_limit:30});
 for(const q of ['hotel=Other','hotel=KAT&tskAccount=B','hotel=KAT&hotel=TSK','account=A','dimension=billing','status=billed','dimension=billing&status=Friendly','dimension=followup&status=invalid','bucket=[]','bucket=["x",1,0,1]','bucket=["x",null,null,1]','flag=unknown','details=0','page=-1','page=1e2','limit=0','limit=201','type=%20','katAccount=A%0A'])expect(()=>parseAgingInvoicesQuery(url(q)),q).toThrow('aging_invalid');
});
it('rejects missing actor/method before reading and masks provider errors',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 expect((await agingInvoicesApi(new Request(url()),env,'')).status).toBe(401);
 expect((await agingInvoicesApi(new Request(url(),{method:'POST'}),env,actor)).status).toBe(405);expect(fetcher).not.toHaveBeenCalled();
 vi.stubGlobal('fetch',async()=>new Response('private customer error',{status:500}));const r=await agingInvoicesApi(new Request(url()),env,actor);expect(r.status).toBe(503);expect(await r.json()).toEqual({error:'aging_unavailable'});
});
it('preserves unknown counts and canonicalizes bucket identity without exposing SQL whitespace',async()=>{
 const body={asOfDate:'2026-09-13',publications:[],accounts:[{hotel:'KAT',accountId:'A',buckets:[{key:'["91 - 120", 91, 120, 4]',count:null,amount:null,creditAmount:null,complete:false}]}],summary:{complete:false},rows:[],total:0,complete:false};
 vi.stubGlobal('fetch',async()=>Response.json(body));const r=await agingInvoicesApi(new Request(url()),env,actor);expect(r.status).toBe(200);expect(r.headers.get('Cache-Control')).toBe('no-store');expect((await r.json() as typeof body).accounts[0].buckets[0]).toMatchObject({key:'["91 - 120",91,120,4]',count:null});
 vi.stubGlobal('fetch',async()=>Response.json({error:'aging_forbidden'}));expect((await agingInvoicesApi(new Request(url()),env,actor)).status).toBe(403);
});

it('accepts bounded exact groups and rejects duplicate, foreign and ambiguous memberships',()=>{
 const pairs=encodeURIComponent(JSON.stringify([['KAT','A'],['KAT','B'],['TSK','C']]));expect(parseAgingInvoicesQuery(url('accounts='+pairs))).toMatchObject({p_accounts:[['KAT','A'],['KAT','B'],['TSK','C']]});
 for(const q of ['accounts='+pairs+'&katAccount=A','accounts='+pairs+'&hotel=KAT','accounts='+encodeURIComponent(JSON.stringify([['KAT','A'],['KAT','A']])),'accounts='+encodeURIComponent(JSON.stringify([['Other','A']])),'accounts=[]','accounts={}','accounts='+encodeURIComponent(JSON.stringify(Array.from({length:201},(_,i)=>['KAT',String(i)])))])expect(()=>parseAgingInvoicesQuery(url(q))).toThrow('aging_invalid');
});

it('accepts Credit as a display filter in each status view, without making it an attention flag',()=>{for(const dimension of ['billing','followup','due'])expect(parseAgingInvoicesQuery(url('dimension='+dimension+'&status=credit'))).toMatchObject({p_dimension:dimension,p_status:'credit'});expect(()=>parseAgingInvoicesQuery(url('dimension=flags&status=credit'))).toThrow();});
