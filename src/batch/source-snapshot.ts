import type {DocumentFile} from '../../worker/documents/jobs';
import type {PdfSourceDocument} from '../pdf/types';
export async function assertCachedSources(files:DocumentFile[],sources:PdfSourceDocument[]){
 const changed=()=>{throw Error('The source PDFs changed while editing. Keep your edits and prepare a new complete package.');};
 if(files.length!==sources.length||new Set(sources.map(s=>s.id)).size!==sources.length||files.some(f=>f.state!=='ready'))changed();
 for(const file of files){
  const source=sources.find(s=>s.id===file.id);
  if(!source||source.kind!==file.kind||(source.invoiceId??null)!==file.invoice_id||file.byte_count!==null&&source.bytes.byteLength!==file.byte_count)changed();
  if(file.sha256&&/^[a-f0-9]{64}$/.test(file.sha256)){
   const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(source!.bytes));
   if([...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')!==file.sha256)changed();
  }
 }
}
