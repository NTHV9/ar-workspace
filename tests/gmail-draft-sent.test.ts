import {afterEach,expect,it,vi} from 'vitest';
vi.mock('../worker/email/oauth',()=>({gmailToken:async()=> 'synthetic',gmailCanRead:async()=>true}));
import {checkDelivery} from '../worker/email/delivery';
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
