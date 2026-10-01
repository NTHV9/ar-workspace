import {afterEach,expect,it,vi} from 'vitest';
import type {WorkflowStep} from 'cloudflare:workers';
const renders=vi.hoisted(()=>({invoice:vi.fn(),statement:vi.fn()}));
vi.mock('../worker/invoice/generate',()=>({workspaceInvoice:renders.invoice}));
vi.mock('../worker/statement/generate',()=>({workspaceStatement:renders.statement}));
import {runDocumentJob,type DocumentJob} from '../worker/documents/jobs';
const job:DocumentJob={id:'00000000-0000-4000-8000-000000000001',owner:'synthetic',hotel:'KAT',account_id:'A',account_name:'Synthetic',invoice_source:'workspace',statement_source:'workspace',invoice_ids:['1','2','3','4'],manifest:['1','2','3','4'].map(id=>({id,hotel:'KAT',account_id:'A',invoice_no:id,folio_no:id,reservation_id:id,folio_date:'2026-10-01',open:10,collection_role:'standalone'})),content:'invoices',layout:'combined',purpose:'billing',state:'running',revision:0,project_key:null,exports:[],acknowledged:false,created_at:'2026-10-01',files:['1','2','3','4'].map((id,ordinal)=>({id,kind:'invoice',invoice_id:id,ordinal,state:'pending',storage_key:null,error_code:null,byte_count:null,sha256:null}))};
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it('starts two workspace PDFs without waiting for the first, drains peers and preserves durable IDs',async()=>{
 let release=()=>{};const gate=new Promise<void>(r=>{release=r;}),started:string[]=[],steps:string[]=[],finished:string[]=[];let active=0,peak=0;
 renders.invoice.mockImplementation(async(_env,_job,invoice)=>{started.push(invoice.id);peak=Math.max(peak,++active);await gate;active--;return {bytes:new Uint8Array([1]),pages:1,sha256:'synthetic'};});
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{const r=new Request(input,init),path=new URL(r.url).pathname,args=(path.includes('/rpc/')?await r.json():{}) as {p_file_id?:string};
  if(path.endsWith('/ar_document_get'))return Response.json(job);
  if(path.endsWith('/ar_document_claim_file'))return Response.json({claimed:true,file:job.files.find(f=>f.id===args.p_file_id)});
  if(path.endsWith('/ar_document_finish_file')){finished.push(args.p_file_id!);return Response.json(true);}
  if(path.includes('/storage/'))return Response.json({});
  if(path.endsWith('/ar_storage_reserve')||path.endsWith('/ar_storage_finish'))return Response.json(true);
  return Response.json(true);
 });
 const step={do:async(name:string,_config:unknown,fn:()=>Promise<unknown>)=>{steps.push(name);return fn();}} as unknown as WorkflowStep;
 const pending=runDocumentJob({SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'},job.id,step);
 try{await vi.waitFor(()=>expect(started).toHaveLength(2),{timeout:250,interval:10});expect(peak).toBe(2);}finally{release();await pending;}
 expect(steps).toEqual(['document-1','document-2','document-3','document-4']);expect(finished.sort()).toEqual(['1','2','3','4']);expect(peak).toBe(2);
});
