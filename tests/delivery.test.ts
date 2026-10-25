import {afterEach,expect,it,vi} from 'vitest';
import {deliverMessage,sendDiagnostic,checkDelivery} from '../worker/email/delivery';
import {hash,url64} from '../worker/email/crypto';
vi.mock('../worker/email/oauth',()=>({gmailToken:async()=>'synthetic-token',gmailCanRead:async()=>true}));
vi.mock('../worker/email/gmail-draft',()=>({draftBudget:()=>10485760,readMailFile:async(_env:unknown,_draft:unknown,file:{name:string;mime:string})=>({...file,bytes:new Uint8Array([1,2,3])}),prepareMail:async(_env:unknown,_actor:string,draft:{recipients:unknown;subject:string;body:string},messageId:string)=>({raw:'synthetic-raw',expected:{messageId,recipients:draft.recipients,subject:draft.subject,body:draft.body,files:[]}})}));
afterEach(()=>vi.unstubAllGlobals());
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'synthetic'},draftId='00000000-0000-4000-8000-000000000001';
for(const lost of [false,true])it(`direct send verifies actual evidence after ${lost?'lost':'normal'} POST result without retry`,async()=>{
 let delivery:any=null,posts=0,confirmations=0;
 const draft={hotel:'KAT',id:draftId,revision:1,purpose:'billing',recipients:{to:['recipient@example.test'],cc:[],bcc:[]},subject:'Synthetic',body:'Synthetic message'};
 vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{
  const input=init.body?JSON.parse(String(init.body)):{};
  if(url.endsWith('/ar_mail_for_draft')||url.endsWith('/ar_mail_get'))return Response.json(delivery);
  if(url.endsWith('/ar_email_business_preflight'))return Response.json({allowed:true});if(url.endsWith('/ar_email_get'))return Response.json(draft);
  if(url.endsWith('/ar_mail_claim')){delivery={id:input.p_id,mode:input.p_mode,state:'pending',message_id:input.p_message_id,snapshot:{expected:input.p_expected}};return Response.json({...delivery,claimed:true});}
  if(url.endsWith('/messages/send')){posts++;if(lost)throw Error('lost response');return Response.json({id:'message1'});}
  if(url.endsWith('/ar_mail_record')){delivery.state=input.p_state;return Response.json(true);}
  if(url.endsWith('/ar_mail_record_verified_sent'))return Response.json(true);
  if(url.includes('/messages?'))return Response.json({messages:[{id:'message1'}]});
  if(url.includes('/messages/message1?'))return Response.json({id:'message1',labelIds:['SENT'],internalDate:String(Date.now()),payload:{mimeType:'text/plain',headers:[{name:'Message-ID',value:delivery.message_id},{name:'From',value:'ar@katathani.com'},{name:'To',value:'recipient@example.test'},{name:'Subject',value:'Synthetic'}],body:{data:url64(new TextEncoder().encode('Synthetic message'))}}});
  if(url.endsWith('/ar_mail_confirm_sent')){confirmations++;delivery.state='sent';return Response.json({state:'sent',recorded:true});}
  throw Error('unexpected request');
 });
 expect(await deliverMessage(env,'actor',draftId,1,'send',null)).toMatchObject({state:'sent',gmailAccepted:true,recorded:true});
 expect(await deliverMessage(env,'actor',draftId,1,'send',null)).toMatchObject({state:'sent'});expect(posts).toBe(1);expect(confirmations).toBe(1);
});

for(const historyFailure of [false,true])it(`records a successful Gmail send immediately without reading back content; history failure=${historyFailure}`,async()=>{
 let delivery:any=null,posts=0,confirmations=0;const calls:string[]=[];
 const draft={hotel:'KAT',id:draftId,revision:1,purpose:'billing',recipients:{to:['recipient@example.test'],cc:['copy@example.test'],bcc:['private@example.test']},subject:'Synthetic',body:'Synthetic message'};
 vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{
  calls.push(url);const input=init.body?JSON.parse(String(init.body)):{};
  if(url.endsWith('/ar_mail_for_draft')||url.endsWith('/ar_mail_get'))return Response.json(delivery);
  if(url.endsWith('/ar_email_business_preflight'))return Response.json({allowed:true});
  if(url.endsWith('/ar_email_get'))return Response.json(draft);
  if(url.endsWith('/ar_mail_claim')){delivery={id:input.p_id,owner:'actor',mode:'send',state:'pending',message_id:input.p_message_id,snapshot:{expected:input.p_expected}};return Response.json({...delivery,claimed:true});}
  if(url.endsWith('/messages/send')){posts++;return Response.json({id:'acknowledged-message'});}
  if(url.endsWith('/ar_mail_record')){delivery.state=input.p_state;delivery.provider_receipt_id=input.p_gmail_id;return Response.json(true);}
  if(url.endsWith('/ar_mail_confirm_sent')){confirmations++;expect(input.p_gmail_id).toBe('acknowledged-message');expect(Date.parse(input.p_sent_at)).toBeGreaterThan(Date.now()-30000);if(historyFailure)return Response.json({error:'synthetic_record_failure'},{status:503});delivery.state='sent';return Response.json({state:'sent',recorded:true});}
  throw Error('Content readback is deliberately unavailable');
 });
 const result=await deliverMessage(env,'actor',draftId,1,'send',null);
 expect(result).toMatchObject(historyFailure?{state:'awaiting_evidence',gmailAccepted:true,recorded:false,reason:'history_recording_unavailable'}:{state:'sent',gmailAccepted:true,recorded:true});
 expect(calls.some(url=>url.includes('/messages?')||url.includes('/messages/acknowledged-message'))).toBe(false);
 await deliverMessage(env,'actor',draftId,1,'send',null);expect(posts).toBe(1);expect(confirmations).toBe(1);
});

it('keeps a workflow conflict distinct from an unsuccessful send after Gmail accepted it',async()=>{
 const {deliveryView}=await import('../worker/email/delivery');
 const base={id:draftId,owner:'actor',draft_id:draftId,revision:1,mode:'send' as const,state:'review_required',stage:null,message_id:'synthetic',gmail_id:'accepted',provider_receipt_id:'accepted',gmail_draft_id:null,sent_at:'2026-10-24T08:00:00Z',reason:'workflow_changed',created_at:'2026-10-24T07:59:59Z',snapshot:{expected:{messageId:'synthetic',recipients:{to:[],cc:[],bcc:[]},subject:'',body:'',files:[]}}};
 expect(deliveryView(base)).toMatchObject({gmailAccepted:true,recorded:false,reason:'workflow_changed'});
 expect(deliveryView({...base,mode:'draft',state:'created',sent_at:null,reason:null})).toMatchObject({gmailAccepted:false,recorded:false});
 expect(deliveryView({...base,mode:'draft',sent_at:null})).toMatchObject({gmailAccepted:false});
 expect(deliveryView({...base,provider_receipt_id:null,sent_at:null})).toMatchObject({gmailAccepted:false});
});

it('retries only history for a durable send receipt, using the original Gmail time without fetching attachments',async()=>{
 const sentAt='2026-10-24T07:00:00.000Z';let confirms=0,gets=0;
 const delivery={id:draftId,owner:'actor',mode:'send',state:'awaiting_evidence',created_at:'2026-10-24T06:59:59Z',provider_receipt_id:'acknowledged-message',snapshot:{expected:{}}};
 vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{
  const v=init.body?JSON.parse(String(init.body)):{};
  if(url.endsWith('/ar_mail_get'))return Response.json(delivery);
  if(url.includes('/messages/acknowledged-message?format=metadata')){gets++;return Response.json({id:'acknowledged-message',labelIds:['SENT'],internalDate:String(Date.parse(sentAt))});}
  if(url.endsWith('/ar_mail_record'))throw Error('The durable receipt must not be rewritten on history retry');
  if(url.endsWith('/ar_mail_confirm_sent')){confirms++;expect(v.p_sent_at).toBe(sentAt);return Response.json({state:'sent',recorded:true});}
  throw Error('Unexpected attachment read or send request');
 });
 expect(await checkDelivery(env,'actor',draftId)).toMatchObject({state:'sent',gmailAccepted:true,recorded:true,sentAt});expect(confirms).toBe(1);expect(gets).toBe(1);
});

it.each([
 {id:'another-message',labelIds:['SENT'],internalDate:String(Date.parse('2026-10-24T07:00:00Z'))},
 {id:'accepted',labelIds:['DRAFT'],internalDate:String(Date.parse('2026-10-24T07:00:00Z'))},
 {id:'accepted',labelIds:['SENT','DRAFT'],internalDate:String(Date.parse('2026-10-24T07:00:00Z'))},
 {id:'accepted',labelIds:['SENT'],internalDate:'not-a-date'},
])('does not record history from inconsistent retry metadata %#',async message=>{
 let confirms=0;const delivery={id:draftId,mode:'send',state:'awaiting_evidence',provider_receipt_id:'accepted',snapshot:{expected:{}}};
 vi.stubGlobal('fetch',async(url:string)=>{
  if(url.endsWith('/ar_mail_get'))return Response.json(delivery);
  if(url.includes('/messages/accepted?format=metadata'))return Response.json(message);
  if(url.endsWith('/ar_mail_confirm_sent'))confirms++;
  throw Error('Unexpected operation');
 });
 expect(await checkDelivery(env,'actor',draftId)).toMatchObject({state:'awaiting_evidence',gmailAccepted:true,recorded:false});expect(confirms).toBe(0);
});

it('does not promote a malformed Gmail success response to accepted or recorded',async()=>{
 let delivery:any=null,posts=0,confirms=0;
 const draft={hotel:'KAT',id:draftId,revision:1,purpose:'billing',recipients:{to:['recipient@example.test'],cc:[],bcc:[]},subject:'Synthetic',body:'Synthetic message'};
 vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{
  const v=init.body?JSON.parse(String(init.body)):{};
  if(url.endsWith('/ar_mail_for_draft')||url.endsWith('/ar_mail_get'))return Response.json(delivery);
  if(url.endsWith('/ar_email_business_preflight'))return Response.json({allowed:true});if(url.endsWith('/ar_email_get'))return Response.json(draft);
  if(url.endsWith('/ar_mail_claim')){delivery={id:v.p_id,mode:'send',state:'pending',message_id:v.p_message_id,snapshot:{expected:v.p_expected}};return Response.json({...delivery,claimed:true});}
  if(url.endsWith('/messages/send')){posts++;return Response.json({id:'invalid/path'});}
  if(url.endsWith('/ar_mail_record')){delivery.state=v.p_state;return Response.json(true);}
  if(url.includes('/messages?'))return Response.json({messages:[]});
  if(url.endsWith('/ar_mail_confirm_sent')){confirms++;throw Error('Must not record');}
  throw Error('Unexpected request');
 });
 expect(await deliverMessage(env,'actor',draftId,1,'send',null)).toMatchObject({state:'awaiting_evidence',gmailAccepted:false,recorded:false});
 await deliverMessage(env,'actor',draftId,1,'send',null);expect(posts).toBe(1);expect(confirms).toBe(0);
});

for(const lostConfirmation of [false,true])it(`reports already committed history after ${lostConfirmation?'a lost confirmation response':'a concurrent confirmation'}`,async()=>{
 let delivery:any=null,posts=0,confirmations=0;
 const draft={hotel:'KAT',id:draftId,revision:1,purpose:'billing',recipients:{to:['recipient@example.test'],cc:[],bcc:[]},subject:'Synthetic',body:'Synthetic message'};
 vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{
  const v=init.body?JSON.parse(String(init.body)):{};
  if(url.endsWith('/ar_mail_for_draft')||url.endsWith('/ar_mail_get'))return Response.json(delivery);
  if(url.endsWith('/ar_email_business_preflight'))return Response.json({allowed:true});if(url.endsWith('/ar_email_get'))return Response.json(draft);
  if(url.endsWith('/ar_mail_claim')){delivery={id:v.p_id,mode:'send',state:'pending',message_id:v.p_message_id,snapshot:{expected:v.p_expected}};return Response.json({...delivery,claimed:true});}
  if(url.endsWith('/messages/send')){posts++;return Response.json({id:'accepted'});}
  if(url.endsWith('/ar_mail_record')){delivery.provider_receipt_id=v.p_gmail_id;if(!lostConfirmation){delivery.state='sent';delivery.sent_at='2026-10-24T07:00:00Z';}return Response.json(lostConfirmation);}
  if(url.endsWith('/ar_mail_confirm_sent')){confirmations++;delivery.state='sent';delivery.sent_at=v.p_sent_at;throw Error('History committed; response lost');}
  throw Error('Unexpected readback/send');
 });
 expect(await deliverMessage(env,'actor',draftId,1,'send',null)).toMatchObject({state:'sent',gmailAccepted:true,recorded:true});
 await deliverMessage(env,'actor',draftId,1,'send',null);expect(posts).toBe(1);expect(confirmations).toBe(lostConfirmation?1:0);
});

it('never reports an already sent Gmail draft as sendable when its history write fails',async()=>{
 const sentAt='2026-10-24T07:00:00.000Z';
 const expected={messageId:'<synthetic@example.test>',recipients:{to:['recipient@example.test'],cc:[],bcc:[]},subject:'Synthetic',body:'Synthetic message',files:[]};
 const delivery={id:draftId,mode:'draft',state:'created',provider_receipt_id:'manually-sent',snapshot:{expected}};
 vi.stubGlobal('fetch',async(url:string)=>{
  if(url.endsWith('/ar_mail_get'))return Response.json(delivery);
  if(url.includes('/messages/manually-sent?format=full'))return Response.json({id:'manually-sent',labelIds:['SENT'],internalDate:String(Date.parse(sentAt)),payload:{mimeType:'text/plain',headers:[{name:'From',value:'ar@katathani.com'},{name:'To',value:'recipient@example.test'},{name:'Subject',value:'Synthetic'}],body:{data:url64(new TextEncoder().encode(expected.body))}}});
  if(url.endsWith('/ar_mail_confirm_sent'))throw Error('Synthetic history unavailable');
  throw Error('Unexpected send');
 });
 expect(await checkDelivery(env,'actor',draftId)).toMatchObject({state:'awaiting_evidence',gmailAccepted:true,recorded:false,sentAt});
});

it('returns the specific recipient problem when recovering a manually sent draft',async()=>{
 const delivery={id:draftId,mode:'draft',state:'created',provider_receipt_id:'manually-sent',snapshot:{expected:{messageId:'<synthetic@example.test>',recipients:{to:['recipient@example.test'],cc:[],bcc:[]},subject:'Synthetic',body:'Synthetic message',files:[]}}};
 vi.stubGlobal('fetch',async(url:string)=>{
  if(url.endsWith('/ar_mail_get'))return Response.json(delivery);
  if(url.endsWith('/ar_mail_record'))return Response.json(true);
  if(url.includes('/messages/manually-sent?format=full'))return Response.json({id:'manually-sent',labelIds:['SENT'],internalDate:String(Date.now()),payload:{headers:[{name:'From',value:'ar@katathani.com'},{name:'To',value:'changed@example.test'}]}});
  throw Error('Must not confirm changed recipients');
 });
 expect(await checkDelivery(env,'actor',draftId)).toMatchObject({state:'review_required',reason:'message_recipients'});
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

it('diagnostics include only explicitly selected supplemental files and retain command identity',async()=>{const sourceId='00000000-0000-4000-8000-000000000003',fileId='00000000-0000-4000-8000-000000000004',commandId='00000000-0000-4000-8000-000000000005';let delivery:any=null,posts=0;vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{const v=init.body?JSON.parse(String(init.body)):{};if(url.endsWith('/ar_mail_get'))return Response.json(delivery);if(url.endsWith('/ar_email_business_preflight'))return Response.json({allowed:true});if(url.endsWith('/ar_email_get'))return Response.json({id:sourceId,hotel:'KAT',revision:2,exports:[{name:'Customer-statement.pdf'}],attachments:[{id:fileId,name:'Synthetic-extra.png',mime:'image/png',byte_count:3}]});if(url.endsWith('/ar_mail_claim')){expect(v.p_draft).toBeNull();expect(v.p_mode).toBe('test');expect(v.p_expected.files.map((f:any)=>f.name)).toEqual(['AR-Workspace-Test.pdf','Synthetic-extra.png']);expect(v.p_expected).not.toHaveProperty('recipients');delivery={id:v.p_id,mode:'test',state:'pending',message_id:v.p_message_id,snapshot:{expected:{...v.p_expected,supplementalSource:{ids:[fileId],revision:2,draftId:sourceId}}}};return Response.json({...delivery,claimed:true});}if(url.endsWith('/messages/send')){posts++;return Response.json({id:'provider-message'});}if(url.endsWith('/ar_mail_record')){delivery.state=v.p_state;return Response.json(true);}if(url.includes('/messages?'))return Response.json({messages:[]});throw Error('Unexpected request');});const source={draftId:sourceId,revision:2,ids:[fileId]};await sendDiagnostic(env,'actor',commandId,'recipient@example.test',source);await sendDiagnostic(env,'actor',commandId,'recipient@example.test',source);expect(posts).toBe(1);await expect(sendDiagnostic(env,'actor',commandId,'different@example.test',source)).rejects.toThrow('email_test_command_conflict');});
