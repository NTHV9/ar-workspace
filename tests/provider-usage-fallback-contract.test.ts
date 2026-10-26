import {afterEach,expect,it,vi} from 'vitest';
import {operationsApi} from '../worker/operations/api';
import {parseProviderUsage} from '../src/operations/provider-usage';
afterEach(()=>vi.unstubAllGlobals());
it('the real Worker private-RPC failure returns exactly the normalized 200 fallback used by the browser',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'synthetic-source-unavailable'},{status:503})));
 const response=await operationsApi(new Request('https://app.synthetic.invalid/api/operations/provider-usage'),{SUPABASE_URL:'https://db.synthetic.invalid',SUPABASE_SECRET_KEY:'synthetic-secret'},'00000000-0000-4000-8000-000000000081');
 expect(response.status).toBe(200);
 expect(await response.json()).toEqual(parseProviderUsage(null));
});
