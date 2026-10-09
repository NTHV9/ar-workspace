import {afterEach,expect,it,vi} from 'vitest';
import {checkDelivery} from '../worker/email/delivery';
import {url64} from '../worker/email/crypto';
import {mailboxSender,type MailboxId} from '../src/domain/mailboxes';
const credentials=vi.hoisted(()=>({calls:[] as string[]}));
vi.mock('../worker/email/oauth',()=>({gmailCanRead:async()=>true,gmailToken:async(_env:unknown,_actor:string,mailbox:string)=>{credentials.calls.push(mailbox);return mailbox;}}));
const owner='00000000-0000-4000-8000-000000000001',phuketId='00000000-0000-4000-8000-000000000002',khaoId='00000000-0000-4000-8000-000000000003',env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'synthetic'};
afterEach(()=>{vi.unstubAllGlobals();credentials.calls=[];});
it('reconciles identical provider IDs in different mailboxes using the frozen sender and credentials',async()=>{
 const confirms:string[]=[];
 vi.stubGlobal('fetch',async(url:string,init:RequestInit={})=>{
  if(url.endsWith('ar_mail_get')){const id=JSON.parse(String(init.body)).p_id,mailbox:MailboxId=id===phuketId?'phuket':'khao-lak';return Response.json({id,owner,mode:'send',state:'awaiting_evidence',provider_receipt_id:'sameGoogleId',message_id:`<${id}@ar-workspace.ar-c82.workers.dev>`,snapshot:{expected:{mailbox,sender:mailboxSender(mailbox),messageId:`<${id}@ar-workspace.ar-c82.workers.dev>`,recipients:{to:['synthetic@example.test'],cc:[],bcc:[]},subject:'Synthetic',body:'Preserved body',files:[]}}});}
  if(url.includes('/messages/sameGoogleId?')){const mailbox=(init.headers as Record<string,string>).Authorization.slice('Bearer '.length) as MailboxId;return Response.json({id:'sameGoogleId',labelIds:['SENT'],internalDate:String(Date.now()-60000),payload:{mimeType:'text/plain',headers:[{name:'From',value:mailboxSender(mailbox)},{name:'To',value:'synthetic@example.test'},{name:'Subject',value:'Synthetic'}],body:{data:url64(new TextEncoder().encode('Preserved body'))}}});}
  if(url.endsWith('ar_mail_confirm_sent')){const v=JSON.parse(String(init.body));confirms.push(v.p_id);return Response.json({state:'sent',recorded:true});}
  throw Error('Unexpected provider operation');
 });
 expect(await checkDelivery(env,owner,phuketId)).toMatchObject({state:'sent'});expect(await checkDelivery(env,owner,khaoId)).toMatchObject({state:'sent'});expect(credentials.calls).toEqual(['phuket','khao-lak']);expect(confirms).toEqual([phuketId,khaoId]);
});
it('does not look in the other mailbox after frozen evidence is absent',async()=>{
 const paths:string[]=[];vi.stubGlobal('fetch',async(url:string)=>{paths.push(url);if(url.endsWith('ar_mail_get'))return Response.json({id:khaoId,owner,mode:'send',state:'awaiting_evidence',created_at:new Date().toISOString(),message_id:`<${khaoId}@ar-workspace.ar-c82.workers.dev>`,snapshot:{expected:{mailbox:'khao-lak',sender:mailboxSender('khao-lak'),subject:'Synthetic'}}});if(url.includes('/messages?'))return Response.json({messages:[]});throw Error('Unexpected write');});
 expect(await checkDelivery(env,owner,khaoId)).toMatchObject({reason:'no_sent_evidence'});expect(credentials.calls).toEqual(['khao-lak']);expect(paths.some(p=>p.endsWith('ar_mail_confirm_sent'))).toBe(false);
});
