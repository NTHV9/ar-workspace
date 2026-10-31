import {afterEach,it,expect,vi} from 'vitest';
import {sendCombined} from '../worker/email/combined';
import {prepareCombinedMail} from '../worker/email/combined-files';
import {checkDelivery} from '../worker/email/delivery';
import {hash} from '../worker/email/crypto';
import type {CombinedEmail} from '../src/email/combined';
vi.mock('../worker/email/oauth',()=>({gmailToken:async()=>'synthetic-token',gmailCanRead:async()=>true}));
const actor='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',command='00000000-0000-4000-8000-000000000003';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
const bytes=new TextEncoder().encode('%PDF synthetic');
const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
afterEach(()=>vi.unstubAllGlobals());
async function fixture(){
 const digest=await hash(bytes);
 const members=['KAT','TSK'].map((hotel,i)=>({memberId:uid(10+i),documentJobId:uid(20+i),documentRevision:1,draftId:uid(30+i),draftRevision:1,stage:null,policyVersion:null,hotel,accountId:'A'+i,accountName:'Synthetic '+i,invoiceIds:['I'],purpose:'billing',layout:i?'separate':'combined',stageLabel:null,files:[{fileId:uid(10+i)+':0',name:hotel+'-A'+i+'-Invoice.pdf',byteCount:bytes.length,sha256:digest}]}));
 const p={id,revision:1,members,content:{recipients:{to:['manual@example.test'],cc:[],bcc:[]},subject:'Synthetic combined',body:'Synthetic body',richBody:null,signatureHotel:'KAT'},mailbox:'phuket',totals:{accounts:2,invoices:2,files:2,bytes:bytes.length*2},delivery:null} as CombinedEmail;
 const drafts=members.map(m=>({id:m.draftId,owner:actor,document_job_id:m.documentJobId,document_revision:1,revision:1,hotel:m.hotel,account_id:m.accountId,invoice_ids:['I'],purpose:'billing',recipients:{to:[],cc:[],bcc:[]},subject:'Separate untouched',body:'Separate untouched',exports:[{name:'Invoice.pdf',storage_key:`jobs/${m.documentJobId}/exports/reviewed.pdf`,byte_count:bytes.length,sha256:digest}],attachments:[] as {id:string;name:string;storage_key:string;mime:string;byte_count:number;sha256:string}[],package_changed:false}));
 return {p,drafts};
}
function server(p:CombinedEmail,drafts:any[],options:{unknown?:boolean;historyFailure?:boolean;originalInvoiceIds?:string[]}={}){
 let delivery:any=null,posts=0;const reads:string[]=[];const mime:string[]=[];
 vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{
 const v=init.body?JSON.parse(String(init.body)):{};
 if(url.endsWith('/ar_combined_email_get'))return Response.json({...p,delivery:delivery?{id:delivery.id,state:delivery.state,mode:'send',recorded:delivery.state==='sent',gmailAccepted:!!delivery.provider_receipt_id}:null});
 if(url.endsWith('/ar_email_get'))return Response.json(drafts.find(d=>d.id===v.p_id)??null);
 if(url.endsWith('/ar_email_business_preflight'))return Response.json({allowed:true});
 if(url.endsWith('/ar_document_get')){const m=p.members.find(m=>m.documentJobId===v.p_job_id)!;return Response.json({id:m.documentJobId,owner:actor,revision:1,acknowledged:true,hotel:m.hotel,account_id:m.accountId,invoice_ids:options.originalInvoiceIds??m.invoiceIds,layout:m.layout});}
 if(url.endsWith('/ar_storage_read'))return Response.json({allowed:true});
 if(url.includes('/storage/')){reads.push(url);return new Response(bytes);}
 if(url.endsWith('/ar_combined_mail_claim')){if(v.p_expected.signatureHotel!==p.content.signatureHotel)return Response.json({error:'email_signature_changed'});if(delivery)return Response.json({...delivery,claimed:false});delivery={id:v.p_id,owner:actor,draft_id:null,mode:'send',state:'pending',message_id:v.p_message_id,created_at:new Date().toISOString(),snapshot:{expected:v.p_expected}};return Response.json({...delivery,claimed:true});}
 if(url.endsWith('/messages/send')){posts++;mime.push(Buffer.from(v.raw.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'));if(options.unknown)throw Error('lost');return Response.json({id:'acceptedMessage'});}
 if(url.endsWith('/ar_mail_get'))return Response.json(delivery);
 if(url.endsWith('/ar_mail_record')){delivery.state=v.p_state;if(v.p_gmail_id)delivery.provider_receipt_id=v.p_gmail_id;return Response.json(true);}
 if(url.endsWith('/ar_mail_confirm_sent')){if(options.historyFailure)return Response.json({error:'unavailable'});delivery.state='sent';return Response.json({state:'sent',recorded:true});}
 if(url.includes('/messages?'))return Response.json({messages:[]});
 if(url.includes('/messages/acceptedMessage?format=metadata'))return Response.json({id:'acceptedMessage',labelIds:['SENT'],internalDate:String(Date.now())});
 throw Error('Unexpected synthetic boundary '+url);
 });
 return {posts:()=>posts,reads,mime,recover:()=>{options.historyFailure=false;}};
}
for(const mode of ['normal','unknown','historyFailure'] as const)it(`one real root provider POST with two own-member packages, including retry: ${mode}`,async()=>{
 const {p,drafts}=await fixture(),s=server(p,drafts,{unknown:mode==='unknown',historyFailure:mode==='historyFailure'});
 const first=await sendCombined(env,actor,id,{revision:1,commandId:command,confirmed:true});
 expect(first).toMatchObject(mode==='normal'?{state:'sent',recorded:true}:mode==='unknown'?{state:'awaiting_evidence',recorded:false}:{gmailAccepted:true,recorded:false,reason:'history_recording_unavailable'});
 await sendCombined(env,actor,id,{revision:1,commandId:command,confirmed:true});expect(s.posts()).toBe(1);
 expect(s.reads).toHaveLength(2);for(const m of p.members)expect(s.reads.some(r=>r.includes(m.documentJobId))).toBe(true);
 expect(s.mime[0]).toMatch(/to: manual@example.test/i);expect(s.mime[0]).not.toContain('Separate untouched');
 for(const m of p.members)expect(s.mime[0]).toContain('filename="'+m.files[0].name+'"');
 if(mode==='historyFailure'){s.recover();expect(await checkDelivery(env,actor,command)).toMatchObject({recorded:true,state:'sent'});expect(s.posts()).toBe(1);}
});
it('concurrent commands admit only one real Gmail POST through the durable claim',async()=>{
 const {p,drafts}=await fixture(),s=server(p,drafts);await Promise.all([command,uid(4)].map(commandId=>sendCombined(env,actor,id,{revision:1,commandId,confirmed:true})));expect(s.posts()).toBe(1);
});
it.each(['foreignOwner','revision','job','hotel','account','crossMailbox','signatureHotel','duplicateName','budget'] as const)('rejects %s without storage or provider writes',async kind=>{
 const {p,drafts}=await fixture();
 if(kind==='foreignOwner')drafts[1].owner=uid(99);if(kind==='revision')drafts[1].revision=2;if(kind==='job')drafts[1].document_job_id=uid(99);if(kind==='hotel')drafts[1].hotel='KAT';if(kind==='account')drafts[1].account_id='foreign';if(kind==='crossMailbox')p.members[1].hotel='TLKL';if(kind==='signatureHotel')p.content.signatureHotel='TLKL';if(kind==='duplicateName')p.members[1].files[0].name=p.members[0].files[0].name;if(kind==='budget')p.members[1].files[0].byteCount=12*1024*1024;
 const s=server(p,drafts);await expect(sendCombined(env,actor,id,{revision:1,commandId:command,confirmed:true})).rejects.toThrow();expect(s.posts()).toBe(0);expect(s.reads).toHaveLength(0);
});
it('counts the one inline signature asset in complete package count and bytes',async()=>{
 const {p,drafts}=await fixture();p.content.richBody={version:1,blocks:[],signature:{staffId:actor,name:'Synthetic',title:'Staff',workplace:'Katathani Phuket Beach Resort'}} as any;
 const s=server(p,drafts);p.members[0].files=Array.from({length:49},(_,i)=>({...p.members[0].files[0],fileId:p.members[0].memberId+':'+i,name:'file'+i+'.pdf'}));
 await expect(prepareCombinedMail(env,actor,p,`<${command}@ar-workspace.ar-c82.workers.dev>`)).rejects.toThrow('email_too_large');expect(s.reads).toHaveLength(0);
});

it('keeps mixed export layouts and supplemental files in their own order with one inline logo',async()=>{
 const {plainMessage,richText}=await import('../src/email/rich-message');const {p,drafts}=await fixture();
 const supplemental={...drafts[1].exports[0],id:uid(50),name:'Extra.pdf',mime:'application/pdf',storage_key:`jobs/${p.members[1].documentJobId}/attachments/extra.pdf`};drafts[1].attachments.push(supplemental);
 p.members[1].files.push({...p.members[1].files[0],fileId:p.members[1].memberId+':1',name:'TSK-A1-Extra.pdf'});
 p.content.richBody={...plainMessage('Synthetic body'),signature:{staffId:actor,name:'Synthetic',title:'Staff',workplace:'Katathani Phuket Beach Resort'}};p.content.body=richText(p.content.richBody);
 const s=server(p,drafts);expect(await sendCombined(env,actor,id,{revision:1,commandId:command,confirmed:true})).toMatchObject({recorded:true});expect(s.posts()).toBe(1);expect(s.reads).toHaveLength(3);
 expect((s.mime[0].match(/Content-Disposition: attachment/g)??[])).toHaveLength(3);expect((s.mime[0].match(/Content-ID:/g)??[])).toHaveLength(1);
 expect(s.mime[0].indexOf('TSK-A1-Invoice.pdf')).toBeLessThan(s.mime[0].indexOf('TSK-A1-Extra.pdf'));
});
it('fails closed on member storage path substitution even when the content digest is unchanged',async()=>{
 const {p,drafts}=await fixture();drafts[1].exports[0].storage_key=drafts[0].exports[0].storage_key;const s=server(p,drafts);
 await expect(sendCombined(env,actor,id,{revision:1,commandId:command,confirmed:true})).rejects.toThrow('email_attachment_invalid');expect(s.posts()).toBe(0);
});
it('sends the reviewed member subset while retaining the larger original job identity',async()=>{
 const {p,drafts}=await fixture();const s=server(p,drafts,{originalInvoiceIds:['REMOVED','I']});
 expect(await sendCombined(env,actor,id,{revision:1,commandId:command,confirmed:true})).toMatchObject({recorded:true});
 expect(s.posts()).toBe(1);expect(s.reads).toHaveLength(2);
});
