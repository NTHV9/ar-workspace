import {it,expect} from 'vitest';
import {buildMime,encodedHeader} from '../worker/email/mime';
const input={revision:0,purpose:'billing' as const,recipients:{to:['example@example.test'],cc:[],bcc:['copy@example.test']},subject:'เอกสารทดสอบ',body:'Synthetic body only'};
it('preserves Unicode headers and exact attachment bytes with CRLF MIME boundaries',()=>{
 const source=new Uint8Array([0,1,2,253,254,255]);const mime=new TextDecoder().decode(buildMime(input,[{name:'ทดสอบ.pdf',mime:'application/pdf',bytes:source}],'<00000000-0000-4000-8000-000000000000@ar-workspace.ar-c82.workers.dev>'));
 expect(mime).toContain('AAEC/f7/');expect(mime).toContain('bcc: copy@example.test');expect(mime).toContain('filename*=UTF-8');expect(mime).toContain(encodedHeader(input.subject));expect(mime.replaceAll('\r\n','')).not.toContain('\n');
});
it('rejects attachment and subject header injection',()=>{
 expect(()=>buildMime({...input,subject:'hello\r\nBcc: attacker@example.test'},[],'bad')).toThrow();
 expect(()=>buildMime(input,[{name:'x\r\n.pdf',mime:'application/pdf',bytes:new Uint8Array([1])}],'<00000000-0000-4000-8000-000000000000@ar-workspace.ar-c82.workers.dev>')).toThrow();
});
it('folds long encoded headers without splitting Unicode code points',()=>{for(const line of encodedHeader('เอกสาร'.repeat(60)).split('\r\n'))expect(line.trim().length).toBeLessThanOrEqual(75);});
