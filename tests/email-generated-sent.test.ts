import {it,expect,vi} from 'vitest';
import {verifySentEvidence} from '../worker/email/sent-evidence';
import {hash,url64} from '../worker/email/crypto';
import {buildMime} from '../worker/email/mime';
it('renamed PDF metadata preserves exact MIME bytes and verifies Sent only with saved name and hash',async()=>{
 const bytes=new TextEncoder().encode('%PDF synthetic reviewed bytes'),name='ใบแจ้งหนี้.pdf';
 const expected={messageId:'<00000000-0000-4000-8000-000000000009@ar-workspace.ar-c82.workers.dev>',subject:'Synthetic renamed package',body:'Synthetic only',recipients:{to:['synthetic@example.test'],cc:[],bcc:[]},files:[{name,byte_count:bytes.length,sha256:await hash(bytes)}]};
 const mime=new TextDecoder().decode(buildMime({revision:4,purpose:'billing',subject:expected.subject,body:expected.body,recipients:expected.recipients},[{name,mime:'application/pdf',bytes}],expected.messageId));expect(mime).toContain(`filename*=UTF-8''${encodeURIComponent(name)}`);expect(mime).toContain(btoa(new TextDecoder().decode(bytes)));
 const message={id:'synthetic',internalDate:String(Date.now()-1000),labelIds:['SENT'],payload:{mimeType:'multipart/mixed',headers:[{name:'From',value:'ar@katathani.com'},{name:'To',value:'synthetic@example.test'},{name:'Subject',value:expected.subject},{name:'Message-ID',value:expected.messageId}],parts:[{mimeType:'text/plain',body:{data:url64(new TextEncoder().encode(expected.body))}},{mimeType:'application/pdf',filename:name,body:{size:bytes.length,data:url64(bytes)}}]}};
 const attachment=vi.fn();expect((await verifySentEvidence(message,expected,attachment)).status).toBe('verified');
 const old={...message,payload:{...message.payload,parts:[message.payload.parts[0],{...message.payload.parts[1],filename:'Original.pdf'}]}};expect((await verifySentEvidence(old,expected,attachment)).status).toBe('review_required');
 expect((await verifySentEvidence(message,{...expected,files:[{...expected.files[0],sha256:'0'.repeat(64)}]},attachment)).status).toBe('review_required');expect(attachment).not.toHaveBeenCalled();
});
