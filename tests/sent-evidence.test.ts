import {expect,it} from 'vitest';
import {verifySentEvidence,verifyDraftEvidence,type ExpectedMail} from '../worker/email/sent-evidence';
import {hash,url64} from '../worker/email/crypto';
import {buildMime} from '../worker/email/mime';
const bytes=new TextEncoder().encode('synthetic PDF bytes');
async function fixture(){const expected:ExpectedMail={messageId:'<synthetic@example.test>',recipients:{to:['recipient@example.test'],cc:[],bcc:[]},subject:'Synthetic subject',body:'Hello\nTest',files:[{name:'test.pdf',sha256:await hash(bytes),byte_count:bytes.length}]};
const message={id:'abc123',labelIds:['SENT'],internalDate:String(Date.parse('2026-09-09T16:30:00Z')),payload:{mimeType:'multipart/mixed',headers:[{name:'Message-ID',value:expected.messageId},{name:'From',value:'AR <ar@katathani.com>'},{name:'To',value:'recipient@example.test'},{name:'Subject',value:expected.subject}],parts:[{mimeType:'text/plain',body:{data:url64(new TextEncoder().encode('Hello\r\nTest'))}},{mimeType:'application/pdf',filename:'test.pdf',body:{size:bytes.length,attachmentId:'attachment1'}}]}};return {expected,message};}
it('requires SENT label and uses Gmail timestamp',async()=>{const {expected,message}=await fixture();expect(await verifySentEvidence(message,expected,async()=>bytes)).toMatchObject({status:'verified',sentAt:'2026-09-09T16:30:00.000Z'});message.labelIds=['DRAFT'];expect(await verifySentEvidence(message,expected,async()=>bytes)).toMatchObject({status:'not_sent'});});
it('verifies draft bytes without producing Sent evidence and rejects changed recipients',async()=>{
 const {expected,message}=await fixture();message.labelIds=['DRAFT'];
 expect(await verifyDraftEvidence(message,expected,async()=>bytes)).toEqual({status:'verified'});
 expect(await verifySentEvidence(message,expected,async()=>bytes)).toEqual({status:'not_sent'});
 message.payload.headers[2].value='changed@example.test';
 expect(await verifyDraftEvidence(message,expected,async()=>bytes)).toMatchObject({status:'review_required',reason:'message_recipients'});
 message.labelIds=['SENT'];expect(await verifyDraftEvidence(message,expected,async()=>bytes)).toMatchObject({status:'not_sent'});
});
it('does not count changed recipients or missing/changed attachments',async()=>{const {expected,message}=await fixture();message.payload.headers[2].value='other@example.test';expect(await verifySentEvidence(message,expected,async()=>bytes)).toMatchObject({status:'review_required'});message.payload.headers[2].value='recipient@example.test';expect(await verifySentEvidence(message,expected,async()=>new Uint8Array([1]))).toMatchObject({status:'review_required'});message.payload.parts.pop();expect(await verifySentEvidence(message,expected,async()=>bytes)).toMatchObject({status:'review_required'});});
it('does not accept another Message-ID or a future timestamp',async()=>{const {expected,message}=await fixture();message.payload.headers[0].value='<unrelated@example.test>';expect(await verifySentEvidence(message,expected,async()=>bytes)).toMatchObject({status:'review_required'});message.payload.headers[0].value=expected.messageId;message.internalDate=String(Date.now()+3600000);expect(await verifySentEvidence(message,expected,async()=>bytes)).toMatchObject({status:'review_required'});});


it('rejects an extra recipient-visible representation and contradictory draft label',async()=>{const {expected,message}=await fixture();message.payload.parts.push({mimeType:'text/html',body:{data:url64(new TextEncoder().encode('<p>Changed content</p>'))}});expect(await verifySentEvidence(message,expected,async()=>bytes)).toMatchObject({status:'review_required'});message.payload.parts.pop();message.labelIds=['SENT','DRAFT'];expect(await verifySentEvidence(message,expected,async()=>bytes)).toMatchObject({status:'not_sent'});});

it('accepts Gmail-rewritten RFC ID only with exact backend receipt ID or preserved correlation',async()=>{const {expected,message}=await fixture();message.payload.headers[0].value='<rewritten@mail.gmail.com>';expect(await verifySentEvidence(message,{...expected,gmailId:'abc123'},async()=>bytes)).toMatchObject({status:'verified'});expect(await verifySentEvidence(message,{...expected,gmailId:'other'},async()=>bytes)).toMatchObject({status:'review_required'});});

it('does not let matching RFC correlation override a different immutable receipt',async()=>{const {expected,message}=await fixture();expect(await verifySentEvidence(message,{...expected,gmailId:'different-receipt'},async()=>bytes)).toMatchObject({status:'review_required'});});

it('moving an already sent message to Trash does not undo independently verified sending',async()=>{const {expected,message}=await fixture();message.labelIds=['SENT','TRASH'];expect(await verifySentEvidence(message,expected,async()=>bytes)).toMatchObject({status:'verified'});message.labelIds=['TRASH'];expect(await verifySentEvidence(message,expected,async()=>bytes)).toMatchObject({status:'not_sent'});});

it('allows Gmail line wrapping without accepting changed words, amounts or paragraph boundaries',async()=>{const {expected,message}=await fixture();expected.body='Please review the synthetic invoice amount THB 1000.\n\nNo payment is requested.';message.payload.parts[0].body.data=url64(new TextEncoder().encode('Please review the synthetic\ninvoice amount THB 1000.\n\nNo payment is requested.'));expect(await verifySentEvidence(message,expected,async()=>bytes)).toMatchObject({status:'verified'});message.payload.parts[0].body.data=url64(new TextEncoder().encode('Please review the synthetic invoice amount THB 2000.\n\nNo payment is requested.'));expect(await verifySentEvidence(message,expected,async()=>bytes)).toMatchObject({status:'review_required',reason:'message_body'});message.payload.parts[0].body.data=url64(new TextEncoder().encode('Please review the synthetic invoice amount THB 1000. No payment is requested.'));expect(await verifySentEvidence(message,expected,async()=>bytes)).toMatchObject({status:'review_required'});});

it.each([
 ['Billing (SAMPLE).pdf','Billing _SAMPLE_.pdf'],
 ['เอกสาร café.pdf','______ caf_.pdf'],
])('verifies the exact MIME fallback filename for %s without changing the frozen original',async(name,fallback)=>{
 const {expected,message}=await fixture();expected.files[0].name=name;
 const raw=new TextDecoder().decode(buildMime({revision:0,purpose:'billing',recipients:expected.recipients,subject:expected.subject,body:expected.body},[{name,mime:'application/pdf',bytes}],'<00000000-0000-4000-8000-000000000000@ar-workspace.ar-c82.workers.dev>'));
 const transported=/Content-Disposition: attachment; filename="([^"]+)"/.exec(raw)?.[1];
 expect(transported).toBe(fallback);message.payload.parts[1].filename=transported;
 expect(await verifySentEvidence(message,expected,async()=>bytes)).toMatchObject({status:'verified'});
 message.labelIds=['DRAFT'];expect(await verifyDraftEvidence(message,expected,async()=>bytes)).toEqual({status:'verified'});
 expect(expected.files[0].name).toBe(name);
});

it('still refuses an unrelated filename or altered bytes after a fallback filename match',async()=>{
 const {expected,message}=await fixture();expected.files[0].name='Billing (SAMPLE).pdf';
 message.payload.parts[1].filename='unrelated.pdf';
 expect(await verifySentEvidence(message,expected,async()=>bytes)).toMatchObject({status:'review_required',reason:'attachment_metadata'});
 message.payload.parts[1].filename='Billing _SAMPLE_.pdf';
 const changed=bytes.slice();changed[0]^=1;
 expect(await verifySentEvidence(message,expected,async()=>changed)).toMatchObject({status:'review_required',reason:'attachment_content'});
});

it('disambiguates colliding fallback names using exact hashes in either attachment order',async()=>{
 const {expected,message}=await fixture();const other=bytes.slice();other[0]^=1;
 expected.files=[{name:'Bill (A).pdf',sha256:await hash(bytes),byte_count:bytes.length},{name:'Bill [A].pdf',sha256:await hash(other),byte_count:other.length}];
 const first={mimeType:'application/pdf',filename:'Bill _A_.pdf',body:{size:bytes.length,attachmentId:'first'}};
 const second={...first,body:{size:other.length,attachmentId:'second'}};
 const plain=message.payload.parts[0];
 for(const files of [[first,second],[second,first]]){
  message.payload.parts=[plain,...files];
  expect(await verifySentEvidence(message,expected,async id=>id==='first'?bytes:other)).toMatchObject({status:'verified'});
 }
 expected.files[1].sha256=expected.files[0].sha256;
 expect(await verifySentEvidence(message,expected,async()=>bytes)).toMatchObject({status:'review_required'});
});

it('reports filename failure after a valid inline logo as metadata rather than content',async()=>{
 const {expected,message}=await fixture();expected.files.unshift({name:'logo.png',byte_count:bytes.length,sha256:await hash(bytes),inlineId:'logo'});
 const pdf=message.payload.parts[1];pdf.filename='wrong.pdf';
 const withLogo={...message,payload:{...message.payload,parts:[message.payload.parts[0],{mimeType:'image/png',filename:'logo.png',headers:[{name:'Content-ID',value:'<logo>'}],body:{size:bytes.length,attachmentId:'logo'}},pdf]}};
 expect(await verifySentEvidence(withLogo,expected,async()=>bytes)).toMatchObject({status:'review_required',reason:'attachment_metadata'});
});

it('never accepts a fallback alias for an inline file or a changed content ID',async()=>{
 const {expected,message}=await fixture();expected.files[0]={...expected.files[0],name:'Logo (A).png',inlineId:'logo'};
 const file={mimeType:'image/png',filename:'Logo _A_.png',headers:[{name:'Content-ID',value:'<logo>'}],body:{size:bytes.length,attachmentId:'logo'}};
 const inlineMessage={...message,payload:{...message.payload,parts:[message.payload.parts[0],file]}};
 expect(await verifySentEvidence(inlineMessage,expected,async()=>bytes)).toMatchObject({status:'review_required',reason:'attachment_metadata'});
 file.filename='Logo (A).png';file.headers[0].value='<different>';
 expect(await verifySentEvidence(inlineMessage,expected,async()=>bytes)).toMatchObject({status:'review_required',reason:'attachment_metadata'});
 file.headers[0].value='<logo>';
 expect(await verifySentEvidence(inlineMessage,expected,async()=>bytes)).toMatchObject({status:'verified'});
});

it('never consumes one frozen attachment twice when fallback names collide',async()=>{
 const {expected,message}=await fixture();const other=bytes.slice();other[0]^=1;
 expected.files=[{name:'Bill (A).pdf',sha256:await hash(bytes),byte_count:bytes.length},{name:'Bill [A].pdf',sha256:await hash(other),byte_count:other.length}];
 const file={mimeType:'application/pdf',filename:'Bill _A_.pdf',body:{size:bytes.length,attachmentId:'same'}};
 message.payload.parts=[message.payload.parts[0],file,file];
 expect(await verifySentEvidence(message,expected,async()=>bytes)).toMatchObject({status:'review_required',reason:'attachment_content'});
});
