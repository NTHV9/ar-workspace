import {beforeEach,it,expect,vi} from 'vitest';
import type {WorkflowStep} from 'cloudflare:workers';
import type {DocumentJob} from '../worker/documents/jobs';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),workspace:vi.fn(),native:vi.fn(),storage:vi.fn()}));
vi.mock('../worker/refresh/backend',()=>({backendRpc:mocks.rpc}));
vi.mock('../worker/invoice/generate',()=>({workspaceInvoice:mocks.workspace}));
vi.mock('../worker/documents/native-invoice',()=>({getNativeInvoicePdf:mocks.native}));
vi.mock('../worker/operations/storage',()=>({writeManagedStorage:mocks.storage}));
vi.mock('../worker/opera/probe',()=>({makeReader:()=>({})}));
import {runDocumentJob,createDocumentJob} from '../worker/documents/jobs';
const job:DocumentJob={id:'11111111-1111-4111-8111-111111111111',owner:'owner',hotel:'KAT',account_id:'101',account_name:'Synthetic',content:'invoices',layout:'combined',purpose:'billing',invoice_ids:['500'],manifest:[{id:'500',hotel:'KAT',account_id:'101',invoice_no:'99',folio_no:'88',reservation_id:'777',folio_date:'2026-01-15',open:100,collection_role:'standalone'}],state:'queued',revision:0,project_key:null,exports:[],acknowledged:false,created_at:'2026-09-21',files:[{id:'22222222-2222-4222-8222-222222222222',kind:'invoice',invoice_id:'500',ordinal:1,state:'pending',storage_key:null,error_code:null,byte_count:null,sha256:null}]};
const step={do:async(_name:unknown,_config:unknown,fn:()=>Promise<unknown>)=>fn()} as WorkflowStep;
const env={SUPABASE_URL:'https://database.example',SUPABASE_SECRET_KEY:'synthetic'};
beforeEach(()=>{vi.clearAllMocks();const pdf={bytes:new TextEncoder().encode('%PDF-synthetic'),pages:1,sha256:'a'.repeat(64)};mocks.workspace.mockResolvedValue(pdf);mocks.native.mockResolvedValue(pdf);mocks.rpc.mockImplementation(async(_e,name)=>name==='ar_document_get'?job:name==='ar_document_claim_file'?{claimed:true,file:job.files[0]}:null);});
it('uses workspace rendering for new Invoice jobs without a native print call',async()=>{
 const current={...job,invoice_source:'workspace',invoice_template_version:'invoice-rtf-20260921-v1'};mocks.rpc.mockImplementation(async(_e,name)=>name==='ar_document_get'?current:name==='ar_document_claim_file'?{claimed:true,file:job.files[0]}:null);
 await runDocumentJob(env,job.id,step);expect(mocks.workspace).toHaveBeenCalledOnce();expect(mocks.native).not.toHaveBeenCalled();expect(mocks.storage).toHaveBeenCalledOnce();
});
it('preserves the native route for a pre-cutover job',async()=>{await runDocumentJob(env,job.id,step);expect(mocks.native).toHaveBeenCalledOnce();expect(mocks.workspace).not.toHaveBeenCalled();});
it('never falls back to a native PDF when tax verification fails',async()=>{
 const current={...job,invoice_source:'workspace'};mocks.rpc.mockImplementation(async(_e,name)=>name==='ar_document_get'?current:name==='ar_document_claim_file'?{claimed:true,file:job.files[0]}:null);mocks.workspace.mockRejectedValue(Error('document_invoice_tax_coverage_missing'));
 await runDocumentJob(env,job.id,step);expect(mocks.native).not.toHaveBeenCalled();expect(mocks.storage).not.toHaveBeenCalled();expect(mocks.rpc).toHaveBeenCalledWith(env,'ar_document_fail_file',expect.objectContaining({p_code:'document_invoice_tax_coverage_missing',p_uncertain:false}));
});
it('creates new preparations through the source-version snapshot RPC',async()=>{
 mocks.rpc.mockResolvedValue({...job,state:'ready',files:[]});await createDocumentJob(env,'owner',{hotel:'KAT',accountId:'101',ids:['500'],commandKey:'33333333-3333-4333-8333-333333333333',content:'invoices',layout:'combined',purpose:'billing'});expect(mocks.rpc).toHaveBeenCalledWith(env,'ar_document_create_v5',expect.objectContaining({p_statement_source:'native',p_hotel:'KAT',p_ids:['500']}));
});
