import {afterEach,expect,it,vi} from 'vitest';
const dependencies=vi.hoisted(()=>({storage:vi.fn(),job:vi.fn()}));
vi.mock('../worker/operations/storage',()=>({readManagedStorage:dependencies.storage}));
vi.mock('../worker/documents/jobs',()=>({documentJob:dependencies.job}));
vi.mock('../worker/email/oauth',()=>({gmailToken:async()=>'synthetic-token',gmailCanRead:async()=>true}));
import {prepareMail,readMailFile} from '../worker/email/gmail-draft';
import {checkDelivery} from '../worker/email/delivery';
import {hash,url64} from '../worker/email/crypto';
import type {EmailDraft} from '../worker/email/shared';
const id='00000000-0000-4000-8000-000000000001',owner='00000000-0000-4000-8000-000000000002';
const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
function draft(){return {id,owner,hotel:'KAT',document_job_id:id,document_revision:1,revision:1,account_id:'synthetic',account_name:'Synthetic',invoice_ids:['A'],purpose:'billing',recipients:{to:['synthetic@example.test'],cc:[],bcc:[]},subject:'Synthetic',body:'Body',exports:[{name:'Synthetic.pdf',storage_key:`jobs/${id}/exports/${id}.pdf`,byte_count:100,sha256:'a'.repeat(64)}],attachments:[],package_changed:false} satisfies EmailDraft;}
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it('refuses local file reads for a released package before Storage is accessed',async()=>{
 const d={...draft(),bytes_released:true};dependencies.storage.mockRejectedValue(Error('local bytes unavailable'));
 await expect(readMailFile(env,d,d.exports[0])).rejects.toThrow('document_bytes_released');expect(dependencies.storage).not.toHaveBeenCalled();
});
it('refuses MIME preparation from a newly released document projection',async()=>{
 const d=draft();dependencies.job.mockResolvedValue({id,owner,revision:1,acknowledged:true,bytes_released:true});vi.stubGlobal('fetch',async()=>Response.json({allowed:true}));
 await expect(prepareMail(env,owner,d,'<synthetic@example.test>')).rejects.toThrow('document_bytes_released');expect(dependencies.storage).not.toHaveBeenCalled();
});
it.each([false,true].flatMap(altered=>[false,true].map(combined=>({altered,combined}))))('reconciles frozen Gmail evidence without local PDF; altered=$altered combined=$combined',async({altered,combined})=>{
 const bytes=new TextEncoder().encode('%PDF synthetic'),messageId='<synthetic@example.test>',sentAt=new Date(Date.now()-1000).toISOString();
 const expected={mailbox:'phuket',sender:'ar@katathani.com',messageId,recipients:draft().recipients,subject:'Synthetic',body:'Body',files:[{name:'Synthetic.pdf',byte_count:bytes.length,sha256:await hash(bytes)}]};
 const calls:string[]=[];dependencies.storage.mockRejectedValue(Error('local PDF physically absent'));
 vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{const u=String(input);calls.push(u);
  if(u.endsWith('/ar_mail_get'))return Response.json({id,owner,draft_id:combined?null:id,combined_preparation_id:combined?id:null,mode:combined?'send':'draft',state:'created',message_id:messageId,provider_receipt_id:'synthetic-message',created_at:new Date(Date.now()-60000).toISOString(),...(combined?{verified_sent_evidence:{gmailId:'synthetic-message',sentAt,mailbox:'phuket'}}:{}),snapshot:{expected}});
  if(u.includes('/messages/synthetic-message?format=full'))return Response.json({id:'synthetic-message',labelIds:['SENT'],internalDate:String(Date.parse(sentAt)),payload:{mimeType:'multipart/mixed',headers:[{name:'From',value:expected.sender},{name:'To',value:expected.recipients.to[0]},{name:'Subject',value:expected.subject}],parts:[{mimeType:'text/plain',body:{data:url64(new TextEncoder().encode(expected.body))}},{mimeType:'application/pdf',filename:'Synthetic.pdf',body:{size:bytes.length,data:url64(altered?new TextEncoder().encode('%PDF changed!!'):bytes)}}]}});
  if(u.endsWith('/ar_mail_record_verified_sent')||u.endsWith('/ar_mail_record'))return Response.json(true);
  if(u.endsWith('/ar_mail_confirm_sent'))return Response.json({state:'sent',recorded:true});
  throw Error('No local reconstruction or provider send permitted: '+u);
 });
 expect(await checkDelivery(env,owner,id)).toMatchObject(altered?{state:'review_required',recorded:false}:{state:'sent',recorded:true});
 expect(dependencies.storage).not.toHaveBeenCalled();expect(calls.some(u=>/drafts\/send|messages\/send|storage\/v1/.test(u))).toBe(false);
 if(altered)expect(calls.some(u=>/ar_mail_record_verified_sent|ar_mail_confirm_sent/.test(u))).toBe(false);
});
