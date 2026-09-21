import {OperaError,type OperaReader} from '../opera/client';
import {nativeFolioSelector,type DocumentInvoice} from '../documents/native-invoice';
import {amountCents} from '../opera/normalize';
import {readScopedInvoiceHistory} from '../opera/printed-invoices';
import {collectPages} from '../opera/pagination';
import {invoiceModel,invoiceTaxEntries,record,type InvoicePacket} from './model';
type Reader=Pick<OperaReader,'account'|'invoiceHistory'|'reservationFolios'|'financialTransactionDetail'|'invoicePostings'|'invoicePostingBreakdown'|'invoiceTransactionDetails'|'invoiceReservation'>;
const fail=():never=>{throw Error('document_source_changed');};
const list=(value:unknown)=>{if(!Array.isArray(value))return fail();return value.map(record);};
export async function readInvoicePacket(reader:Reader,manifest:DocumentInvoice):Promise<InvoicePacket>{
 if(!manifest.reservation_id||!manifest.folio_date||!manifest.invoice_no||!manifest.folio_no)throw Error('document_invoice_selector_missing');
 const account=record(record(await reader.account(manifest.account_id)).accountDetails);if(account.hotelId!==manifest.hotel||record(account.accountId).id!==manifest.account_id)fail();
 let selected=list(account.invoices).filter(i=>String(i.transactionNo)===manifest.id);
 if(!selected.length){const history=await readScopedInvoiceHistory(reader,manifest.hotel,manifest.account_id,[manifest.invoice_no]);selected=history.filter(i=>String(i.transactionNo)===manifest.id&&i.printed===true);}
 if(selected.length!==1)fail();const current=selected[0];
 const valid=(i:Record<string,unknown>)=>String(i.transactionNo)===manifest.id&&String(i.invoiceNo)===manifest.invoice_no&&String(i.folioNo)===manifest.folio_no&&amountCents(i.balance,'THB')===Math.round(manifest.open*100)&&i.folioDate===manifest.folio_date&&i.parentInvoiceNo==null;
 if(!valid(current)||record(current.reservationId).id!==manifest.reservation_id)fail();
 const historical=await reader.reservationFolios(manifest.reservation_id,manifest.folio_date,true),window=nativeFolioSelector(historical,manifest),folioInfo=record(record(historical).reservationFolioInformation),reservation=folioInfo.reservationInfo;
 const scope={hotel:manifest.hotel as Parameters<OperaReader['financialTransactionDetail']>[0]['hotel'],accountId:manifest.account_id,transactionId:manifest.id};
 const detail=record(await reader.financialTransactionDetail(scope)),accounts=list(detail.details);if(accounts.length!==1||accounts[0].hotelId!==manifest.hotel||record(accounts[0].accountId).id!==manifest.account_id)fail();
 const invoices=list(accounts[0].invoices).filter(i=>String(i.transactionNo)===manifest.id);if(invoices.length!==1||!valid(invoices[0]))fail();const invoice=invoices[0];
 if(typeof invoice.internalFolioWindowID!=='string')fail();
 const header=record(record(await reader.invoiceReservation(manifest.reservation_id)).reservations),reservations=list(header.reservation);
 if(reservations.length!==1||header.hasMore===true||reservations[0].hotelId!==manifest.hotel||!list(reservations[0].reservationIdList).some(r=>r.type==='Reservation'&&String(r.id)===manifest.reservation_id))fail();
 const customReference=reservations[0].customReference;if(customReference!=null&&typeof customReference!=='string')throw Error('document_invoice_header_invalid');
 const postings=record(await reader.invoicePostings({...scope,invoiceNo:manifest.invoice_no,folioNo:manifest.folio_no,internalFolioWindowId:invoice.internalFolioWindowID as string})),postingRows=list(postings.invoicePostingsDetails);if(!postingRows.length||postingRows.length>=4000)throw Error('document_invoice_postings_incomplete');
 const dates=postingRows.map(p=>String(p.transactionDate)).sort(),endDate=dates.at(-1)!>manifest.folio_date?dates.at(-1)!:manifest.folio_date;
 const taxRows=await collectPages(async(offset,limit)=>{const raw=record(await reader.invoicePostingBreakdown(manifest.reservation_id!,window,dates[0],endDate,offset,limit));const entries=list(raw.financialPostings);if(raw.offset!==offset||raw.limit!==limit||!Number.isSafeInteger(raw.totalResults)||typeof raw.hasMore!=='boolean')throw Error('document_invoice_pagination_changed');return {rows:entries,offset,hasMore:raw.hasMore,totalResults:raw.totalResults as number,count:raw.count as number|undefined,nextOffset:offset+limit};},e=>String(record(e.posting).transactionNo),50);
 const selectedIds=new Set(postingRows.map(p=>String(p.transactionNo))),taxByCode=new Map<string,string>();
 const packageIds=new Set(taxRows.map(e=>record(e.posting)).filter(p=>selectedIds.has(String(p.transactionNo))&&p.transactionType==='Wrapper').map(p=>String(p.referencePackageTransactionNo)));
 for(const e of taxRows){const p=record(e.posting);if(!selectedIds.has(String(p.transactionNo))&&!(p.transactionType!=='Wrapper'&&packageIds.has(String(p.referencePackageTransactionNo))))continue;if(!e.postingBreakdown)continue;for(const t of invoiceTaxEntries(record(e.postingBreakdown)))taxByCode.set(String(t.transactionCode),String(t.transactionNo));}
 const taxCodes:unknown[]=[];const ids=[...taxByCode.values()];for(let offset=0;offset<ids.length;offset+=40){const details=record(await reader.invoiceTransactionDetails(ids.slice(offset,offset+40)));taxCodes.push(...list(details.trxCodesInfo));}
 const uniqueCodes=[...new Map(taxCodes.map(record).map(c=>[String(c.hotelId)+':'+String(c.transactionCode),c])).values()];
 // Recheck the AR balance after the slower postings/tax reads to fence a payment
 // or adjustment arriving during preparation. No write or print call is made.
 const ending=list(record(await reader.financialTransactionDetail(scope)).details);if(ending.length!==1||ending[0].hotelId!==manifest.hotel||record(ending[0].accountId).id!==manifest.account_id)fail();const last=list(ending[0].invoices).filter(i=>String(i.transactionNo)===manifest.id);if(last.length!==1||!valid(last[0])||amountCents(last[0].amount,'THB')!==amountCents(invoice.amount,'THB'))fail();
 const profileId=account.profileId&&record(account.profileId).id;
 const payeeWindow=Array.isArray(folioInfo.folioWindows)?list(folioInfo.folioWindows).find(w=>w.folioWindowNo===window&&w.internalFolioWindowID===invoice.internalFolioWindowID):undefined;
 const payee=payeeWindow?.payeeInfo?record(payeeWindow.payeeInfo):undefined;
 const payeeTaxNumber=profileId&&payee?.payeeId&&record(payee.payeeId).id===profileId&&typeof payee.payeeTaxNumber==='string'?payee.payeeTaxNumber:undefined;
 return {manifest,account,invoice,reservation,postings,taxRows,taxCodes:uniqueCodes,payeeTaxNumber,customReference:customReference as string|undefined};
}
export async function readInvoiceModel(reader:Reader,manifest:DocumentInvoice,now?:Date){
 let packet:InvoicePacket|undefined;
 for(let attempt=0;attempt<3;attempt++){
  try{packet=await readInvoicePacket(reader,manifest);break;}
  catch(error){
   // A paginated OPERA read can overlap or change while it is being read. Start
   // from the account again; never deduplicate, merge attempts, or retry rendering.
   const unstable=error instanceof OperaError&&['duplicate_member','pagination_changed','pagination_incomplete'].includes(error.code)||error instanceof Error&&error.message==='document_invoice_pagination_changed';
   if(!unstable)throw error;
   if(attempt===2)throw Error('document_invoice_source_unstable',{cause:error});
  }
 }
 if(!packet)throw Error('document_invoice_source_unstable');
 return invoiceModel(packet,now);
}
