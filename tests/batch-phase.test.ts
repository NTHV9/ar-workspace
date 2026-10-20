import {expect,it} from 'vitest';
import {pdfReadyForEmail,retainPdfSession} from '../src/batch/phase';
import type {DocumentBatchSession} from '../src/DocumentRoute';

const reviewed={state:'ready',acknowledged:true,exports:[{}],revision:3,closed_at:null};
it('requires each account to have current confirmed PDFs before the whole batch opens email',()=>{
 expect(pdfReadyForEmail(reviewed)).toBe(true);
 expect(pdfReadyForEmail({...reviewed,acknowledged:false})).toBe(false);
 expect(pdfReadyForEmail({...reviewed,exports:[]})).toBe(false);
 expect(pdfReadyForEmail({...reviewed,state:'partial'})).toBe(false);
 expect(pdfReadyForEmail({...reviewed,closed_at:'closed'})).toBe(false);
 expect(pdfReadyForEmail(reviewed,{revision:3,editor:{dirty:true}})).toBe(false);
 expect(pdfReadyForEmail(reviewed,{revision:2,editor:{dirty:false}})).toBe(false);
 expect(pdfReadyForEmail(reviewed,{revision:3,editor:{dirty:false}})).toBe(true);
});
it('saving email keeps the existing tab-only PDF session for going back to PDF mode',()=>{
 const previous={revision:3,sources:[{id:'original'}],editor:{dirty:false,past:[{id:'edit'}]},compose:false} as unknown as DocumentBatchSession;
 const mail={revision:3,sources:null,compose:true};
 const kept=retainPdfSession(previous,mail);
 expect(kept.sources).toBe(previous.sources);
 expect(kept.editor).toBe(previous.editor);
 expect(kept.compose).toBe(true);
 expect(retainPdfSession(previous,{...mail,revision:4}).sources).toBeNull();
});
