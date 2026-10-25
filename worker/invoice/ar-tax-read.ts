import {nativeTaxReport} from './tax-report-profile';
import type {OperaReader} from '../opera/client';
import {getNativeInvoicePdf,type DocumentInvoice} from '../documents/native-invoice';
import {canonical,verifyArSimulation,type ArSimulation} from './ar-tax';
import {discoverPostedGenerates,verifyPostedGenerates,type ArPostedGenerates} from './posted-generates';
import {readArTransfer,refreshArTransfer,type ArTransferReader} from './ar-transfer-read';
import type {ArTransferEvidence} from './ar-transfer';
import {record,type InvoicePacket} from './model';
import {amountCents} from '../opera/normalize';
export type ArTaxReader=Pick<OperaReader,'account'|'reservationFolios'|'folioReport'|'invoiceTransactionCodeRules'|'invoiceChargeSimulation'|'folioTypeName'>&Partial<ArTransferReader>;
const fail=():never=>{throw Error('document_invoice_ar_tax_unverified');};
const list=(v:unknown)=>Array.isArray(v)?v.map(record):fail();
export async function readNativeInvoiceTaxControls(reader:Pick<ArTaxReader,'account'|'reservationFolios'|'folioReport'|'folioTypeName'>,manifest:DocumentInvoice,onRenderStart:()=>void=()=>{}){
 const report=nativeTaxReport(manifest.hotel);if(!report)return fail();
 const config=record(record(await reader.folioTypeName('Guest')).details);
 if(config.hotelId!==manifest.hotel||config.folioReportName!==report)fail();
 const native=await getNativeInvoicePdf(reader,manifest,onRenderStart);
 const {readNativeTaxControls}=await import('./native-tax-controls');
 return readNativeTaxControls(native.bytes,manifest.folio_no!,{includeFullTotals:true});
}
export async function readArTaxEvidence(reader:ArTaxReader,manifest:DocumentInvoice,account:Record<string,unknown>,invoice:Record<string,unknown>,postings:Record<string,unknown>,details:NonNullable<InvoicePacket['arDetails']>,onRenderStart:()=>void=()=>{},currentRulesOnly=false){
 const report=nativeTaxReport(manifest.hotel);if(!report)return fail();
 if(!currentRulesOnly){const config=record(record(await reader.folioTypeName('Guest')).details);if(config.hotelId!==manifest.hotel||config.folioReportName!==report)fail();}
 const roots=details.flatMap(d=>list(record(d.response).transactions));if(!roots.length||roots.length>20)fail();
 const graphs=discoverPostedGenerates(manifest,account,postings,details),claimed=new Set(graphs.flatMap(g=>[String(g.root.transactionNo),...g.children.map(c=>String(c.transactionNo))]));
 if(currentRulesOnly&&graphs.length)throw Error('document_invoice_current_ar_tax_unverified');
 let arTransfer:ArTransferEvidence|undefined;
 if(roots.some(p=>!claimed.has(String(p.transactionNo))&&String(record(p.aRInfo).accountNumber)!==String(account.accountNo))){
  if(currentRulesOnly)throw Error('document_invoice_current_ar_tax_unverified');
  if(!reader.accountsByNumber||!reader.invoiceHistory||!reader.invoicePostings||!reader.financialTransactionDetail||!reader.invoiceTransactionDetails)throw Error('document_invoice_ar_transfer_unverified');
  arTransfer=await readArTransfer(reader as ArTransferReader,manifest,account,invoice,postings,roots);
 }
 const graphCodes=[...new Set(graphs.flatMap(g=>[String(g.root.transactionCode),...g.children.map(c=>String(c.transactionCode))]))];
 const readGraphRules=async()=>{const result=new Map<string,unknown>();for(let n=0;n<graphCodes.length;n+=4){const codes=graphCodes.slice(n,n+4),values=await Promise.allSettled(codes.map(code=>reader.invoiceTransactionCodeRules(code)));for(let i=0;i<codes.length;i++){const value=values[i];if(value.status==='rejected')throw value.reason;result.set(codes[i],value.value);}}return result;};
 const before=await readGraphRules();
 const graphEvidence=(after:Map<string,unknown>):ArPostedGenerates[]=>graphs.map(g=>({postingId:String(g.root.transactionNo),childIds:g.children.map(c=>String(c.transactionNo)),rules:before.get(String(g.root.transactionCode)),rulesAfter:after.get(String(g.root.transactionCode)),generatedRules:g.children.map(c=>before.get(String(c.transactionCode))),generatedRulesAfter:g.children.map(c=>after.get(String(c.transactionCode)))}));
 graphEvidence(before).forEach((e,n)=>verifyPostedGenerates(graphs[n],e,manifest.hotel));
 const simulations:ArSimulation[]=[];
 for(const p of roots){
  if(claimed.has(String(p.transactionNo)))continue;
  const selected=list(postings.invoicePostingsDetails).filter(r=>String(r.transactionNo)===String(p.transactionNo)),info=record(p.aRInfo);
  const accountMatches=String(info.accountNumber)===String(account.accountNo)||!!arTransfer&&String(info.accountNumber)===arTransfer.sourceAccountNumber&&arTransfer.postingIds.includes(String(p.transactionNo));
  if(selected.length!==1||!accountMatches||String(info.invoiceNo)!==manifest.invoice_no||String(p.folioNo)!==manifest.folio_no||p.transactionCode!==selected[0].transactionCode||p.transactionType!=='Revenue'||p.deferredTax!==false)fail();
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
  const evidence={postingId:String(p.transactionNo),rules,rulesAfter,generatedRules,generatedRulesAfter:generatedAfter,calculation};verifyArSimulation(evidence,manifest.hotel,code,amount);simulations.push(evidence);
 }
 if(currentRulesOnly)return {arSimulations:simulations,arPostedGenerates:[]};
 const nativeTaxControls=await readNativeInvoiceTaxControls(reader,manifest,onRenderStart);
 const arPostedGenerates=graphEvidence(await readGraphRules());arPostedGenerates.forEach((e,n)=>verifyPostedGenerates(graphs[n],e,manifest.hotel));
 if(arTransfer)arTransfer=await refreshArTransfer(reader as ArTransferReader,manifest,arTransfer);
 return {arSimulations:simulations,arPostedGenerates,nativeTaxControls,...arTransfer?{arTransfer}:{}};
}
export function financialPostingFingerprint(raw:unknown){
 const rows=list(record(raw).invoicePostingsDetails).map(p=>({id:p.transactionNo,code:p.transactionCode,date:p.transactionDate,debit:p.debitAmount??null,credit:p.creditAmount??null,check:p.checkNo??null,reference:p.reference??null,remark:p.remark??null})).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 if(new Set(rows.map(p=>String(p.id))).size!==rows.length)fail();return canonical(rows);
}
