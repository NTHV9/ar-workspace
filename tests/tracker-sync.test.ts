import {afterEach,describe,expect,it,vi} from 'vitest';
import {confirmedSentFields,matchTrackerInvoice,trackerHotel,trackerMerge} from '../worker/tracker-sync/model';
import {syncTracker,type TrackerAdapter,type ProviderSnapshot} from '../worker/tracker-sync/service';
import {trackerApi} from '../worker/tracker-sync/api';
import {requestAccessIntent} from '../worker/access/scope';
import {trackerRevisionKey} from '../src/reports/use-tracker-revision';
const actor='00000000-0000-4000-8000-000000000001',file='synthetic_tracker_original_12345';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',REPORT_SHEET_PHUKET_ID:file,TRACKER_SYNC_ENABLED:'true'};
const snapshot:ProviderSnapshot={version:'v1',schemaFingerprint:'headers1',capabilities:{conditionalWrite:'unsupported'},rows:[{rowKey:'opaque-key',hotel:'KAT',accountNo:'0002',invoiceNo:'00001',folio:'7',fields:{R:'2026-09-01',U:null},locator:{tab:'KT',row:3}}]};
const adapter=():TrackerAdapter=>({read:vi.fn(async()=>structuredClone(snapshot)),write:vi.fn(async()=>({status:'written' as const,version:'v2'}))});
afterEach(()=>vi.unstubAllGlobals());
it('scopes background revision comparisons and rejects malformed or duplicate regional revisions',()=>{
 expect(trackerRevisionKey({rows:[{region:'phuket',revision:'1'}]})).not.toBe(trackerRevisionKey({rows:[{region:'phuket',revision:'2'}]}));
 expect(trackerRevisionKey({rows:[{region:'phuket',revision:'1'},{region:'khao-lak',revision:'2'}]})).toBe(trackerRevisionKey({rows:[{region:'khao-lak',revision:'2'},{region:'phuket',revision:'1'}]}));
 expect(trackerRevisionKey({rows:[{region:'phuket',revision:'1'},{region:'phuket',revision:'2'}]})).toBeNull();expect(trackerRevisionKey({rows:[{region:'unknown',revision:'1'}]})).toBeNull();
});
describe('tracker invoice identity',()=>{
 it('keeps leading zeroes and corroborates hotel/account/folio without first-match fallback',()=>{
  const row={hotel:'KAT' as const,accountNo:'0002',invoiceNo:'00001',folioNo:'7'},candidate={...row,accountId:'a',invoiceId:'i'};
  expect(matchTrackerInvoice(row,[candidate])).toEqual(candidate);
  expect(matchTrackerInvoice(row,[candidate,candidate])).toBeNull();
  expect(matchTrackerInvoice(row,[{...candidate,hotel:'TSK'}])).toBeNull();
  expect(matchTrackerInvoice(row,[{...candidate,invoiceNo:'1'}])).toBeNull();
  expect(matchTrackerInvoice(row,[{...candidate,accountNo:'2'}])).toBeNull();
  expect(matchTrackerInvoice(row,[{...candidate,folioNo:'8'}])).toBeNull();
 });
 it('accepts only explicit regional aliases and excludes LFS',()=>{
  expect(trackerHotel('KT','phuket')).toBe('KAT');expect(trackerHotel('KAT','phuket')).toBe('KAT');
  expect(trackerHotel('SAN','khao-lak')).toBe('TSAN');expect(trackerHotel('LFS','khao-lak')).toBeNull();expect(trackerHotel('KT','khao-lak')).toBeNull();
 });
});
it('three-way comparison holds conflicting bootstrap/manual changes and recognizes writeback echoes',()=>{
 expect(trackerMerge(undefined,'2026-09-01',null)).toBe('import');expect(trackerMerge(undefined,'2026-09-01','2026-09-02')).toBe('conflict');
 expect(trackerMerge('a','b','a')).toBe('import');expect(trackerMerge('a','b','c')).toBe('conflict');expect(trackerMerge('a','b','b')).toBe('echo');expect(trackerMerge('a',null,'b')).toBe('conflict');
});
it('outbound field allowlist excludes Friendly/Final/custom stage and nonconfirmed purposes',()=>{
 expect(confirmedSentFields('billing',null)).toEqual(['R']);expect(confirmedSentFields('collection','Follow 1')).toEqual(['U']);expect(confirmedSentFields('collection','Follow 2')).toEqual(['V']);expect(confirmedSentFields('collection','Follow 3')).toEqual(['W']);
 for(const stage of ['Friendly','Final','round_custom'])expect(confirmedSentFields('collection',stage)).toEqual([]);expect(confirmedSentFields('draft','Follow 1')).toEqual([]);
});
function database(outbox:unknown[]=[],claim={status:'claimed',fileId:file}){
 const calls:{name:string;body:Record<string,unknown>}[]=[];
 vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{const name=url.split('/').at(-1)!;const body=JSON.parse(String(init.body));calls.push({name,body});
  if(name==='ar_tracker_claim')return Response.json(claim);if(name==='ar_tracker_outbox')return Response.json(outbox.map(v=>({identity:{hotel:'KAT',accountNo:'0002',invoiceNo:'00001',folio:'7'},...(v as Record<string,unknown>)})));if(name==='ar_tracker_status')return Response.json({connected:false,revision:0});if(name==='ar_tracker_write_result')return Response.json({state:body.p_state});return Response.json({});
 });return calls;
}
it('coalesces tabs through the database lease before provider work',async()=>{
 database([],{status:'busy',fileId:file});const p=adapter();expect(await syncTracker(env,actor,actor,'phuket',p)).toEqual({status:'busy'});expect(p.read).not.toHaveBeenCalled();expect(p.write).not.toHaveBeenCalled();
});
it('never acknowledges a matching date under a changed canonical identity',async()=>{
 const calls=database([{id:'q',rowKey:'opaque-key',identity:{hotel:'TSK',accountNo:'0002',invoiceNo:'00001',folio:'7'},field:'R',value:'2026-09-01',expected:null,state:'uncertain'}]);
 await syncTracker(env,actor,actor,'phuket',adapter());expect(calls.find(c=>c.name==='ar_tracker_write_result')?.body.p_state).toBe('conflict');
});
it('native uncertainty only reconciles exact identity/date and never repeats publication',async()=>{
 const identity={hotel:'TSAN' as const,accountNo:'0002',invoiceNo:'00001',folio:'7'},nativeEnv={...env,REPORT_SHEET_KHAOLAK_ID:file,TRACKER_NATIVE_BEST_EFFORT_ENABLED:'true'};
 const calls=database([{id:'q',rowKey:'opaque-key',identity,field:'U',value:'2026-09-02',expected:null,state:'uncertain'}]);
 const p=adapter();p.read=vi.fn(async()=>({...structuredClone(snapshot),rows:[{...snapshot.rows[0],...identity}],capabilities:{conditionalWrite:'unverified' as const,writeAssurance:'best-effort' as const}}));
 await syncTracker(nativeEnv,actor,actor,'khao-lak',p);expect(p.write).not.toHaveBeenCalled();expect(calls.find(c=>c.name==='ar_tracker_write_result')?.body.p_state).toBe('uncertain');
});
it('native best-effort pending dates publish while conditional capability stays unverified',async()=>{
 const identity={hotel:'TSAN' as const,accountNo:'0002',invoiceNo:'00001',folio:'7'},nativeEnv={...env,REPORT_SHEET_KHAOLAK_ID:file,TRACKER_NATIVE_BEST_EFFORT_ENABLED:'true'};
 const calls=database([{id:'q',rowKey:'opaque-key',identity,field:'U',value:'2026-09-02',expected:null,state:'pending'}]);const p=adapter();p.read=vi.fn(async()=>({...structuredClone(snapshot),rows:[{...snapshot.rows[0],...identity}],capabilities:{conditionalWrite:'unverified' as const,writeAssurance:'best-effort' as const}}));
 p.write=vi.fn(async()=>{expect(calls.filter(c=>c.name==='ar_tracker_write_result').map(c=>c.body.p_state)).toEqual(['uncertain']);return {status:'written' as const};});
 await syncTracker(nativeEnv,actor,actor,'khao-lak',p);expect(p.write).toHaveBeenCalledTimes(1);expect(calls.filter(c=>c.name==='ar_tracker_write_result').map(c=>c.body.p_state)).toEqual(['uncertain','written']);
});
it('holds unsupported CAS while acknowledging exact readback without rewriting',async()=>{
 const calls=database([{id:'q1',rowKey:'opaque-key',field:'U',value:'2026-09-02',expected:null,state:'pending'},{id:'q2',rowKey:'opaque-key',field:'R',value:'2026-09-01',expected:'2026-09-01',state:'uncertain'}]);
 const p=adapter();await syncTracker(env,actor,actor,'phuket',p);
 expect(p.write).not.toHaveBeenCalled();expect(calls.filter(c=>c.name==='ar_tracker_write_result').map(c=>c.body.p_state)).toEqual(['held','written']);
 expect(calls.find(c=>c.name==='ar_tracker_membership')?.body.p_keys).toEqual(['opaque-key']);
});
it('publishes one deduplicated batch for all selected invoice fields and acknowledges the same publication',async()=>{
 const identity={hotel:'KAT' as const,accountNo:'0002',invoiceNo:'00001',folio:'7'};
 const calls=database([{id:'q1',rowKey:'opaque-key',identity,locator:{},field:'U',value:'2026-09-02',expected:null,state:'pending'},{id:'q2',rowKey:'opaque-key',identity,locator:{},field:'U',value:'2026-09-02',expected:null,state:'pending'},{id:'q3',rowKey:'opaque-key',identity,locator:{},field:'V',value:'2026-09-03',expected:null,state:'pending'}]);
 const p=adapter();p.read=vi.fn(async()=>({...structuredClone(snapshot),capabilities:{conditionalWrite:'proven' as const}}));p.writeBatch=vi.fn(async()=>({status:'written' as const,version:'one-publication'}));
 await syncTracker(env,actor,actor,'phuket',p);expect(p.write).not.toHaveBeenCalled();expect(p.writeBatch).toHaveBeenCalledTimes(1);
 expect(vi.mocked(p.writeBatch).mock.calls[0][4]).toMatchObject([{rowKey:'opaque-key',changes:[{field:'U',value:'2026-09-02'},{field:'V',value:'2026-09-03'}]}]);
 expect(calls.filter(c=>c.name==='ar_tracker_write_result').map(c=>[c.body.p_id,c.body.p_state,c.body.p_version])).toEqual([['q1','written','one-publication'],['q2','written','one-publication'],['q3','written','one-publication']]);
});
it.each(['conflict','uncertain'] as const)('holds every attempted item after one batch %s and never retries publication',async state=>{
 const calls=database([{id:'q1',rowKey:'opaque-key',field:'U',value:'2026-09-02',expected:null,state:'pending'},{id:'q2',rowKey:'opaque-key',field:'V',value:'2026-09-03',expected:null,state:'pending'}]);
 const p=adapter();p.read=vi.fn(async()=>({...structuredClone(snapshot),capabilities:{conditionalWrite:'proven' as const}}));p.writeBatch=vi.fn(async()=>({status:state}));
 await syncTracker(env,actor,actor,'phuket',p);expect(p.writeBatch).toHaveBeenCalledTimes(1);expect(p.write).not.toHaveBeenCalled();expect(calls.filter(c=>c.name==='ar_tracker_write_result').map(c=>c.body.p_state)).toEqual([state,state]);
});
it('does not treat duplicate keys or failed imports as a successful snapshot',async()=>{
 const calls=database(),p=adapter();p.read=vi.fn(async()=>({...snapshot,rows:[...snapshot.rows,...snapshot.rows]}));
 await expect(syncTracker(env,actor,actor,'phuket',p)).rejects.toThrow('tracker_schema_unverified');expect(calls.some(c=>c.name==='ar_tracker_snapshot')).toBe(false);expect(calls.at(-1)?.body.p_error).toBe('tracker_unavailable');
});
it('retains a nonnumeric credit reference as a field hold without holding valid invoice dates',async()=>{
 const calls=database(),p=adapter();p.read=vi.fn(async()=>({...structuredClone(snapshot),rows:[{...snapshot.rows[0],fields:{...snapshot.rows[0].fields,S:'30 days'}}]}));
 await syncTracker(env,actor,actor,'phuket',p);const rows=calls.find(c=>c.name==='ar_tracker_snapshot')?.body.p_rows as {fieldHolds:string[];holdReason:string|null;fields:{S:string;R:string}}[];
 expect(rows[0]).toMatchObject({fieldHolds:['S'],holdReason:null,fields:{S:'30 days',R:'2026-09-01'}});
});
it('client cannot supply a spreadsheet URL or ID and crossing regions is denied',async()=>{
 database();const p=adapter();const request=new Request('https://app.test/api/reports/tracker?region=phuket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'connect',revision:0,fileId:'untrusted'})});
 expect((await trackerApi(request,env,actor,p)).status).toBe(400);expect(p.read).not.toHaveBeenCalled();
 expect(await requestAccessIntent(new Request('https://app.test/api/reports/tracker?region=khao-lak',{method:'POST'}))).toEqual({kind:'region',region:'khao-lak'});
 await expect(requestAccessIntent(new Request('https://app.test/api/reports/tracker?region=phuket&url=anything'))).rejects.toThrow('access_forbidden');
});
it('regional staff see truthful native mode while clients cannot enable its deployment flag',async()=>{
 database();const p=adapter(),nativeEnv={...env,REPORT_SHEET_KHAOLAK_ID:file,TRACKER_NATIVE_BEST_EFFORT_ENABLED:'true',REQUEST_ACCESS:{email:'synthetic-staff@example.invalid',administrator:false,regions:['khao-lak' as const],revision:1,actorId:actor,workspaceOwnerId:actor,scopeHotels:['TSAN' as const]}};
 const result=await trackerApi(new Request('https://app.test/api/reports/tracker?region=khao-lak'),nativeEnv,actor,p);expect(await result.json()).toMatchObject({writebackAvailable:true,writeAssurance:'best-effort'});expect(p.read).not.toHaveBeenCalled();
 const disabled=await trackerApi(new Request('https://app.test/api/reports/tracker?region=khao-lak'),{...nativeEnv,TRACKER_NATIVE_BEST_EFFORT_ENABLED:undefined},actor,p);expect(await disabled.json()).toMatchObject({writebackAvailable:false,writeAssurance:'held'});
 const input=new Request('https://app.test/api/reports/tracker?region=khao-lak',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'sync',TRACKER_NATIVE_BEST_EFFORT_ENABLED:'true'})});expect((await trackerApi(input,nativeEnv,actor,p)).status).toBe(400);
});
it('native flag-off prevents publication even with a custom proven snapshot',async()=>{const identity={hotel:'TSAN' as const,accountNo:'0002',invoiceNo:'00001',folio:'7'},calls=database([{id:'q',rowKey:'opaque-key',identity,field:'U',value:'2026-09-02',expected:null,state:'pending'}]),p=adapter();p.read=vi.fn(async()=>({...structuredClone(snapshot),rows:[{...snapshot.rows[0],...identity}],capabilities:{conditionalWrite:'proven' as const,writeAssurance:'best-effort' as const}}));await syncTracker({...env,REPORT_SHEET_KHAOLAK_ID:file},actor,actor,'khao-lak',p);expect(p.write).not.toHaveBeenCalled();expect(calls.find(c=>c.name==='ar_tracker_write_result')?.body.p_state).toBe('held');});
it('a native lost response remains read-only across later syncs until exact intended day is observed',async()=>{const identity={hotel:'TSAN' as const,accountNo:'0002',invoiceNo:'00001',folio:'7'},q={id:'q',rowKey:'opaque-key',identity,field:'U',value:'2026-09-02',expected:null,state:'pending'},calls=database([q]),p=adapter();let observed:string|null=null;p.read=vi.fn(async()=>({...structuredClone(snapshot),rows:[{...snapshot.rows[0],...identity,fields:{U:observed}}],capabilities:{conditionalWrite:'unverified' as const,writeAssurance:'best-effort' as const}}));p.write=vi.fn(async()=>({status:'uncertain' as const}));const nativeEnv={...env,REPORT_SHEET_KHAOLAK_ID:file,TRACKER_NATIVE_BEST_EFFORT_ENABLED:'true'};await syncTracker(nativeEnv,actor,actor,'khao-lak',p);q.state='uncertain';observed='2026-09-03';await syncTracker(nativeEnv,actor,actor,'khao-lak',p);expect(p.write).toHaveBeenCalledTimes(1);expect(calls.filter(c=>c.name==='ar_tracker_write_result').at(-1)?.body.p_state).toBe('uncertain');observed=q.value;await syncTracker(nativeEnv,actor,actor,'khao-lak',p);expect(p.write).toHaveBeenCalledTimes(1);expect(calls.filter(c=>c.name==='ar_tracker_write_result').at(-1)?.body.p_state).toBe('written');});
it('failure while arming a native batch never invokes the provider',async()=>{const identity={hotel:'TSAN' as const,accountNo:'0002',invoiceNo:'00001',folio:'7'},calls=database([{id:'q1',rowKey:'opaque-key',identity,field:'U',value:'2026-09-02',expected:null,state:'pending'},{id:'q2',rowKey:'opaque-key',identity,field:'V',value:'2026-09-03',expected:null,state:'pending'}]),fetch=globalThis.fetch;vi.stubGlobal('fetch',async(...args:Parameters<typeof fetch>)=>{const body=JSON.parse(String(args[1]?.body));if(String(args[0]).endsWith('ar_tracker_write_result')&&body.p_id==='q2')throw Error('synthetic arm RPC lost');return fetch(...args);});const p=adapter();p.read=vi.fn(async()=>({...structuredClone(snapshot),rows:[{...snapshot.rows[0],...identity}],capabilities:{conditionalWrite:'unverified' as const,writeAssurance:'best-effort' as const}}));p.writeBatch=vi.fn();await expect(syncTracker({...env,REPORT_SHEET_KHAOLAK_ID:file,TRACKER_NATIVE_BEST_EFFORT_ENABLED:'true'},actor,actor,'khao-lak',p)).rejects.toThrow();expect(p.writeBatch).not.toHaveBeenCalled();expect(p.write).not.toHaveBeenCalled();expect(calls.find(c=>c.name==='ar_tracker_write_result')?.body.p_state).toBe('uncertain');});
it.each(['identity','formula','invalid-field'] as const)('native unknown %s remains uncertain even when its observed date matches',async problem=>{const identity={hotel:'TSAN' as const,accountNo:'0002',invoiceNo:'00001',folio:'7'},calls=database([{id:'q',rowKey:'opaque-key',identity,field:'U',value:'2026-09-02',expected:null,state:'uncertain'}]),p=adapter();p.read=vi.fn(async()=>({...structuredClone(snapshot),rows:[{...snapshot.rows[0],...identity,invoiceNo:problem==='identity'?'OTHER':'00001',fields:{U:'2026-09-02'},formulaFields:problem==='formula'?['U' as const]:[],issues:problem==='invalid-field'?['U_invalid']:[]}],capabilities:{conditionalWrite:'unverified' as const,writeAssurance:'best-effort' as const}}));await syncTracker({...env,REPORT_SHEET_KHAOLAK_ID:file,TRACKER_NATIVE_BEST_EFFORT_ENABLED:'true'},actor,actor,'khao-lak',p);expect(calls.find(c=>c.name==='ar_tracker_write_result')?.body.p_state).toBe('uncertain');expect(p.write).not.toHaveBeenCalled();});
