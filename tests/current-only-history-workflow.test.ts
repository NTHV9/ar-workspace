import {afterEach,expect,it,vi} from 'vitest';
import type {WorkflowEvent,WorkflowStep} from 'cloudflare:workers';
import type {RefreshParams} from '../worker/refresh/backend';
vi.mock('cloudflare:workers',()=>({WorkflowEntrypoint:class {env:unknown;constructor(_context:unknown,env:unknown){this.env=env;}}}));
import {ArFinancialWorkflow} from '../worker/financial/workflow';
import {ArRefreshWorkflow} from '../worker/refresh/workflow';
afterEach(()=>vi.unstubAllGlobals());
it.each([ArFinancialWorkflow,ArRefreshWorkflow])('retired queued history Workflow performs no provider reads or database writes',async Workflow=>{
 const fetcher=vi.fn(async()=>Response.json({status:'failed'}));vi.stubGlobal('fetch',fetcher);
 const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',FINANCIAL_HISTORY_ENABLED:'true',FINANCIAL_HISTORY_DATE_FILTER_PROOF:'verified:legacy'},id='00000000-0000-4000-8000-000000000001';
 const workflow=new Workflow({} as ExecutionContext,env);
 const event={payload:{runId:id,actorId:id,hotel:'KAT',financialHistory:true}} as WorkflowEvent<RefreshParams>;
 const step={do:async(_name:string,...args:unknown[])=>(args.at(-1) as ()=>Promise<unknown>)()} as unknown as WorkflowStep;
 expect(await workflow.run(event,step)).toMatchObject({status:'retired'});expect(fetcher).not.toHaveBeenCalled();
});
