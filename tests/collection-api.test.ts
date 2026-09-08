import {afterEach,expect,it,vi} from 'vitest';
import {handleApi} from '../worker/index';
afterEach(()=>vi.unstubAllGlobals());
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_PUBLISHABLE_KEY:'synthetic'};
const request=(input:unknown)=>new Request('https://app.test/api/collection/validate-selection',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify(input)});
it('rejects an unauthenticated selection',async()=>{expect((await handleApi(new Request('https://app.test/api/collection/validate-selection',{method:'POST'}),env)).status).toBe(401);});
it('ignores forged eligible flags and rejects authoritative child result',async()=>{
 const calls:unknown[]=[];vi.stubGlobal('fetch',async(url:string,options:RequestInit)=>{if(url.endsWith('/auth/v1/user'))return Response.json({email:'ar@katathani.com',email_confirmed_at:'2026-09-09'});calls.push(JSON.parse(String(options.body)));return Response.json(false);});
 const r=await handleApi(request({hotel:'KAT',accountId:'A',ids:['child'],collection_selectable:true,open:100,collection_role:'standalone'}),env);
 expect(r.status).toBe(409);expect(calls).toEqual([{p_hotel:'KAT',p_account_id:'A',p_ids:['child']}]);
});
it('fails closed when database validation is unavailable',async()=>{
 vi.stubGlobal('fetch',async(url:string)=>url.endsWith('/auth/v1/user')?Response.json({email:'ar@katathani.com',email_confirmed_at:'2026-09-09'}):new Response('',{status:503}));
 expect((await handleApi(request({hotel:'KAT',accountId:'A',ids:['parent']}),env)).status).toBe(503);
});
