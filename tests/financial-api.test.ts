import {afterEach,expect,it,vi} from 'vitest';
import {financialApi,financialFilters} from '../worker/financial/api';
import {handleApi} from '../worker/index';
const actor='00000000-0000-4000-8000-000000000001',env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
afterEach(()=>vi.unstubAllGlobals());
it('requires authentication before financial data or refresh commands',async()=>{const f=vi.fn();vi.stubGlobal('fetch',f);for(const [path,method]of [['/api/financial/payments','GET'],['/api/financial/refresh','POST']])expect((await handleApi(new Request('https://app.test'+path,{method}),env)).status).toBe(401);expect(f).not.toHaveBeenCalled();});
it('keeps date and Hotel/Account filter scope exact',()=>{expect(financialFilters(new URL('https://app.test/api/financial/payments?hotel=TSK&account=A%2FB&from=2026-09-01&to=2026-09-10&page=2&limit=25'))).toEqual({p_hotel:'TSK',p_account:'A/B',p_type:null,p_from:'2026-09-01',p_to:'2026-09-10',p_offset:50,p_limit:25});for(const q of ['account=A','hotel=OTHER','from=2026-02-30&to=2026-03-01','from=2026-09-11&to=2026-09-10','limit=201','page=-1','hotel=KAT&hotel=TSK'])expect(()=>financialFilters(new URL('https://app.test/api/financial/payments?'+q))).toThrow('financial_invalid');});
it('keeps unavailable source data unavailable rather than manufacturing an empty report',async()=>{vi.stubGlobal('fetch',async()=>new Response('private error',{status:500}));const r=await financialApi(new Request('https://app.test/api/financial/payments'),env,actor);expect(r.status).toBe(503);expect(await r.text()).not.toContain('private error');});
it('does not enable ingestion merely because Supabase has a URL',async()=>{vi.stubGlobal('fetch',vi.fn());const r=await financialApi(new Request('https://app.test/api/financial/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({commandId:actor,hotel:'KAT',reason:'manual'})}),env,actor);expect(r.status).toBe(503);expect(await r.json()).toMatchObject({status:'not_enabled'});expect(fetch).not.toHaveBeenCalled();});
it('rejects malformed and oversized command bodies',async()=>{vi.stubGlobal('fetch',vi.fn());for(const [body,status]of [['{',400],[' '.repeat(3000),413]] as const){expect((await financialApi(new Request('https://app.test/api/financial/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body}),env,actor)).status).toBe(status);}expect(fetch).not.toHaveBeenCalled();});

it('reconciles only a confirmed terminal Workflow, preserving unknown or active runs',async()=>{
 let finished=false;const calls:string[]=[];vi.stubGlobal('fetch',async(url:string)=>{const name=url.split('/').at(-1)!;calls.push(name);if(name==='ar_financial_fail'){finished=true;return Response.json(true);}return Response.json({running:!finished,runs:[{id:actor,status:finished?'failed':'running'}]});});
 const status=vi.fn().mockResolvedValue({status:'running'}),get=vi.fn(async()=>({status}));const configured={...env,FINANCIAL_HISTORY_ENABLED:'true',FINANCIAL_HISTORY_DATE_FILTER_PROOF:'verified:test',AR_REFRESH:{get,create:vi.fn()}};
 await financialApi(new Request('https://app.test/api/financial/status'),configured,actor);expect(calls).not.toContain('ar_financial_fail');
 status.mockRejectedValueOnce(Error('unavailable'));await financialApi(new Request('https://app.test/api/financial/status'),configured,actor);expect(calls).not.toContain('ar_financial_fail');
 status.mockResolvedValue({status:'errored'});const result=await financialApi(new Request('https://app.test/api/financial/status'),configured,actor);expect(await result.json()).toMatchObject({running:false,enabled:true,runs:[{status:'failed'}]});expect(calls.filter(n=>n==='ar_financial_fail')).toHaveLength(1);
});

it('version2 financial imports use the background queue instead of interactive document capacity',async()=>{
 const interactive={create:vi.fn(),get:vi.fn()},background={create:vi.fn().mockResolvedValue({}),get:vi.fn()};
 vi.stubGlobal('fetch',async()=>Response.json({id:actor,stepsVersion:2,status:'queued',created:false,hotel:'KAT'}));
 const request=new Request('https://app.test/api/financial/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({commandId:actor,hotel:'KAT',reason:'manual'})});
 const response=await financialApi(request,{...env,FINANCIAL_HISTORY_ENABLED:'true',FINANCIAL_HISTORY_DATE_FILTER_PROOF:'synthetic',AR_REFRESH:interactive,AR_FINANCIAL:background},actor);
 expect(response.status).toBe(202);expect(background.create).toHaveBeenCalledOnce();expect(interactive.create).not.toHaveBeenCalled();
});
it('a missing background binding does not silently consume document capacity for a version2 job',async()=>{
 const create=vi.fn();vi.stubGlobal('fetch',async()=>Response.json({id:actor,stepsVersion:2,status:'queued',created:false,hotel:'KAT'}));
 const response=await financialApi(new Request('https://app.test/api/financial/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({commandId:actor,hotel:'KAT',reason:'manual'})}),{...env,FINANCIAL_HISTORY_ENABLED:'true',FINANCIAL_HISTORY_DATE_FILTER_PROOF:'synthetic',AR_REFRESH:{create,get:vi.fn()}},actor);
 expect(response.status).toBe(503);expect(create).not.toHaveBeenCalled();
});
