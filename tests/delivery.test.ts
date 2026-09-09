import {afterEach,expect,it,vi} from 'vitest';
import {deliverMessage,sendDiagnostic,checkDelivery} from '../worker/email/delivery';
import {hash,url64} from '../worker/email/crypto';
vi.mock('../worker/email/oauth',()=>({gmailToken:async()=>'synthetic-token',gmailCanRead:async()=>true}));
vi.mock('../worker/email/gmail-draft',()=>({draftBudget:()=>10485760,readMailFile:async(_env:unknown,_draft:unknown,file:{name:string;mime:string})=>({...file,bytes:new Uint8Array([1,2,3])}),prepareMail:async(_env:unknown,_actor:string,draft:{recipients:unknown;subject:string;body:string},messageId:string)=>({raw:'synthetic-raw',expected:{messageId,recipients:draft.recipients,subject:draft.subject,body:draft.body,files:[]}})}));
afterEach(()=>vi.unstubAllGlobals());
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'synthetic'},draftId='00000000-0000-4000-8000-000000000001';
for(const lost of [false,true])it(`direct send verifies actual evidence after ${lost?'lost':'normal'} POST result without retry`,async()=>{
 let delivery:any=null,posts=0,confirmations=0;
 const draft={id:draftId,revision:1,purpose:'billing',recipients:{to:['recipient@example.test'],cc:[],bcc:[]},subject:'Synthetic',body:'Synthetic message'};
 vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{
  const input=init.body?JSON.parse(String(init.body)):{};
  if(url.endsWith('/ar_mail_for_draft')||url.endsWith('/ar_mail_get'))return Response.json(delivery);
  if(url.endsWith('/ar_email_get'))return Response.json(draft);
  if(url.endsWith('/ar_mail_claim')){delivery={id:input.p_id,mode:input.p_mode,state:'pending',message_id:input.p_message_id,snapshot:{expected:input.p_expected}};return Response.json({...delivery,claimed:true});}
  if(url.endsWith('/messages/send')){posts++;if(lost)throw Error('lost response');return Response.json({id:'message1'});}
  if(url.endsWith('/ar_mail_record')){delivery.state=input.p_state;return Response.json(true);}
  if(url.includes('/messages?'))return Response.json({messages:[{id:'message1'}]});
  if(url.includes('/messages/message1?'))return Response.json({id:'message1',labelIds:['SENT'],internalDate:String(Date.now()),payload:{mimeType:'text/plain',headers:[{name:'Message-ID',value:delivery.message_id},{name:'From',value:'ar@katathani.com'},{name:'To',value:'recipient@example.test'},{name:'Subject',value:'Synthetic'}],body:{data:url64(new TextEncoder().encode('Synthetic message'))}}});
  if(url.endsWith('/ar_mail_confirm_sent')){confirmations++;delivery.state='sent';return Response.json({state:'sent',recorded:true});}
  throw Error('unexpected request');
 });
 expect(await deliverMessage(env,'actor',draftId,1,'send',null)).toMatchObject({state:'sent',recorded:true});
 expect(await deliverMessage(env,'actor',draftId,1,'send',null)).toMatchObject({state:'sent'});expect(posts).toBe(1);expect(confirmations).toBe(1);
});
it('stores only a recipient hash for diagnostic mail and never retries an unconfirmed send',async()=>{
 let delivery:any=null,posts=0;const recipient='one-time@example.test';
 vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{
  const v=init.body?JSON.parse(String(init.body)):{};
  if(url.endsWith('/ar_mail_get'))return Response.json(delivery);
  if(url.endsWith('/ar_mail_claim')){expect(JSON.stringify(v)).not.toContain(recipient);expect(v.p_expected.recipientHash).toBe(await hash(new TextEncoder().encode(JSON.stringify({to:[recipient],cc:[],bcc:[]}))));delivery={id:v.p_id,mode:'test',state:'pending',message_id:v.p_message_id,snapshot:{expected:v.p_expected}};return Response.json({...delivery,claimed:true});}
  if(url.endsWith('/messages/send')){posts++;throw Error('lost');}
  if(url.endsWith('/ar_mail_record')){delivery.state=v.p_state;return Response.json(true);}
  if(url.includes('/messages?'))return Response.json({messages:[]});
  if(url.endsWith('/ar_mail_confirm_sent'))throw Error('unverified test must not be confirmed');
  throw Error('unexpected request');
 });
 const id='00000000-0000-4000-8000-000000000002';expect(await sendDiagnostic(env,'actor',id,recipient)).toMatchObject({state:'awaiting_evidence'});await sendDiagnostic(env,'actor',id,recipient);await checkDelivery(env,'actor',id);expect(posts).toBe(1);
});

it('diagnostics include only explicitly selected supplemental files and retain command identity',async()=>{const sourceId='00000000-0000-4000-8000-000000000003',fileId='00000000-0000-4000-8000-000000000004',commandId='00000000-0000-4000-8000-000000000005';let delivery:any=null,posts=0;vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{const v=init.body?JSON.parse(String(init.body)):{};if(url.endsWith('/ar_mail_get'))return Response.json(delivery);if(url.endsWith('/ar_email_get'))return Response.json({id:sourceId,revision:2,exports:[{name:'Customer-statement.pdf'}],attachments:[{id:fileId,name:'Synthetic-extra.png',mime:'image/png',byte_count:3}]});if(url.endsWith('/ar_mail_claim')){expect(v.p_draft).toBeNull();expect(v.p_mode).toBe('test');expect(v.p_expected.files.map((f:any)=>f.name)).toEqual(['AR-Workspace-Test.pdf','Synthetic-extra.png']);expect(v.p_expected).not.toHaveProperty('recipients');delivery={id:v.p_id,mode:'test',state:'pending',message_id:v.p_message_id,snapshot:{expected:{...v.p_expected,supplementalSource:{ids:[fileId],revision:2,draftId:sourceId}}}};return Response.json({...delivery,claimed:true});}if(url.endsWith('/messages/send')){posts++;return Response.json({id:'provider-message'});}if(url.endsWith('/ar_mail_record')){delivery.state=v.p_state;return Response.json(true);}if(url.includes('/messages?'))return Response.json({messages:[]});throw Error('Unexpected request');});const source={draftId:sourceId,revision:2,ids:[fileId]};await sendDiagnostic(env,'actor',commandId,'recipient@example.test',source);await sendDiagnostic(env,'actor',commandId,'recipient@example.test',source);expect(posts).toBe(1);await expect(sendDiagnostic(env,'actor',commandId,'different@example.test',source)).rejects.toThrow('email_test_command_conflict');});
