import {afterEach,expect,it,vi} from 'vitest';
import {handleApi} from '../worker/index';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'synthetic'};
afterEach(()=>vi.unstubAllGlobals());
it('protects renderer proof before any provider call',async()=>{
 const mock=vi.fn();vi.stubGlobal('fetch',mock);
 expect((await handleApi(new Request('https://app.test/api/statement-renderer-proof'),env)).status).toBe(401);
 expect(mock).not.toHaveBeenCalled();
});
it('rejects a non-allowlisted user for renderer proof',async()=>{
 vi.stubGlobal('fetch',async()=>Response.json({email:'other@example.test',email_confirmed_at:'2026-09-09'}));
 expect((await handleApi(new Request('https://app.test/api/statement-renderer-proof',{headers:{Authorization:'Bearer synthetic'}}),env)).status).toBe(403);
});
it('renders fixed synthetic Unicode proof only after verified login',async()=>{
 vi.stubGlobal('fetch',async()=>Response.json({email:'ar@katathani.com',email_confirmed_at:'2026-09-09'}));
 const response=await handleApi(new Request('https://app.test/api/statement-renderer-proof',{headers:{Authorization:'Bearer synthetic'}}),env);
 expect(response.status).toBe(200);expect(response.headers.get('content-type')).toBe('application/pdf');expect(response.headers.get('cache-control')).toBe('no-store');
 const bytes=new Uint8Array(await response.arrayBuffer());expect(new TextDecoder().decode(bytes.slice(0,5))).toBe('%PDF-');expect(bytes.length).toBeGreaterThan(1000);
});
