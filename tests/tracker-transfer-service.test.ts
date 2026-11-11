import {afterEach,expect,it,vi} from 'vitest';
import {syncAccountTransfers} from '../worker/tracker-sync/transfers';
import {backendRpc} from '../worker/refresh/backend';
import type {ProviderSnapshot,TrackerAdapter,TrackerEnv} from '../worker/tracker-sync/service';
import type {TransferWrite} from '../worker/tracker-sync/transfer-model';
vi.mock('../worker/refresh/backend',()=>({backendRpc:vi.fn()}));
const input:TransferWrite={version:'before',rowKey:'KT|OLD|I:17|1',expectedIdentity:{hotel:'KAT',accountNo:'A',invoiceNo:'17',folio:'3',transactionDate:'2026-11-01'},expectedAgent:'OLD',agent:'NEW',accountNo:'B',newRowKey:'KT|NEW|I:17|1'};
function harness(state:'pending'|'uncertain'='pending'){
 const env:TrackerEnv={TRACKER_TRANSFER_IDENTITY_ENABLED:'true'},receipt={state:state as string},events:string[]=[];
 const snapshot:ProviderSnapshot={version:'before',schemaFingerprint:'schema',capabilities:{conditionalWrite:'proven'},rows:[{...input.expectedIdentity,rowKey:input.rowKey,hotel:'KAT',agent:'OLD',property:'KT',folio:'3',fields:{R:'2026-11-02',U:null},locator:{row:3}}]};
 const rpc=vi.mocked(backendRpc);rpc.mockImplementation(async(_env,name,args)=>{
  events.push(name+':'+(args.p_state??''));
  if(name==='ar_tracker_transfer_jobs')return [{id:'job',state:receipt.state,write:input}] as never;
  if(name==='ar_tracker_transfer_result'){if(args.p_state!=='defer')receipt.state=String(args.p_state);return {state:receipt.state} as never;}
  throw Error('Unexpected RPC');
 });
 const write=vi.fn(async()=>{
  events.push('provider');
  const row=snapshot.rows[0];row.rowKey=input.newRowKey;row.accountNo='B';row.agent='NEW';
  return {status:'written' as const,mutationStarted:true,version:'after'};
 });
 const adapter={writeTransfers:write} as unknown as TrackerAdapter;
 const run=()=>syncAccountTransfers(env,'actor','owner','phuket','lease','file',adapter,snapshot);
 return {env,receipt,events,snapshot,write,run};
}
afterEach(()=>vi.clearAllMocks());
it('durably admits before one provider mutation and writes only identity values',async()=>{
 const h=harness();expect(await h.run()).toEqual({changed:true});
 expect(h.events).toEqual(['ar_tracker_transfer_jobs:','ar_tracker_transfer_result:uncertain','provider','ar_tracker_transfer_result:written']);
 expect(h.snapshot.rows[0].fields).toEqual({R:'2026-11-02',U:null});
 expect(h.write).toHaveBeenCalledOnce();
 expect(h.write.mock.calls[0]).toHaveLength(5);
});
it('a lost reply remains readback-only across retry',async()=>{
 const h=harness();h.write.mockImplementationOnce(async()=>{throw Error('lost');});
 await h.run();expect(h.receipt.state).toBe('uncertain');
 await h.run();expect(h.write).toHaveBeenCalledOnce();
 h.snapshot.rows[0]={...h.snapshot.rows[0],rowKey:input.newRowKey,accountNo:'B',agent:'NEW'};
 h.snapshot.transferGroupsCorrect=false;await h.run();expect(h.receipt.state).toBe('uncertain');
 h.snapshot.transferGroupsCorrect=true;await h.run();expect(h.receipt.state).toBe('written');expect(h.write).toHaveBeenCalledOnce();
});
it('requires a confirmed durable intent before mutation',async()=>{
 const h=harness();vi.mocked(backendRpc).mockImplementation(async(_env,name)=>name==='ar_tracker_transfer_jobs'?[{id:'job',state:'pending',write:input}] as never:{state:'cancelled'} as never);
 expect(await h.run()).toEqual({changed:false});expect(h.write).not.toHaveBeenCalled();
});
it('keeps the feature disabled by default',async()=>{
 const h=harness();delete h.env.TRACKER_TRANSFER_IDENTITY_ENABLED;
 await h.run();expect(backendRpc).not.toHaveBeenCalled();expect(h.write).not.toHaveBeenCalled();
});
it('holds a changed Agent or a duplicate complete tuple',async()=>{
 const h=harness();h.snapshot.rows[0].agent='STAFF EDIT';
 await h.run();expect(h.write).not.toHaveBeenCalled();
 h.snapshot.rows[0].agent='OLD';h.snapshot.rows.push({...h.snapshot.rows[0],rowKey:'other',accountNo:'C'});
 await h.run();expect(h.write).not.toHaveBeenCalled();
});
