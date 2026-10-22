import type {OperaReader} from '../opera/client';
import type {DocumentInvoice} from '../documents/native-invoice';
import {amountCents} from '../opera/normalize';
import {verifyArTransfer,revalidateArTransfer,type ArTransferEvidence,type ArTransferInput} from './ar-transfer';
type Row=Record<string,unknown>;
export type ArTransferReader=Pick<OperaReader,'account'|'accountsByNumber'|'invoiceHistory'|'invoicePostings'|'financialTransactionDetail'|'invoiceTransactionDetails'>;
const fail=():never=>{throw Error('document_invoice_ar_transfer_unverified');};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail();
const list=(v:unknown):Row[]=>Array.isArray(v)?v.map(object):fail();
const id=(v:unknown)=>{const value=String(v);return /^[1-9][0-9]{0,15}$/.test(value)?value:fail();};
const accountNumber=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(v)?v:fail();
const complete=(v:Row,count:number)=>{if(v.hasMore!==false||v.totalResults!==count||v.limit!==20||v.offset!==20||v.totalPages!==undefined&&v.totalPages!==1)fail();};
const resolved=async(promises:Promise<unknown>[])=>{const values=await Promise.allSettled(promises);return values.map(value=>{if(value.status==='rejected')throw value.reason;return value.value;});};
function destination(account:Row,manifest:DocumentInvoice){
 if(account.hotelId!==manifest.hotel||object(account.accountId).type!=='AccountId'||id(object(account.accountId).id)!==manifest.account_id)fail();
 const rows=list(account.invoices).filter(i=>String(i.transactionNo)===manifest.id);if(rows.length!==1||rows[0].transferredIn!==true||rows[0].transferredOut!==false||rows[0].compressed!==false)fail();
 return accountNumber(account.accountNo);
}
/** All queries are exact selectors derived from verified source identities.
 * No source account is inferred from a supplement, label or nearby record ID. */
export async function readArTransfer(reader:ArTransferReader,manifest:DocumentInvoice,account:Row,invoice:Row,postings:unknown,postedRows:Row[],previous?:ArTransferEvidence):Promise<ArTransferEvidence>{
 const destinationNumber=destination(account,manifest),numbers=new Set(postedRows.map(p=>accountNumber(object(p.aRInfo).accountNumber)).filter(n=>n!==destinationNumber));
 if(numbers.size!==1)fail();const sourceNumber=[...numbers][0];if(previous&&sourceNumber!==previous.sourceAccountNumber)fail();
 const sourceAccounts=object(await reader.accountsByNumber(sourceNumber)),sources=list(sourceAccounts.accountsDetails);complete(sourceAccounts,1);
 if(sources.length!==1||sources[0].hotelId!==manifest.hotel||accountNumber(sources[0].accountNo)!==sourceNumber||object(sources[0].accountId).type!=='AccountId')fail();
 const sourceId=id(object(sources[0].accountId).id);if(sourceId===manifest.account_id||previous&&sourceId!==previous.sourceAccountId)fail();
 if(!manifest.invoice_no||!manifest.folio_no)fail();
 const sourceHistory=object(await reader.invoiceHistory(sourceId,[manifest.invoice_no!],0,20)),groups=list(sourceHistory.details);complete(sourceHistory,2);
 if(groups.length!==1||groups[0].hotelId!==manifest.hotel||id(object(groups[0].accountId).id)!==sourceId||accountNumber(groups[0].accountNo)!==sourceNumber)fail();
 const historyRows=list(groups[0].invoices);if(historyRows.length!==2)fail();
 const positive=historyRows.filter(i=>amountCents(i.amount,'THB')===amountCents(invoice.amount,'THB'));if(positive.length!==1)fail();
 const selected=positive[0],positiveId=id(selected.transactionNo),window=id(invoice.internalFolioWindowID);
 if(String(selected.invoiceNo)!==manifest.invoice_no||String(selected.folioNo)!==manifest.folio_no||id(selected.internalFolioWindowID)!==window||previous&&positiveId!==previous.positiveInvoiceId)fail();
 const request={hotel:manifest.hotel as Parameters<OperaReader['invoicePostings']>[0]['hotel'],accountId:sourceId,transactionId:positiveId,invoiceNo:manifest.invoice_no!,folioNo:manifest.folio_no!,internalFolioWindowId:window};
 const sourcePostings={request,response:await reader.invoicePostings(request)},input:ArTransferInput={manifest,account,invoice,postings,postedRows,sourceAccounts,sourceHistory,sourcePostings};
 return previous?revalidateArTransfer(previous,input):verifyArTransfer(input);
}
/** Native printing is followed by new destination and source snapshots. A
 * failed or changed read never causes this function to print or retry. */
export async function refreshArTransfer(reader:ArTransferReader,manifest:DocumentInvoice,evidence:ArTransferEvidence):Promise<ArTransferEvidence>{
 const scope={hotel:manifest.hotel as Parameters<OperaReader['financialTransactionDetail']>[0]['hotel'],accountId:manifest.account_id,transactionId:manifest.id};
 const postingScope={...scope,invoiceNo:manifest.invoice_no!,folioNo:manifest.folio_no!,internalFolioWindowId:evidence.internalFolioWindowId};
 const previousRows=list(evidence.proof.postedRows),ids=previousRows.map(p=>id(p.transactionNo));if(!ids.length||ids.length>20||new Set(ids).size!==ids.length)fail();
 const [rawAccount,rawDetail,postings,rawRows]=await resolved([reader.account(manifest.account_id),reader.financialTransactionDetail(scope),reader.invoicePostings(postingScope),reader.invoiceTransactionDetails(ids)]);
 const account=object(object(rawAccount).accountDetails),detail=list(object(rawDetail).details);
 if(detail.length!==1||detail[0].hotelId!==manifest.hotel||id(object(detail[0].accountId).id)!==manifest.account_id)fail();
 const invoices=list(detail[0].invoices).filter(i=>String(i.transactionNo)===manifest.id);if(invoices.length!==1)fail();
 const postedRows=list(object(rawRows).transactions);if(postedRows.length!==ids.length||postedRows.some(p=>!ids.includes(id(p.transactionNo)))||new Set(postedRows.map(p=>id(p.transactionNo))).size!==ids.length)fail();
 return readArTransfer(reader,manifest,account,invoices[0],postings,postedRows,evidence);
}
