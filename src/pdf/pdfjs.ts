import {getDocument,GlobalWorkerOptions,version,type PDFPageProxy} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {PDFDocument,PDFRawStream,PDFName,PDFNumber} from 'pdf-lib';

GlobalWorkerOptions.workerSrc=workerUrl;
export const MAX_PDF_IMAGE_PIXELS=32_000_000;
async function validateImageDimensions(bytes:Uint8Array){
 // PDF.js can remove an oversized XObject before adding an image operator,
 // even with stopAtErrors. Inspect compressed image metadata without decoding.
 const document=await PDFDocument.load(bytes);
 for(const [,object] of document.context.enumerateIndirectObjects()){
  if(!(object instanceof PDFRawStream)||object.dict.get(PDFName.of('Subtype'))!==PDFName.of('Image'))continue;
  const width=object.dict.lookup(PDFName.of('Width'),PDFNumber).asNumber(),height=object.dict.lookup(PDFName.of('Height'),PDFNumber).asNumber();
  if(!Number.isFinite(width*height)||width<=0||height<=0||width*height>MAX_PDF_IMAGE_PIXELS)throw Error('A PDF image exceeds the safe preview size. Use a lower resolution source document.');
 }
}
/** Canvas previews use local, pinned decoder assets and reject oversized images. */
export function loadPdf(data:Uint8Array,options:{fontExtraProperties?:boolean}={}){
 const validation=validateImageDimensions(data.slice());
 const task=getDocument({data,...options,enableXfa:false,stopAtErrors:true,maxImageSize:MAX_PDF_IMAGE_PIXELS,
  wasmUrl:`/pdfjs/${version}/wasm/`,useWorkerFetch:true});
 return {promise:Promise.all([task.promise,validation]).then(([document])=>document).catch(error=>{void task.destroy();throw error;}),destroy:()=>task.destroy()};
}

/** PDF.js resolves render even when an image decoder sends null. Fail visibly. */
export function renderPdfPage(page:PDFPageProxy,parameters:Parameters<PDFPageProxy['render']>[0]){
 const task=page.render(parameters);
 const promise=task.promise.then(async()=>{
  // Inspect the completed render intent. getOperatorList creates another intent
  // with different image IDs, which would incorrectly reject valid images.
  for(const objects of [page.objs,page.commonObjs])for(const [id,data] of objects){
   if(id.includes('img_')&&data===null)throw Error('A PDF image could not be decoded. Reopen the original document or try again.');
  }
 });
 return {promise,cancel:()=>task.cancel()};
}
