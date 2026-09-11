import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),status:vi.fn(),enroll:vi.fn(),run:vi.fn(),providers:vi.fn(),read:vi.fn()}));
vi.mock('../worker/operations/storage',()=>({readManagedStorage:mocks.read}));
vi.mock('../worker/refresh/backend',()=>({backendRpc:mocks.rpc}));
vi.mock('../worker/operations/retention',()=>({retentionStatus:mocks.status,enrollRetention:mocks.enroll,runRetentionItem:mocks.run}));
vi.mock('../worker/operations/retention-providers',()=>({retentionProviders:mocks.providers}));
import {sweepTransientDocuments} from '../worker/operations/retention-sweep';
const env={RETENTION_ENABLED:'true'};
beforeEach(()=>{vi.clearAllMocks();mocks.rpc.mockImplementation(async(_e:unknown,name:string)=>name==='ar_financial_service_actor'?'synthetic-owner':[]);});
it('does no work when retention is disabled',async()=>{expect(await sweepTransientDocuments({})).toEqual({enabled:false});expect(mocks.rpc).not.toHaveBeenCalled();});
it('bounds candidate processing and reuses exact retention claims',async()=>{
 mocks.rpc.mockImplementation(async(_e:unknown,name:string,args:unknown)=>{if(name==='ar_financial_service_actor')return 'synthetic-owner';if(name==='ar_document_pending_uploads')return [];expect(args).toEqual({p_actor:'synthetic-owner',p_limit:10});return [{objectId:'exact-object',itemId:null}];});
 mocks.enroll.mockResolvedValue({id:'item',state:'waiting',dueAt:'2026-01-01T00:00:00Z'});mocks.run.mockResolvedValue({state:'deleted'});
 expect(await sweepTransientDocuments(env)).toMatchObject({checked:1,deleted:1});expect(mocks.enroll).toHaveBeenCalledWith(env,'synthetic-owner','supabase','exact-object');expect(mocks.run).toHaveBeenCalledTimes(1);
});
it('does not dispatch deletion for blocked or not-due work',async()=>{
 mocks.rpc.mockImplementation(async(_e:unknown,name:string)=>name==='ar_financial_service_actor'?'synthetic-owner':name==='ar_document_pending_uploads'?[]:[{objectId:'exact-object',itemId:'item'}]);mocks.status.mockResolvedValue({id:'item',state:'blocked',dueAt:null});await sweepTransientDocuments(env);expect(mocks.run).not.toHaveBeenCalled();
});
it('captures cleanup failures without throwing or altering delivery state',async()=>{
 mocks.rpc.mockImplementation(async(_e:unknown,name:string)=>name==='ar_financial_service_actor'?'synthetic-owner':name==='ar_document_pending_uploads'?[]:[{objectId:'exact-object',itemId:null}]);mocks.enroll.mockRejectedValue(Error('provider unavailable'));expect(await sweepTransientDocuments(env)).toMatchObject({errors:1,deleted:0});
});

it('reconciles only byte/hash-verified existing upload intents without issuing another upload',async()=>{
 const bytes=new TextEncoder().encode('synthetic PDF bytes');const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const upload={job_id:'synthetic-job',storage_key:'jobs/synthetic-job/exports/synthetic.pdf',byte_count:bytes.length,sha256:sha};
 mocks.rpc.mockImplementation(async(_e:unknown,name:string)=>name==='ar_financial_service_actor'?'synthetic-owner':name==='ar_document_pending_uploads'?[upload]:[]);mocks.read.mockResolvedValue(new Response(bytes));
 await sweepTransientDocuments(env);expect(mocks.rpc).toHaveBeenCalledWith(env,'ar_document_register_upload',{p_job_id:upload.job_id,p_storage_key:upload.storage_key,p_bytes:bytes.length,p_sha256:sha,p_mime:'application/pdf'});
});
it('keeps a mismatched upload intent unresolved',async()=>{
 mocks.rpc.mockImplementation(async(_e:unknown,name:string)=>name==='ar_financial_service_actor'?'synthetic-owner':name==='ar_document_pending_uploads'?[{job_id:'j',storage_key:'jobs/j/exports/x.pdf',byte_count:3,sha256:'a'.repeat(64)}]:[]);mocks.read.mockResolvedValue(new Response('bad'));
 await sweepTransientDocuments(env);expect(mocks.rpc.mock.calls.some(c=>c[1]==='ar_document_register_upload')).toBe(false);
});
