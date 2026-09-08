import {OperaError,type OperaReader} from './client';
import {amountCents} from './normalize';
import {asObject} from '../refresh/read-snapshot';
/** A/C preparation trial only; no statement generation POST or send. */
export async function probeSelectedStatement(reader:Pick<OperaReader,'account'|'statementSelection'>,hotel:string,accountId:string){
 const current=asObject(asObject(await reader.account(accountId)).accountDetails);
 if(current.hotelId!==hotel||asObject(current.accountId).id!==accountId||!Array.isArray(current.invoices))throw new OperaError('invalid_response');
 const eligible=current.invoices.map(asObject).filter(i=>i.parentInvoiceNo==null&&amountCents(i.balance,'THB')>0);
 if(eligible.length<3)return {status:'insufficient_sample',eligible:eligible.length};
 const selected=[eligible[0],eligible[2]],ids=selected.map(i=>String(i.transactionNo));
 const response=asObject(await reader.statementSelection(accountId,ids));
 const statements=Array.isArray(response.aRStatements)?response.aRStatements.map(asObject):[];
 const rows=statements.flatMap(s=>Array.isArray(s.invoices)?s.invoices.map(asObject):[]);
 const exactScope=statements.length===1&&statements[0].hotelId===hotel&&asObject(statements[0].accountId).id===accountId&&rows.length===ids.length&&new Set(rows.map(r=>String(r.transactionNo))).size===ids.length&&rows.every(r=>ids.includes(String(r.transactionNo)));
 const balanceMatches=statements.length===1&&amountCents(statements[0].balance,'THB')===selected.reduce((sum,i)=>sum+amountCents(i.balance,'THB'),0);
 return {status:exactScope&&balanceMatches?'selection_verified':'selection_rejected',requested:2,returned:rows.length,exactScope,balanceMatches,excludedMiddleAbsent:rows.every(r=>String(r.transactionNo)!==String(eligible[1].transactionNo)),nativeStatementPdfVerified:false};
}
