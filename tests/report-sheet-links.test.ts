import {afterEach,expect,it,vi} from 'vitest';
import {handleApi} from '../worker/index';
import {reportSheetLinks} from '../worker/reports/sheet-links';
import {requestAccessIntent} from '../worker/access/scope';
import {regionHotels,type RegionId} from '../src/domain/hotels';

const phuket='synthetic_phuket_sheet_12345',khaolak='synthetic_khaolak_sheet_12345';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'synthetic',SUPABASE_SECRET_KEY:'synthetic',REPORT_SHEET_PHUKET_ID:phuket,REPORT_SHEET_KHAOLAK_ID:khaolak};
const req=(query='',method='GET',authenticated=true)=>new Request('https://app.test/api/reports/sheets'+query,{method,headers:authenticated?{Authorization:'Bearer synthetic'}:{}});
afterEach(()=>vi.unstubAllGlobals());
function auth(administrator:boolean,regions:RegionId[],denied=false){
 const calls:string[]=[];vi.stubGlobal('fetch',async(input:string,init?:RequestInit)=>{const url=String(input);calls.push(url);
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'00000000-0000-4000-8000-000000000001',email:administrator?'ar@katathani.com':'staff@example.com',email_confirmed_at:'2026-09-29'});
  if(url.endsWith('/auth/v1/settings'))return Response.json({external:{google:true}});
  if(url.endsWith('/rpc/ar_access_authorize')){expect(JSON.parse(String(init?.body))).toMatchObject({p_kind:'global',p_method:'GET',p_path:'/api/reports/sheets'});return Response.json(denied?null:{email:'staff@example.com',administrator:false,regions,revision:1,workspaceOwnerId:'00000000-0000-4000-8000-000000000002',scopeHotels:regions.flatMap(r=>[...regionHotels(r)])});}
  throw Error('Unexpected provider call');
 });return calls;
}
it('requires authentication without revealing a configured destination',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const response=await handleApi(req('','GET',false),env);expect(response.status).toBe(401);expect(await response.text()).not.toContain(phuket);expect(fetcher).not.toHaveBeenCalled();
});
it.each<RegionId>(['phuket','khao-lak'])('returns only the authorized %s link without reading a Google file',async region=>{
 const calls=auth(false,[region]);const response=await handleApi(req(),env);expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('no-store');const data=await response.json();expect(data).toEqual({rows:[{region,label:region==='phuket'?'Phuket':'Khao Lak',url:`https://docs.google.com/spreadsheets/d/${region==='phuket'?phuket:khaolak}/edit`}]});expect(calls).toHaveLength(2);expect(calls.every(v=>v.startsWith(env.SUPABASE_URL+'/'))).toBe(true);
});
it('shows both configured links to the administrator and exposes none in public config',async()=>{
 auth(true,['phuket','khao-lak']);expect(await (await handleApi(req(),env)).json()).toMatchObject({rows:[{region:'phuket'},{region:'khao-lak'}]});
 const config=await (await handleApi(new Request('https://app.test/api/config'),env)).text();expect(config).not.toContain(phuket);expect(config).not.toContain(khaolak);
});
it('does not turn a revoked membership into link access',async()=>{auth(false,['phuket'],true);expect((await handleApi(req(),env)).status).toBe(403);});
it('admits only the exact read endpoint and rejects client-supplied targets',async()=>{
 expect(await requestAccessIntent(req())).toEqual({kind:'global'});
 for(const query of ['?region=khao-lak','?url=https://example.com'])await expect(requestAccessIntent(req(query))).rejects.toThrow('access_forbidden');
 for(const method of ['POST','PUT','DELETE']){expect((await handleApi(req('',method),env)).status).toBe(405);await expect(requestAccessIntent(req('',method))).rejects.toThrow('access_forbidden');}
 expect(reportSheetLinks(req('?url=anything'),env,['phuket']).status).toBe(400);
});
it('keeps absent or malformed configuration unavailable instead of creating arbitrary links',async()=>{
 for(const id of [undefined,'https://untrusted.example/','bad/id','a'.repeat(201)]){const response=reportSheetLinks(req(),{REPORT_SHEET_PHUKET_ID:id},['phuket']);expect(await response.json()).toEqual({rows:[{region:'phuket',label:'Phuket',url:null}]});}
});
