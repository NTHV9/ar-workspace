import {afterEach,expect,it,vi} from 'vitest';
import worker,{handleApi} from '../worker/index';
import {requestMailReconcile,runMailReconcile} from '../worker/email/reconcile';
const mocked=vi.hoisted(()=>({check:vi.fn(),send:vi.fn(),draft:vi.fn()}));
vi.mock('../worker/email/delivery',()=>({checkDelivery:mocked.check,deliverMessage:mocked.send,sendDiagnostic:mocked.draft,deliveryView:vi.fn()}));
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'synthetic',GMAIL_RECONCILE_ENABLED:'true'};
it('cron and manual request share an existing run and never create a second workflow',async()=>{const create=vi.fn();vi.stubGlobal('fetch',async()=>Response.json({id:'run',created:false,state:'running'}));expect(await requestMailReconcile({...env,AR_REFRESH:{create,get:vi.fn()}},'manual')).toMatchObject({created:false});expect(create).not.toHaveBeenCalled();});
it('a Gmail cron never starts an OPERA refresh or sends email',async()=>{const calls:string[]=[];vi.stubGlobal('fetch',async(url:string)=>{calls.push(url);return Response.json({id:'run',created:true,state:'complete'});});await worker.scheduled({cron:'*/15 * * * *'},{...env,OPERA_REFRESH_ENABLED:'true'});expect(calls.map(c=>c.split('/').at(-1))).toEqual(['ar_mail_reconcile_request','ar_period_summary_plan']);expect(mocked.send).not.toHaveBeenCalled();expect(mocked.draft).not.toHaveBeenCalled();});
it('the read-only workflow checks exact claimed IDs and records outcomes',async()=>{const finish:any[]=[];vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{if(url.endsWith('/ar_mail_reconcile_guard'))return Response.json(true);if(url.endsWith('/ar_mail_reconcile_get'))return Response.json({state:'running',lease_until:new Date(Date.now()+600000).toISOString(),deliveries:[{id:'one',owner:'allowed'},{id:'two',owner:'allowed'}]});finish.push(JSON.parse(String(init.body)));return Response.json(true);});mocked.check.mockResolvedValueOnce({state:'sent'}).mockRejectedValueOnce(Error('provider unavailable'));const step={do:async(_name:string,...args:any[])=>args.at(-1)()};expect(await runMailReconcile(env,'run',step as never)).toMatchObject({checked:2,verified:1,unavailable:1});expect(mocked.check.mock.calls.map(c=>c.slice(1))).toEqual([['allowed','one'],['allowed','two']]);expect(finish[0]).toMatchObject({p_checked:2,p_verified:1,p_unavailable:1});expect(mocked.send).not.toHaveBeenCalled();});
it('anonymous queue and reconciliation access is denied',async()=>{for(const path of ['/api/collection-queue','/api/mail-reconciliation'])expect((await handleApi(new Request('https://app.test'+path),{})).status).toBe(401);});

it('an expired batch never starts another delivery verification',async()=>{vi.stubGlobal('fetch',async(url:string)=>Response.json(url.endsWith('/ar_mail_reconcile_get')?{state:'running',lease_until:new Date(Date.now()+600000).toISOString(),deliveries:[{id:'one',owner:'allowed'}]}:url.endsWith('/ar_mail_reconcile_guard')?false:true));const step={do:async(_name:string,...args:any[])=>args.at(-1)()};expect(await runMailReconcile(env,'run',step as never)).toMatchObject({checked:0});expect(mocked.check).not.toHaveBeenCalled();});

const serviceActor='00000000-0000-4000-8000-000000000001';
function maintenanceHarness(failing: string[]=[]){
 const calls:{name:string;args:Record<string,unknown>}[]=[];
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{
  const request=input instanceof Request?input:new Request(input,init),name=new URL(request.url).pathname.split('/').at(-1)!;
  calls.push({name,args:JSON.parse(await request.text())});
  if(failing.includes(name))throw Error('synthetic private upstream failure');
  if(name==='ar_period_summary_plan')return Response.json({actor:serviceActor,tasks:[]});
  if(name==='ar_mail_reconcile_request')return Response.json({id:'run',created:false,state:'complete'});
  if(name==='ar_financial_service_actor')return Response.json(serviceActor);
  if(name==='ar_document_pending_uploads'||name==='ar_document_cleanup_candidates')return Response.json([]);
  if(name==='ar_financial_log_prune')return Response.json({status:'succeeded',deleted:1000,moreEligible:true,retentionMonths:1,checkedAt:'2026-09-15T09:00:00Z'});
  if(name==='ar_request_refresh')return Response.json({status:'succeeded',created:false});
  throw Error('Unexpected synthetic RPC');
 });
 return calls;
}
const maintenanceEnv={...env,RETENTION_ENABLED:'true',FINANCIAL_LOG_RETENTION_ENABLED:'true'};

it.each([
 ['Gmail',['ar_mail_reconcile_request']],
 ['file cleanup',['ar_document_pending_uploads']],
 ['Gmail and file cleanup',['ar_mail_reconcile_request','ar_document_pending_uploads']],
] as const)('prunes one financial log batch when %s fails',async(_label,failing)=>{
 const calls=maintenanceHarness([...failing]);
 await expect(worker.scheduled({cron:'*/15 * * * *'},maintenanceEnv)).resolves.toBeUndefined();
 expect(calls.filter(c=>c.name==='ar_financial_log_prune')).toEqual([{name:'ar_financial_log_prune',args:{p_actor:serviceActor,p_limit:1000}}]);
 expect(calls.some(c=>c.name==='ar_mail_reconcile_request')).toBe(true);
 expect(calls.some(c=>c.name==='ar_document_pending_uploads')).toBe(true);
 expect(calls.some(c=>c.name==='ar_request_refresh')).toBe(false);
 expect(mocked.send).not.toHaveBeenCalled();expect(mocked.draft).not.toHaveBeenCalled();
});

it('keeps Gmail and document maintenance running when financial pruning fails',async()=>{
 const calls=maintenanceHarness(['ar_financial_log_prune']);
 await expect(worker.scheduled({cron:'*/15 * * * *'},maintenanceEnv)).resolves.toBeUndefined();
 expect(calls.filter(c=>c.name==='ar_financial_log_prune')).toHaveLength(1);
 expect(calls.some(c=>c.name==='ar_mail_reconcile_request')).toBe(true);
 expect(calls.some(c=>c.name==='ar_document_cleanup_candidates')).toBe(true);
});

it('financial log maintenance runs independently when Gmail and file cleanup are disabled',async()=>{
 const calls=maintenanceHarness();
 await worker.scheduled({cron:'*/15 * * * *'},{...maintenanceEnv,GMAIL_RECONCILE_ENABLED:'false',RETENTION_ENABLED:'false'});
 expect(calls.map(c=>c.name)).toEqual(['ar_financial_service_actor','ar_period_summary_plan','ar_financial_log_prune']);
});

it('write hold prevents every scheduled maintenance request',async()=>{
 const calls=maintenanceHarness();
 await worker.scheduled({cron:'*/15 * * * *'},{...maintenanceEnv,OPERATIONS_WRITE_HOLD:'true'});
 expect(calls).toEqual([]);
});

it('financial pruning never runs on the twice-daily OPERA refresh schedule',async()=>{
 const calls=maintenanceHarness();
 await worker.scheduled({cron:'0 0,12 * * *'},{...maintenanceEnv,OPERA_REFRESH_ENABLED:'true',OPERA_HOTEL_IDS:'KAT,TSK',OPERA_CLIENT_ID:'synthetic',OPERA_CLIENT_SECRET:'synthetic',OPERA_APP_KEY:'synthetic',AR_REFRESH:{create:vi.fn(),get:vi.fn()}});
 expect(calls).toEqual([
  {name:'ar_request_refresh',args:{p_hotel:'KAT',p_account_id:null,p_reason:'scheduled',p_stale_minutes:30}},
  {name:'ar_request_refresh',args:{p_hotel:'TSK',p_account_id:null,p_reason:'scheduled',p_stale_minutes:30}},
 ]);
});
