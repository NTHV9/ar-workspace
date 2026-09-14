import {afterEach,expect,it,vi} from 'vitest';
vi.mock('../worker/email/oauth',()=>({gmailToken:async()=> 'synthetic',gmailCanRead:async()=>true}));
import {checkDelivery,deliveryView} from '../worker/email/delivery';
const id='00000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-000000000002';
const expected={messageId:`<${id}@ar-workspace.ar-c82.workers.dev>`,subject:'Synthetic Gmail draft test',body:'Synthetic body',recipients:{to:['allowed@example.invalid'],cc:[],bcc:[]},files:[]};
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
afterEach(()=>vi.unstubAllGlobals());
function harness(labels=['SENT'],recipient='allowed@example.invalid'){
 const calls:string[]=[];vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{const u=new URL(String(input));calls.push(u.pathname);
  if(u.pathname.endsWith('ar_mail_get'))return Response.json({id,owner:actor,mode:'draft',state:'created',provider_receipt_id:'syntheticGmailId',snapshot:{expected}});
  if(u.pathname.endsWith('/syntheticGmailId'))return Response.json({id:'syntheticGmailId',labelIds:labels,internalDate:String(Date.now()-1000),payload:{mimeType:'text/plain',headers:[{name:'From',value:'ar@katathani.com'},{name:'To',value:recipient},{name:'Subject',value:expected.subject},{name:'Message-ID',value:'<rewritten-by-gmail@google.test>'}],body:{data:btoa(expected.body)}}});
  if(u.pathname.endsWith('ar_mail_confirm_sent'))return Response.json({state:'sent',recorded:true});
  if(u.pathname.endsWith('ar_mail_record'))return Response.json(true);
  throw Error('Unexpected synthetic request '+u.pathname);
 });return calls;
}
it('verifies a sent Gmail draft by its recorded provider ID even when RFC/custom headers change',async()=>{const calls=harness();expect(await checkDelivery(env,actor,id)).toMatchObject({state:'sent',recorded:true});expect(calls).toContain('/rest/v1/rpc/ar_mail_confirm_sent');expect(calls.some(p=>p.endsWith('/messages/send'))).toBe(false);});
it('does not mistake the same provider message still labelled DRAFT for sending',async()=>{const calls=harness(['DRAFT']);expect(await checkDelivery(env,actor,id)).toMatchObject({state:'created'});expect(calls).not.toContain('/rest/v1/rpc/ar_mail_confirm_sent');});
it('provider identity never bypasses recipient and content verification',async()=>{const calls=harness(['SENT'],'changed@example.invalid');expect(await checkDelivery(env,actor,id)).toMatchObject({state:'review_required'});expect(calls).not.toContain('/rest/v1/rpc/ar_mail_confirm_sent');});
it('turns a missing trusted draft message into actionable review without searching or resending',async()=>{
 const calls:{path:string;method:string;body:Record<string,unknown>|null}[]=[];
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init:RequestInit={})=>{const path=new URL(String(input)).pathname,body=init.body?JSON.parse(String(init.body)):null;calls.push({path,method:init.method??'GET',body});if(path.endsWith('ar_mail_get'))return Response.json({id,owner:actor,mode:'draft',state:'created',stage:'Friendly',provider_receipt_id:'removed-draft-message',snapshot:{expected}});if(path.endsWith('/removed-draft-message'))return Response.json({error:{code:404}},{status:404});if(path.endsWith('ar_mail_record'))return Response.json(true);throw Error('Unexpected request');});
 expect(await checkDelivery(env,actor,id)).toMatchObject({id,state:'review_required',reason:'gmail_receipt_missing',recorded:false,stage:'Friendly'});
 expect(calls.find(call=>call.path.endsWith('ar_mail_record'))?.body).toMatchObject({p_state:'review_required',p_reason:'gmail_receipt_missing'});
 expect(calls.filter(call=>call.path.includes('/gmail/')).map(call=>call.path)).toEqual(['/gmail/v1/users/me/messages/removed-draft-message']);
 expect(calls.some(call=>/ar_mail_confirm_sent|messages\/send|\/drafts$/.test(call.path))).toBe(false);
});
it('does not classify auth, throttling or provider failures as a missing receipt',async()=>{
 for(const status of [401,403,429,500]){const calls:string[]=[];vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{const path=new URL(String(input)).pathname;calls.push(path);if(path.endsWith('ar_mail_get'))return Response.json({id,owner:actor,mode:'draft',state:'created',provider_receipt_id:'retained-message',snapshot:{expected}});if(path.endsWith('/retained-message'))return Response.json({error:{code:status}},{status});throw Error('Unexpected request');});await expect(checkDelivery(env,actor,id)).rejects.toThrow(status===401||status===403?'gmail_reconnect_required':'gmail_unavailable');expect(calls.some(path=>/ar_mail_record|ar_mail_confirm_sent/.test(path))).toBe(false);}
});
it('returns the captured collection stage and label for a locked saved handoff',()=>{
 const delivery={id,owner:actor,draft_id:actor,revision:2,mode:'draft' as const,state:'created',stage:'Friendly',message_id:expected.messageId,gmail_id:null,provider_receipt_id:'saved-draft-message',gmail_draft_id:'draft-id',sent_at:null,reason:null,created_at:'2026-09-10T00:00:00Z',snapshot:{expected},stage_snapshot:{key:'Friendly',label:'Original friendly reminder',anchor:'due',offsetDays:-7,terminal:false,policyVersion:1,position:0,earlierKeys:[]}};
 expect(deliveryView(delivery)).toMatchObject({stage:'Friendly',stageLabel:'Original friendly reminder',state:'created',recorded:false});
 expect(deliveryView({...delivery,stage_snapshot:undefined})).toMatchObject({stage:'Friendly',stageLabel:'Friendly'});
});
