import {OperaError,type OperaReader} from '../opera/client';
import {asObject} from '../refresh/read-snapshot';
import {nativeFolioSelector,type DocumentInvoice} from './native-invoice';

function shape(value:unknown,depth=0):unknown{
 if(value===null)return 'null';if(depth>5)return typeof value;
 if(Array.isArray(value))return {count:value.length,item:value.length?shape(value[0],depth+1):null};
 if(typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([k])=>k!=='links').map(([k,v])=>[k,shape(v,depth+1)]));
 return typeof value;
}
function links(value:unknown):unknown[]{
 if(!value||typeof value!=='object')return [];
 const result:unknown[]=[];
 for(const [key,child]of Object.entries(value)){
  if(key==='links'&&Array.isArray(child))for(const raw of child){
   const link=asObject(raw);if(typeof link.href!=='string')continue;
   try{const url=new URL(link.href,'https://relative.invalid');result.push({rel:link.rel,method:link.method,path:url.pathname.replace(/\d{3,}/g,'{id}'),queryNames:[...url.searchParams.keys()],typeSelectors:Object.fromEntries([...url.searchParams].filter(([k,v])=>/^(reservationIdType|idType|folioType|folioReportGroup)$/.test(k)&&/^[A-Za-z][A-Za-z0-9 _-]{0,79}$/.test(v)))});}catch{/* Do not expose or follow malformed links. */}
  }else if(child&&typeof child==='object')result.push(...links(child));
 }
 return result;
}
/** Selected-invoice metadata only. The returned structure contains no PDF/customer values. */
export async function readInvoiceFolioContract(reader:Pick<OperaReader,'reservationFolios'|'financialTransactionDetail'> & Partial<Pick<OperaReader,'invoicePostings'|'reservationInvoiceFolios'|'invoicePostingBreakdown'|'invoiceTransactionDetails'>>,invoice:DocumentInvoice){
 if(!invoice.reservation_id||!invoice.folio_date)throw Error('document_probe_selector_missing');
 const history=await reader.reservationFolios(invoice.reservation_id,invoice.folio_date);
 const window=nativeFolioSelector(history,invoice),info=asObject(asObject(history).reservationFolioInformation);
 const windows=Array.isArray(info.folioHistory)?info.folioHistory.map(asObject):[];
 const folios=windows.flatMap(w=>Array.isArray(w.folios)?w.folios.map(asObject):[]);
 const folio=folios.find(f=>String(f.folioNo)===invoice.folio_no&&String(f.invoiceNo)===invoice.invoice_no)!;
 const detail=await reader.financialTransactionDetail({hotel:invoice.hotel as Parameters<OperaReader['financialTransactionDetail']>[0]['hotel'],accountId:invoice.account_id,transactionId:invoice.id});
 let postings:unknown,fullHistory:unknown,taxes:unknown,transactionDetails:unknown,taxError:unknown,taxCodeDefinitions:unknown;
 if(reader.invoicePostings&&invoice.invoice_no&&invoice.folio_no){
  const accounts=asObject(detail).details;if(!Array.isArray(accounts)||accounts.length!==1)throw Error('document_probe_scope_invalid');
  const account=asObject(accounts[0]);if(account.hotelId!==invoice.hotel||asObject(account.accountId).id!==invoice.account_id||!Array.isArray(account.invoices))throw Error('document_probe_scope_invalid');
  const rows=account.invoices.map(asObject).filter(i=>String(i.transactionNo)===invoice.id&&String(i.invoiceNo)===invoice.invoice_no&&String(i.folioNo)===invoice.folio_no);
  if(rows.length!==1||typeof rows[0].internalFolioWindowID!=='string')throw Error('document_probe_scope_invalid');
  postings=await reader.invoicePostings({hotel:invoice.hotel as Parameters<OperaReader['invoicePostings']>[0]['hotel'],accountId:invoice.account_id,transactionId:invoice.id,invoiceNo:invoice.invoice_no,folioNo:invoice.folio_no,internalFolioWindowId:rows[0].internalFolioWindowID});
  if(reader.reservationInvoiceFolios)fullHistory=await reader.reservationInvoiceFolios(invoice.reservation_id,window);
  if(reader.invoicePostingBreakdown)try{const dates=(asObject(postings).invoicePostingsDetails as unknown[]).map(asObject).map(p=>String(p.transactionDate)).sort();taxes=await reader.invoicePostingBreakdown(invoice.reservation_id,window,dates[0],invoice.folio_date);}catch(error){taxError=error instanceof OperaError?{code:error.code,status:error.upstreamStatus,message:error.providerMessage}:{code:'unavailable'};}
  if(reader.invoiceTransactionDetails){const ids=(asObject(postings).invoicePostingsDetails as unknown[]).map(asObject).map(p=>String(p.transactionNo));if(ids.length>0&&ids.length<=40)transactionDetails=await reader.invoiceTransactionDetails(ids);}
  if(reader.invoiceTransactionDetails&&Array.isArray(asObject(taxes??{}).financialPostings)){const byCode=new Map<string,string>();for(const entry of asObject(taxes).financialPostings as unknown[]){const b=asObject(entry).postingBreakdown;if(!b)continue;for(const tax of asObject(b).taxes as unknown[]??[]){const t=asObject(tax);byCode.set(String(t.transactionCode),String(t.transactionNo));}}if(byCode.size&&byCode.size<=40)taxCodeDefinitions=asObject(await reader.invoiceTransactionDetails([...byCode.values()])).trxCodesInfo;}
 }
 const hash=async(values:string[])=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(values.sort().join('|'))))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const referenceHashes=postings?{reference:await hash((asObject(postings).invoicePostingsDetails as unknown[]).map(asObject).map(p=>String(p.reference??'').trim())),check:await hash((asObject(postings).invoicePostingsDetails as unknown[]).map(asObject).map(p=>String(p.checkNo??'').trim()))}:undefined;
 return {referenceHashes,taxPagination:taxes?{offset:asObject(taxes).offset,limit:asObject(taxes).limit,hasMore:asObject(taxes).hasMore,total:asObject(taxes).totalResults}:undefined,hotel:invoice.hotel,matched:true,windowVerified:Number.isSafeInteger(window),folioTypeName:typeof folio.folioTypeName==='string'?folio.folioTypeName:undefined,folioFieldNames:Object.keys(folio),folioShape:shape(folio),reservationShape:shape(info.reservationInfo),detailShape:shape(detail),taxCodeDefinitions,componentShape:Array.isArray(asObject(taxes??{}).financialPostings)?shape((asObject(taxes??{}).financialPostings as unknown[]).map(asObject).find(p=>p.postingBreakdown)?.posting):undefined,postingIdsSha:postings?[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode((asObject(postings).invoicePostingsDetails as unknown[]).map(asObject).map(p=>String(p.transactionNo)).sort().join('|'))))].map(n=>n.toString(16).padStart(2,'0')).join(''):undefined,taxError,transactionDetailShape:shape(transactionDetails),transactionClasses:Array.isArray(asObject(transactionDetails??{}).transactions)?(asObject(transactionDetails??{}).transactions as unknown[]).map(asObject).map(p=>({code:p.transactionCode,type:p.transactionType,group:p.groupTypeInfo,debit:p.debitAmount,credit:p.creditAmount,posted:p.postedAmount,subPostingsShape:shape(p.subPostings)})):undefined,taxShape:shape(taxes),taxTotals:Array.isArray(asObject(taxes??{}).financialPostings)?(asObject(taxes??{}).financialPostings as unknown[]).map(asObject).map(r=>({code:asObject(r.posting).transactionCode,sameFolio:String(asObject(r.posting).folioNo)===invoice.folio_no,sameHotel:asObject(r.posting).hotelId===invoice.hotel,sameReservation:asObject(asObject(asObject(r.posting).guestInfo).reservationId).id===invoice.reservation_id,breakdown:r.postingBreakdown,matched:(asObject(postings??{}).invoicePostingsDetails as unknown[]??[]).map(asObject).some(p=>p.transactionNo===asObject(r.posting).transactionNo)})):undefined,postingsShape:shape(postings),fullHistoryShape:shape(fullHistory),postingClasses:Array.isArray(asObject(postings??{}).invoicePostingsDetails)?(asObject(postings??{}).invoicePostingsDetails as unknown[]).map(asObject).map(p=>({code:p.transactionCode,type:p.transactionType,group:p.groupTypeInfo,debit:p.debitAmount,credit:p.creditAmount,posted:p.postedAmount,referenceEmpty:!String(p.reference??'').trim(),checkEmpty:!String(p.checkNo??'').trim(),referenceIsTransactionNo:String(p.reference)===String(p.transactionNo)})):undefined,links:[...links(history),...links(detail)]};
}
