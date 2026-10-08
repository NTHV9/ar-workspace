import {afterEach,expect,it,vi} from 'vitest';
import {handleApi} from '../worker/index';
import {probeOpera} from '../worker/opera/probe';
vi.mock('../worker/opera/probe',async(importOriginal)=>({...await importOriginal<typeof import('../worker/opera/probe')>(),probeOpera:vi.fn(async()=>({status:'read_verified'}))}));
const env={SUPABASE_URL:'https://db.synthetic.invalid',SUPABASE_PUBLISHABLE_KEY:'synthetic'};
const request=(query:string)=>new Request('https://app.synthetic.invalid/api/opera/probe?'+query,{method:'POST',headers:{Authorization:'Bearer synthetic'}});
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
function authenticate(email='ar@katathani.com'){vi.stubGlobal('fetch',vi.fn(async()=>Response.json({id:'synthetic-user',email,email_confirmed_at:'2026-09-10'})));}
it('forwards only a validated optional account selector after authentication',async()=>{
 authenticate();expect((await handleApi(request('hotel=KAT&account=SYN_A-1'),env)).status).toBe(200);
 expect(probeOpera).toHaveBeenCalledWith(expect.anything(),'KAT','SYN_A-1');
});
it.each(['hotel=KAT&account=','hotel=KAT&account=a.b','hotel=KAT&account=a&account=b','hotel=KAT&hotel=TSK','hotel=KAT&other=x','hotel=KAT&account='+ 'a'.repeat(101)])('rejects malformed query %s before OPERA calls',async(query)=>{
 authenticate();expect((await handleApi(request(query),env)).status).toBe(400);expect(probeOpera).not.toHaveBeenCalled();
});
it('retains missing-auth and non-admin denial for targeted probes',async()=>{
 expect((await handleApi(new Request('https://app.synthetic.invalid/api/opera/probe?hotel=KAT&account=A',{method:'POST'}),env)).status).toBe(401);
 authenticate('staff@example.invalid');expect((await handleApi(request('hotel=KAT&account=A'),env)).status).toBe(403);expect(probeOpera).not.toHaveBeenCalled();
});
