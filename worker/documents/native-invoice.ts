import {PDFDocument} from 'pdf-lib';
import {OperaError,type OperaReader} from '../opera/client';
import {amountCents} from '../opera/normalize';
import {asObject} from '../refresh/read-snapshot';
export interface DocumentInvoice {
 id:string;hotel:string;account_id:string;invoice_no:string|null;folio_no:string|null;reservation_id:string|null;folio_date:string|null;open:number;collection_role:string;
}
export interface NativePdf {bytes:Uint8Array;sha256:string;pages:number}
function fail(stage:string):never{throw new OperaError('invalid_response',undefined,stage);}
export function nativeFolioSelector(raw:unknown,invoice:DocumentInvoice){
 const info=asObject(asObject(raw).reservationFolioInformation),reservation=asObject(info.reservationInfo);
 if(reservation.hotelId!==invoice.hotel||!Array.isArray(reservation.reservationIdList)||!reservation.reservationIdList.map(asObject).some(id=>id.type==='Reservation'&&id.id===invoice.reservation_id))fail('folio_reservation_identity');
 if(!Array.isArray(info.folioHistory))fail('folio_history_missing');
 const rows=info.folioHistory.map(asObject).flatMap(window=>{
  if(!Array.isArray(window.folios))fail('folio_history_shape');
  return window.folios.map(asObject).map(folio=>({window:window.folioWindowNo,folio}));
 });
 const matches=rows.filter(r=>String(r.folio.invoiceNo)===invoice.invoice_no&&String(r.folio.folioNo)===invoice.folio_no);
 if(matches.length!==1||typeof matches[0].window!=='number'||!Number.isSafeInteger(matches[0].window)||matches[0].window<1)fail('folio_selector_ambiguous');
 // billNumber mapping for multiple historical folios in one window is unproven.
 if(rows.filter(r=>r.window===matches[0].window).length!==1)fail('folio_window_ambiguous');
 return matches[0].window;
}
export async function getNativeInvoicePdf(reader:Pick<OperaReader,'account'|'reservationFolios'|'folioReport'>,invoice:DocumentInvoice,onRenderStart:()=>void=()=>{}):Promise<NativePdf>{
 if(!['standalone','parent'].includes(invoice.collection_role)||invoice.open<=0)fail('document_not_collectible');
 if(!invoice.reservation_id||!invoice.folio_date||!invoice.folio_no||!invoice.invoice_no)fail('non_reservation_document_unavailable');
 const account=asObject(asObject(await reader.account(invoice.account_id)).accountDetails);
 if(account.hotelId!==invoice.hotel||asObject(account.accountId).id!==invoice.account_id||!Array.isArray(account.invoices))fail('document_scope');
 const matches=account.invoices.map(asObject).filter(i=>String(i.transactionNo)===invoice.id);
 if(matches.length!==1)fail('document_source_changed');const current=matches[0];
 if(current.parentInvoiceNo!=null||amountCents(current.balance,'THB')!==Math.round(invoice.open*100)||String(current.invoiceNo)!==invoice.invoice_no||String(current.folioNo)!==invoice.folio_no||!current.reservationId||String(asObject(current.reservationId).id)!==invoice.reservation_id||current.folioDate!==invoice.folio_date)fail('document_source_changed');
 const window=nativeFolioSelector(await reader.reservationFolios(invoice.reservation_id,invoice.folio_date),invoice);
 onRenderStart();
 const report=asObject(asObject(await reader.folioReport(invoice.reservation_id,window,invoice.folio_date)).folio);
 if(report.hotelId!==invoice.hotel||!report.reservationId||String(asObject(report.reservationId).id)!==invoice.reservation_id||typeof report.folio!=='string')fail('pdf_report_identity');
 let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(report.folio),c=>c.charCodeAt(0));}catch{return fail('pdf_encoding');}
 if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')fail('pdf_signature');
 const pdf=await PDFDocument.load(bytes,{updateMetadata:false});const pages=pdf.getPageCount();if(!pages)fail('pdf_empty');
 const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes));
 return {bytes,pages,sha256:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')};
}
