import {describe,it,expect,vi} from 'vitest';
import {createReviewHandoff} from '../src/pdf/review-handoff';
import type {DocumentJob} from '../worker/documents/jobs';
import type {PdfExportFile} from '../src/pdf/types';

const files = (): PdfExportFile[] => [{name:'A.pdf',bytes:new Uint8Array([1,2,3])}];
const receipt={storage_key:'jobs/synthetic/exports/A.pdf',byte_count:3,sha256:'synthetic'};
const result={id:'synthetic',revision:1} as DocumentJob;
describe('temporary reviewed PDF handoff',()=>{
 it('retries a lost review response with the same uploaded receipt and original revision',async()=>{
  const send=createReviewHandoff(),pdfs=files(),upload=vi.fn().mockResolvedValue(receipt);
  const review=vi.fn().mockRejectedValueOnce(Error('response lost')).mockResolvedValue(result);
  await expect(send(pdfs,0,upload,review)).rejects.toThrow('response lost');
  expect(await send(pdfs,12,upload,review)).toBe(result);
  expect(upload).toHaveBeenCalledTimes(1);
  expect(review.mock.calls[1]).toEqual(review.mock.calls[0]);
  expect(review.mock.calls[1][0]).toBe(0);
  expect(await send(pdfs,1,upload,review)).toBe(result);
  expect(review).toHaveBeenCalledTimes(2);
 });
 it('resumes an interrupted multi-file upload without duplicating known receipts',async()=>{
  const send=createReviewHandoff(),pdfs=[...files(),{...files()[0],name:'B.pdf'}];
  const upload=vi.fn().mockResolvedValueOnce(receipt).mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce({...receipt,storage_key:'jobs/synthetic/exports/B.pdf'});
  const review=vi.fn().mockResolvedValue(result);
  await expect(send(pdfs,0,upload,review)).rejects.toThrow('offline');
  await send(pdfs,0,upload,review);
  expect(upload.mock.calls.map(call=>call[0].name)).toEqual(['A.pdf','B.pdf','B.pdf']);
  expect(review.mock.calls[0][1].map((file:{name:string})=>file.name)).toEqual(['A.pdf','B.pdf']);
 });
 it('joins concurrent clicks and uses new bytes only after a newly generated Preview',async()=>{
  const send=createReviewHandoff(),pdfs=files(),upload=vi.fn().mockResolvedValue(receipt),review=vi.fn().mockResolvedValue(result);
  const first=send(pdfs,0,upload,review),second=send(pdfs,0,upload,review);
  expect(first).toBe(second);await first;expect(upload).toHaveBeenCalledTimes(1);
  await send(files(),1,upload,review);expect(upload).toHaveBeenCalledTimes(2);expect(review.mock.calls[1][0]).toBe(1);
 });
});

