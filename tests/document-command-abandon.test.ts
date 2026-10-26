import {afterEach,expect,it,vi} from 'vitest';
import {documentApi} from '../worker/documents/api';
const owner='00000000-0000-4000-8000-000000000001',command='00000000-0000-4000-8000-000000000003',digest='a'.repeat(64);
afterEach(()=>vi.unstubAllGlobals());
it('accepts exact unknown-create abandonment without repeating create or dispatch',async()=>{
 const fetcher=vi.fn(async()=>Response.json({commandKey:command,payloadDigest:digest,hotel:'KAT',outcome:'cancelled'}));vi.stubGlobal('fetch',fetcher);
 const r=await documentApi(new Request(`https://app.test/api/documents/commands/${command}/abandon`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hotel:'KAT',payloadDigest:digest})}),{SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',REQUEST_ACTOR:owner},owner,{});
 expect(r.status).toBe(200);expect(await r.json()).toMatchObject({commandKey:command,outcome:'cancelled'});expect(fetcher).toHaveBeenCalledTimes(1);
});
