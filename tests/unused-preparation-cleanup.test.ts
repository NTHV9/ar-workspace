import {beforeEach,expect,it,vi} from 'vitest';
import type {WorkflowEvent,WorkflowStep} from 'cloudflare:workers';
import type {RefreshParams} from '../worker/refresh/backend';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),cleanup:vi.fn(),generate:vi.fn(),acceptance:vi.fn()}));
vi.mock('cloudflare:workers',()=>({WorkflowEntrypoint:class {env:unknown;constructor(_context:unknown,env:unknown){this.env=env;}}}));
vi.mock('../worker/refresh/backend',()=>({backendRpc:mocks.rpc}));
vi.mock('../worker/operations/retention-sweep',()=>({cleanupTransientDocument:mocks.cleanup}));
vi.mock('../worker/documents/jobs',()=>({runDocumentJob:mocks.generate,uuidPattern:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/}));
vi.mock('../worker/acceptance/context',()=>({acceptanceEnvironment:mocks.acceptance}));
import {ArDocumentWorkflow} from '../worker/documents/workflow';
const id='00000000-0000-4000-8000-000000000101',actor='00000000-0000-4000-8000-000000000001';
const env={RETENTION_ENABLED:'true'},payload={runId:id,hotel:'KAT',unusedPreparationCleanup:true};
const job=()=>({id,hotel:'KAT',owner:actor,retired:true,closed_reason:'discarded',closed_at:'2026-10-25T12:00:00Z'});
const stepCalls:unknown[][]=[];
const step={do:async(...args:unknown[])=>{stepCalls.push(args.slice(0,-1));return (args.at(-1) as ()=>Promise<unknown>)();}} as unknown as WorkflowStep;
function run(input:unknown=payload,runtime=env){return new ArDocumentWorkflow({} as ExecutionContext,runtime).run({payload:input} as WorkflowEvent<RefreshParams>,step);}
beforeEach(()=>{
 vi.clearAllMocks();stepCalls.length=0;
 mocks.rpc.mockImplementation(async(_env:unknown,name:string)=>name==='ar_financial_service_actor'?actor:job());
 mocks.cleanup.mockResolvedValue({enabled:true,checked:0,deleted:0,errors:0});
});
it('runs exact retired-job cleanup through the dedicated document Workflow without generation or acceptance routing',async()=>{
 mocks.cleanup.mockResolvedValueOnce({enabled:true,checked:3,deleted:3,errors:0});
 expect(await run()).toMatchObject({status:'complete',jobId:id,passes:2,checked:3,deleted:3,errors:0});
 expect(mocks.rpc.mock.calls.map(c=>[c[1],c[2]])).toEqual([['ar_financial_service_actor',{}],['ar_document_get',{p_job_id:id}]]);
 expect(mocks.cleanup).toHaveBeenCalledTimes(2);expect(mocks.cleanup).toHaveBeenCalledWith(env,actor,id);
 expect(mocks.generate).not.toHaveBeenCalled();expect(mocks.acceptance).not.toHaveBeenCalled();
 for(const call of stepCalls)expect(call[1]).toMatchObject({retries:{limit:0}});
});
it.each([{actorId:actor},{owner:actor},{url:'https://example.test'},{key:'jobs/arbitrary'},{acceptanceId:id},{documentJob:true},{passes:999},{unusedPreparationCleanup:false,documentJob:true}])('rejects caller-controlled authority/routing/bounds %j before reads',async extra=>{
 await expect(run({...payload,...extra})).rejects.toThrow('document_request_invalid');expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.cleanup).not.toHaveBeenCalled();expect(mocks.generate).not.toHaveBeenCalled();
});
it.each([{runId:'invalid'},{hotel:'UNKNOWN'},{runId:null}])('rejects malformed exact-job scope %j',async extra=>{
 await expect(run({...payload,...extra})).rejects.toThrow('document_request_invalid');expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([{owner:'00000000-0000-4000-8000-000000000002'},{retired:false},{retired:undefined},{hotel:'TSK'},{id:'00000000-0000-4000-8000-000000000102'},{closed_reason:'sent'},{closed_at:null}])('preserves forged/unretired/wrong-scope jobs %j',async extra=>{
 mocks.rpc.mockImplementation(async(_env:unknown,name:string)=>name==='ar_financial_service_actor'?actor:{...job(),...extra});
 await expect(run()).rejects.toThrow('document_forbidden');expect(mocks.cleanup).not.toHaveBeenCalled();expect(mocks.generate).not.toHaveBeenCalled();
});
it('rejects an absent canonical service owner',async()=>{
 mocks.rpc.mockResolvedValue(null);await expect(run()).rejects.toThrow('document_forbidden');expect(mocks.cleanup).not.toHaveBeenCalled();
});
it('bounds one job to eight ten-object maintenance passes',async()=>{
 mocks.cleanup.mockResolvedValue({enabled:true,checked:10,deleted:10,errors:0});
 expect(await run()).toMatchObject({status:'bounded',passes:8,checked:80,deleted:80});expect(mocks.cleanup).toHaveBeenCalledTimes(8);expect(mocks.generate).not.toHaveBeenCalled();
});
it.each([{checked:0,deleted:0,errors:1},{checked:10,deleted:0,errors:0},{checked:10,deleted:9,errors:0}])('stops on errors, no progress or any blocked/uncertain item %j',async result=>{
 mocks.cleanup.mockResolvedValue({enabled:true,...result});expect(await run()).toMatchObject({status:'attention',passes:1,...result});expect(mocks.cleanup).toHaveBeenCalledTimes(1);expect(mocks.generate).not.toHaveBeenCalled();
});
it('honors a write hold and disabled retention without work',async()=>{
 expect(await run(payload,{...env,OPERATIONS_WRITE_HOLD:'true'} as typeof env)).toMatchObject({status:'paused',passes:0});expect(mocks.rpc).not.toHaveBeenCalled();
 expect(await run(payload,{RETENTION_ENABLED:'false'})).toMatchObject({status:'paused',passes:0});expect(mocks.cleanup).not.toHaveBeenCalled();
});
it('stops if maintenance becomes disabled after admission',async()=>{
 mocks.cleanup.mockResolvedValue({enabled:false});expect(await run()).toMatchObject({status:'paused',passes:1});expect(mocks.cleanup).toHaveBeenCalledTimes(1);
});
it.each([{enabled:true},{enabled:true,checked:11,deleted:11,errors:0}])('does not accept malformed counts as verified deletion %j',async result=>{
 mocks.cleanup.mockResolvedValue(result);await expect(run()).rejects.toThrow('document_cleanup_invalid');
});
it('preserves the ordinary generation path',async()=>{
 mocks.generate.mockResolvedValue({state:'ready'});expect(await run({runId:id,hotel:'KAT',documentJob:true})).toEqual({state:'ready'});expect(mocks.generate).toHaveBeenCalledWith(env,id,step);expect(mocks.cleanup).not.toHaveBeenCalled();
});
