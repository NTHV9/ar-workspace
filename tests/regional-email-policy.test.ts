import {afterEach,expect,it,vi} from 'vitest';
import {requireRegionalDelivery} from '../worker/email/regional-delivery';
import {hotelMailbox,mailboxSender,frozenMailIdentity} from '../src/domain/mailboxes';
import {buildMime} from '../worker/email/mime';
import {parseConversation,externalRecipients} from '../worker/email/threads';
import {verifySentEvidence} from '../worker/email/sent-evidence';
import {url64} from '../worker/email/crypto';
const id='00000000-0000-4000-8000-000000000021';
afterEach(()=>vi.unstubAllGlobals());
it.each(['TLKL','WAKL','TLFO','TSAN'])('routes approved Khao Lak hotel %s without a provider write',async hotel=>{const fetcher=vi.fn(async(_input:RequestInfo|URL)=>Response.json({allowed:true}));vi.stubGlobal('fetch',fetcher);await requireRegionalDelivery({SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SECRET_KEY:'synthetic'}, {id,hotel,owner:id});expect(hotelMailbox(hotel)).toBe('khao-lak');expect(mailboxSender(hotelMailbox(hotel))).toBe('ar@thesandskhaolak.com');expect(fetcher).toHaveBeenCalledTimes(1);expect(String(fetcher.mock.calls[0][0])).toContain('/ar_email_business_preflight');});
it.each(['KAT','TSK'])('preserves Phuket sender for %s',hotel=>expect(mailboxSender(hotelMailbox(hotel))).toBe('ar@katathani.com'));
it('rejects unknown hotels and mixed frozen identities',()=>{expect(()=>hotelMailbox('UNKNOWN')).toThrow('email_invalid');expect(()=>frozenMailIdentity({mailbox:'khao-lak',sender:'ar@katathani.com'})).toThrow('email_forbidden');expect(frozenMailIdentity({})).toEqual({mailbox:'phuket',sender:'ar@katathani.com'});});
it('uses the frozen sender in MIME and requires it in SENT evidence',async()=>{
 const identity={mailbox:'khao-lak' as const,sender:'ar@thesandskhaolak.com'},input={revision:0,purpose:'billing' as const,recipients:{to:['synthetic@example.test'],cc:[],bcc:[]},subject:'Synthetic',body:'Body'},messageId=`<${id}@ar-workspace.ar-c82.workers.dev>`;
 expect(new TextDecoder().decode(buildMime(input,[],messageId,null,identity))).toContain('From: ar@thesandskhaolak.com');
 const message={id:'sameGoogleId',internalDate:String(Date.now()-60000),labelIds:['SENT'],payload:{mimeType:'text/plain',headers:[{name:'Message-ID',value:messageId},{name:'From',value:identity.sender},{name:'To',value:input.recipients.to[0]},{name:'Subject',value:input.subject}],body:{data:url64(new TextEncoder().encode(input.body))}}};
 expect((await verifySentEvidence(message,{...input,...identity,messageId,files:[]},async()=>new Uint8Array())).status).toBe('verified');
 message.payload.headers[1].value='ar@katathani.com';expect(await verifySentEvidence(message,{...input,...identity,messageId,files:[]},async()=>new Uint8Array())).toMatchObject({status:'review_required',reason:'message_identity'});
});
it('uses mailbox-specific self filtering and thread direction',()=>{
 const self='ar@thesandskhaolak.com',recipients={to:[self,'synthetic@example.test'],cc:[],bcc:[]};expect(externalRecipients(recipients,self)).toEqual(['synthetic@example.test']);
 const result=parseConversation({id:'sameThread',historyId:'1',messages:[{id:'sameGoogleId',threadId:'sameThread',internalDate:String(Date.now()-60000),payload:{headers:[{name:'Message-ID',value:'<synthetic@example.test>'},{name:'From',value:self},{name:'To',value:'synthetic@example.test'},{name:'Subject',value:'Synthetic'}]}}]},'sameThread',recipients,undefined,self);
 expect(result.messages[0].direction).toBe('outgoing');
});
