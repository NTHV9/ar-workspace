import {afterEach,it,expect,vi} from 'vitest';
import {emailApi} from '../worker/email/api';
import {hash} from '../worker/email/crypto';
const actor='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',job='00000000-0000-4000-8000-000000000003';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
const bytes=new TextEncoder().encode('%PDF synthetic file');
async function fixture(name='Original.pdf'){return {id,owner:actor,document_job_id:job,hotel:'KAT',purpose:'billing',recipients:{to:[],cc:[],bcc:[]},subject:'Synthetic',body:'Synthetic',revision:3,exports:[{name,storage_key:`jobs/${job}/exports/synthetic.pdf`,sha256:await hash(bytes),byte_count:bytes.length}],attachments:[]};}
afterEach(()=>vi.unstubAllGlobals());
it('forwards only draft filename metadata to v3 and retains revision conflict',async()=>{
 const draft=await fixture(),calls:{name:string;body:Record<string,unknown>}[]=[];
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{const name=new URL(String(input)).pathname.split('/').pop()!;calls.push({name,body:JSON.parse(String(init.body))});if(name==='ar_email_get')return Response.json(draft);if(name==='ar_email_save_v3')return Response.json({error:'email_revision_conflict'});throw Error('Unexpected synthetic request');});
 const r=await emailApi(new Request(`https://app.test/api/email/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:3,purpose:'billing',recipients:draft.recipients,subject:'Synthetic',body:'Synthetic',generatedNames:[{storageKey:draft.exports[0].storage_key,name:'ใหม่'}]})}),env,actor);
 expect(r.status).toBe(409);expect(calls.at(-1)).toMatchObject({name:'ar_email_save_v3',body:{p_actor:actor,p_revision:3,p_generated_names:[{storageKey:draft.exports[0].storage_key,name:'ใหม่.pdf'}]}});
});
it('rejects foreign, duplicate and malformed keys before the save RPC',async()=>{
 const draft=await fixture();const f=vi.fn().mockImplementation(()=>Promise.resolve(Response.json(draft)));vi.stubGlobal('fetch',f);
 for(const names of [[{storageKey:'foreign',name:'a.pdf'}],[],[{storageKey:draft.exports[0].storage_key,name:'../bad.pdf'}]]){const r=await emailApi(new Request(`https://app.test/api/email/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:3,purpose:'billing',recipients:draft.recipients,subject:'Synthetic',body:'Synthetic',generatedNames:names})}),env,actor);expect(r.status).toBe(400);}
 expect(f.mock.calls.every(c=>String(c[0]).endsWith('/ar_email_get'))).toBe(true);
});
for(const name of ['ใบแจ้งหนี้.pdf','01-Invoice123..45.pdf'])it(`downloads exact bytes with saved safe filename: ${name}`,async()=>{
 const draft=await fixture(name),calls:string[]=[];vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{const u=String(input);calls.push(u);if(u.endsWith('/ar_email_get'))return Response.json(draft);if(u.includes('/ar_storage_read'))return Response.json({allowed:true});if(u.includes('/storage/'))return new Response(bytes);throw Error('Unexpected synthetic request '+u);});
 const r=await emailApi(new Request(`https://app.test/api/email/${id}/exports/0?revision=3`),env,actor);
 expect(r.status).toBe(200);expect(r.headers.get('Content-Disposition')).toContain(`filename*=UTF-8''${encodeURIComponent(name)}`);expect(new Uint8Array(await r.arrayBuffer())).toEqual(bytes);expect(calls.some(u=>u.includes('googleapis'))).toBe(false);
});
it('rejects stale download before reading private bytes',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json(await fixture())));const r=await emailApi(new Request(`https://app.test/api/email/${id}/exports/0?revision=2`),env,actor);expect(r.status).toBe(409);expect(fetch).toHaveBeenCalledTimes(1);});
