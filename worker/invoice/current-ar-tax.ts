import {canonical,type ArSimulation} from './ar-tax';
import type {InvoicePacket} from './model';
export type CurrentArTaxSource=Pick<InvoicePacket,'manifest'|'account'|'invoice'|'postings'|'taxRows'|'taxCodes'|'arDetails'>;
export interface CurrentArTaxProof {version:1;kind?:'posted-vat7'|'ar-only-current-vat7';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource}
const fail=():never=>{throw Error('document_invoice_current_ar_tax_unverified');};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail();
/** Keep financial source identity separate from mutable display/profile fields. */
export function currentArTaxSource(p:CurrentArTaxSource):CurrentArTaxSource{
 const a=object(p.account);
 return {manifest:p.manifest,account:{hotelId:a.hotelId,accountId:a.accountId,accountNo:a.accountNo},invoice:p.invoice,postings:p.postings,taxRows:p.taxRows,taxCodes:p.taxCodes,arDetails:p.arDetails};
}
/** AR-only proofs compare selected postings by exact identity. Preserve every
 * field and reject duplicate/invalid IDs before removing response-order noise.
 * Legacy current-rule proofs retain their original ordered-source contract. */
export function arOnlyTaxSource(p:CurrentArTaxSource):CurrentArTaxSource{
 const source=currentArTaxSource(p),postings=object(source.postings),raw=postings.invoicePostingsDetails;
 if(!Array.isArray(raw))return fail();
 const rows=raw.map(object),seen=new Set<string>();
 for(const row of rows){const key=String(row.transactionNo);if(!/^[1-9][0-9]{0,15}$/.test(key))return fail();if(seen.has(key))throw Error('document_invoice_posting_duplicate');seen.add(key);}
 return {...source,postings:{...postings,invoicePostingsDetails:[...rows].sort((a,b)=>String(a.transactionNo).localeCompare(String(b.transactionNo)))}};
}
/** This authenticates the source/rule interval. invoiceModel independently
 * requires full posted VAT7 coverage, no taxless components, and each current
 * simulation to cover its entire inclusive charge. It never fabricates native
 * tax controls or claims these calculations are historical posted VAT. */
export function verifyCurrentArTaxProof(p:InvoicePacket):true{
 const proof=p.currentArTaxProof;
 if(!proof)return fail();
 const simulations=p.arSimulations??[];
 if(proof.version!==1||proof.kind!==undefined&&proof.kind!=='posted-vat7'&&proof.kind!=='ar-only-current-vat7'||p.nativeTaxControls||p.arTransfer||p.arPostedGenerates?.length||p.embeddedGenerateProof||p.directZeroTaxProof)return fail();
 // Posted-only evidence enters the same strict model branch, with no simulated
 // roots. The legacy current-adjustment proof still requires both independently.
 if(proof.kind==='posted-vat7'){if(p.arDetails?.length||simulations.length)return fail();}
 else if(!p.arDetails?.length||!simulations.length)return fail();
 const current=canonical(proof.kind===undefined?currentArTaxSource(p):arOnlyTaxSource(p));
 if(canonical(proof.sourceBefore)!==current||canonical(proof.sourceAfter)!==current)fail();
 for(const e of simulations){
  if(!e.generatedRulesAfter||canonical(e.rules)!==canonical(e.rulesAfter)||canonical(e.generatedRules)!==canonical(e.generatedRulesAfter))fail();
 }
 return true;
}
/** Re-read every parent/leaf definition across the final source-read interval. */
export async function refreshCurrentArRules(simulations:ArSimulation[],readRules:(code:string)=>Promise<unknown>):Promise<ArSimulation[]>{
 const codeOf=(raw:unknown)=>{const code=object(object(raw).transactionCode).code;if(typeof code!=='string'||!code)fail();return code as string;};
 const codes=[...new Set(simulations.flatMap(e=>[codeOf(e.rules),...e.generatedRules.map(codeOf)]))],values=new Map<string,unknown>();
 for(let start=0;start<codes.length;start+=4){const batch=codes.slice(start,start+4),reads=await Promise.allSettled(batch.map(readRules));for(let n=0;n<batch.length;n++){const r=reads[n];if(r.status==='rejected')throw r.reason;values.set(batch[n],r.value);}}
 return simulations.map(e=>{
  const rulesAfter=values.get(codeOf(e.rules)),generatedRulesAfter=e.generatedRules.map(r=>values.get(codeOf(r)));
  if(canonical(e.rules)!==canonical(rulesAfter)||canonical(e.generatedRules)!==canonical(generatedRulesAfter))throw Error('document_source_changed');
  return {...e,rulesAfter,generatedRulesAfter};
 });
}
