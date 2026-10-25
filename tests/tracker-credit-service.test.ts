import {afterEach,expect,it,vi} from 'vitest';
import {syncTracker,type ProviderSnapshot,type TrackerAdapter,type TrackerEnv} from '../worker/tracker-sync/service';
const actor='00000000-0000-4000-8000-000000000001',file='synthetic_credit_tracker_12345';
const env:TrackerEnv={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',REPORT_SHEET_KHAOLAK_ID:file,TRACKER_NATIVE_BEST_EFFORT_ENABLED:'true',TRACKER_CREDIT_FILL_ENABLED:'true'};
const identity={hotel:'TSAN' as const,accountNo:'0002',invoiceNo:'00001',folio:'7',transactionDate:'2026-09-01'};
const base:ProviderSnapshot={version:'observed-1',schemaFingerprint:'headers1',capabilities:{conditionalWrite:'unverified',writeAssurance:'best-effort'},rows:[{...identity,rowKey:'row-a',fields:{R:null,S:null,U:null},locator:{rowIndex:2}}]};
const job={id:'credit-1',rowKey:'row-a',identity,locator:{rowIndex:2},value:'30',state:'pending'};
afterEach(()=>vi.unstubAllGlobals());
function harness(options:{jobs?:unknown[];snapshot?:ProviderSnapshot;freezeState?:string;outcome?:'written'|'conflict'|'uncertain';outcomeVersion?:string;throwWrite?:boolean;persistJobState?:boolean}={}){
 const calls:{name:string;body:Record<string,unknown>}[]=[],events:string[]=[],current=structuredClone(options.snapshot??base),receipts=new Map<string,string>();
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{const name=String(input).split('/').at(-1)!,body=JSON.parse(String(init.body));calls.push({name,body});events.push(name);
  if(name==='ar_tracker_claim')return Response.json({status:'claimed',fileId:file});
  // SQL may create another pending fill on a blank observation after a
  // terminal conflict; unresolved uncertain commands must retain their fence.
  if(name==='ar_tracker_snapshot'&&options.persistJobState&&receipts.get(job.id)==='conflict')receipts.set(job.id,'pending');
  if(name==='ar_tracker_credit_jobs')return Response.json(options.persistJobState?[{...job,state:receipts.get(job.id)??job.state}].filter(j=>['pending','uncertain'].includes(j.state)):options.jobs??[job]);
  if(name==='ar_tracker_credit_result'){const state=body.p_state==='uncertain'?options.freezeState??'uncertain':String(body.p_state);receipts.set(String(body.p_id),state);return Response.json({state});}
  if(name==='ar_tracker_outbox')return Response.json([]);return Response.json({});
 });
 const adapter:TrackerAdapter={read:vi.fn(async()=>{events.push('read');return structuredClone(current);}),write:vi.fn(async()=>{throw Error('batch required');}),writeBatch:vi.fn(async(_env,_owner,_region,_file,inputs)=>{
  events.push('write');expect(calls.filter(c=>c.name==='ar_tracker_credit_result').slice(-inputs.length).map(c=>c.body.p_state)).toEqual(inputs.map(()=> 'uncertain'));
  if(options.throwWrite)throw Error('synthetic lost reply');
  if((options.outcome??'written')==='written'){for(const input of inputs){current.rows.find(r=>r.rowKey===input.rowKey)!.fields.S=input.changes[0].value;}current.version='observed-2';}
  return {status:options.outcome??'written',version:options.outcomeVersion??(options.outcome==='conflict'?undefined:current.version)};
 })};
 return {calls,events,adapter,run:(overrides:Partial<TrackerEnv>={})=>syncTracker({...env,...overrides},actor,actor,'khao-lak',adapter)};
}
it('fills only S after membership, freezes before one batch, and republishes readback before date selection',async()=>{
 const state=harness();await state.run();
 expect(state.adapter.writeBatch).toHaveBeenCalledTimes(1);
 expect(vi.mocked(state.adapter.writeBatch!).mock.calls[0][4]).toEqual([{version:'observed-1',rowKey:'row-a',expectedIdentity:identity,locator:{rowIndex:2},changes:[{field:'S',value:'30',expected:null}]}]);
 expect(state.events).toEqual(['ar_tracker_claim','read','ar_tracker_snapshot','ar_tracker_membership','ar_tracker_credit_jobs','ar_tracker_credit_result','write','ar_tracker_credit_result','read','ar_tracker_snapshot','ar_tracker_membership','ar_tracker_outbox','ar_tracker_finish']);
 expect(state.calls.filter(c=>c.name==='ar_tracker_credit_result').map(c=>c.body.p_state)).toEqual(['uncertain','written']);
 expect(state.calls.filter(c=>c.name==='ar_tracker_snapshot').at(-1)?.body).toMatchObject({p_rows:[{fields:{S:'30',R:null,U:null}}]});
 expect(state.calls.find(c=>c.name==='ar_tracker_finish')?.body.p_version).toBe('observed-2');
});
it('keeps the feature disabled by default without credit RPCs or extra provider reads',async()=>{
 const state=harness();await state.run({TRACKER_CREDIT_FILL_ENABLED:undefined});expect(state.calls.some(c=>c.name.startsWith('ar_tracker_credit'))).toBe(false);expect(state.adapter.read).toHaveBeenCalledTimes(1);
});
it.each([null,'30','45'])('uncertain credit intents reconcile S=%s by readback only',async term=>{
 const snapshot=structuredClone(base);snapshot.rows[0].fields.S=term;const state=harness({snapshot,jobs:[{...job,state:'uncertain'}]});await state.run();
 expect(state.adapter.writeBatch).not.toHaveBeenCalled();expect(state.adapter.read).toHaveBeenCalledTimes(1);
 expect(state.calls.filter(c=>c.name==='ar_tracker_credit_result').map(c=>c.body.p_state)).toEqual([term==='30'?'written':'uncertain']);
});
it.each(['employee','formula','metadata','identity','issue','held'] as const)('does not write a %s-held row',async reason=>{
 const snapshot=structuredClone(base),row=snapshot.rows[0];
 if(reason==='employee')row.fields.S='45';if(reason==='formula')row.formulaFields=['S'];if(reason==='metadata')row.blockedWriteFields=['S'];if(reason==='identity')row.accountNo='other';if(reason==='issue')row.issues=['S_invalid'];if(reason==='held')snapshot.capabilities.writeAssurance='held';
 const state=harness({snapshot});await state.run();expect(state.adapter.writeBatch).not.toHaveBeenCalled();expect(state.adapter.read).toHaveBeenCalledTimes(1);
 expect(state.calls.filter(c=>c.name==='ar_tracker_credit_result').at(-1)?.body.p_state).toBe(['formula','metadata','issue','held'].includes(reason)?'held':'conflict');
});
it('requires a durable uncertain receipt before any provider mutation',async()=>{
 const state=harness({freezeState:'held'});await expect(state.run()).rejects.toThrow('tracker_intent_not_confirmed');expect(state.adapter.writeBatch).not.toHaveBeenCalled();
});
it('holds duplicate complete corroborating tuples even with two nonblank Accounts',async()=>{
 const snapshot=structuredClone(base);snapshot.rows.push({...structuredClone(snapshot.rows[0]),rowKey:'other-row',accountNo:'other-account'});
 const state=harness({snapshot});await state.run();expect(state.adapter.writeBatch).not.toHaveBeenCalled();
 expect(state.calls.find(c=>c.name==='ar_tracker_snapshot')?.body).toMatchObject({p_rows:[{ambiguous:true},{ambiguous:true}]});
});
it.each(['uncertain','conflict','throw'] as const)('does not blindly retry %s outcomes and refreshes possible provider changes',async outcome=>{
 const state=harness({outcome:outcome==='throw'?undefined:outcome,throwWrite:outcome==='throw'});await state.run();
 expect(state.adapter.writeBatch).toHaveBeenCalledTimes(1);expect(state.adapter.read).toHaveBeenCalledTimes(outcome==='conflict'?1:2);
 expect(state.calls.filter(c=>c.name==='ar_tracker_credit_result').at(-1)?.body.p_state).toBe(outcome==='conflict'?'conflict':'uncertain');
});
it('rejects more than twenty credit jobs without touching a provider',async()=>{
 const state=harness({jobs:Array.from({length:21},(_,i)=>({...job,id:'credit-'+i}))});await expect(state.run()).rejects.toThrow('tracker_credit_invalid');expect(state.adapter.writeBatch).not.toHaveBeenCalled();
});
it.each(['-1','3651','1.5','2026-10-25'])('rejects invalid credit term %s without a write',async value=>{
 const state=harness({jobs:[{...job,value}]});await state.run();expect(state.adapter.writeBatch).not.toHaveBeenCalled();expect(state.calls.filter(c=>c.name==='ar_tracker_credit_result').at(-1)?.body.p_state).toBe('held');
});
it('publishes twenty independent S fills in one batch without mutating snapshot metadata',async()=>{
 const snapshot=structuredClone(base);snapshot.rows=Array.from({length:20},(_,i)=>({...structuredClone(base.rows[0]),invoiceNo:'inv-'+i,folio:'folio-'+i,rowKey:'row-'+i}));
 const before=structuredClone(snapshot),jobs=snapshot.rows.map((row,i)=>({...job,id:'credit-'+i,rowKey:row.rowKey,identity:{...identity,invoiceNo:row.invoiceNo,folio:row.folio},locator:row.locator}));
 const state=harness({snapshot,jobs});await state.run();expect(state.adapter.writeBatch).toHaveBeenCalledTimes(1);expect(vi.mocked(state.adapter.writeBatch!).mock.calls[0][4]).toHaveLength(20);expect(snapshot).toEqual(before);
});
it('never publishes a pending command beside an unresolved uncertain command for the same row',async()=>{
 const state=harness({jobs:[{...job,id:'older-credit',state:'uncertain'},job]});await state.run();expect(state.adapter.writeBatch).not.toHaveBeenCalled();
});
it('does not read again when the credit journal is empty',async()=>{
 const state=harness({jobs:[]});await state.run();expect(state.adapter.read).toHaveBeenCalledTimes(1);expect(state.adapter.writeBatch).not.toHaveBeenCalled();
});
it('refreshes a CAS conflict carrying a post-upload observation before selecting date commands',async()=>{
 const state=harness({outcome:'conflict',outcomeVersion:'observed-after-upload'});await state.run();expect(state.adapter.read).toHaveBeenCalledTimes(2);
 expect(state.calls.filter(c=>c.name==='ar_tracker_credit_result').map(c=>c.body.p_state)).toEqual(['uncertain','uncertain']);
});
it('a post-upload CAS mismatch with blank S remains readback-only across later syncs',async()=>{
 const state=harness({outcome:'conflict',outcomeVersion:'observed-after-upload',persistJobState:true});
 await state.run();await state.run();await state.run();
 expect(state.adapter.writeBatch).toHaveBeenCalledTimes(1);
 expect(state.calls.filter(c=>c.name==='ar_tracker_credit_result').map(c=>c.body.p_state)).toEqual(['uncertain','uncertain','uncertain','uncertain']);
 expect(state.calls.filter(c=>c.name==='ar_tracker_snapshot').every(c=>(c.body.p_rows as {fields:{S:string|null}}[])[0].fields.S===null)).toBe(true);
});
it('freezes XLSX intents before its CAS upload and leaves lost replies readback only',async()=>{
 const snapshot={...structuredClone(base),capabilities:{conditionalWrite:'proven' as const,writeAssurance:'cas' as const}},state=harness({snapshot,outcome:'uncertain'});
 await syncTracker({...env,REPORT_SHEET_PHUKET_ID:file,TRACKER_BLOB_CAS_ENABLED:'true'},actor,actor,'phuket',state.adapter);
 expect(state.adapter.writeBatch).toHaveBeenCalledTimes(1);expect(state.calls.filter(c=>c.name==='ar_tracker_credit_result').map(c=>c.body.p_state)).toEqual(['uncertain','uncertain']);
});
