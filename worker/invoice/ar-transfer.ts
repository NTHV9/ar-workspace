import type {DocumentInvoice} from '../documents/native-invoice';
import {amountCents} from '../opera/normalize';
import {canonical} from './ar-tax';
export interface ArTransferInput {manifest:DocumentInvoice;account:unknown;invoice:unknown;postings:unknown;postedRows:unknown[];sourceAccounts:unknown;sourceHistory:unknown;sourcePostings:{request:{hotel:string;accountId:string;transactionId:string;invoiceNo:string;folioNo:string;internalFolioWindowId:string};response:unknown}}
export interface ArTransferEvidence {
 version:1;hotel:string;destinationAccountId:string;destinationAccountNumber:string;currentInvoiceId:string;
 sourceAccountId:string;sourceAccountNumber:string;positiveInvoiceId:string;offsetInvoiceId:string;
 invoiceNo:string;folioNo:string;folioDate:string;transactionDate:string;reservationId:string;internalFolioWindowId:string;
 grossCents:number;balanceCents:number;postingIds:string[];postingFingerprint:string;postedAccountFingerprint:string;
 /** Private, detached evidence for the model to validate again. Never log or persist publicly. */
 proof:ArTransferInput;
}
type Row=Record<string,unknown>;
const fail=():never=>{throw Error('document_invoice_ar_transfer_unverified');};
const object=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:fail();
const list=(value:unknown):Row[]=>Array.isArray(value)?value.map(object):fail();
const text=(value:unknown):string=>{
 if(typeof value==='number'&&!Number.isSafeInteger(value)||!['string','number'].includes(typeof value))return fail();
 const result=String(value);return result.trim()&&result.length<=200&&!/[\u0000-\u001f\u007f]/.test(result)?result:fail();
};
const id=(value:unknown)=>{const result=text(value);return /^[1-9][0-9]{0,15}$/.test(result)?result:fail();};
const date=(value:unknown)=>{const result=text(value);return /^\d{4}-\d{2}-\d{2}$/.test(result)&&Number.isFinite(Date.parse(result+'T00:00:00Z'))&&new Date(result+'T00:00:00Z').toISOString().slice(0,10)===result?result:fail();};
const money=(value:unknown)=>amountCents(value);
const accountId=(account:Row)=>{const value=object(account.accountId);if(value.type!=='AccountId')return fail();return id(value.id);};
function complete(raw:Row,count:number){
 // This OPERA adapter returns the next offset, including a partial last page.
 // A two-row scoped proof must fit in one fully returned page from offset zero.
 if(raw.hasMore!==false||raw.totalResults!==count||!Number.isSafeInteger(raw.limit)||Number(raw.limit)<count||Number(raw.limit)>4000||raw.offset!==raw.limit||raw.totalPages!==undefined&&raw.totalPages!==1)fail();
}
function selectedPostings(raw:unknown){
 const rows=list(object(raw).invoicePostingsDetails);if(!rows.length||rows.length>=4000)fail();
 const seen=new Set<string>();let gross=0;
 const material=rows.map(row=>{
  const key=id(row.transactionNo);if(seen.has(key))fail();seen.add(key);
  const debit=row.debitAmount===undefined?0:money(row.debitAmount),credit=row.creditAmount===undefined?0:money(row.creditAmount);
  if(!debit&&!credit||debit&&credit)fail();gross+=debit-credit;if(!Number.isSafeInteger(gross))fail();
  for(const field of ['checkNo','reference','remark'])if(row[field]!==undefined&&row[field]!==null&&typeof row[field]!=='string')fail();
  return {id:row.transactionNo,code:text(row.transactionCode),date:date(row.transactionDate),debit:row.debitAmount??null,credit:row.creditAmount??null,check:row.checkNo??null,reference:row.reference??null,remark:row.remark??null};
 }).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 return {rows,gross,ids:material.map(p=>id(p.id)),fingerprint:canonical(material)};
}
function validate(input:ArTransferInput):ArTransferEvidence{
 const m=input.manifest,hotel=text(m.hotel),destinationAccountId=id(m.account_id),currentInvoiceId=id(m.id),invoiceNo=id(m.invoice_no),folioNo=id(m.folio_no),reservationId=id(m.reservation_id),folioDate=date(m.folio_date);
 if(!['standalone','parent'].includes(m.collection_role)||!Number.isFinite(m.open)||m.open<=0)fail();
 const account=object(input.account),invoice=object(input.invoice),destinationAccountNumber=text(account.accountNo);
 if(account.hotelId!==hotel||accountId(account)!==destinationAccountId)fail();
 const currentRows=list(account.invoices).filter(r=>id(r.transactionNo)===currentInvoiceId);if(currentRows.length!==1)fail();const current=currentRows[0];
 const internalFolioWindowId=id(current.internalFolioWindowID),transactionDate=date(current.transactionDate);
 const sameInvoice=(row:Row,withReservation:boolean)=>{
  if(row.hotelId!==hotel||id(row.invoiceNo)!==invoiceNo||id(row.folioNo)!==folioNo||date(row.folioDate)!==folioDate||date(row.transactionDate)!==transactionDate||id(row.internalFolioWindowID)!==internalFolioWindowId||row.parentInvoiceNo!=null)fail();
  if(withReservation){const reservation=object(row.reservationId);if(reservation.type!=='Reservation'||id(reservation.id)!==reservationId)fail();}
 };
 sameInvoice(current,true);sameInvoice(invoice,false);
 if(current.transferredIn!==true||current.transferredOut!==false||current.compressed!==false||id(invoice.transactionNo)!==currentInvoiceId)fail();
 if(invoice.reservationId!==undefined){const reservation=object(invoice.reservationId);if(id(reservation.id)!==reservationId)fail();}
 const grossCents=money(invoice.amount),balanceCents=money(invoice.balance);
 if(grossCents<=0||balanceCents<=0||balanceCents!==Math.round(m.open*100)||money(current.amount)!==grossCents||money(current.balance)!==balanceCents)fail();
 const selected=selectedPostings(input.postings);if(selected.gross!==grossCents)fail();
 const accounts=new Set<string>(),postedIds=new Set<string>(),postedAccounts:{id:string;accountNumber:string}[]=[];
 for(const row of list(input.postedRows)){
  const key=id(row.transactionNo),selectedRow=selected.rows.find(r=>id(r.transactionNo)===key)??fail();if(postedIds.has(key))fail();postedIds.add(key);
  if(['transactionCode','transactionDate','debitAmount','creditAmount'].some(k=>canonical(row[k])!==canonical(selectedRow[k])))fail();
  const info=object(row.aRInfo),number=text(info.accountNumber);
  if(id(info.invoiceNo)!==invoiceNo||row.hotelId!==undefined&&row.hotelId!==hotel||id(row.folioNo)!==folioNo)fail();
  if(number!==destinationAccountNumber)accounts.add(number);postedAccounts.push({id:key,accountNumber:number});
 }
 if(accounts.size!==1)fail();const sourceAccountNumber=[...accounts][0];
 const sourceRaw=object(input.sourceAccounts),sourceRows=list(sourceRaw.accountsDetails);complete(sourceRaw,1);if(sourceRows.length!==1)fail();
 const source=sourceRows[0],sourceAccountId=accountId(source);
 if(source.hotelId!==hotel||text(source.accountNo)!==sourceAccountNumber||sourceAccountId===destinationAccountId)fail();
 const history=object(input.sourceHistory),groups=list(history.details);complete(history,2);if(groups.length!==1)fail();const group=groups[0];
 if(group.hotelId!==hotel||accountId(group)!==sourceAccountId||text(group.accountNo)!==sourceAccountNumber)fail();
 const historyRows=list(group.invoices);if(historyRows.length!==2)fail();let positiveInvoiceId='',offsetInvoiceId='';const historicalIds=new Set<string>();
 for(const row of historyRows){
  sameInvoice(row,true);const key=id(row.transactionNo);if(key===currentInvoiceId||historicalIds.has(key))fail();historicalIds.add(key);
  if(row.transferredIn!==false||row.transferredOut!==true||row.compressed!==false||money(row.balance)!==0)fail();
  const amount=money(row.amount);if(amount===grossCents&&!positiveInvoiceId)positiveInvoiceId=key;else if(amount===-grossCents&&!offsetInvoiceId)offsetInvoiceId=key;else fail();
 }
 if(!positiveInvoiceId||!offsetInvoiceId)fail();
 const request=object(input.sourcePostings.request);
 if(request.hotel!==hotel||id(request.accountId)!==sourceAccountId||id(request.transactionId)!==positiveInvoiceId||id(request.invoiceNo)!==invoiceNo||id(request.folioNo)!==folioNo||id(request.internalFolioWindowId)!==internalFolioWindowId)fail();
 if(selectedPostings(input.sourcePostings.response).fingerprint!==selected.fingerprint)fail();
 return {version:1,hotel,destinationAccountId,destinationAccountNumber,currentInvoiceId,sourceAccountId,sourceAccountNumber,positiveInvoiceId,offsetInvoiceId,invoiceNo,folioNo,folioDate,transactionDate,reservationId,internalFolioWindowId,grossCents,balanceCents,postingIds:selected.ids,postingFingerprint:selected.fingerprint,postedAccountFingerprint:canonical(postedAccounts.sort((a,b)=>a.id.localeCompare(b.id))),proof:structuredClone(input)};
}
/** No network or ledger operations. This proof never authorizes unrelated account mismatches. */
export function verifyArTransfer(input:ArTransferInput):ArTransferEvidence{
 try{return validate(input);}catch{return fail();}
}
const facts=(e:ArTransferEvidence)=>{
 const {proof,...value}=e;
 const taxFields=['transactionNo','transactionCode','transactionDate','postingDate','revenueDate','debitAmount','creditAmount','postedAmount','transactionAmount','transactionType','deferredTax','referenceTransactionNo','referencePackageTransactionNo','folioNo','folioWindowNo','internalFolioWindowID','hotelId','reservationId','guestInfo','subPostings'];
 const postedTaxFacts=list(proof.postedRows).map((row):Row=>({...Object.fromEntries(taxFields.map(key=>[key,row[key]??null])),aRInfo:{accountNumber:text(object(row.aRInfo).accountNumber),invoiceNo:id(object(row.aRInfo).invoiceNo)}})).sort((a,b)=>String(a.transactionNo).localeCompare(String(b.transactionNo)));
 return canonical({...value,postedTaxFacts});
};
/** Revalidate both retained and freshly read proof around native printing. */
export function revalidateArTransfer(evidence:ArTransferEvidence,fresh:ArTransferInput):ArTransferEvidence{
 try{const original=verifyArTransfer(evidence.proof),next=verifyArTransfer(fresh);if(facts(evidence)!==facts(original)||facts(original)!==facts(next))fail();return next;}catch{return fail();}
}
