import {afterEach,it,expect,vi} from 'vitest';
import {deliverMessage,deliveryView} from '../worker/email/delivery';
import {sendCombined} from '../worker/email/combined';
import {prepareMail} from '../worker/email/gmail-draft';
import {hash,url64} from '../worker/email/crypto';
vi.mock('../worker/email/oauth',()=>({gmailToken:async()=>'synthetic-token',gmailCanRead:async()=>true}));
const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=uid(1),env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic',REQUEST_ACTOR:actor};
const bytes=new TextEncoder().encode('%PDF synthetic local-read boundary');
afterEach(()=>vi.unstubAllGlobals());
async function fixture(kind:string,historyFailure=false){
 const digest=await hash(bytes),events:string[]=[],reads:string[]=[],postBodies:any[]=[];
 let denied=false,deniedReads=0,delivery:any=null,providerRelease:()=>void=()=>{},providerArrived:()=>void=()=>{};
 const arrival=new Promise<void>(r=>providerArrived=r),release=new Promise<void>(r=>providerRelease=r);
 const members=['KAT','TSK'].map((hotel,i)=>({memberId:uid(10+i),documentJobId:uid(20+i),documentRevision:1,draftId:uid(30+i),draftRevision:1,stage:null,policyVersion:null,hotel,accountId:'SYNTHETIC-'+i,accountName:'Synthetic '+i,invoiceIds:['I'],purpose:'billing',layout:'combined',stageLabel:null,files:[{fileId:uid(10+i)+':0',name:hotel+'-Invoice.pdf',byteCount:bytes.length,sha256:digest}]}));
 const recipients={to:['synthetic@example.test'],cc:[],bcc:[]};
 const drafts=members.map(m=>({id:m.draftId,owner:actor,document_job_id:m.documentJobId,document_revision:1,revision:1,hotel:m.hotel,account_id:m.accountId,invoice_ids:['I'],purpose:'billing',recipients,subject:'Synthetic',body:'Synthetic body',exports:[{name:'Invoice.pdf',storage_key:`jobs/${m.documentJobId}/exports/reviewed.pdf`,byte_count:bytes.length,sha256:digest}],attachments:[],package_changed:false}));
 const preparation={id:uid(2),revision:1,members,content:{recipients,subject:'Synthetic',body:'Synthetic body',richBody:null,signatureHotel:'KAT'},mailbox:'phuket',totals:{accounts:2,invoices:2,files:2,bytes:bytes.length*2},delivery:null};
 vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{
  const v=init.body?JSON.parse(String(init.body)):{};
  if(url.includes('/storage/')){if(denied){deniedReads++;throw Error('All local Storage reads denied after admission');}events.push('storage');reads.push(url);return new Response(bytes);}
  if(url.endsWith('/ar_email_business_preflight'))return Response.json({allowed:true});
  if(url.endsWith('/ar_email_get'))return Response.json(drafts.find(d=>d.id===v.p_id));
  if(url.endsWith('/ar_document_get')){const m=members.find(m=>m.documentJobId===v.p_job_id)!;return Response.json({id:m.documentJobId,owner:actor,revision:1,acknowledged:true,hotel:m.hotel,account_id:m.accountId,invoice_ids:m.invoiceIds,layout:m.layout});}
  if(url.endsWith('/ar_combined_email_get'))return Response.json({...preparation,delivery:delivery?deliveryView(delivery):null});
  if(url.endsWith('/ar_mail_for_draft')||url.endsWith('/ar_mail_get'))return Response.json(delivery);
  if(url.endsWith('/ar_mail_claim')||url.endsWith('/ar_mail_claim_draft_send')||url.endsWith('/ar_combined_mail_claim')){
   events.push('claim');expect(reads.length).toBeGreaterThan(0);expect(v.p_expected.files.length).toBe(kind==='combined'?2:1);
   denied=true;delivery={...delivery,id:v.p_id,owner:actor,draft_id:drafts[0].id,revision:1,stage:null,mode:kind==='draft'?'draft':'send',state:'pending',message_id:v.p_message_id??delivery?.message_id,created_at:new Date().toISOString(),snapshot:{expected:v.p_expected},...(kind==='draft'?{draft_send_claimed_at:new Date().toISOString()}:{} )};
   return Response.json({...delivery,claimed:true});
  }
  if(url.includes('/drafts/existingDraft?format=full')){
   events.push('gmail-verification');return Response.json({id:'existingDraft',message:{id:'existingMessage',labelIds:['DRAFT'],internalDate:String(Date.now()),payload:{mimeType:'multipart/mixed',headers:[{name:'Message-ID',value:delivery.message_id},{name:'From',value:'ar@katathani.com'},{name:'To',value:recipients.to[0]},{name:'Subject',value:'Synthetic'}],parts:[{mimeType:'text/plain',body:{data:url64(new TextEncoder().encode('Synthetic body'))}},{mimeType:'application/pdf',filename:'Invoice.pdf',body:{size:bytes.length,data:url64(bytes)}}]}}});
  }
  if(url.endsWith('/messages/send')||url.endsWith('/drafts/send')){events.push('provider-post');postBodies.push(v);expect(denied).toBe(true);expect(typeof(v.raw??v.message?.raw)).toBe('string');providerArrived();await release;return Response.json({id:'syntheticAccepted'});}
  if(url.endsWith('/ar_preparation_complete')){expect(delivery.provider_receipt_id).toBe('syntheticAccepted');delivery.preparationRetirement={accepted:true};return Response.json({accepted:true});}
  if(url.endsWith('/ar_mail_record')){events.push('persist-receipt');delivery.state=v.p_state;delivery.provider_receipt_id=v.p_gmail_id;return Response.json(true);}
  if(url.endsWith('/ar_mail_confirm_sent')){events.push('history');if(historyFailure)return Response.json({error:'synthetic_history_unavailable'},{status:503});delivery.state='sent';return Response.json({state:'sent',recorded:true});}
  throw Error('Unexpected synthetic boundary '+url);
 });
 if(kind==='draft'){
  const messageId=`<${uid(99)}@ar-workspace.ar-c82.workers.dev>`,prepared=await prepareMail(env,actor,drafts[0] as any,messageId);
  delivery={id:uid(99),owner:actor,draft_id:drafts[0].id,revision:1,stage:null,mode:'draft',state:'created',gmail_draft_id:'existingDraft',message_id:messageId,created_at:new Date().toISOString(),snapshot:{expected:prepared.expected}};
  reads.length=0;events.length=0;
 }
 return {run:()=>kind==='combined'?sendCombined(env,actor,preparation.id,{revision:1,commandId:uid(3),confirmed:true}):deliverMessage(env,actor,drafts[0].id,1,'send',null),arrival,providerRelease,events,reads,postBodies,deniedReads:()=>deniedReads,delivery:()=>delivery};
}
for(const kind of ['ordinary','draft','combined'])it(`actual ${kind} MIME and claim can finish a stalled provider POST with every post-claim Storage read denied`,async()=>{
 const s=await fixture(kind),pending=s.run();await s.arrival;
 expect(s.events.indexOf('storage')).toBeLessThan(s.events.indexOf('claim'));expect(s.events.indexOf('claim')).toBeLessThan(s.events.indexOf('provider-post'));
 if(kind==='draft')expect(s.events.indexOf('gmail-verification')).toBeLessThan(s.events.indexOf('claim'));
 expect(s.reads).toHaveLength(kind==='combined'?2:1);s.providerRelease();
 expect(await pending).toMatchObject({state:'sent',gmailAccepted:true,recorded:true});
 expect(await s.run()).toMatchObject({state:'sent'});expect(s.postBodies).toHaveLength(1);expect(s.deniedReads()).toBe(0);
});
it('trusted persisted provider send ACK with history pending retires local preparation through the existing delivery projection',async()=>{
 const s=await fixture('ordinary',true),pending=s.run();await s.arrival;s.providerRelease();
 const result=await pending;expect(result).toMatchObject({gmailAccepted:true,recorded:false,reason:'history_recording_unavailable'});
 expect(s.delivery().provider_receipt_id).toBe('syntheticAccepted');
 expect(deliveryView(s.delivery())).toMatchObject({preparationRetirement:{accepted:true}});
});

it('a draft-create provider ACK alone is not completed-send authority',()=>{
 const d={id:uid(99),owner:actor,mode:'draft',state:'created',created_at:new Date().toISOString(),provider_receipt_id:'createdDraftMessage',draft_send_claimed_at:null,sent_at:null,snapshot:{expected:{mailbox:'phuket',sender:'ar@katathani.com',files:[]}}} as any;
 expect(deliveryView(d)).toMatchObject({gmailAccepted:false,recorded:false});expect((deliveryView(d) as any).preparationRetirement?.accepted).not.toBe(true);
});
