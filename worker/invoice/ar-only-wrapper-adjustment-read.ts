import type {ArOnlyInvoiceReader} from './ar-only-read';
import {invoiceModel,record,type InvoicePacket} from './model';
import {amountCents} from '../opera/normalize';
import {canonical} from './ar-tax';
import {arOnlyTaxSource} from './current-ar-tax';
import {readArOnlyBatch} from './ar-only-evidence-read';
import {discoverPostedWrapperRegion} from './ar-only-posted-wrapper-claims';
import {inspectWrapperArAdjustmentRegion} from './ar-only-wrapper-adjustment-claims';
import type {ArOnlyWrapperNetVatComponent,WrapperNetVatCandidate} from './ar-only-wrapper-net-vat-proof';
import type {TransferProjectionCalculation} from './transfer-projection-calculation';

const fail=():never=>{throw Error('document_invoice_ar_only_wrapper_adjustment_unverified');};
const code=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(v)?v:fail();
/** One complete source fence. Only exact late AR rebates use the calculator;
 * reservation package VAT always comes from its independent posted source. */
export async function readWrapperArAdjustmentClaims(reader:ArOnlyInvoiceReader,initial:InvoicePacket,readFresh:()=>Promise<InvoicePacket>):Promise<InvoicePacket>{
 if(!reader.invoiceTransactionCodeRules||!reader.invoiceChargeSimulation)fail();
 const {roots,reservation}=inspectWrapperArAdjustmentRegion(initial),planned=discoverPostedWrapperRegion(reservation);if(!planned.length)fail();
 const before=structuredClone(arOnlyTaxSource(initial));
 const codes=[...new Set([...planned.flatMap(c=>[code(c.posting.transactionCode),...c.taxes.map(t=>code(t.transactionCode))]),...roots.map(r=>code(r.transactionCode))])];
 const readDefinitions=async(keys:string[])=>new Map((await readArOnlyBatch(keys.map(k=>()=>reader.invoiceTransactionCodeRules!(k)))).map((v,n)=>[keys[n],structuredClone(v)]));
 const rules=await readDefinitions(codes),children=new Set<string>();
 for(const root of roots){const generated=record(record(rules.get(code(root.transactionCode))).transactionCode).generatesSetup,rawGenerates=record(generated).generates,generates=Array.isArray(rawGenerates)?rawGenerates:fail();if(!generates.length||generates.length>5)fail();for(const raw of generates)children.add(code(record(raw).code));}
 const extra=[...children].filter(c=>!rules.has(c));for(const [key,value]of await readDefinitions(extra)){codes.push(key);rules.set(key,value);}
 const gross=(r:Record<string,unknown>)=>((r.debitAmount===undefined?0:amountCents(r.debitAmount,'THB'))-(r.creditAmount===undefined?0:amountCents(r.creditAmount,'THB')))/100;
 const scopes=[...new Map(roots.map(r=>[JSON.stringify([r.transactionCode,gross(r)]),{code:code(r.transactionCode),amount:gross(r)}])).entries()];
 const readCalculations=async()=>new Map((await readArOnlyBatch(scopes.map(([,s])=>()=>reader.invoiceChargeSimulation!(s.code,s.amount)))).map((v,n)=>[scopes[n][0],structuredClone(v)]));
 const calculations=await readCalculations(),fresh=await readFresh(),after=structuredClone(arOnlyTaxSource(fresh));if(canonical(before)!==canonical(after))throw Error('document_source_changed');
 const rulesAfter=await readDefinitions(codes);for(const key of codes)if(canonical(rules.get(key))!==canonical(rulesAfter.get(key)))throw Error('document_source_changed');
 const calculationsAfter=await readCalculations();for(const [key,value]of calculations)if(canonical(value)!==canonical(calculationsAfter.get(key)))throw Error('document_source_changed');
 const posted=(c:WrapperNetVatCandidate):ArOnlyWrapperNetVatComponent=>({wrapperId:c.wrapperId,packageReference:c.packageReference,componentId:String(c.posting.transactionNo),generateIds:c.taxes.map(t=>String(t.transactionNo)),rules:rules.get(code(c.posting.transactionCode)),rulesAfter:rulesAfter.get(code(c.posting.transactionCode)),generatedRules:c.taxes.map(t=>rules.get(code(t.transactionCode))),generatedRulesAfter:c.taxes.map(t=>rulesAfter.get(code(t.transactionCode)))});
 const evidence:TransferProjectionCalculation[]=roots.map(root=>{const parent=code(root.transactionCode),generates=record(record(rules.get(parent)).transactionCode).generatesSetup,raw=record(generates).generates;if(!Array.isArray(raw))return fail();const leaves=raw.map(v=>code(record(v).code)),key=JSON.stringify([parent,gross(root)]);return {postingId:String(root.transactionNo),rules:rules.get(parent),rulesAfter:rulesAfter.get(parent),generatedRules:leaves.map(c=>rules.get(c)),generatedRulesAfter:leaves.map(c=>rulesAfter.get(c)),calculation:calculations.get(key),calculationAfter:calculationsAfter.get(key)};});
 const qualified:InvoicePacket={...fresh,arOnlySourceClaimsProof:{version:7,kind:'ar-only-source-claims',sourceBefore:before,sourceAfter:after,components:[{kind:'posted-embedded-vat',components:planned.map(posted)},{kind:'same-account-current-ar-adjustment-vat7',roots:evidence}]}};
 invoiceModel(qualified);return qualified;
}
