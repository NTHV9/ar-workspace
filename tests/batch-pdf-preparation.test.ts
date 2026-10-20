import {expect,it,vi} from 'vitest';
import {createBatchPdfPreparation} from '../src/batch/prepare-pdfs';
import type {DocumentJob} from '../worker/documents/jobs';
import type {DocumentBatchSession} from '../src/DocumentRoute';
const job:DocumentJob={id:crypto.randomUUID(),owner:'owner',hotel:'KAT',account_id:'10',invoice_ids:['1'],state:'ready',revision:0,acknowledged:false,exports:[],account_name:'Synthetic',content:'both',layout:'combined',purpose:'billing',manifest:[],project_key:null,files:[],created_at:'2026-10-20T00:00:00Z'};
const files=[{name:'Edited.pdf',bytes:new Uint8Array([1,2,3])}];
const receipt={storage_key:'synthetic',byte_count:3,sha256:'synthetic'};
const session={revision:0,sources:[],compose:false} satisfies DocumentBatchSession;
it('prepares unconfirmed PDFs directly and reuses the completed package on a second transition',async()=>{
 const render=vi.fn(async()=>({files,session})),upload=vi.fn(async()=>receipt),review=vi.fn(async()=>({...job,revision:1,acknowledged:true,exports:[{...receipt,name:'Edited.pdf'}]}));
 const prepare=createBatchPdfPreparation({render,upload,review});
 const result=await prepare(job,session);
 expect(result.job.acknowledged).toBe(true);
 expect(result.session?.revision).toBe(1);
 await prepare(result.job,result.session);
 expect(upload).toHaveBeenCalledTimes(1);
 expect(render).toHaveBeenCalledTimes(1);
});
it('retries an uncertain review using the same uploaded bytes and original revision',async()=>{
 const render=vi.fn(async()=>({files,session})),upload=vi.fn(async()=>receipt),review=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue({...job,revision:1,acknowledged:true,exports:[{...receipt,name:'Edited.pdf'}]});
 const prepare=createBatchPdfPreparation({render,upload,review});
 await expect(prepare(job,session)).rejects.toThrow('offline');
 expect(prepare.pending(job.id)).toBe(true);
 await prepare({...job,revision:1},session);
 expect(prepare.pending(job.id)).toBe(false);
 expect(render).toHaveBeenCalledTimes(1);expect(upload).toHaveBeenCalledTimes(1);
 expect(review.mock.calls[0]).toEqual(review.mock.calls[1]);
});
it('stops before uploads if the tab owner changes and rejects incomplete sources',async()=>{
 const upload=vi.fn(async()=>receipt),review=vi.fn();
 const prepare=createBatchPdfPreparation({render:async()=>({files,session}),upload,review,canContinue:()=>false});
 await expect(prepare(job,session)).rejects.toThrow();
 expect(upload).not.toHaveBeenCalled();
 const ready=createBatchPdfPreparation({render:async()=>({files,session}),upload,review});
 await expect(ready({...job,state:'partial'},session)).rejects.toThrow();
 expect(upload).not.toHaveBeenCalled();
});
