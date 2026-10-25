import {afterEach,expect,it,vi} from 'vitest';
import {deliverMessage} from '../worker/email/delivery';
import {url64} from '../worker/email/crypto';
vi.mock('../worker/email/oauth',()=>({gmailToken:async()=>'synthetic-token',gmailCanRead:async()=>true}));
vi.mock('../worker/email/gmail-draft',()=>({prepareMail:async(_e:unknown,_a:string,d:any,messageId:string)=>({raw:'reviewed-bytes',expected:{messageId,recipients:d.recipients,subject:d.subject,body:d.body,files:[]}})}));
afterEach(()=>vi.unstubAllGlobals());
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
function setup(options:{changed?:boolean;missing?:boolean;lost?:boolean;incomplete?:'to'|'subject'|'body'}={}){
 const draft={id:'draft',owner:'actor',hotel:'KAT',revision:1,purpose:'billing',recipients:{to:['recipient@example.test'],cc:[] as string[],bcc:[]},subject:'Synthetic',body:'Synthetic body'};
 const expected={messageId:'<00000000-0000-4000-8000-000000000001@ar-workspace.ar-c82.workers.dev>',recipients:draft.recipients,subject:draft.subject,body:draft.body,files:[]};
 if(options.incomplete==='to'){draft.recipients.to=[];draft.recipients.cc=['recipient@example.test'];}else if(options.incomplete)draft[options.incomplete]='';
 const delivery:any={id:'delivery',owner:'actor',draft_id:'draft',revision:1,mode:'draft',state:'created',stage:null,gmail_draft_id:'draft123',provider_receipt_id:'before123',message_id:expected.messageId,snapshot:{expected}};
 let sends=0,claims=0;
 const message=(sent=false)=>({id:sent?'after123':'before123',labelIds:[sent?'SENT':'DRAFT'],internalDate:String(Date.now()),payload:{mimeType:'text/plain',headers:[{name:'Message-ID',value:expected.messageId},{name:'From',value:'ar@katathani.com'},{name:'To',value:options.changed?'changed@example.test':'recipient@example.test'},{name:'Subject',value:draft.subject}],body:{data:url64(new TextEncoder().encode(draft.body))}}});
 vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{
  const v=init.body?JSON.parse(String(init.body)):{};
  if(url.endsWith('/ar_mail_for_draft')||url.endsWith('/ar_mail_get'))return Response.json(delivery);
  if(url.endsWith('/ar_email_get'))return Response.json(draft);
  if(url.endsWith('/ar_email_business_preflight'))return Response.json({allowed:true});
  if(url.endsWith('/ar_access_authorize')){expect(v.p_actor).toBe('staff');return Response.json({});}
  if(url.endsWith('/drafts/draft123?format=full'))return options.missing?new Response('',{status:404}):Response.json({id:'draft123',message:message()});
  if(url.endsWith('/ar_mail_claim_draft_send')){claims++;if(delivery.state!=='created')return Response.json({...delivery,claimed:false});delivery.state='awaiting_evidence';delivery.provider_receipt_id=null;return Response.json({...delivery,claimed:true});}
  if(url.endsWith('/drafts/send')){sends++;expect(v).toEqual({id:'draft123',message:{raw:'reviewed-bytes'}});if(options.lost)throw Error('lost');return Response.json({id:'after123'});}
  if(url.endsWith('/ar_mail_record')){delivery.state=v.p_state;delivery.provider_receipt_id=v.p_gmail_id;return Response.json(true);}
  if(url.includes('/messages?'))return Response.json({messages:[]});
  if(url.includes('/messages/after123?'))return Response.json(message(true));
  if(url.includes('/messages/before123?'))return new Response('',{status:404});
  if(url.endsWith('/ar_mail_confirm_sent')){delivery.state='sent';return Response.json({state:'sent',recorded:true});}
  throw Error('Unexpected request: '+url);
 });
 return {delivery,counts:()=>({sends,claims})};
}
it('sends the original draft exactly once through drafts.send and verifies its new receipt',async()=>{const s=setup();expect(await deliverMessage(env,'actor','draft',1,'send',null)).toMatchObject({state:'sent'});await deliverMessage(env,'actor','draft',1,'send',null);expect(s.counts()).toEqual({sends:1,claims:1});});
it('keeps an ordinary member able to send a previously created reviewed Gmail Draft once',async()=>{
 const s=setup(),memberEnv={...env,REQUEST_ACTOR:'staff',REQUEST_ACCESS:{actorId:'staff',workspaceOwnerId:'actor',email:'staff@example.invalid',administrator:false,regions:['phuket' as const],scopeHotels:['KAT' as const],revision:1}};
 expect(await deliverMessage(memberEnv,'actor','draft',1,'send',null)).toMatchObject({state:'sent',gmailAccepted:true});await deliverMessage(memberEnv,'actor','draft',1,'send',null);expect(s.counts()).toEqual({sends:1,claims:1});
});
it('two simultaneous send commands cannot submit the same draft twice',async()=>{const s=setup();await Promise.all([deliverMessage(env,'actor','draft',1,'send',null),deliverMessage(env,'actor','draft',1,'send',null)]);expect(s.counts().sends).toBe(1);});
it('rejects a Gmail-edited recipient before acquiring a send claim',async()=>{const s=setup({changed:true});await expect(deliverMessage(env,'actor','draft',1,'send',null)).rejects.toThrow('email_draft_changed');expect(s.counts()).toEqual({sends:0,claims:0});});
it('never recreates a missing Gmail draft',async()=>{const s=setup({missing:true});await deliverMessage(env,'actor','draft',1,'send',null);expect(s.counts()).toEqual({sends:0,claims:0});});
it('does not resubmit after an uncertain send response',async()=>{const s=setup({lost:true});await deliverMessage(env,'actor','draft',1,'send',null);await deliverMessage(env,'actor','draft',1,'send',null);expect(s.counts().sends).toBe(1);});
it.each(['to','subject','body'] as const)('rejects an incomplete %s on an existing draft',async incomplete=>{const s=setup({incomplete});await expect(deliverMessage(env,'actor','draft',1,'send',null)).rejects.toThrow('email_incomplete');expect(s.counts()).toEqual({sends:0,claims:0});});

