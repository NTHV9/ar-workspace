import type {OperaReader} from '../opera/client';
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
export async function readInvoiceFolioContract(reader:Pick<OperaReader,'reservationFolios'|'financialTransactionDetail'>,invoice:DocumentInvoice){
 if(!invoice.reservation_id||!invoice.folio_date)throw Error('document_probe_selector_missing');
 const history=await reader.reservationFolios(invoice.reservation_id,invoice.folio_date);
 const window=nativeFolioSelector(history,invoice),info=asObject(asObject(history).reservationFolioInformation);
 const windows=Array.isArray(info.folioHistory)?info.folioHistory.map(asObject):[];
 const folios=windows.flatMap(w=>Array.isArray(w.folios)?w.folios.map(asObject):[]);
 const folio=folios.find(f=>String(f.folioNo)===invoice.folio_no&&String(f.invoiceNo)===invoice.invoice_no)!;
 const detail=await reader.financialTransactionDetail({hotel:invoice.hotel as Parameters<OperaReader['financialTransactionDetail']>[0]['hotel'],accountId:invoice.account_id,transactionId:invoice.id});
 return {hotel:invoice.hotel,matched:true,windowVerified:Number.isSafeInteger(window),folioTypeName:typeof folio.folioTypeName==='string'?folio.folioTypeName:undefined,folioFieldNames:Object.keys(folio),detailShape:shape(detail),links:[...links(history),...links(detail)]};
}
