import {afterEach,expect,it,vi} from 'vitest';
import {trackerApi} from '../worker/tracker-sync/api';
import {trackerConflictsApi} from '../worker/tracker-sync/conflicts-api';
import {trackerPickerConfig} from '../worker/tracker-sync/picker';
import {handleApi} from '../worker/index';
import type {TrackerEnv,TrackerAdapter} from '../worker/tracker-sync/service';
const actor='00000000-0000-4000-8000-000000000031',owner='00000000-0000-4000-8000-000000000032';
const grant={actorId:actor,workspaceOwnerId:owner,email:'staff@example.invalid',administrator:false,regions:['khao-lak' as const],revision:1,scopeHotels:['TSAN' as const]};
const env:TrackerEnv&{SUPABASE_PUBLISHABLE_KEY:string}={SUPABASE_URL:'https://db.synthetic.invalid',SUPABASE_SECRET_KEY:'synthetic-server',SUPABASE_PUBLISHABLE_KEY:'synthetic-public',TRACKER_SYNC_ENABLED:'true',REQUEST_ACTOR:actor,REQUEST_ACCESS:grant};
const status={connected:true,revision:3,lastSuccessAt:'2026-10-24T03:00:00Z',lastCheckedAt:'2026-10-25T03:00:00Z',error:'synthetic private error',pending:42,conflictCount:1,conflicts:[{rowKey:'private identity'}],rowAddRows:[{invoiceNo:'private invoice'}]};
const adapter:TrackerAdapter={read:async()=>{throw Error('Provider read forbidden');},write:async()=>{throw Error('Provider write forbidden');}};
const request=(path='tracker',region='khao-lak',method='GET',action='sync')=>new Request(`https://app.synthetic.invalid/api/reports/${path}?region=${region}`,{method,headers:{Authorization:'Bearer synthetic-user','Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({action})}:{})});
afterEach(()=>vi.unstubAllGlobals());
it('projects member tracker reads to the successful timestamp only',async()=>{
 const calls:unknown[]=[];vi.stubGlobal('fetch',async(_url:unknown,init:RequestInit)=>{calls.push(JSON.parse(String(init.body)));return Response.json(status);});
 const response=await trackerApi(request(),env,owner,adapter);expect(response.status).toBe(200);expect(await response.json()).toEqual({lastSuccessAt:'2026-10-24T03:00:00Z'});expect(response.headers.get('cache-control')).toBe('no-store');expect(calls).toEqual([{p_actor:actor,p_region:'khao-lak'}]);
});
it('uses an explicit null when there is no recorded successful synchronization',async()=>{vi.stubGlobal('fetch',async()=>Response.json({connected:false,revision:0}));expect(await (await trackerApi(request(),env,owner,adapter)).json()).toEqual({lastSuccessAt:null});});
it.each(['connect','sync','preview','confirm_preview','resolve'])('denies member %s before any backend or provider access',async action=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const response=await trackerApi(request('tracker','khao-lak','POST',action),env,owner,adapter);expect(response.status).toBe(403);expect(await response.json()).toEqual({error:'tracker_forbidden'});expect(fetcher).not.toHaveBeenCalled();
});
it('denies member conflict pages and Picker before any private configuration or backend read',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);expect((await trackerConflictsApi(request('tracker-conflicts'),env,owner)).status).toBe(403);expect((await trackerPickerConfig(request('tracker-picker'),env,owner)).status).toBe(403);expect(fetcher).not.toHaveBeenCalled();
});
it.each([false,true])('retains full administrator status for verified owner legacy path or explicit grant: %s',async explicit=>{
 vi.stubGlobal('fetch',async()=>Response.json(status));const administrator={...env,REQUEST_ACCESS:explicit?{...grant,administrator:true}:undefined};const response=await trackerApi(request(),administrator,owner,adapter);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({...status,available:true,writeAssurance:'held'});
});
it('keeps regional restrictions on member and administrator reads',async()=>{const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);for(const administrator of [false,true])expect((await trackerApi(request('tracker','phuket'),{...env,REQUEST_ACCESS:{...grant,administrator}},owner,adapter)).status).toBe(403);expect(fetcher).not.toHaveBeenCalled();});
it('enforces the restricted contract through the authenticated regional dispatcher',async()=>{
 const calls:string[]=[];vi.stubGlobal('fetch',async(input:unknown)=>{const path=new URL(String(input)).pathname;if(path==='/auth/v1/user')return Response.json({id:actor,email:grant.email,email_confirmed_at:'2026-09-17T00:00:00Z'});const rpc=path.split('/').at(-1)!;calls.push(rpc);return Response.json(rpc==='ar_access_authorize'?grant:status);});
 const {REQUEST_ACCESS:_,REQUEST_ACTOR:__,...dispatcherEnv}=env;
 expect(await (await handleApi(request(),dispatcherEnv)).json()).toEqual({lastSuccessAt:'2026-10-24T03:00:00Z'});
 for(const r of [request('tracker','khao-lak','POST'),request('tracker-conflicts'),request('tracker-picker')])expect((await handleApi(r,dispatcherEnv)).status).toBe(403);
 expect(calls.filter(name=>name!=='ar_access_authorize')).toEqual(['ar_tracker_status']);
});
