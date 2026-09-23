import {afterEach,expect,it,vi} from 'vitest';
import {googleSession} from '../worker/access/session';
import {initialize} from '../src/access/tab-session';
import {accessApi} from '../worker/access/api';
const actor='00000000-0000-4000-8000-000000000001',session='00000000-0000-4000-8000-000000000002';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
const claims={sub:actor,session_id:session,amr:[{method:'oauth'}],app_metadata:{provider:'email',providers:['email','google']}};
const token=(v:unknown)=>'Bearer header.'+btoa(JSON.stringify(v))+'.signature';
afterEach(()=>vi.unstubAllGlobals());
it('rejects password sessions even when Google is linked; accepts only an active Google OAuth session',async()=>{
 const fetch=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>Response.json(true));vi.stubGlobal('fetch',fetch);
 expect(await googleSession(env,token({...claims,amr:[{method:'password'}]}),actor)).toBe(false);
 expect(await googleSession(env,token({...claims,sub:session}),actor)).toBe(false);
 expect(fetch).not.toHaveBeenCalled();
 expect(await googleSession(env,token(claims),actor)).toBe(true);
 expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({p_actor:actor,p_session:session});
});
it('rejects removed or cutover-expired sessions and fails closed on database failure',async()=>{
 vi.stubGlobal('fetch',async()=>Response.json(false));expect(await googleSession(env,token(claims),actor)).toBe(false);
 vi.stubGlobal('fetch',async()=>new Response(null,{status:503}));await expect(googleSession(env,token(claims),actor)).rejects.toThrow();
});
function memory():Storage{const m=new Map<string,string>();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>{m.set(k,v);},removeItem:k=>{m.delete(k);},clear:()=>m.clear(),key:n=>[...m.keys()][n]??null,get length(){return m.size;}};}
it('retains reload but clears new navigation and copied-tab credentials; removes only the legacy project token',()=>{
 const s=memory(),l=memory();l.setItem('sb-project-auth-token','obsolete');l.setItem('other','retain');
 const one=initialize(s,l,'project','navigate',false);s.setItem(one.storageKey,'synthetic-session');
 expect(initialize(s,l,'project','reload',false).storageKey).toBe(one.storageKey);
 const two=initialize(s,l,'project','navigate',false);expect(two.storageKey).not.toBe(one.storageKey);expect(s.getItem(one.storageKey)).toBeNull();
 expect(l.getItem('sb-project-auth-token')).toBeNull();expect(l.getItem('other')).toBe('retain');
});
it('preserves the tab PKCE verifier only on a recent explicit Google return',()=>{
 const s=memory(),l=memory(),one=initialize(s,l,'project','navigate',false);s.setItem(one.storageKey+'-code-verifier','verifier');s.setItem('ar-google-tab-v1-oauth','1000');
 expect(initialize(s,l,'project','navigate',true,2000)).toMatchObject({storageKey:one.storageKey,detectSessionInUrl:true});
 expect(s.getItem(one.storageKey+'-code-verifier')).toBe('verifier');expect(s.getItem('ar-google-tab-v1-oauth')).toBeNull();
});
it('creates approved staff with name and region without ever provisioning passwords',async()=>{
 const fetch=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>Response.json({email:'synthetic@gmail.com'}));vi.stubGlobal('fetch',fetch);
 const body={commandId:session,email:'synthetic@gmail.com',displayName:'Synthetic Staff',regions:['phuket'],active:true,revision:0};
 const request=(input:unknown)=>new Request('https://app.test/api/access/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
 expect((await accessApi(request(body),env,actor,'ar@katathani.com')).status).toBe(200);
 expect(String(fetch.mock.calls[0]?.[0])).toContain('/ar_access_staff_save');
 for(const displayName of ['', 'x'.repeat(101),'a\nb'])expect((await accessApi(request({...body,displayName}),env,actor,'ar@katathani.com')).status).toBe(400);
 expect((await accessApi(request({...body,role:'admin'}),env,actor,'ar@katathani.com')).status).toBe(400);
 expect(fetch).toHaveBeenCalledTimes(1);
});
