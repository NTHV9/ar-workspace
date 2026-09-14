import {afterEach,expect,it,vi} from 'vitest';
import {handleApi} from '../worker/index';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_PUBLISHABLE_KEY:'synthetic-public',SUPABASE_SECRET_KEY:'synthetic-secret'},actor='11111111-1111-4111-8111-111111111111';
const user={id:actor,email:'ar@katathani.com',email_confirmed_at:'2026-09-01'},request=(path:string)=>new Request('https://app.test'+path,{headers:{Authorization:'Bearer synthetic'}});
afterEach(()=>vi.unstubAllGlobals());
it('Portfolio uses one atomic root-count projection and preserves the native net amount',async()=>{
 const calls:string[]=[],account={hotel:'KAT',id:'a',name:'Synthetic account',type:'Agent',open:80,items:2},response={accounts:[account],source:'opera',status:'connected',refresh:{hotels:[],running:false}};
 vi.stubGlobal('fetch',async(target:string,options:RequestInit)=>{const p=new URL(target).pathname;calls.push(p);if(p==='/auth/v1/user')return Response.json(user);if(p==='/rest/v1/rpc/ar_portfolio_accounts'){expect(JSON.parse(String(options.body))).toEqual({p_actor:actor});return Response.json(response);}throw Error('Unexpected non-atomic read');});
 const result=await handleApi(request('/api/portfolio'),env);expect(result.status).toBe(200);expect(await result.json()).toEqual(response);expect(calls).toEqual(['/auth/v1/user','/rest/v1/rpc/ar_portfolio_accounts']);
});
it('the Folio reader excludes children while retaining positive, negative and unknown nonchild rows',async()=>{
 const rows=[{id:'debit',collection_role:'standalone',open:100},{id:'credit',collection_role:'standalone',open:-20},{id:'child',collection_role:'child',open:100},{id:'unknown',collection_role:'unverified',open:5}].map(r=>({...r,hotel:'KAT',account_id:'a'}));
 let query:URLSearchParams|undefined;
 vi.stubGlobal('fetch',async(target:string)=>{const u=new URL(target);if(u.pathname==='/auth/v1/user')return Response.json(user);if(u.pathname==='/rest/v1/ar_invoices'){query=u.searchParams;return Response.json(query.get('collection_role')==='neq.child'?rows.filter(r=>r.collection_role!=='child'):rows);}return Response.json([]);});
 const result=await handleApi(request('/api/accounts/KAT/a'),env),body=await result.json() as {invoices:{id:string;open:number}[]};expect(result.status).toBe(200);expect(query?.get('open')).toBe('neq.0');expect(query?.get('hotel')).toBe('eq.KAT');expect(query?.get('collection_role')).toBe('neq.child');expect(body.invoices.map(r=>r.id)).toEqual(['debit','credit','unknown']);expect(body.invoices[1].open).toBe(-20);
});
