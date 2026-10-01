import type {DocumentJob} from '../../worker/documents/jobs';
import type {PdfSourceDocument} from './types';
import {operationMessages} from '../../worker/operations/messages';

/** One private preparation, two downloads at most, original manifest order. */
export async function loadJobSources(job:DocumentJob,token:string,maxBytes:number):Promise<PdfSourceDocument[]>{
 const ready=job.files.filter(file=>file.state==='ready');
 if(!ready.length)throw Error('No source PDF is ready.');
 if(ready.reduce((sum,file)=>sum+(file.byte_count??0),0)>maxBytes)throw Error('Package exceeds the configured editor memory budget. Use a smaller selection.');
 const controller=new AbortController(),docs:PdfSourceDocument[]=new Array(ready.length);let total=0;
 async function read(index:number){const file=ready[index];
  const response=await fetch(`/api/documents/${job.id}/files/${file.id}`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
  if(!response.ok||!response.body){if(response.status===410)throw Error(operationMessages.storage_file_expired);throw Error('A private source file could not be loaded. No partial package was opened.');}
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;total+=part.value.length;if(total>maxBytes){await reader.cancel();throw Error('Package exceeds the configured editor memory budget. Use a smaller selection.');}chunks.push(part.value);}}finally{reader.releaseLock();}
  if(file.byte_count!==null&&size!==file.byte_count)throw Error('A private source file changed. Reload this preparation.');
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  if(file.sha256&&/^[a-f0-9]{64}$/.test(file.sha256)){const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==file.sha256)throw Error('A private source file changed. Reload this preparation.');}
  const invoice=job.manifest.find(i=>i.id===file.invoice_id);
  docs[index]={id:file.id,name:file.kind==='statement'?'Statement.pdf':`Invoice ${invoice?.invoice_no??file.ordinal}.pdf`,kind:file.kind,invoiceId:file.invoice_id??undefined,...file.kind==='invoice'?{invoiceLabel:`Invoice ${invoice?.invoice_no??file.ordinal}${invoice?.folio_no?' · Folio '+invoice.folio_no:''}`}:{},invoiceIds:job.manifest.map(i=>i.id),bytes};
 }
 for(let start=0;start<ready.length;start+=2){
  const outcomes=await Promise.allSettled(ready.slice(start,start+2).map((_file,offset)=>read(start+offset).catch(error=>{controller.abort();throw error;})));
  const failure=outcomes.find(result=>result.status==='rejected');if(failure?.status==='rejected')throw failure.reason;
 }
 return docs;
}
