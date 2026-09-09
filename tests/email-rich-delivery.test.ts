import {it,expect} from 'vitest';
import {parseEmailDraft} from '../worker/email/validation';
import {buildMime} from '../worker/email/mime';
import {verifySentEvidence} from '../worker/email/sent-evidence';
import {url64} from '../worker/email/crypto';
import {plainMessage,richHtml,parseRichMessage} from '../src/email/rich-message';
import {jsonBody} from '../worker/email/shared';
const richBody=plainMessage('Hello & review');
richBody.blocks[0].runs[0].bold=true;
const input={revision:0,purpose:'billing' as const,recipients:{to:['example@example.test'],cc:[],bcc:[]},subject:'Synthetic rich message',body:'Hello & review',richBody};
const messageId='<00000000-0000-4000-8000-000000000000@ar-workspace.ar-c82.workers.dev>';
it('reserves database serialization space for heavily formatted multilingual messages',()=>{
 const value={version:1,blocks:[{type:'paragraph',runs:Array.from({length:4000},(_,i)=>({text:'ท'.repeat(24),bold:true,italic:true,...(i%2?{underline:true}:{})}))}]};
 expect(()=>parseRichMessage(value)).toThrow('rich_message_too_large');
});
it('accepts the full multilingual editor text budget in a saved rich request',async()=>{
 const body='ท'.repeat(100000);const value={...input,body,richBody:plainMessage(body)};
 const request=new Request('https://app.test/api/email/save',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
 expect(parseEmailDraft(await jsonBody(request)).body.length).toBe(100000);
});
it('binds rich content to matching plain text and rejects inconsistent content',()=>{
 expect(parseEmailDraft(input).richBody).toEqual(richBody);
 expect(()=>parseEmailDraft({...input,body:'Different payment instruction'})).toThrow();
 const mime=new TextDecoder().decode(buildMime(input,[],messageId));expect(mime).toContain('multipart/alternative');expect(mime).toContain('text/html');
});
it('verifies both exact body representations and refuses changed HTML despite matching plain text',async()=>{
 const message={id:'test',labelIds:['SENT'],internalDate:String(Date.now()-60000),payload:{headers:[{name:'Message-ID',value:messageId},{name:'From',value:'ar@katathani.com'},{name:'To',value:'example@example.test'},{name:'Subject',value:input.subject}],parts:[{mimeType:'text/plain',body:{data:url64(new TextEncoder().encode(input.body))}},{mimeType:'text/html',body:{data:url64(new TextEncoder().encode(richHtml(richBody)))}}]}};
 const expected={messageId,recipients:input.recipients,subject:input.subject,body:input.body,richBody,files:[]};
 expect(await verifySentEvidence(message,expected,async()=>new Uint8Array())).toMatchObject({status:'verified'});
 message.payload.parts[1].body.data=url64(new TextEncoder().encode('<p>Changed account instructions</p>'));
 expect(await verifySentEvidence(message,expected,async()=>new Uint8Array())).toMatchObject({status:'review_required'});
});
