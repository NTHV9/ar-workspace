import {canonical} from './ar-tax';
import {arOnlyTaxSource} from './current-ar-tax';
import {inspectArOnlyNonVat} from './ar-only-nonvat-proof';
import {directNonVatProvenance} from './direct-nonvat-policy';
import {excludedFooterProvenance,type CurrentArZeroFooterGroup} from './ar-only-zero-footer-claims';
import {readArOnlyBatch} from './ar-only-evidence-read';
import type {ArOnlyInvoiceReader} from './ar-only-read';
import type {InvoicePacket} from './model';
const fail=():never=>{throw Error('document_invoice_current_ar_zero_footer_unverified');};
/** Explicit NonVAT alone uses its existing calculator evidence. The named
 * excluded report role is proved from source/policy and never simulated. */
export async function readCurrentArZeroFooter(reader:ArOnlyInvoiceReader,initial:InvoicePacket,rules:ReadonlyMap<string,unknown>,readFresh:()=>Promise<InvoicePacket>):Promise<InvoicePacket>{
 const plan=inspectArOnlyNonVat(initial),codes=[...new Set(plan.candidates.map(g=>String(g.posting.transactionCode)))],before=structuredClone(arOnlyTaxSource(initial));
 const classified=plan.candidates.map(g=>{const code=String(g.posting.transactionCode),rule=rules.get(code),nonvat=directNonVatProvenance(rule,initial.manifest.hotel,code,g.definition);if(nonvat)return {g,code,rule,nonvat};const excluded=excludedFooterProvenance(rule,initial.manifest.hotel,code,g.definition);if(!excluded||g.signedCents<=0)fail();return {g,code,rule,excluded};});if(!classified.some(g=>g.excluded))fail();
 const calculations=()=>{const cache=new Map<string,unknown>();return async(code:string,cents:number)=>{const key=JSON.stringify([code,cents]);if(!reader.invoiceChargeSimulation)fail();if(!cache.has(key))cache.set(key,await reader.invoiceChargeSimulation!(code,cents/100));return cache.get(key);};},readBefore=calculations(),readAfter=calculations(),groups:CurrentArZeroFooterGroup[]=[];
 for(const c of classified)if(c.nonvat){const calculation=await readBefore(c.code,c.g.signedCents);groups.push({kind:'explicit-nonvat',postingId:c.g.id,rules:c.rule,rulesAfter:c.rule,calculation,calculationAfter:calculation,provenance:c.nonvat});}else groups.push({kind:'excluded-tax-footer',postingId:c.g.id,rules:c.rule,rulesAfter:c.rule,provenance:c.excluded??fail()});
 const fresh=await readFresh(),after=structuredClone(arOnlyTaxSource(fresh));if(canonical(before)!==canonical(after))throw Error('document_source_changed');const values=await readArOnlyBatch(codes.map(code=>()=>reader.invoiceTransactionCodeRules!(code))),rulesAfter=new Map(codes.map((code,n)=>[code,values[n]]));for(const code of codes)if(canonical(rules.get(code))!==canonical(rulesAfter.get(code)))throw Error('document_source_changed');
 const paired:CurrentArZeroFooterGroup[]=[];for(let n=0;n<groups.length;n++){const g=groups[n],c=classified[n];if(g.kind==='explicit-nonvat'){const calculationAfter=await readAfter(c.code,c.g.signedCents);if(canonical(g.calculation)!==canonical(calculationAfter))throw Error('document_source_changed');paired.push({...g,rulesAfter:rulesAfter.get(c.code),calculationAfter});}else paired.push({...g,rulesAfter:rulesAfter.get(c.code)});}
 return {...fresh,arOnlySourceClaimsProof:{version:5,kind:'ar-only-source-claims',sourceBefore:before,sourceAfter:after,components:[{kind:'current-ar-zero-footer',groups:paired}]}};
}
