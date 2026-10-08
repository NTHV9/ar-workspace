import {createHash} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
const dependencies=vi.hoisted(()=>({storage:vi.fn(),job:vi.fn(),snapshot:vi.fn(),thread:vi.fn()}));
vi.mock('../worker/operations/storage',()=>({readManagedStorage:dependencies.storage}));
vi.mock('../worker/documents/jobs',()=>({documentJob:dependencies.job}));
vi.mock('../worker/opera/probe',()=>({makeReader:()=>({})}));
vi.mock('../worker/refresh/read-snapshot',()=>({readBusinessDate:async()=> '2026-10-08',readVerifiedAccount:dependencies.snapshot}));
vi.mock('../worker/email/threads',()=>({revalidateThread:dependencies.thread,validateThreadChoice:vi.fn()}));
// Keep the exact SHA algorithm, synchronously resolved for deterministic virtual network time.
vi.mock('../worker/email/crypto',async importOriginal=>({...await importOriginal<object>(),hash:async(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex')}));
import {prepareMail,readMailFile} from '../worker/email/gmail-draft';
import {decodeUrl64} from '../worker/email/sent-evidence';
import type {EmailDraft} from '../worker/email/shared';
const id='00000000-0000-4000-8000-000000000001',owner='00000000-0000-4000-8000-000000000002';
const messageId=`<${id}@ar-workspace.ar-c82.workers.dev>`;
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
function setup(count=6){
 const contents=Array.from({length:count},(_,index)=>new Uint8Array([1,2,index+3]));
 const files=contents.map((bytes,index)=>({name:`Synthetic-${index}.pdf`,storage_key:`jobs/${id}/${index}.pdf`,byte_count:bytes.length,sha256:digest(bytes)}));
 const draft:EmailDraft={id,owner,hotel:'KAT',document_job_id:id,document_revision:1,revision:1,account_id:'synthetic-account',account_name:'Synthetic',invoice_ids:['synthetic-invoice'],purpose:'billing',recipients:{to:['synthetic@example.invalid'],cc:[],bcc:[]},subject:'Synthetic',body:'Synthetic message',exports:files,attachments:[],package_changed:false};
 const invoice={id:'synthetic-invoice',open:100,invoice_no:'synthetic-invoice',folio_no:'synthetic-folio',collection_role:'standalone'};
 dependencies.job.mockResolvedValue({id,owner,hotel:'KAT',account_id:draft.account_id,revision:1,acknowledged:true,manifest:[invoice]});
 dependencies.snapshot.mockResolvedValue({invoices:[invoice]});dependencies.thread.mockResolvedValue(null);
 const activity={active:0,peak:0,calls:[] as string[]};
 dependencies.storage.mockImplementation(async(_env:unknown,key:string)=>{
  activity.calls.push(key);activity.active++;activity.peak=Math.max(activity.peak,activity.active);
  await new Promise(resolve=>setTimeout(resolve,100));activity.active--;
  return new Response(contents[Number(key.match(/\/(\d+)\.pdf$/)?.[1])]);
 });
 return {draft,files,contents,activity};
}
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
it('reduces simulated six-file preparation reads from six waits to two while preserving MIME order and evidence',async()=>{
 vi.useFakeTimers();const baseline=setup(),start=Date.now();
 const serial=(async()=>{const loaded=[];for(const file of baseline.files)loaded.push(await readMailFile(env,baseline.draft,file));return loaded;})();
 await vi.runAllTimersAsync();const serialFiles=await serial,serialMs=Date.now()-start;
 const optimized=setup(),parallelStart=Date.now(),prepared=prepareMail(env,owner,optimized.draft,messageId);
 await vi.runAllTimersAsync();const result=await prepared,parallelMs=Date.now()-parallelStart;
 expect({serialMs,parallelMs}).toEqual({serialMs:600,parallelMs:200});
 expect(optimized.activity.peak).toBe(3);expect(optimized.activity.active).toBe(0);
 expect(result.expected.files).toEqual(optimized.files.map(({name,byte_count,sha256})=>({name,byte_count,sha256})));
 const mime=new TextDecoder().decode(decodeUrl64(result.raw));let previous=-1;
 for(const file of serialFiles){const position=mime.indexOf(`filename="${file.name}"`);expect(position).toBeGreaterThan(previous);expect(mime).toContain(btoa(String.fromCharCode(...file.bytes)));previous=position;}
 console.info(JSON.stringify({measurement:'simulated-storage-network-only',files:6,serialMs,parallelMs,peak:optimized.activity.peak}));
});
it('keeps a single-file read at one simulated wait',async()=>{
 vi.useFakeTimers();const state=setup(1),start=Date.now(),prepared=prepareMail(env,owner,state.draft,messageId);
 await vi.runAllTimersAsync();await prepared;expect(Date.now()-start).toBe(100);expect(state.activity.peak).toBe(1);
});
it('validates the entire storage manifest before starting any reads',async()=>{
 const state=setup(4);state.files[3].storage_key=`jobs/${owner}/unrelated.pdf`;
 await expect(prepareMail(env,owner,state.draft,messageId)).rejects.toThrow('email_attachment_invalid');
 expect(dependencies.storage).not.toHaveBeenCalled();
});
it('drains the failed batch and never reads the next batch or revalidates a thread',async()=>{
 vi.useFakeTimers();const state=setup(6);let finished=0;
 dependencies.storage.mockImplementation(async(_env:unknown,key:string)=>{
  state.activity.calls.push(key);await new Promise(resolve=>setTimeout(resolve,key.endsWith('/0.pdf')?20:100));finished++;
  if(key.endsWith('/0.pdf'))throw Error('storage_file_expired');return new Response(state.contents[Number(key.match(/\/(\d+)\.pdf$/)?.[1])]);
 });
 let settled=false;const failure=prepareMail(env,owner,state.draft,messageId).catch(error=>{settled=true;return error;});
 await vi.advanceTimersByTimeAsync(20);expect(finished).toBe(1);expect(settled).toBe(false);
 await vi.runAllTimersAsync();expect(await failure).toMatchObject({message:'storage_file_expired'});
 expect(finished).toBe(3);expect(state.activity.calls).toEqual(state.files.slice(0,3).map(file=>file.storage_key));expect(dependencies.thread).not.toHaveBeenCalled();
});
it('preserves attachment order even when the network completes reads out of order',async()=>{
 vi.useFakeTimers();const state=setup(3),completed:number[]=[];
 dependencies.storage.mockImplementation(async(_env:unknown,key:string)=>{
  const index=Number(key.match(/\/(\d+)\.pdf$/)?.[1]);await new Promise(resolve=>setTimeout(resolve,[100,20,60][index]));completed.push(index);return new Response(state.contents[index]);
 });
 const prepared=prepareMail(env,owner,state.draft,messageId);await vi.runAllTimersAsync();
 const result=await prepared,mime=new TextDecoder().decode(decodeUrl64(result.raw));
 expect(completed).toEqual([1,2,0]);expect(result.expected.files.map(file=>file.name)).toEqual(state.files.map(file=>file.name));
 expect(mime.indexOf('filename="Synthetic-0.pdf"')).toBeLessThan(mime.indexOf('filename="Synthetic-1.pdf"'));
 expect(mime.indexOf('filename="Synthetic-1.pdf"')).toBeLessThan(mime.indexOf('filename="Synthetic-2.pdf"'));
});
it('rejects closed, oversized or invalid MIME/name packages without starting reads',async()=>{
 for(const mutation of ['closed','size','name','mime'] as const){
  const state=setup(4);
  if(mutation==='closed')state.draft.document_closed_at='2026-10-08T00:00:00Z';
  if(mutation==='size')state.files[3].byte_count=10485761;
  if(mutation==='name')state.files[3].name='invalid\r\n.pdf';
  if(mutation==='mime')state.draft.attachments.push({id,name:'invalid.pdf',mime:'text/html',storage_key:`jobs/${id}/invalid.pdf`,byte_count:1,sha256:'invalid'});
  await expect(prepareMail(env,owner,state.draft,messageId)).rejects.toThrow(mutation==='closed'?'document_closed':mutation==='size'?'email_too_large':'email_attachment_invalid');
  expect(dependencies.storage).not.toHaveBeenCalled();
 }
});
it('still rejects changed bytes and size before MIME creation',async()=>{
 for(const bytes of [new Uint8Array([9,9,9]),new Uint8Array([1,2])]){
  const state=setup(1);dependencies.storage.mockResolvedValue(new Response(bytes));
  await expect(prepareMail(env,owner,state.draft,messageId)).rejects.toThrow('email_attachment_changed');
 }
 expect(dependencies.thread).not.toHaveBeenCalled();
});
it('completes the fresh full invoice check before any storage read',async()=>{
 const state=setup();dependencies.snapshot.mockResolvedValue({invoices:[]});
 await expect(prepareMail(env,owner,state.draft,messageId)).rejects.toThrow('email_source_changed');expect(dependencies.storage).not.toHaveBeenCalled();
});
