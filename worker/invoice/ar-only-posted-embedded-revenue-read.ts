import {canonical} from './ar-tax';
import {arOnlyTaxSource} from './current-ar-tax';
import {discoverPostedEmbeddedRevenue} from './ar-only-posted-embedded-revenue-claims';
import {inspectArOnlyNonVat} from './ar-only-nonvat-proof';
import {zeroVatNetProvenance,type ArOnlyZeroVatNetGroup} from './ar-only-zero-vat-net-proof';
import {exclusiveNonRevenueZeroVatNetProvenance} from './exclusive-nonrevenue-zero-vat-net';
import {directNonVatProvenance} from './direct-nonvat-policy';
import {readArOnlyBatch} from './ar-only-evidence-read';
import type {ArOnlyInvoiceReader} from './ar-only-read';
import type {InvoicePacket} from './model';
const fail=():never=>{throw Error('document_invoice_posted_embedded_revenue_unverified');};
export async function readPostedEmbeddedRevenue(reader:ArOnlyInvoiceReader,initial:InvoicePacket,readFresh:()=>Promise<InvoicePacket>):Promise<InvoicePacket>{
 const roots=discoverPostedEmbeddedRevenue(initial),zero=inspectArOnlyNonVat(initial);if(!roots.length||!reader.invoiceTransactionCodeRules)fail();const codes=[...new Set([...roots.flatMap(c=>[String(c.posting.transactionCode),...c.taxes.map(t=>String(t.transactionCode))]),...zero.candidates.map(g=>String(g.posting.transactionCode))])],before=structuredClone(arOnlyTaxSource(initial)),readRules=async()=>new Map((await readArOnlyBatch(codes.map(code=>()=>reader.invoiceTransactionCodeRules!(code)))).map((r,n)=>[codes[n],r])),rules=await readRules();
 const classified=zero.candidates.map(g=>{const code=String(g.posting.transactionCode),r=rules.get(code),provenance=directNonVatProvenance(r,initial.manifest.hotel,code,g.definition)??zeroVatNetProvenance(r,initial.manifest.hotel,code,g.definition)??exclusiveNonRevenueZeroVatNetProvenance(r,initial.manifest.hotel,code,g.definition)??fail();return {g,code,r,provenance};});
 const calculations=()=>{const cache=new Map<string,unknown>();return async(code:string,cents:number)=>{if(!reader.invoiceChargeSimulation)fail();const key=JSON.stringify([code,cents]);if(!cache.has(key))cache.set(key,await reader.invoiceChargeSimulation!(code,cents/100));return cache.get(key);};},calcBefore=calculations(),calcAfter=calculations(),groups:ArOnlyZeroVatNetGroup[]=[];
 for(const c of classified){const calculation=await calcBefore(c.code,c.g.signedCents);groups.push({postingId:c.g.id,rules:c.r,rulesAfter:c.r,calculation,calculationAfter:calculation,provenance:c.provenance});}
 const fresh=await readFresh(),after=structuredClone(arOnlyTaxSource(fresh));if(canonical(before)!==canonical(after))throw Error('document_source_changed');const refreshed=await readRules();for(const code of codes)if(canonical(rules.get(code))!==canonical(refreshed.get(code)))throw Error('document_source_changed');const paired:ArOnlyZeroVatNetGroup[]=[];
 for(let n=0;n<classified.length;n++){const c=classified[n],calculationAfter=await calcAfter(c.code,c.g.signedCents);if(canonical(groups[n].calculation)!==canonical(calculationAfter))throw Error('document_source_changed');paired.push({...groups[n],rulesAfter:refreshed.get(c.code),calculationAfter});}
 return {...fresh,arOnlySourceClaimsProof:{version:6,kind:'ar-only-source-claims',sourceBefore:before,sourceAfter:after,components:[{kind:'posted-embedded-revenue-vat',roots:roots.map(c=>({rootId:String(c.posting.transactionNo),generateIds:c.taxes.map(t=>String(t.transactionNo)),rules:rules.get(String(c.posting.transactionCode)),rulesAfter:refreshed.get(String(c.posting.transactionCode)),generatedRules:c.taxes.map(t=>rules.get(String(t.transactionCode))),generatedRulesAfter:c.taxes.map(t=>refreshed.get(String(t.transactionCode)))}))},...paired.length?[{kind:'direct-zero' as const,groups:paired}]:[]]}};
}
