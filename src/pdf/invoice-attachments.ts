import type {PdfProject,PdfSourceDocument} from './types';
export const MAX_INVOICE_PDFS=50;
export const MAX_ATTACHED_PAGES=500;
export function invoiceTargets(sources:PdfSourceDocument[]){
 const seen=new Set<string>();return sources.filter(s=>s.kind==='invoice').flatMap(s=>{const id=s.invoiceId||s.id;if(seen.has(id))return [];seen.add(id);return [{id,name:s.invoiceLabel??s.name.replace(/\.pdf$/i,'')}];});
}
export function validateInvoiceAttachments(project:PdfProject,sources:PdfSourceDocument[],forExport=false){
 const targets=new Set(invoiceTargets(sources).map(s=>s.id)),seen=new Set<string>(),catalog=new Map(sources.map(s=>[s.id,s]));
 if(catalog.size!==sources.length)throw Error('Duplicate PDF identity. Reopen this preparation.');
 if((project.invoiceAttachments?.length??0)>MAX_INVOICE_PDFS)throw Error('Attach up to 50 PDFs in one preparation.');
 for(const a of project.invoiceAttachments??[]){
  if(!a||Object.keys(a).some(k=>!['sourceId','invoiceId'].includes(k))||typeof a.sourceId!=='string'||typeof a.invoiceId!=='string'||!targets.has(a.invoiceId)||seen.has(a.sourceId)||catalog.get(a.sourceId)?.kind!=='attachment')throw Error('An attached PDF does not match an invoice in this preparation.');
  seen.add(a.sourceId);
  if(forExport&&project.content!=='statement'){
   const originals=new Set(sources.filter(s=>s.kind==='invoice'&&(s.invoiceId||s.id)===a.invoiceId).map(s=>s.id));
   if(!project.pages.some(p=>originals.has(p.sourceId)))throw Error('An invoice with attached PDFs has no pages. Restore an invoice page or remove its attached PDFs.');
  }
 }
 if(project.pages.some(p=>catalog.get(p.sourceId)?.kind==='attachment'&&!seen.has(p.sourceId)))throw Error('Choose an invoice for every attached PDF.');
}
export function moveInvoiceAttachment(project:PdfProject,sourceId:string,direction:-1|1):PdfProject{
 const attachments=[...(project.invoiceAttachments??[])],item=attachments.find(a=>a.sourceId===sourceId);if(!item)return project;
 const siblings=attachments.filter(a=>a.invoiceId===item.invoiceId),other=siblings[siblings.indexOf(item)+direction];if(!other)return project;
 const i=attachments.indexOf(item),j=attachments.indexOf(other);[attachments[i],attachments[j]]=[attachments[j],attachments[i]];
 return {...project,invoiceAttachments:attachments};
}
export function removeInvoiceAttachment(project:PdfProject,sourceId:string):PdfProject{return {...project,invoiceAttachments:(project.invoiceAttachments??[]).filter(a=>a.sourceId!==sourceId),pages:project.pages.filter(p=>p.sourceId!==sourceId)};}
