import {nativeTaxReport} from './tax-report-profile';
import type {OperaReader} from '../opera/client';
import {getNativeInvoicePdf,type DocumentInvoice} from '../documents/native-invoice';
import {canonical,verifyArSimulation,type ArSimulation} from './ar-tax';
import {record,type InvoicePacket} from './model';
import {amountCents} from '../opera/normalize';
export type ArTaxReader=Pick<OperaReader,'account'|'reservationFolios'|'folioReport'|'invoiceTransactionCodeRules'|'invoiceChargeSimulation'|'folioTypeName'>;
const fail=():never=>{throw Error('document_invoice_ar_tax_unverified');};
const list=(v:unknown)=>Array.isArray(v)?v.map(record):fail();
export async function readArTaxEvidence(reader:ArTaxReader,manifest:DocumentInvoice,account:Record<string,unknown>,postings:Record<string,unknown>,details:NonNullable<InvoicePacket['arDetails']>,onRenderStart:()=>void=()=>{}){
 const report=nativeTaxReport(manifest.hotel);if(!report)return fail();
 const config=record(record(await reader.folioTypeName('Guest')).details);
 if(config.hotelId!==manifest.hotel||config.folioReportName!==report)fail();
 const roots=details.flatMap(d=>list(record(d.response).transactions));if(!roots.length||roots.length>20)fail();
 const simulations:ArSimulation[]=[];
 for(const p of roots){
  const selected=list(postings.invoicePostingsDetails).filter(r=>String(r.transactionNo)===String(p.transactionNo)),info=record(p.aRInfo);
  if(selected.length!==1||String(info.accountNumber)!==String(account.accountNo)||String(info.invoiceNo)!==manifest.invoice_no||String(p.folioNo)!==manifest.folio_no||p.transactionCode!==selected[0].transactionCode||p.transactionType!=='Revenue'||p.deferredTax!==false)fail();
  const signed=(r:Record<string,unknown>)=>(r.debitAmount?amountCents(r.debitAmount,'THB'):0)-(r.creditAmount?amountCents(r.creditAmount,'THB'):0);
  const amount=signed(p)/100;if(signed(p)!==signed(selected[0]))fail();const code=String(p.transactionCode);
  const rules=await reader.invoiceTransactionCodeRules(code),definition=record(record(rules).transactionCode);
  const generated=list(record(definition.generatesSetup).generates);if(!generated.length||generated.length>5)fail();
  const codes=generated.map(g=>String(g.code));if(new Set(codes).size!==codes.length)fail();
  const reads=await Promise.allSettled([reader.invoiceChargeSimulation(code,amount),...codes.map(c=>reader.invoiceTransactionCodeRules(c))]);
  const [calculation,...generatedRules]=reads.map(r=>{if(r.status==='rejected')throw r.reason;return r.value;});
  const after=await Promise.allSettled([reader.invoiceTransactionCodeRules(code),...codes.map(c=>reader.invoiceTransactionCodeRules(c))]);
  const [rulesAfter,...generatedAfter]=after.map(r=>{if(r.status==='rejected')throw r.reason;return r.value;});
  if(canonical(generatedRules)!==canonical(generatedAfter))fail();
  const evidence={postingId:String(p.transactionNo),rules,rulesAfter,generatedRules,calculation};verifyArSimulation(evidence,manifest.hotel,code,amount);simulations.push(evidence);
 }
 const native=await getNativeInvoicePdf(reader,manifest,onRenderStart);
 const {readNativeTaxControls}=await import('./native-tax-controls');
 return {arSimulations:simulations,nativeTaxControls:await readNativeTaxControls(native.bytes,manifest.folio_no!)};
}
export function financialPostingFingerprint(raw:unknown){
 const rows=list(record(raw).invoicePostingsDetails).map(p=>({id:p.transactionNo,code:p.transactionCode,date:p.transactionDate,debit:p.debitAmount??null,credit:p.creditAmount??null,check:p.checkNo??null,reference:p.reference??null,remark:p.remark??null})).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 if(new Set(rows.map(p=>String(p.id))).size!==rows.length)fail();return canonical(rows);
}
