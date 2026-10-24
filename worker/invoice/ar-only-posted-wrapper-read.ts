import {canonical} from './ar-tax';
import {arOnlyTaxSource} from './current-ar-tax';
import {discoverPostedWrapperRegion,verifySelectedWrapperSourceAssertions} from './ar-only-posted-wrapper-claims';
import {verifyArOnlyWrapperOwnership,discoverWrapperNetVat,canPlanWrapperNetVatComponent,type WrapperNetVatCandidate} from './ar-only-wrapper-net-vat-proof';
import {readArOnlyBatch} from './ar-only-evidence-read';
import type {ArOnlyInvoiceReader} from './ar-only-read';
import type {InvoicePacket} from './model';
const fail=():never=>{throw Error('document_invoice_posted_wrapper_claims_unverified');};
/** Exact code metadata around one complete financial source fence. No tax is
 * simulated and no provider or source failure selects another proof. */
export async function readPostedWrapperClaims(reader:ArOnlyInvoiceReader,initial:InvoicePacket,readFresh:()=>Promise<InvoicePacket>):Promise<InvoicePacket>{
 verifyArOnlyWrapperOwnership(initial);verifySelectedWrapperSourceAssertions(initial);const planned=discoverPostedWrapperRegion(initial),capability=reader.invoiceTransactionCodeRules;if(!planned.length||!capability)fail();const codes=[...new Set(planned.flatMap(c=>[String(c.posting.transactionCode),...c.taxes.map(t=>String(t.transactionCode))]))],before=structuredClone(arOnlyTaxSource(initial));
 const read=async()=>new Map((await readArOnlyBatch(codes.map(code=>()=>reader.invoiceTransactionCodeRules!(code)))).map((value,n)=>[codes[n],value])),rules=await read();
 const record=(c:WrapperNetVatCandidate,after:ReadonlyMap<string,unknown>)=>({wrapperId:c.wrapperId,packageReference:c.packageReference,componentId:String(c.posting.transactionNo),generateIds:c.taxes.map(t=>String(t.transactionNo)),rules:rules.get(String(c.posting.transactionCode)),rulesAfter:after.get(String(c.posting.transactionCode)),generatedRules:c.taxes.map(t=>rules.get(String(t.transactionCode))),generatedRulesAfter:c.taxes.map(t=>after.get(String(t.transactionCode)))});
 // Select the complete, unchanged prior proof from pure facts BEFORE the fresh
 // source fence. Unsupported facts are not caught provider/verifier failures.
 const exceptions=discoverWrapperNetVat(initial),prior=exceptions.length>0&&exceptions.every(c=>canPlanWrapperNetVatComponent(initial,c,record(c,rules)));
 const fresh=await readFresh(),after=structuredClone(arOnlyTaxSource(fresh));if(canonical(before)!==canonical(after))throw Error('document_source_changed');const rulesAfter=await read();for(const code of codes)if(canonical(rules.get(code))!==canonical(rulesAfter.get(code)))throw Error('document_source_changed');
 if(prior)return {...fresh,arOnlyWrapperNetVatProof:{version:1,kind:'ar-only-wrapper-net-vat7',sourceBefore:before,sourceAfter:after,components:exceptions.map(c=>record(c,rulesAfter))}};
 return {...fresh,arOnlySourceClaimsProof:{version:4,kind:'ar-only-source-claims',sourceBefore:before,sourceAfter:after,components:[{kind:'posted-embedded-vat',components:planned.map(c=>record(c,rulesAfter))}]}};
}
