import {afterEach,expect,it,vi} from 'vitest';
import {deliverMessage,sendDiagnostic} from '../worker/email/delivery';
import {hash,url64} from '../worker/email/crypto';
import {decodeUrl64} from '../worker/email/sent-evidence';
import {chooseParent,parseConversation} from '../worker/email/threads';

vi.mock('../worker/email/oauth',()=>({gmailToken:async()=>'synthetic-provider-token',gmailCanRead:async()=>true}));
vi.mock('../worker/opera/probe',()=>({makeReader:()=>({})}));
vi.mock('../worker/refresh/read-snapshot',()=>({readBusinessDate:async()=>'2026-09-10',readVerifiedAccount:async()=>({invoices:[{id:'1',open:100,collection_role:'standalone',invoice_no:'1',folio_no:'2'}]})}));
vi.mock('../worker/documents/jobs',()=>({documentJob:async()=>({owner:'owner',revision:4,acknowledged:true,hotel:'KAT',account_id:'synthetic',manifest:[{id:'1',open:100,invoice_no:'1',folio_no:'2'}]})}));
afterEach(()=>vi.unstubAllGlobals());
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
const draftId='00000000-0000-4000-8000-000000000001',jobId='00000000-0000-4000-8000-000000000002',sourceId='00000000-0000-4000-8000-000000000003',commandId='00000000-0000-4000-8000-000000000004';
const recipients={to:['example@example.test'],cc:[],bcc:[]};
const provider=()=>({id:'thread1',historyId:'100',messages:[{id:'parent1',threadId:'thread1',internalDate:String(Date.parse('2026-09-10T00:00:00Z')),labelIds:['SENT'],payload:{headers:[{name:'From',value:'ar@katathani.com'},{name:'To',value:recipients.to[0]},{name:'Subject',value:'Synthetic thread'},{name:'Message-ID',value:'<rewritten-parent@mail.gmail.com>'}]}}]});
async function fixture(){const c=provider(),thread=chooseParent(parseConversation(c,c.id,recipients),recipients,'parent1'),bytes=new TextEncoder().encode('%PDF-synthetic');return {c,bytes,draft:{id:draftId,owner:'owner',document_job_id:jobId,document_revision:4,revision:2,package_changed:false,purpose:'billing',recipients,subject:thread.subject,body:'Synthetic body',thread,exports:[{name:'test.pdf',storage_key:`jobs/${jobId}/exports/test.pdf`,byte_count:bytes.length,sha256:await hash(bytes)}],attachments:[]}};}
for(const mode of ['draft','send'] as const)it(`threads ${mode} provider request and preserves no-duplicate claim behavior`,async()=>{
 const {c,bytes,draft}=await fixture();let delivery:any=null,posts=0,claims=0,confirmed=0;
 vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{
  const body=init.body?JSON.parse(String(init.body)):{};
  if(url.endsWith('/ar_mail_for_draft')||url.endsWith('/ar_mail_get'))return Response.json(delivery);
  if(url.endsWith('/ar_email_get'))return Response.json(draft);
  if(url.includes('/storage/'))return new Response(bytes);
  if(url.includes('/threads/thread1?'))return Response.json(c);
  if(url.endsWith('/ar_mail_claim')){claims++;expect(body.p_expected.thread).toEqual(draft.thread);delivery={id:body.p_id,owner:'owner',mode,state:'pending',created_at:new Date().toISOString(),message_id:body.p_message_id,snapshot:{expected:body.p_expected}};return Response.json({...delivery,claimed:true});}
  if(url.endsWith('/drafts')||url.endsWith('/messages/send')){posts++;expect(init.redirect).toBe('manual');const message=mode==='draft'?body.message:body;expect(message.threadId).toBe('thread1');expect(new TextDecoder().decode(decodeUrl64(message.raw))).toContain('In-Reply-To: <rewritten-parent@mail.gmail.com>');return Response.json(mode==='draft'?{id:'draft1',message:{id:'sent1',threadId:'thread1'}}:{id:'sent1',threadId:'thread1'});}
  if(url.endsWith('/ar_mail_record')){delivery.state=body.p_state;delivery.provider_receipt_id=body.p_gmail_id;return Response.json(true);}
  if(url.includes('/messages/sent1?'))return Response.json({id:'sent1',threadId:'thread1',labelIds:['SENT'],internalDate:String(Date.now()),payload:{headers:[{name:'From',value:'ar@katathani.com'},{name:'To',value:recipients.to[0]},{name:'Subject',value:draft.subject},{name:'In-Reply-To',value:draft.thread.rfcMessageId},{name:'References',value:draft.thread.references.join(' ')}],parts:[{mimeType:'text/plain',body:{data:url64(new TextEncoder().encode(draft.body))}},{mimeType:'application/pdf',filename:'test.pdf',body:{size:bytes.length,data:url64(bytes)}}]}});
  if(url.endsWith('/ar_mail_confirm_sent')){confirmed++;delivery.state='sent';return Response.json({state:'sent',recorded:true});}
  throw Error('Unexpected request');
 });
 expect(await deliverMessage(env,'owner',draftId,2,mode,null)).toMatchObject({state:mode==='draft'?'created':'sent'});await deliverMessage(env,'owner',draftId,2,mode,null);expect(posts).toBe(1);expect(claims).toBe(1);expect(confirmed).toBe(mode==='send'?1:0);
});
it('refuses changed parent before atomic claim or provider send',async()=>{
 const {c,bytes,draft}=await fixture();c.messages[0].payload.headers[3].value='<changed@mail.gmail.com>';const urls:string[]=[];
 vi.stubGlobal('fetch',async(url:string)=>{urls.push(url);if(url.endsWith('/ar_mail_for_draft'))return Response.json(null);if(url.endsWith('/ar_email_get'))return Response.json(draft);if(url.includes('/storage/'))return new Response(bytes);if(url.includes('/threads/'))return Response.json(c);throw Error('Unexpected request');});
 await expect(deliverMessage(env,'owner',draftId,2,'send',null)).rejects.toThrow('email_thread_changed');expect(urls.some(u=>u.includes('/ar_mail_claim')||u.includes('/messages/send'))).toBe(false);
});
it('diagnostic reply stores no participant address and never repeats an uncertain provider send',async()=>{
 const c=provider(),digest=await hash(new TextEncoder().encode(JSON.stringify(recipients)));const source={id:sourceId,owner:'owner',mode:'test',state:'sent',draft_id:null,gmail_id:'parent1',snapshot:{expected:{recipientHash:digest,subject:'Synthetic thread'}}};let delivery:any=null,posts=0;
 vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{
  const body=init.body?JSON.parse(String(init.body)):{};
  if(url.endsWith('/ar_mail_get'))return Response.json(body.p_id===sourceId?source:delivery);
  if(url.includes('/messages/parent1?'))return Response.json(c.messages[0]);
  if(url.includes('/threads/thread1?'))return Response.json(c);
  if(url.endsWith('/ar_mail_claim')){expect(JSON.stringify(body)).not.toContain(recipients.to[0]);expect(body.p_draft).toBeNull();expect(body.p_mode).toBe('test');expect(body.p_expected).toMatchObject({recipientHash:digest,replyToDeliveryId:sourceId,thread:{parentMessageId:'parent1',rfcMessageId:'<rewritten-parent@mail.gmail.com>'}});expect(body.p_expected.thread).not.toHaveProperty('matchedRecipients');delivery={id:body.p_id,owner:'owner',mode:'test',state:'pending',message_id:body.p_message_id,created_at:new Date().toISOString(),snapshot:{expected:body.p_expected}};return Response.json({...delivery,claimed:true});}
  if(url.endsWith('/messages/send')){posts++;expect(body.threadId).toBe('thread1');throw Error('Synthetic ambiguous result');}
  if(url.endsWith('/ar_mail_record')){delivery.state=body.p_state;return Response.json(true);}
  if(url.includes('/messages?'))return Response.json({messages:[]});
  throw Error('Unexpected request');
 });
 expect(await sendDiagnostic(env,'owner',commandId,recipients.to[0],undefined,false,sourceId)).toMatchObject({state:'awaiting_evidence'});await sendDiagnostic(env,'owner',commandId,recipients.to[0],undefined,false,sourceId);expect(posts).toBe(1);
 await expect(sendDiagnostic(env,'owner',commandId,recipients.to[0],undefined,false,draftId)).rejects.toThrow('email_test_command_conflict');
});
