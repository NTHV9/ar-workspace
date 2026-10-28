import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {backendRpc} from '../worker/refresh/backend';
import {syncTracker,type ProviderSnapshot,type TrackerAdapter,type TrackerEnv} from '../worker/tracker-sync/service';
import type {SentAppendCandidate,SentAppendPlan,SentAppendResult} from '../worker/tracker-sync/append';
vi.mock('../worker/refresh/backend',()=>({backendRpc:vi.fn()}));
const env:TrackerEnv={TRACKER_SENT_ROW_APPEND_ENABLED:'true',REFRESH_STALE_MINUTES:'5',REPORT_SHEET_PHUKET_ID:'synthetic-freshness-tracker'};
const currentBase:ProviderSnapshot={version:'v1',schemaFingerprint:'synthetic-schema',capabilities:{conditionalWrite:'proven'},rows:[{hotel:'KAT',accountNo:'A1',agent:'SYNTHETIC',property:'KT',invoiceNo:'10',folio:'F10',transactionDate:'2026-10-25',rowKey:'existing',fields:{R:null,S:'30'},locator:{}}]};
const source:SentAppendCandidate={id:'append-job',state:'pending',hotel:'KAT',accountId:'a',invoiceId:'new',invoiceNo:'11',folio:'F11',sourceHash:'a'.repeat(64),desiredDates:{R:'2026-10-28',U:null,V:null,W:null},sourceRow:{accountNo:'A1',accountName:'SYNTHETIC',guest:null,transactionDate:'2026-10-27',open:'100.00',aging:['100.00','0.00','0.00','0.00','0.00','0.00'],age:1,agingLabel:'0-30',agingStatus:'synthetic',businessDate:'2026-10-28',creditTerm:30,billingRequired:true,sourceAt:'2026-10-28T00:00:00Z'}};
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-28T00:01:00Z'));});
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
function harness(result:SentAppendResult,failRead=false){
 const calls:{name:string;body:Record<string,unknown>}[]=[],current=structuredClone(currentBase);let prepared:SentAppendCandidate|undefined;let reads=0;
 vi.mocked(backendRpc).mockImplementation(async(_env,name,body)=>{
  calls.push({name,body});if(name==='ar_tracker_claim')return {status:'claimed',fileId:env.REPORT_SHEET_PHUKET_ID};
  if(name==='ar_tracker_append_candidates')return {jobs:[structuredClone(source)],total:1};
  if(name==='ar_tracker_append_prepare'){prepared={...structuredClone(source),plan:body.p_plan as SentAppendPlan,planHash:'b'.repeat(64)};return prepared;}
  if(name==='ar_tracker_append_begin')return {...prepared,state:'writing',readbackOnly:false};
  if(name==='ar_tracker_outbox')return [{id:'date-q',rowKey:'existing',identity:{hotel:'KAT',accountNo:'A1',invoiceNo:'10',folio:'F10',transactionDate:'2026-10-25'},locator:{},field:'R',value:'2026-10-28',expected:null,state:'pending'}];
  return {};
 });
 const adapter:TrackerAdapter={
  read:vi.fn(async()=>{if(++reads>1&&failRead)throw Error('synthetic reread unavailable');return structuredClone(current);}),
  appendSentRow:vi.fn(async()=>{if(result.mutationStarted||result.version==='v2')current.version='v2';return result;}),
  write:vi.fn(async()=>{throw Error('batch expected');}),
  writeBatch:vi.fn(async(_env,_owner,_region,_file,inputs)=>{expect(inputs[0].version).toBe(current.version);return {status:'written' as const,version:'v3'};}),
 };
 return {adapter,calls,run:()=>syncTracker(env,'actor','owner','phuket',adapter)};
}
it.each([
 {status:'uncertain',mutationStarted:true},
 {status:'uncertain',mutationStarted:true,retrySafe:true,rejectedStatus:412},
 {status:'conflict',mutationStarted:false,version:'v2'},
] satisfies SentAppendResult[])('rereads a possibly changed append before selecting ordinary dates (%j)',async result=>{
 const h=harness(result);await h.run();expect(h.adapter.appendSentRow).toHaveBeenCalledOnce();expect(h.adapter.writeBatch).toHaveBeenCalledOnce();
 expect(vi.mocked(h.adapter.writeBatch!).mock.calls[0][4][0].version).toBe('v2');
 expect(h.calls.filter(c=>c.name==='ar_tracker_snapshot').at(-1)?.body.p_rows).toEqual(currentBase.rows.map(r=>({...r,ambiguous:false,fieldHolds:[],holdReason:null})));
 expect(h.calls.find(c=>c.name==='ar_tracker_append_finish')?.body.p_state).not.toBe('written');
});
it('stops before date publication when a possibly committed append cannot be reread',async()=>{
 const h=harness({status:'uncertain',mutationStarted:true},true);await expect(h.run()).rejects.toThrow('synthetic reread unavailable');
 expect(h.adapter.appendSentRow).toHaveBeenCalledOnce();expect(h.adapter.writeBatch).not.toHaveBeenCalled();
 expect(h.calls.find(c=>c.name==='ar_tracker_append_finish')?.body.p_state).toBe('uncertain');
});
it('does not add rereads when no mutation or new provider version was observed',async()=>{
 const h=harness({status:'uncertain',mutationStarted:false});await h.run();expect(h.adapter.read).toHaveBeenCalledOnce();expect(vi.mocked(h.adapter.writeBatch!).mock.calls[0][4][0].version).toBe('v1');
});
