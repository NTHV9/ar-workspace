import {afterEach,expect,it,vi} from 'vitest';
import {handleApi} from '../worker/index';
const actor='00000000-0000-4000-8000-000000000031',owner='00000000-0000-4000-8000-000000000032',id='00000000-0000-4000-8000-000000000033';
const env={SUPABASE_URL:'https://db.synthetic.invalid',SUPABASE_SECRET_KEY:'synthetic-server',SUPABASE_PUBLISHABLE_KEY:'synthetic-public'};
const grant={email:'staff@example.invalid',administrator:false,regions:['khao-lak'],revision:1,workspaceOwnerId:owner,scopeHotels:['TLKL','WAKL','TLFO','TSAN']};
const request=(path:string,method='GET',body?:unknown)=>new Request('https://app.synthetic.invalid'+path,{method,headers:{Authorization:'Bearer synthetic-user','Content-Type':'application/json'},...(body&&method!=='GET'?{body:JSON.stringify(body)}:{})});
afterEach(()=>vi.unstubAllGlobals());
function transport(authorize:(body:Record<string,unknown>)=>Response,result:unknown={}){
 const calls:{name:string;body:Record<string,unknown>}[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input));if(url.pathname==='/auth/v1/user')return Response.json({id:actor,email:'staff@example.invalid',email_confirmed_at:'2026-09-17T00:00:00Z',app_metadata:{administrator:true,regions:['phuket','khao-lak']}});
  const name=url.pathname.split('/').at(-1)!,body=JSON.parse(String(init?.body??'{}'));calls.push({name,body});
  if(name==='ar_access_authorize')return authorize(body);if(name==='ar_access_account_publication'&&Array.isArray(result))return Response.json([{hotel:'TLKL',id:'SYNTHETIC',synced_at:'2026-10-08T00:00:00Z'}]);return Response.json(result);
 }));return calls;
}
it('normal dispatcher admits an authorized non-admin conflict page with real actor and region',async()=>{
 const calls=transport(body=>{expect(body).toMatchObject({p_actor:actor,p_kind:'region',p_region:'khao-lak',p_path:'/api/reports/tracker-conflicts',p_method:'GET'});return Response.json(grant);},{region:'khao-lak',category:'dates',counts:{all:1,dates:1,references:0,identity:0,other:0},rows:[{id,rowKey:'SYNTH-KH-PAGE',field:'W',reason:'source_difference',sheetValue:null,webValue:'2026-10-06',revision:1,createdAt:'2026-10-06T09:00:00.123456Z'}],next:null});
 const response=await handleApi(request('/api/reports/tracker-conflicts?region=khao-lak&category=dates'),env);expect(response.status).toBe(200);expect(calls).toHaveLength(2);expect(calls[1]).toMatchObject({name:'ar_tracker_conflicts_page',body:{p_actor:actor,p_region:'khao-lak',p_category:'dates'}});
});
it('normal dispatcher rejects wrong-region conflict paging before the service reader',async()=>{const calls=transport(body=>body.p_region==='khao-lak'?Response.json(grant):Response.json({message:'access_forbidden'},{status:400}));expect((await handleApi(request('/api/reports/tracker-conflicts?region=phuket&category=dates'),env)).status).toBe(403);expect(calls.map(c=>c.name)).toEqual(['ar_access_authorize']);});
it.each(['/api/reports/tracker-conflicts?region=khao-lak&unknown=1','/api/reports/tracker-conflicts?region=khao-lak&cursor=x&cursor=y','/api/reports/tracker-conflicts?region=khao-lak&category=bad'])('normal dispatcher denies malformed non-admin conflict query %s before authorization RPC',async path=>{const calls=transport(()=>Response.json(grant));expect((await handleApi(request(path),env)).status).toBe(403);expect(calls).toHaveLength(0);});
it('normal dispatcher rejects conflict POST and missing bearer without any grant or page read',async()=>{const calls=transport(()=>Response.json(grant));expect((await handleApi(request('/api/reports/tracker-conflicts?region=khao-lak','POST',{}),env)).status).toBe(405);expect((await handleApi(new Request('https://app.synthetic.invalid/api/reports/tracker-conflicts?region=khao-lak'),env)).status).toBe(401);expect(calls).toHaveLength(0);});
it('rejects metadata escalation and authenticates the real actor on every request',async()=>{
 let active=true;const calls=transport(v=>active&&v.p_region==='khao-lak'?Response.json(grant):Response.json({message:'access_forbidden'},{status:400}),{region:'khao-lak',accounts:[],source:'opera',status:'connected',refresh:{hotels:[],running:false}});
 expect((await handleApi(request('/api/portfolio?region=khao-lak'),env)).status).toBe(200);
 expect(calls[0]).toMatchObject({name:'ar_access_authorize',body:{p_actor:actor,p_region:'khao-lak'}});expect(calls[1]).toMatchObject({name:'ar_portfolio_region_accounts',body:{p_actor:owner,p_region:'khao-lak'}});
 active=false;expect((await handleApi(request('/api/portfolio?region=khao-lak'),env)).status).toBe(403);expect(calls.filter(c=>c.name==='ar_portfolio_region_accounts')).toHaveLength(1);
});
it.each(['/api/access/users','/api/operations/storage','/api/drive/status','/api/email/test-send','/api/gmail/connect'])('keeps administration out of ordinary sessions: %s',async path=>{
 const calls=transport(()=>Response.json(grant));const response=await handleApi(request(path,path.includes('test-send')||path.includes('connect')?'POST':'GET',{}),env);expect(response.status).toBe(403);expect(calls).toHaveLength(0);
});
it('resolves opaque record hotel in the database and stops before reading disallowed file bytes',async()=>{
 const calls=transport(body=>{expect(body).toMatchObject({p_actor:actor,p_kind:'document',p_ref:id});expect(body.p_hotel).toBeNull();return Response.json({message:'access_forbidden'},{status:400});});
 expect((await handleApi(request(`/api/documents/${id}/exports/0?hotel=TLKL`),env)).status).toBe(403);expect(calls).toHaveLength(1);
});
it('rejects mismatched response data even after the route was authorized',async()=>{
 transport(()=>Response.json({...grant,scopeHotels:['TLKL']}),{hotel:'KAT',accountId:'SYNTHETIC'});
 expect((await handleApi(request('/api/account-settings/TLKL/SYNTHETIC'),env)).status).toBe(503);
});
it('uses the scoped service reader instead of broadening direct authenticated data access',async()=>{
 const calls=transport(()=>Response.json({...grant,scopeHotels:['TLKL']}),[]);
 const response=await handleApi(request('/api/accounts/TLKL/SYNTHETIC'),env);expect(response.status).toBe(200);
 expect(calls.find(c=>c.name==='ar_access_account_publication')?.body).toEqual({p_actor:actor,p_hotel:'TLKL',p_account:'SYNTHETIC'});
 expect(calls.filter(c=>c.name==='ar_access_rows').every(c=>c.body.p_actor===actor&&JSON.stringify(c.body.p_hotels)==='["TLKL"]')).toBe(true);
});
it('blocks direct requests for the default Phuket view from a Khao Lak member',async()=>{
 const calls=transport(body=>{expect(body.p_region).toBe('phuket');return Response.json({message:'access_forbidden'},{status:400});});
 expect((await handleApi(request('/api/collection-queue'),env)).status).toBe(403);expect(calls).toHaveLength(1);
});
it('returns a missing idempotency receipt without a second resource lookup',async()=>{
 const calls=transport(()=>Response.json({...grant,missingCommand:true}));
 const response=await handleApi(request('/api/remittances/commands/'+id),env);expect(response.status).toBe(200);expect(await response.json()).toEqual({complete:false});expect(calls).toHaveLength(1);
});
it('does not let a delegated session inherit an administrator acceptance cookie',async()=>{
 const calls=transport(()=>Response.json(grant));const r=request('/api/portfolio?region=khao-lak');r.headers.set('Cookie','__Host-ar-acceptance='+id);
 expect((await handleApi(r,env)).status).toBe(403);expect(calls).toHaveLength(0);
});
