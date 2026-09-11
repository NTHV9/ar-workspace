import {afterEach,it,expect,vi} from 'vitest';
import {createGmailDraft} from '../worker/email/gmail-draft';
import {hash} from '../worker/email/crypto';
vi.mock('../worker/email/oauth',()=>({gmailToken:async()=>'synthetic-provider-token'}));
vi.mock('../worker/opera/probe',()=>({makeReader:()=>({})}));
vi.mock('../worker/refresh/read-snapshot',()=>({readBusinessDate:async()=>'2026-09-10',readVerifiedAccount:async()=>({invoices:[{id:'1',open:100,collection_role:'standalone',invoice_no:'1',folio_no:'2'}]})}));
vi.mock('../worker/documents/jobs',()=>({documentJob:async()=>({owner:'owner',revision:4,acknowledged:true,hotel:'KAT',account_id:'example',manifest:[{id:'1',open:100,invoice_no:'1',folio_no:'2'}]})}));
afterEach(()=>vi.unstubAllGlobals());
for(const ambiguous of [false,true])it(`new handoff ${ambiguous?'ambiguous failure':'success'} never repeats the external create`,async()=>{
 const job='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',bytes=new TextEncoder().encode('%PDF-synthetic');
 const draft={id,document_job_id:job,document_revision:4,revision:0,package_changed:false,purpose:'billing',recipients:{to:[],cc:[],bcc:[]},subject:'Synthetic test',body:'Test',exports:[{name:'test.pdf',storage_key:`jobs/${job}/exports/test.pdf`,byte_count:bytes.length,sha256:await hash(bytes)}],attachments:[]};let attempt:null|{id:string;state:string}=null;let posts=0;
 vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{
  if(url.includes('/ar_email_get'))return Response.json(draft);
  if(url.includes('/ar_gmail_attempt_get'))return Response.json(attempt);
  if(url.includes('/storage/'))return new Response(bytes);
  if(url.includes('/ar_gmail_attempt_claim')){attempt={id:'attempt',state:'creating'};return Response.json({...attempt,claimed:true});}
  if(url==='https://gmail.googleapis.com/gmail/v1/users/me/drafts'){posts++;expect(init.method).toBe('POST');expect(init.redirect).toBe('manual');expect(JSON.parse(String(init.body)).message.raw).toBeTruthy();if(ambiguous)throw Error('synthetic timeout');return Response.json({id:'draft-id',message:{id:'message-id'}});}
  if(url.includes('/ar_gmail_attempt_finish')){const input=JSON.parse(String(init.body));attempt={id:'attempt',state:input.p_draft_id?'created':'uncertain'};return Response.json(true);}
  throw Error('Unexpected request');
 });
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
 expect(await createGmailDraft(env,'owner',id,0)).toMatchObject({state:ambiguous?'uncertain':'created'});
 expect(await createGmailDraft(env,'owner',id,0)).toMatchObject({alreadyRequested:true});expect(posts).toBe(1);
});
