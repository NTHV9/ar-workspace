import {afterEach,expect,it,vi} from 'vitest';
import {checkDelivery,deliverMessage,deliveryView,type Delivery} from '../worker/email/delivery';
import {hash,url64} from '../worker/email/crypto';
import {emailApi} from '../worker/email/api';
import {reviewSentMatch,sentCandidates} from '../worker/email/sent-review';
vi.mock('../worker/email/oauth',()=>({gmailToken:async()=>'synthetic-token',gmailCanRead:async()=>true}));
afterEach(()=>vi.unstubAllGlobals());
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'synthetic'},id='00000000-0000-4000-8000-000000000031';
async function fixture(){
 const bytes=new TextEncoder().encode('%PDF synthetic reviewed content'),sentAt=new Date(Date.now()-1000).toISOString();
 const expected={mailbox:'phuket' as const,sender:'ar@katathani.com',messageId:'<synthetic@example.test>',recipients:{to:['recipient@example.test'],cc:[],bcc:[]},subject:'Synthetic',body:'Reviewed body',files:[{name:'Reviewed.pdf',byte_count:bytes.length,sha256:await hash(bytes)}]};
 const delivery:Delivery={id,owner:'owner',draft_id:id,revision:1,mode:'draft',state:'created',stage:null,message_id:expected.messageId,gmail_id:'external-message',provider_receipt_id:'external-message',gmail_draft_id:'original-draft',sent_at:null,reason:null,created_at:new Date(Date.now()-60000).toISOString(),snapshot:{expected}};
 const message={id:'external-message',labelIds:['SENT'],internalDate:String(Date.parse(sentAt)),payload:{mimeType:'multipart/mixed',headers:[{name:'From',value:expected.sender},{name:'To',value:expected.recipients.to[0]},{name:'Subject',value:expected.subject}],parts:[{mimeType:'text/plain',body:{data:url64(new TextEncoder().encode(expected.body))}},{mimeType:'application/pdf',filename:'Reviewed.pdf',body:{size:bytes.length,data:url64(bytes)}}]}};
 return {delivery,message,sentAt,expected};
}
it('persists a verified external Sent outcome before failed history, reopens consistently, and retries the same operation without a provider send',async()=>{
 const {delivery,message,sentAt,expected}=await fixture();let historyAvailable=false,confirmations=0,events=0,proofWrites=0;const calls:string[]=[];
 vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{
  calls.push(url);const v=init.body?JSON.parse(String(init.body)):{};
  if(url.endsWith('/ar_mail_get')||url.endsWith('/ar_mail_for_draft'))return Response.json(delivery);
  if(url.endsWith('/ar_email_get'))return Response.json({id,revision:1,exports:[]});
  if(url.endsWith('/ar_gmail_attempt_get'))return Response.json(null);
  if(url.includes('/messages/external-message?format=full'))return Response.json(message);
  if(url.endsWith('/ar_mail_record_verified_sent')){
   proofWrites++;expect(v).toMatchObject({p_actor:'owner',p_id:id,p_gmail_id:'external-message',p_sent_at:sentAt,p_expected:expected});
   Object.assign(delivery,{verified_sent_evidence:{gmailId:v.p_gmail_id,sentAt:v.p_sent_at,mailbox:'phuket'},state:'awaiting_evidence',reason:'history_recording_unavailable'});return Response.json(true);
  }
  if(url.endsWith('/ar_mail_confirm_sent')){confirmations++;expect(proofWrites).toBeGreaterThan(0);expect(v.p_sent_at).toBe(sentAt);if(!historyAvailable)return new Response('',{status:503});events++;delivery.state='sent';delivery.sent_at=sentAt;return Response.json({state:'sent',recorded:true});}
  throw Error('Unexpected request, especially send or attachment reconstruction: '+url);
 });
 expect(await checkDelivery(env,'owner',id)).toMatchObject({state:'awaiting_evidence',gmailAccepted:true,recorded:false,sentAt});
 const reopened=await emailApi(new Request(`https://app.synthetic.invalid/api/email/${id}`),env,'owner');expect(reopened.status).toBe(200);expect(await reopened.json()).toMatchObject({gmail_handoff:'awaiting_evidence',delivery:{gmailAccepted:true,recorded:false,sentAt}});
 expect(delivery.provider_receipt_id).toBe('external-message');expect(delivery.snapshot.expected).toEqual(expected);
 await deliverMessage(env,'owner',id,1,'send',null);expect(confirmations).toBe(1);
 historyAvailable=true;expect(await checkDelivery(env,'owner',id)).toMatchObject({state:'sent',recorded:true,gmailAccepted:true});
 await checkDelivery(env,'owner',id);expect(events).toBe(1);expect(confirmations).toBe(2);
 expect(calls.filter(url=>url.includes('gmail.googleapis.com/')).every(url=>url.endsWith('?format=full'))).toBe(true);
});
it('does not persist accepted evidence or confirm history for changed external recipients or attachment bytes',async()=>{
 for(const changed of ['recipients','bytes']){
  const {delivery,message}=await fixture();if(changed==='recipients')message.payload.headers[1].value='changed@example.test';else message.payload.parts[1].body.data=url64(new TextEncoder().encode('%PDF different'));
  const writes:string[]=[];vi.stubGlobal('fetch',async(url:string)=>{if(url.endsWith('/ar_mail_get'))return Response.json(delivery);if(url.includes('/messages/external-message?format=full'))return Response.json(message);if(url.endsWith('/ar_mail_record'))return Response.json(true);writes.push(url);throw Error('No proof/history write authorized');});
  expect(await checkDelivery(env,'owner',id)).toMatchObject({state:'review_required',gmailAccepted:false,recorded:false});expect(writes).toEqual([]);
 }
});
it('a malformed or wrong-mailbox external proof never makes an unsent Draft look accepted',async()=>{
 const {delivery}=await fixture();for(const proof of [{gmailId:'unsafe/path',sentAt:'2026-10-24T07:00:00Z',mailbox:'phuket'},{gmailId:'safe',sentAt:'not-a-date',mailbox:'phuket'},{gmailId:'safe',sentAt:'2026-10-24T07:00:00Z',mailbox:'khao-lak'}])expect(deliveryView({...delivery,verified_sent_evidence:proof} as Delivery)).toMatchObject({gmailAccepted:false});
});
it.each(['awaiting_evidence','review_required'])('keeps full external Sent verification and the original proof when a later check cannot match the reviewed bytes: %s',async state=>{
 const {delivery,message,sentAt}=await fixture();delivery.verified_sent_evidence={gmailId:'external-message',sentAt,mailbox:'phuket'};delivery.state=state;if(state==='review_required')delivery.sent_at=sentAt;
 message.payload.parts[1].body.data=url64(new TextEncoder().encode('%PDF changed attachment'));
 const proof=structuredClone(delivery.verified_sent_evidence),calls:string[]=[];
 vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{calls.push(url);if(url.endsWith('/ar_mail_get'))return Response.json(delivery);if(url.includes('/messages/external-message?format=full'))return Response.json(message);if(url.endsWith('/ar_mail_record')){const v=JSON.parse(String(init.body));delivery.state=v.p_state;delivery.reason=v.p_reason;return Response.json(true);}throw Error('No metadata shortcut, proof replacement, history confirmation or provider send');});
 expect(await checkDelivery(env,'owner',id)).toMatchObject({state:'review_required',gmailAccepted:true,recorded:false});expect(delivery.verified_sent_evidence).toEqual(proof);expect(calls.some(url=>/ar_mail_(confirm_sent|record_verified_sent)|drafts\/send|messages\/send|format=metadata/.test(url))).toBe(false);
});
it('retains a manually reviewed rewritten message identity and reason across failed history and API reopen',async()=>{
 const {delivery,message,sentAt,expected}=await fixture();delivery.provider_receipt_id='old-draft-message';message.id='rewritten-message';
 let reviewAudit:null|{proof:string;reason:string}=null,events=0;const providerCalls:{url:string;method:string}[]=[];
 vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{
  const v=init.body?JSON.parse(String(init.body)):{};
  if(url.includes('gmail.googleapis.com'))providerCalls.push({url,method:init.method??'GET'});
  if(url.endsWith('/ar_mail_get')||url.endsWith('/ar_mail_for_draft'))return Response.json(delivery);
  if(url.endsWith('/ar_email_get'))return Response.json({id,revision:1,exports:[]});if(url.endsWith('/ar_gmail_attempt_get'))return Response.json(null);
  if(url.endsWith('/profile'))return Response.json({emailAddress:'ar@katathani.com'});
  if(new URL(url).pathname.endsWith('/messages'))return Response.json({messages:[{id:'rewritten-message'}]});
  if(url.includes('/messages/rewritten-message?format=full'))return Response.json(message);
  if(url.endsWith('/ar_mail_record_verified_review')){
   expect(v).toMatchObject({p_actor:'owner',p_id:id,p_gmail_id:'rewritten-message',p_sent_at:sentAt,p_expected:expected,p_reason:'Confirmed original Sent message'});reviewAudit={proof:v.p_proof,reason:v.p_reason};
   Object.assign(delivery,{verified_sent_evidence:{gmailId:v.p_gmail_id,sentAt:v.p_sent_at,mailbox:'phuket'},state:'awaiting_evidence',reason:'history_recording_unavailable'});return Response.json(true);
  }
  if(url.endsWith('/ar_mail_reviewed_sent'))return new Response('',{status:503});
  if(url.endsWith('/ar_mail_record_verified_sent')){expect(v.p_gmail_id).toBe('rewritten-message');return Response.json(true);}
  if(url.endsWith('/ar_mail_confirm_sent')){expect(reviewAudit).toMatchObject({reason:'Confirmed original Sent message'});expect(v).toMatchObject({p_gmail_id:'rewritten-message',p_sent_at:sentAt});events++;delivery.state='sent';delivery.sent_at=sentAt;return Response.json({state:'sent',recorded:true});}
  throw Error('Unexpected request: '+url);
 });
 const candidate=(await sentCandidates(env,'owner',id)).rows[0];
 await expect(reviewSentMatch(env,'owner',id,{gmailId:candidate.gmailId,proof:candidate.proof!,reason:'  Confirmed original Sent message  ',confirmed:true})).rejects.toThrow();
 const reopened=await emailApi(new Request(`https://app.synthetic.invalid/api/email/${id}`),env,'owner');expect(await reopened.json()).toMatchObject({delivery:{gmailAccepted:true,recorded:false,sentAt}});
 expect(reviewAudit).toEqual({proof:candidate.proof,reason:'Confirmed original Sent message'});expect(delivery.provider_receipt_id).toBe('old-draft-message');
 expect(await checkDelivery(env,'owner',id)).toMatchObject({state:'sent',recorded:true});await checkDelivery(env,'owner',id);expect(events).toBe(1);expect(providerCalls.every(call=>call.method==='GET'&&!call.url.includes('old-draft-message'))).toBe(true);
});
it.each(['proof','bytes'])('does not persist manual reviewed proof before a fresh %s mismatch is rejected',async changed=>{
 const {delivery,message,sentAt,expected}=await fixture();const proof=await hash(new TextEncoder().encode(JSON.stringify({delivery:id,gmailId:'external-message',sentAt,expected})));if(changed==='bytes')message.payload.parts[1].body.data=url64(new TextEncoder().encode('%PDF changed'));
 const writes:string[]=[];vi.stubGlobal('fetch',async(url:string)=>{if(url.endsWith('/ar_mail_get'))return Response.json(delivery);if(url.endsWith('/profile'))return Response.json({emailAddress:'ar@katathani.com'});if(url.includes('/messages/external-message?format=full'))return Response.json(message);writes.push(url);throw Error('No durable write allowed');});
 await expect(reviewSentMatch(env,'owner',id,{gmailId:'external-message',proof:changed==='proof'?'0'.repeat(64):proof,reason:'Reviewed Sent candidate',confirmed:true})).rejects.toThrow('email_sent_match_changed');expect(writes).toEqual([]);
});
