import {discoverPostedEmbeddedRevenue} from './ar-only-posted-embedded-revenue-claims';
import {readPostedEmbeddedRevenue} from './ar-only-posted-embedded-revenue-read';
import {exclusiveNonRevenueZeroVatNetProvenance} from './exclusive-nonrevenue-zero-vat-net';
import {canPlanCurrentArZeroFooter} from './ar-only-zero-footer-claims';
import {readCurrentArZeroFooter} from './ar-only-zero-footer-read';
import {canPlanExplicitOthersRevenuePos} from './ar-only-explicit-others-revenue-pos-claims';
import {verifySourceClaimsDisplayMembership,SourceClaimsDisplayMembershipUnsupported} from './source-claims-display-membership';
import {beginEmbeddedCancellationDisplayRead,type EmbeddedCancellationDisplayRead} from './embedded-cancellation-display-read';
import {readPostedWrapperClaims} from './ar-only-posted-wrapper-read';
import {beginArCountryDisplayRead,type CountryDisplayRead} from './country-display-read';
import {canPlanExplicitNetNonRevenuePos} from './ar-only-explicit-net-nonrevenue-pos-claims';
import {verifyArOnlySourceClaimsWithDisplayRegion} from './ar-only-source-claims';
import {beginArSourceClaimsPosDisplayRead,type SourceClaimsPosDisplayRead} from './source-claims-pos-display-read';
import {beginArPaymentOffsetDisplayRead,type PaymentOffsetDisplayRead} from './payment-offset-display-read';
import {canPlanExclusiveNonRevenuePos} from './ar-only-exclusive-nonrevenue-pos-claims';
import {canPlanExplicitRevenuePos} from './ar-only-explicit-revenue-pos-claims';
import {canPlanPostedPosFee} from './ar-only-posted-pos-fee-plan';
import {beginArOnlyPosInterfaceRead} from './ar-only-pos-interface-read';
import {readTransferredCurrentArRuleClaims} from './ar-only-transferred-current-rule-read';
import {beginArPosDisplayRead,type ArPosDisplayRead,type ArPosDisplayReadResult} from './pos-display-read';
import {canPlanPostedPosClaims} from './ar-only-posted-tax-claims';
import {readArOnlyBatch} from './ar-only-evidence-read';
import {discoverSourceClaimsPosCodes,readArOnlySourceClaims} from './ar-only-source-claims-read';
import {zeroVatNetProvenance,type ArOnlyZeroVatNetGroup} from './ar-only-zero-vat-net-proof';
import {directNonVatProvenance} from './direct-nonvat-policy';
import {canPlanArOnlyPosSales,inspectArOnlyPosSales} from './ar-only-pos-sales-proof';
import {canPlanArOnlyPosSignedMultiVat,inspectArOnlyPosSignedMultiVat} from './ar-only-pos-signed-multi-vat-proof';
import {beginArRateDisplayRead} from './ar-rate-display-read';
import {canPlanArOnlyPosMultiVat,inspectArOnlyPosMultiVat} from './ar-only-pos-multi-vat-proof';
import {canPlanCompleteArOnlyPosDiscount,canPlanArOnlyPosDiscount,inspectArOnlyPosDiscount} from './ar-only-pos-discount-proof';
import {canPlanArOnlyPosFee,inspectArOnlyPosFee} from './ar-only-pos-fee-proof';
import {OperaError,type OperaReader} from '../opera/client';
import type {DocumentInvoice} from '../documents/native-invoice';
import {readInvoicePacket} from './read';
import {invoiceModel,record,type InvoicePacket} from './model';
import {canonical,verifyArSimulation,type ArSimulation} from './ar-tax';
import {arOnlyTaxSource} from './current-ar-tax';
import {verifyArOnlyPostedGraph} from './ar-only-posted-proof';
import {inspectArOnlyPos} from './ar-only-pos-proof';
import {readDirectZeroTaxEvidence,verifyDirectZeroTaxProof} from './direct-zero-tax';
import {inspectArOnlyNonVat} from './ar-only-nonvat-proof';
import {discoverWrapperNetVat} from './ar-only-wrapper-net-vat-proof';
import {posServiceCandidate,inspectArOnlyPosService} from './ar-only-pos-service-proof';
import {discoverPostedGenerates,type ArPostedGenerates} from './posted-generates';
import {amountCents} from '../opera/normalize';

export type ArOnlyInvoiceReader=Pick<OperaReader,'account'|'invoiceHistory'|'reservationFolios'|'financialTransactionDetail'|'invoicePostings'|'invoicePostingBreakdown'|'invoiceTransactionDetails'|'invoiceReservation'>&Partial<Pick<OperaReader,'profile'|'invoiceTransactionCodeRules'|'invoiceChargeSimulation'|'invoiceCheckDetails'|'invoicePosInterfaces'|'invoicePosTransactionCodes'|'invoiceRatePlanFolioText'|'invoicePosDisplayFolios'|'accountsByNumber'|'invoiceCountryDisplayMetadata'>>;
export class ArOnlyProofUnsupported extends Error{
 constructor(readonly category:string,options?:ErrorOptions){super('document_invoice_ar_only_unsupported:'+category,options);}
}
const unsupported=(category:string):never=>{throw new ArOnlyProofUnsupported(category);};
const planPos=(plan:()=>boolean)=>{try{return plan();}catch(error){if(error instanceof Error&&error.message.startsWith('document_invoice_ar_only_pos_unverified:'))throw new ArOnlyProofUnsupported(error.message,{cause:error});throw error;}};
const rows=(value:unknown)=>{if(!Array.isArray(value))throw Error('document_invoice_data_invalid');return value.map(record);};
/** A capability allowlist, not a cast of a full OPERA client. The shared collector
 * cannot obtain Guest report/type capabilities, including on later fallback paths. */
function collector(reader:ArOnlyInvoiceReader):ArOnlyInvoiceReader{
 return {account:reader.account.bind(reader),invoiceHistory:reader.invoiceHistory.bind(reader),reservationFolios:reader.reservationFolios.bind(reader),financialTransactionDetail:reader.financialTransactionDetail.bind(reader),invoicePostings:async(...args)=>{const response=record(await reader.invoicePostings(...args));return {...response,invoicePostingsDetails:rows(response.invoicePostingsDetails).sort((a,b)=>String(a.transactionNo).localeCompare(String(b.transactionNo)))};},invoicePostingBreakdown:reader.invoicePostingBreakdown.bind(reader),invoiceTransactionDetails:reader.invoiceTransactionDetails.bind(reader),invoiceReservation:reader.invoiceReservation.bind(reader),...reader.profile?{profile:reader.profile.bind(reader)}:{}};
}
/** Independent proof gate: never let the legacy model infer NonVAT from missing taxes. */
export function arOnlyInvoiceModel(packet:InvoicePacket,now?:Date){
 if('nativeTaxControls' in packet)throw Error('document_invoice_ar_only_native_proof_forbidden');
 if(packet.arTransfer)unsupported('transfer');

 if(packet.embeddedGenerateProof||packet.directZeroTaxProof)unsupported('legacy-proof');
 if(Number(!!packet.currentArTaxProof)+Number(!!packet.arOnlyPostedProof)+Number(!!packet.arOnlyPosProof)+Number(!!packet.arOnlyNonVatProof)+Number(!!packet.arOnlyWrapperNetVatProof)+Number(!!packet.arOnlyPosServiceProof)+Number(!!packet.arOnlyPosFeeProof)+Number(!!packet.arOnlyPosDiscountProof)+Number(!!packet.arOnlyPosMultiVatProof)+Number(!!packet.arOnlyPosSignedMultiVatProof)+Number(!!packet.arOnlyPosSalesProof)+Number(!!packet.arOnlyZeroVatNetProof)+Number(!!packet.arOnlySourceClaimsProof)!==1)unsupported('missing-proof');
 if(packet.arPostedGenerates?.length&&!packet.arOnlyPostedProof)unsupported('posted-generates');
 try{return invoiceModel(packet,now);}catch(error){
  if(error instanceof Error&&(['document_invoice_current_ar_tax_unverified','document_invoice_tax_code_unsupported','document_invoice_tax_rate_unsupported','document_invoice_ar_tax_unsupported','document_invoice_ar_only_nonvat_unverified','document_invoice_direct_zero_tax_unverified','document_invoice_ar_only_wrapper_net_vat_unverified','document_invoice_ar_only_pos_service_unverified','document_invoice_ar_only_pos_fee_unverified','document_invoice_ar_only_pos_discount_unverified','document_invoice_ar_only_pos_multi_vat_unverified','document_invoice_ar_only_pos_signed_multi_vat_unverified','document_invoice_ar_only_pos_sales_unverified','document_invoice_ar_only_zero_vat_net_unverified','document_invoice_ar_only_source_claims_unverified','document_invoice_ar_only_posted_tax_claims_unverified','document_invoice_transferred_current_ar_rules_unverified','document_invoice_transfer_projection_calculation_unverified','document_invoice_ar_only_posted_pos_fee_unverified','document_invoice_explicit_revenue_pos_unverified','document_invoice_zero_vat_net_calculation_unverified','document_invoice_pos_receipt_service_unverified'].includes(error.message)||error.message.startsWith('document_invoice_ar_only_pos_unverified:')))throw new ArOnlyProofUnsupported(error.message,{cause:error});
  throw error;
 }
}
async function currentEvidence(reader:ArOnlyInvoiceReader,packet:InvoicePacket,claimed:Set<string>,readRules:(code:string)=>Promise<unknown>):Promise<ArSimulation[]>{
 const account=record(packet.account),postings=record(packet.postings),details=packet.arDetails??[];
 const roots=details.flatMap(page=>rows(record(page.response).transactions)).filter(root=>!claimed.has(String(root.transactionNo)));if(roots.length>20)return unsupported('current-rule-root-count');
 if(roots.length&&!reader.invoiceChargeSimulation)return unsupported('current-rules-capability');
 const simulations:ArSimulation[]=[];
 for(const root of roots){
  const selected=rows(postings.invoicePostingsDetails).filter(row=>String(row.transactionNo)===String(root.transactionNo)),info=record(root.aRInfo);
  if(String(info.accountNumber)!==String(account.accountNo))unsupported('transfer');
  const signed=(row:Record<string,unknown>)=>(row.debitAmount?amountCents(row.debitAmount,'THB'):0)-(row.creditAmount?amountCents(row.creditAmount,'THB'):0);
  if(selected.length!==1||String(info.invoiceNo)!==packet.manifest.invoice_no||String(root.folioNo)!==packet.manifest.folio_no||root.transactionCode!==selected[0].transactionCode||signed(root)!==signed(selected[0]))throw Error('document_invoice_ar_tax_scope_invalid');
  if(root.transactionType!=='Revenue'||root.deferredTax!==false)unsupported('current-rule-posting-type');
  const code=String(root.transactionCode),amount=signed(root)/100,rules=await readRules(code),generated=rows(record(record(rules).transactionCode).generatesSetup===undefined?[]:record(record(record(rules).transactionCode).generatesSetup).generates);
  if(!generated.length||generated.length>5)unsupported('current-rule-generates');
  const codes=generated.map(row=>String(row.code));if(new Set(codes).size!==codes.length)throw Error('document_invoice_ar_tax_unverified');
  const generatedRules:unknown[]=[];for(let start=0;start<codes.length;start+=4){const settled=await Promise.allSettled(codes.slice(start,start+4).map(readRules));for(const result of settled){if(result.status==='rejected')throw result.reason;generatedRules.push(result.value);}}
  const calculation=await reader.invoiceChargeSimulation!(code,amount);
  const evidence={postingId:String(root.transactionNo),rules,rulesAfter:rules,generatedRules,generatedRulesAfter:generatedRules,calculation};
  verifyArSimulation(evidence,packet.manifest.hotel,code,amount);simulations.push(evidence);
 }
 return simulations;
}
export async function readArOnlyInvoicePacket(reader:ArOnlyInvoiceReader,manifest:DocumentInvoice):Promise<InvoicePacket>{
 const safe=collector(reader),initial=await readInvoicePacket(safe,manifest,false),before=structuredClone(arOnlyTaxSource(initial));
 const display=await beginArRateDisplayRead(reader,initial);let posDisplay:ArPosDisplayRead|undefined;let paymentDisplay:PaymentOffsetDisplayRead|undefined;let sourceClaimsDisplay:SourceClaimsPosDisplayRead|undefined;let countryDisplay:CountryDisplayRead|undefined;
 // Optional POS metadata is started only after a supported financial strategy
 // has been selected, and always before that strategy's existing fresh source.
 let embeddedDisplay:EmbeddedCancellationDisplayRead|undefined;
 const readFresh=async(posSupported=false,sourceClaimsSupported=false)=>{if(!embeddedDisplay)embeddedDisplay=await beginEmbeddedCancellationDisplayRead(reader,initial);if(!countryDisplay)countryDisplay=await beginArCountryDisplayRead(reader,initial);if(sourceClaimsSupported&&!sourceClaimsDisplay)sourceClaimsDisplay=await beginArSourceClaimsPosDisplayRead(reader,initial);if(!paymentDisplay)paymentDisplay=await beginArPaymentOffsetDisplayRead(reader,initial);if(posSupported&&!posDisplay)posDisplay=await beginArPosDisplayRead(reader,initial);return readInvoicePacket(safe,manifest,false);};
 const finish=async(qualified:InvoicePacket):Promise<InvoicePacket>=>{
  arOnlyInvoiceModel(qualified);if(!countryDisplay)throw Error('document_source_changed');const countryResult=await countryDisplay.finish(qualified);const result=await display.finish(qualified);
  const posSupported=!!(qualified.arOnlyPosProof||qualified.arOnlyPosServiceProof||qualified.arOnlyPosFeeProof||qualified.arOnlyPosDiscountProof||qualified.arOnlyPosMultiVatProof||qualified.arOnlyPosSignedMultiVatProof||qualified.arOnlyPosSalesProof);
  if(posSupported&&!posDisplay)throw Error('document_source_changed');
  const sourceClaimsRegion=qualified.arOnlySourceClaimsProof?verifyArOnlySourceClaimsWithDisplayRegion(qualified).posRegion:undefined;if(sourceClaimsRegion&&!sourceClaimsDisplay)throw Error('document_source_changed');
  const finishSourceClaimsDisplay=async():Promise<ArPosDisplayReadResult>=>{
   let membership;try{membership=verifySourceClaimsDisplayMembership(qualified,sourceClaimsRegion!);}catch(error){if(error instanceof SourceClaimsDisplayMembershipUnsupported)return {gap:'pos-display-evidence'};throw error;}
   return sourceClaimsDisplay!.finish(qualified,membership);
  };
  const posResult:ArPosDisplayReadResult=sourceClaimsRegion?await finishSourceClaimsDisplay():posSupported?await posDisplay!.finish(qualified):{gap:'pos-display-profile'};
  if(!paymentDisplay)throw Error('document_source_changed');const paymentResult=await paymentDisplay.finish(qualified);
  if(!embeddedDisplay)throw Error('document_source_changed');const embeddedResult=await embeddedDisplay.finish(qualified);
  const complete:InvoicePacket={...qualified,...embeddedResult.proof?{arEmbeddedCancellationDisplayProof:embeddedResult.proof}:embeddedResult.gap?{arEmbeddedCancellationDisplayGap:embeddedResult.gap}:{},...countryResult.proof?{arCountryDisplayProof:countryResult.proof}:countryResult.gap?{arCountryDisplayGap:countryResult.gap}:{},...result.proof?{arRateDisplayProof:result.proof}:{},...result.gap?{arRateDisplayGap:result.gap}:{},...posResult.proof?{arPosDisplayProof:posResult.proof}:{arPosDisplayGap:posResult.gap},...paymentResult.proof?{arPaymentOffsetDisplayProof:paymentResult.proof}:paymentResult.gap?{arPaymentOffsetDisplayGap:paymentResult.gap}:{}};
  arOnlyInvoiceModel(complete);return complete;
 };
 const transferRoots=(initial.arDetails??[]).flatMap(page=>rows(record(page.response).transactions));if(transferRoots.some(root=>String(record(root.aRInfo).accountNumber)!==String(record(initial.account).accountNo)))return finish(await readTransferredCurrentArRuleClaims(reader,initial,()=>readFresh()));
 if(discoverPostedEmbeddedRevenue(initial).length)return finish(await readPostedEmbeddedRevenue(reader,initial,()=>readFresh()));
 // Explicit zero atoms may have no POS check. Plan them first, rather than
 // treating a POS refusal as permission to try another financial source.
 const zeroPlan=inspectArOnlyNonVat(initial);
 if(zeroPlan.candidates.length){
  if(initial.arDetails?.length)unsupported('nonvat-mixed-ar');
  if(discoverSourceClaimsPosCodes(initial).length)return finish(await readArOnlySourceClaims(reader,initial,()=>readFresh(false,true)));
  if(!reader.invoiceTransactionCodeRules)unsupported('zero-tax-capabilities');
  const zeroCodes=[...new Set(zeroPlan.candidates.map(g=>String(g.posting.transactionCode)))],initialRules=await readArOnlyBatch(zeroCodes.map(code=>()=>reader.invoiceTransactionCodeRules!(code))),zeroRules=new Map(zeroCodes.map((code,n)=>[code,initialRules[n]]));
  if(canPlanCurrentArZeroFooter(initial,zeroRules))return finish(await readCurrentArZeroFooter(reader,initial,zeroRules,()=>readFresh()));
  if(!reader.invoiceChargeSimulation)unsupported('zero-tax-capabilities');
  const classified=zeroPlan.candidates.map(g=>{const code=String(g.posting.transactionCode),rules=zeroRules.get(code),provenance=directNonVatProvenance(rules,manifest.hotel,code,g.definition)??zeroVatNetProvenance(rules,manifest.hotel,code,g.definition)??exclusiveNonRevenueZeroVatNetProvenance(rules,manifest.hotel,code,g.definition)??unsupported('zero-vat-policy');return {g,code,rules,provenance};});
  if(classified.some(g=>g.provenance==='ordinary-revenue-zero-vat-net'||g.provenance==='exclusive-nonrevenue-zero-vat-net')){
   const calculations=()=>{const cache=new Map<string,unknown>();return async(code:string,cents:number)=>{const key=JSON.stringify([code,cents]);if(!cache.has(key))cache.set(key,structuredClone(await reader.invoiceChargeSimulation!(code,cents/100)));return cache.get(key);};};
   const readBefore=calculations(),readAfter=calculations(),groups:ArOnlyZeroVatNetGroup[]=[];for(const row of classified){const calculation=await readBefore(row.code,row.g.signedCents);groups.push({postingId:row.g.id,rules:row.rules,rulesAfter:row.rules,calculation,calculationAfter:calculation,provenance:row.provenance});}
   arOnlyInvoiceModel({...initial,arOnlyZeroVatNetProof:{version:1,kind:'ar-only-direct-zero-vat-net',sourceBefore:before,sourceAfter:before,groups}});
   const fresh=await readFresh(),after=structuredClone(arOnlyTaxSource(fresh));if(canonical(before)!==canonical(after))throw Error('document_source_changed');
   const afterRules=await readArOnlyBatch(zeroCodes.map(code=>()=>reader.invoiceTransactionCodeRules!(code))),refreshed=new Map(zeroCodes.map((code,n)=>[code,afterRules[n]]));for(const code of zeroCodes)if(canonical(zeroRules.get(code))!==canonical(refreshed.get(code)))throw Error('document_source_changed');
   const paired:ArOnlyZeroVatNetGroup[]=[];for(let n=0;n<classified.length;n++){const row=classified[n],calculationAfter=await readAfter(row.code,row.g.signedCents);if(canonical(groups[n].calculation)!==canonical(calculationAfter))throw Error('document_source_changed');paired.push({...groups[n],rulesAfter:refreshed.get(row.code),calculationAfter});}
   return finish({...fresh,arOnlyZeroVatNetProof:{version:1,kind:'ar-only-direct-zero-vat-net',sourceBefore:before,sourceAfter:after,groups:paired}});
  }
  // Preserve the existing explicit-NonVAT reader and its exact call contract:
  // each prefetched definition supplies only that reader's initial phase.
  const offered=new Set<string>(),explicitRules=async(code:string)=>{if(!offered.has(code)&&zeroRules.has(code)){offered.add(code);return structuredClone(zeroRules.get(code));}return structuredClone(await reader.invoiceTransactionCodeRules!(code));};
  let freshPacket:InvoicePacket|undefined;
  const explicit=await readDirectZeroTaxEvidence(initial,explicitRules,async()=>{
   const fresh=await readFresh();if(canonical(before)!==canonical(arOnlyTaxSource(fresh)))throw Error('document_source_changed');freshPacket=fresh;return fresh;
  },reader.invoiceChargeSimulation?async(code,amount)=>structuredClone(await reader.invoiceChargeSimulation!(code,amount)):undefined,undefined);
  const fresh=freshPacket??unsupported('nonvat-explicit-proof'),proof=explicit.directZeroTaxProof??unsupported('nonvat-explicit-proof');
  if(verifyDirectZeroTaxProof(explicit)!=='explicit')unsupported('nonvat-explicit-proof');
  const qualified:InvoicePacket={...fresh,arOnlyNonVatProof:{version:1,kind:'ar-only-direct-nonvat',sourceBefore:before,sourceAfter:structuredClone(arOnlyTaxSource(fresh)),groups:proof.groups}};
  return finish(qualified);
 }
 const wrapperNet=discoverWrapperNetVat(initial);
 if(wrapperNet.length)return finish(await readPostedWrapperClaims(reader,initial,()=>readFresh()));

 const postedOnly=!initial.arDetails?.length;
 const graphs=discoverPostedGenerates(manifest,record(initial.account),initial.postings,initial.arDetails??[]),claimed=new Set<string>(),definitions=new Map<string,unknown>();
 const readRules=async(code:string)=>{if(!reader.invoiceTransactionCodeRules)return unsupported('current-rules-capability');if(!definitions.has(code))definitions.set(code,structuredClone(await reader.invoiceTransactionCodeRules(code)));return definitions.get(code);};
 const posAtoms=inspectArOnlyPos(initial);if(posAtoms.length&&(graphs.length||initial.arDetails?.length))unsupported('pos-mixed-ar');
 const graphCodes=[...new Set([...graphs.flatMap(graph=>[String(graph.root.transactionCode),...graph.children.map(c=>String(c.transactionCode))]),...posAtoms.map(a=>a.code)])];
 for(let start=0;start<graphCodes.length;start+=4){const results=await Promise.allSettled(graphCodes.slice(start,start+4).map(readRules));for(const result of results)if(result.status==='rejected')throw result.reason;}
 const posCodes=[...new Set(posAtoms.map(a=>a.code))],posDefinitions=posCodes.map(code=>({before:definitions.get(code),after:definitions.get(code)}));
 const explicitOthersRevenuePlan=posAtoms.length&&!graphs.length&&!initial.arDetails?.length&&canPlanExplicitOthersRevenuePos(posAtoms,posDefinitions,manifest.hotel);
 if(explicitOthersRevenuePlan){
  const fresh=await readFresh(false,true),after=structuredClone(arOnlyTaxSource(fresh));if(canonical(before)!==canonical(after))throw Error('document_source_changed');const paired=await readArOnlyBatch(posCodes.map(code=>()=>reader.invoiceTransactionCodeRules!(code)));for(let n=0;n<posCodes.length;n++)if(canonical(definitions.get(posCodes[n]))!==canonical(paired[n]))throw Error('document_source_changed');
  return finish({...fresh,arOnlySourceClaimsProof:{version:2,kind:'ar-only-source-claims',sourceBefore:before,sourceAfter:after,components:[{kind:'posted-pos-explicit-others-revenue',definitions:posCodes.map((code,n)=>({before:definitions.get(code),after:paired[n]}))}]}});
 }
 const explicitNetNonRevenuePlan=posAtoms.length&&!graphs.length&&!initial.arDetails?.length&&canPlanExplicitNetNonRevenuePos(posAtoms,posDefinitions,manifest.hotel);
 if(explicitNetNonRevenuePlan){
  const fresh=await readFresh(false,true),after=structuredClone(arOnlyTaxSource(fresh));if(canonical(before)!==canonical(after))throw Error('document_source_changed');const paired=await readArOnlyBatch(posCodes.map(code=>()=>reader.invoiceTransactionCodeRules!(code)));for(let n=0;n<posCodes.length;n++)if(canonical(definitions.get(posCodes[n]))!==canonical(paired[n]))throw Error('document_source_changed');
  return finish({...fresh,arOnlySourceClaimsProof:{version:2,kind:'ar-only-source-claims',sourceBefore:before,sourceAfter:after,components:[{kind:'posted-pos-explicit-net-nonrevenue',definitions:posCodes.map((code,n)=>({before:definitions.get(code),after:paired[n]}))}]}});
 }
 const exclusiveNonRevenuePlan=posAtoms.length&&!graphs.length&&!initial.arDetails?.length&&canPlanExclusiveNonRevenuePos(posAtoms,posDefinitions,manifest.hotel);
 if(exclusiveNonRevenuePlan){
  const fresh=await readFresh(false,true),after=structuredClone(arOnlyTaxSource(fresh));if(canonical(before)!==canonical(after))throw Error('document_source_changed');const paired=await readArOnlyBatch(posCodes.map(code=>()=>reader.invoiceTransactionCodeRules!(code)));for(let n=0;n<posCodes.length;n++)if(canonical(definitions.get(posCodes[n]))!==canonical(paired[n]))throw Error('document_source_changed');
  return finish({...fresh,arOnlySourceClaimsProof:{version:2,kind:'ar-only-source-claims',sourceBefore:before,sourceAfter:after,components:[{kind:'posted-pos-exclusive-nonrevenue',definitions:posCodes.map((code,n)=>({before:definitions.get(code),after:paired[n]}))}]}});
 }
 const explicitRevenuePlan=posAtoms.length&&!graphs.length&&!initial.arDetails?.length?canPlanExplicitRevenuePos(posAtoms,posDefinitions,manifest.hotel):undefined;
 if(explicitRevenuePlan){
  const interfaces=explicitRevenuePlan.fees.size?await beginArOnlyPosInterfaceRead(reader,manifest.hotel):undefined,fresh=await readFresh(false,true),after=structuredClone(arOnlyTaxSource(fresh));if(canonical(before)!==canonical(after))throw Error('document_source_changed');const paired=await readArOnlyBatch(posCodes.map(code=>()=>reader.invoiceTransactionCodeRules!(code)));for(let n=0;n<posCodes.length;n++)if(canonical(definitions.get(posCodes[n]))!==canonical(paired[n]))throw Error('document_source_changed');const interfaceEvidence=interfaces?await interfaces.finish():undefined;
  return finish({...fresh,arOnlySourceClaimsProof:{version:2,kind:'ar-only-source-claims',sourceBefore:before,sourceAfter:after,components:[{kind:'posted-pos-explicit-revenue-base',definitions:posCodes.map((code,n)=>({before:definitions.get(code),after:paired[n]})),...interfaceEvidence?{interfaces:interfaceEvidence}:{}}]}});
 }
 if(posAtoms.length&&!graphs.length&&!initial.arDetails?.length&&planPos(()=>canPlanPostedPosFee(posAtoms,posDefinitions,manifest.hotel))){
  const interfaces=await beginArOnlyPosInterfaceRead(reader,manifest.hotel),fresh=await readFresh(false,true),after=structuredClone(arOnlyTaxSource(fresh));if(canonical(before)!==canonical(after))throw Error('document_source_changed');const paired=await readArOnlyBatch(posCodes.map(code=>()=>reader.invoiceTransactionCodeRules!(code)));for(let n=0;n<posCodes.length;n++)if(canonical(definitions.get(posCodes[n]))!==canonical(paired[n]))throw Error('document_source_changed');const interfaceEvidence=await interfaces.finish();
  return finish({...fresh,arOnlySourceClaimsProof:{version:2,kind:'ar-only-source-claims',sourceBefore:before,sourceAfter:after,components:[{kind:'posted-pos-mapped-fee',definitions:posCodes.map((code,n)=>({before:definitions.get(code),after:paired[n]})),interfaces:interfaceEvidence}]}});
 }
 if(posAtoms.length&&!graphs.length&&!initial.arDetails?.length&&!canPlanCompleteArOnlyPosDiscount(posAtoms,posDefinitions,manifest.hotel)&&planPos(()=>canPlanPostedPosClaims(posAtoms,posDefinitions,manifest.hotel))){
  const fresh=await readFresh(false,true),after=structuredClone(arOnlyTaxSource(fresh));if(canonical(before)!==canonical(after))throw Error('document_source_changed');
  const paired=await readArOnlyBatch(posCodes.map(code=>()=>reader.invoiceTransactionCodeRules!(code)));for(let n=0;n<posCodes.length;n++)if(canonical(definitions.get(posCodes[n]))!==canonical(paired[n]))throw Error('document_source_changed');
  return finish({...fresh,arOnlySourceClaimsProof:{version:2,kind:'ar-only-source-claims',sourceBefore:before,sourceAfter:after,components:[{kind:'posted-pos-vat',definitions:posCodes.map((code,n)=>({before:definitions.get(code),after:paired[n]}))}]}});
 }
 if(canPlanArOnlyPosSales(posAtoms,posDefinitions,manifest.hotel)){
  inspectArOnlyPosSales(posAtoms,posDefinitions,manifest.hotel);if(!reader.invoicePosInterfaces||!reader.invoicePosTransactionCodes)unsupported('pos-sales-capabilities');
  const discoveryBefore=structuredClone(await reader.invoicePosInterfaces!()),logos=rows(discoveryBefore.hotelInterfaces).map(row=>{if(row.hotelId!==manifest.hotel||row.interfaceType!=='Pos'||row.activeFlag!==true||typeof row.logo!=='string'||!row.logo)unsupported('pos-interface-scope');return String(row.logo);});
  if(!logos.length||logos.length>20||new Set(logos).size!==logos.length)unsupported('pos-sales-evidence-count');const beforeMaps=await readArOnlyBatch(logos.map(logo=>()=>reader.invoicePosTransactionCodes!(logo)));
  const fresh=await readFresh(true),after=structuredClone(arOnlyTaxSource(fresh));if(canonical(before)!==canonical(after))throw Error('document_source_changed');const discoveryAfter=structuredClone(await reader.invoicePosInterfaces!());if(canonical(discoveryBefore)!==canonical(discoveryAfter))throw Error('document_source_changed');
  const afterFacts=await readArOnlyBatch([...posCodes.map(code=>()=>reader.invoiceTransactionCodeRules!(code)),...logos.map(logo=>()=>reader.invoicePosTransactionCodes!(logo))]);for(let n=0;n<posCodes.length;n++)if(canonical(definitions.get(posCodes[n]))!==canonical(afterFacts[n]))throw Error('document_source_changed');for(let n=0;n<beforeMaps.length;n++)if(canonical(beforeMaps[n])!==canonical(afterFacts[posCodes.length+n]))throw Error('document_source_changed');
  return finish({...fresh,arOnlyPosSalesProof:{version:1,kind:'ar-only-pos-mapped-sales-vat7',sourceBefore:before,sourceAfter:after,definitions:posCodes.map((code,n)=>({before:definitions.get(code),after:afterFacts[n]})),interfaces:{hotel:manifest.hotel,discoveryBefore,discoveryAfter,mappings:logos.map((logo,n)=>({logo,before:beforeMaps[n],after:afterFacts[posCodes.length+n]}))}}});
 }
 if(canPlanArOnlyPosSignedMultiVat(posAtoms,posDefinitions,manifest.hotel)){
  const {fees}=inspectArOnlyPosSignedMultiVat(posAtoms,posDefinitions,manifest.hotel);let discoveryBefore:unknown,discoveryAfter:unknown;let logos:string[]=[],beforeFacts:unknown[]=[];
  if(fees.size){
   if(!reader.invoicePosInterfaces||!reader.invoicePosTransactionCodes)unsupported('pos-signed-multi-vat-capabilities');
   discoveryBefore=structuredClone(await reader.invoicePosInterfaces!());logos=rows(record(discoveryBefore).hotelInterfaces).map(row=>{if(row.hotelId!==manifest.hotel||row.interfaceType!=='Pos'||row.activeFlag!==true||typeof row.logo!=='string'||!row.logo)unsupported('pos-interface-scope');return String(row.logo);});
   if(!logos.length||logos.length>20||new Set(logos).size!==logos.length)unsupported('pos-signed-multi-vat-evidence-count');beforeFacts=await readArOnlyBatch(logos.map(logo=>()=>reader.invoicePosTransactionCodes!(logo)));
  }
  const fresh=await readFresh(true),after=structuredClone(arOnlyTaxSource(fresh));if(canonical(before)!==canonical(after))throw Error('document_source_changed');
  if(fees.size){discoveryAfter=structuredClone(await reader.invoicePosInterfaces!());if(canonical(discoveryBefore)!==canonical(discoveryAfter))throw Error('document_source_changed');}
  const afterFacts=await readArOnlyBatch([...posCodes.map(code=>()=>reader.invoiceTransactionCodeRules!(code)),...logos.map(logo=>()=>reader.invoicePosTransactionCodes!(logo))]);
  for(let n=0;n<posCodes.length;n++)if(canonical(definitions.get(posCodes[n]))!==canonical(afterFacts[n]))throw Error('document_source_changed');for(let n=0;n<beforeFacts.length;n++)if(canonical(beforeFacts[n])!==canonical(afterFacts[posCodes.length+n]))throw Error('document_source_changed');
  const qualified:InvoicePacket={...fresh,arOnlyPosSignedMultiVatProof:{version:1,kind:'ar-only-pos-signed-multi-vat7',sourceBefore:before,sourceAfter:after,definitions:posCodes.map((code,n)=>({before:definitions.get(code),after:afterFacts[n]})),...fees.size?{interfaces:{hotel:manifest.hotel,discoveryBefore,discoveryAfter,mappings:logos.map((logo,n)=>({logo,before:beforeFacts[n],after:afterFacts[posCodes.length+n]}))}}:{}}};
  return finish(qualified);
 }
 if(canPlanArOnlyPosMultiVat(posAtoms,posDefinitions,manifest.hotel)){
  const {fees}=inspectArOnlyPosMultiVat(posAtoms,posDefinitions,manifest.hotel);let discoveryBefore:unknown,discoveryAfter:unknown;let logos:string[]=[],beforeFacts:unknown[]=[];
  if(fees.size){
   if(!reader.invoicePosInterfaces||!reader.invoicePosTransactionCodes)unsupported('pos-multi-vat-capabilities');
   discoveryBefore=structuredClone(await reader.invoicePosInterfaces!());logos=rows(record(discoveryBefore).hotelInterfaces).map(row=>{if(row.hotelId!==manifest.hotel||row.interfaceType!=='Pos'||row.activeFlag!==true||typeof row.logo!=='string'||!row.logo)unsupported('pos-interface-scope');return String(row.logo);});
   if(!logos.length||logos.length>20||new Set(logos).size!==logos.length)unsupported('pos-multi-vat-evidence-count');beforeFacts=await readArOnlyBatch(logos.map(logo=>()=>reader.invoicePosTransactionCodes!(logo)));
  }
  const fresh=await readFresh(true),after=structuredClone(arOnlyTaxSource(fresh));if(canonical(before)!==canonical(after))throw Error('document_source_changed');
  if(fees.size){discoveryAfter=structuredClone(await reader.invoicePosInterfaces!());if(canonical(discoveryBefore)!==canonical(discoveryAfter))throw Error('document_source_changed');}
  const afterFacts=await readArOnlyBatch([...posCodes.map(code=>()=>reader.invoiceTransactionCodeRules!(code)),...logos.map(logo=>()=>reader.invoicePosTransactionCodes!(logo))]);
  for(let n=0;n<posCodes.length;n++)if(canonical(definitions.get(posCodes[n]))!==canonical(afterFacts[n]))throw Error('document_source_changed');for(let n=0;n<beforeFacts.length;n++)if(canonical(beforeFacts[n])!==canonical(afterFacts[posCodes.length+n]))throw Error('document_source_changed');
  const qualified:InvoicePacket={...fresh,arOnlyPosMultiVatProof:{version:1,kind:'ar-only-pos-positive-multi-vat7',sourceBefore:before,sourceAfter:after,definitions:posCodes.map((code,n)=>({before:definitions.get(code),after:afterFacts[n]})),...fees.size?{interfaces:{hotel:manifest.hotel,discoveryBefore,discoveryAfter,mappings:logos.map((logo,n)=>({logo,before:beforeFacts[n],after:afterFacts[posCodes.length+n]}))}}:{}}};
  return finish(qualified);
 }
 if(canPlanArOnlyPosDiscount(posAtoms,posDefinitions,manifest.hotel)){
  inspectArOnlyPosDiscount(posAtoms,posDefinitions,manifest.hotel);
  if(!reader.invoicePosInterfaces||!reader.invoicePosTransactionCodes)unsupported('pos-discount-capabilities');
  const discoveryBefore=structuredClone(await reader.invoicePosInterfaces!()),interfaces=rows(discoveryBefore.hotelInterfaces),logos=interfaces.map(row=>{if(row.hotelId!==manifest.hotel||row.interfaceType!=='Pos'||row.activeFlag!==true||typeof row.logo!=='string'||!row.logo)unsupported('pos-interface-scope');return String(row.logo);});
  if(!logos.length||logos.length>20||new Set(logos).size!==logos.length)unsupported('pos-discount-evidence-count');
  const beforeFacts=await readArOnlyBatch(logos.map(logo=>()=>reader.invoicePosTransactionCodes!(logo)));
  const fresh=await readFresh(true),after=structuredClone(arOnlyTaxSource(fresh));if(canonical(before)!==canonical(after))throw Error('document_source_changed');
  const discoveryAfter=structuredClone(await reader.invoicePosInterfaces!());if(canonical(discoveryBefore)!==canonical(discoveryAfter))throw Error('document_source_changed');
  const afterFacts=await readArOnlyBatch([...posCodes.map(code=>()=>reader.invoiceTransactionCodeRules!(code)),...logos.map(logo=>()=>reader.invoicePosTransactionCodes!(logo))]);
  for(let n=0;n<posCodes.length;n++)if(canonical(definitions.get(posCodes[n]))!==canonical(afterFacts[n]))throw Error('document_source_changed');
  for(let n=0;n<beforeFacts.length;n++)if(canonical(beforeFacts[n])!==canonical(afterFacts[posCodes.length+n]))throw Error('document_source_changed');
  const qualified:InvoicePacket={...fresh,arOnlyPosDiscountProof:{version:1,kind:'ar-only-pos-mapped-discount-vat7',sourceBefore:before,sourceAfter:after,definitions:posCodes.map((code,n)=>({before:definitions.get(code),after:afterFacts[n]})),interfaces:{hotel:manifest.hotel,discoveryBefore,discoveryAfter,mappings:logos.map((logo,n)=>({logo,before:beforeFacts[n],after:afterFacts[posCodes.length+n]}))}}};
  return finish(qualified);
 }
 let hasServiceCandidate=false;
 try{hasServiceCandidate=posAtoms.some(a=>posServiceCandidate(a,{before:definitions.get(a.code),after:definitions.get(a.code)},manifest.hotel));}catch(error){if(error instanceof Error&&error.message.startsWith('document_invoice_ar_only_pos_unverified:'))throw new ArOnlyProofUnsupported(error.message,{cause:error});throw error;}
 if(hasServiceCandidate&&canPlanArOnlyPosFee(posAtoms,posDefinitions,manifest.hotel)){
  inspectArOnlyPosFee(posAtoms,posDefinitions,manifest.hotel);
  if(!reader.invoicePosInterfaces||!reader.invoicePosTransactionCodes)unsupported('pos-fee-capabilities');
  const discoveryBefore=structuredClone(await reader.invoicePosInterfaces!()),interfaces=rows(discoveryBefore.hotelInterfaces),logos=interfaces.map(row=>{if(row.hotelId!==manifest.hotel||row.interfaceType!=='Pos'||row.activeFlag!==true||typeof row.logo!=='string'||!row.logo)unsupported('pos-interface-scope');return String(row.logo);});
  if(!logos.length||logos.length>20||new Set(logos).size!==logos.length)unsupported('pos-fee-evidence-count');
  const beforeFacts=await readArOnlyBatch(logos.map(logo=>()=>reader.invoicePosTransactionCodes!(logo)));
  const fresh=await readFresh(true),after=structuredClone(arOnlyTaxSource(fresh));if(canonical(before)!==canonical(after))throw Error('document_source_changed');
  const discoveryAfter=structuredClone(await reader.invoicePosInterfaces!());if(canonical(discoveryBefore)!==canonical(discoveryAfter))throw Error('document_source_changed');
  const afterFacts=await readArOnlyBatch([...posCodes.map(code=>()=>reader.invoiceTransactionCodeRules!(code)),...logos.map(logo=>()=>reader.invoicePosTransactionCodes!(logo))]);
  for(let n=0;n<posCodes.length;n++)if(canonical(definitions.get(posCodes[n]))!==canonical(afterFacts[n]))throw Error('document_source_changed');
  for(let n=0;n<beforeFacts.length;n++)if(canonical(beforeFacts[n])!==canonical(afterFacts[posCodes.length+n]))throw Error('document_source_changed');
  const qualified:InvoicePacket={...fresh,arOnlyPosFeeProof:{version:1,kind:'ar-only-pos-mapped-fee-vat7',sourceBefore:before,sourceAfter:after,definitions:posCodes.map((code,n)=>({before:definitions.get(code),after:afterFacts[n]})),interfaces:{hotel:manifest.hotel,discoveryBefore,discoveryAfter,mappings:logos.map((logo,n)=>({logo,before:beforeFacts[n],after:afterFacts[posCodes.length+n]}))}}};
  return finish(qualified);
 }
 if(hasServiceCandidate){
  const plan=inspectArOnlyPosService(posAtoms,posDefinitions,manifest.hotel);
  if(!reader.invoiceCheckDetails||!reader.invoicePosInterfaces||!reader.invoicePosTransactionCodes)unsupported('pos-service-capabilities');
  const discoveryBefore=structuredClone(await reader.invoicePosInterfaces!()),interfaces=rows(discoveryBefore.hotelInterfaces),logos=interfaces.map(row=>{if(row.hotelId!==manifest.hotel||row.interfaceType!=='Pos'||row.activeFlag!==true||typeof row.logo!=='string'||!row.logo)unsupported('pos-interface-scope');return String(row.logo);});
  if(!logos.length||logos.length>20||new Set(logos).size!==logos.length||plan.requests.length>100)unsupported('pos-service-evidence-count');
  const checks=plan.requests.map(g=>g.checkNumber),beforeFacts=await readArOnlyBatch([...logos.map(logo=>()=>reader.invoicePosTransactionCodes!(logo)),...checks.map(check=>()=>reader.invoiceCheckDetails!(check))]);
  const fresh=await readFresh(true),after=structuredClone(arOnlyTaxSource(fresh));if(canonical(before)!==canonical(after))throw Error('document_source_changed');
  const discoveryAfter=structuredClone(await reader.invoicePosInterfaces!());if(canonical(discoveryBefore)!==canonical(discoveryAfter))throw Error('document_source_changed');
  const afterFacts=await readArOnlyBatch([...posCodes.map(code=>()=>reader.invoiceTransactionCodeRules!(code)),...logos.map(logo=>()=>reader.invoicePosTransactionCodes!(logo)),...checks.map(check=>()=>reader.invoiceCheckDetails!(check))]);
  for(let n=0;n<posCodes.length;n++)if(canonical(definitions.get(posCodes[n]))!==canonical(afterFacts[n]))throw Error('document_source_changed');
  for(let n=0;n<beforeFacts.length;n++)if(canonical(beforeFacts[n])!==canonical(afterFacts[posCodes.length+n]))throw Error('document_source_changed');
  const qualified:InvoicePacket={...fresh,arOnlyPosServiceProof:{version:1,kind:'ar-only-pos-receipt-service-vat7',sourceBefore:before,sourceAfter:after,definitions:posCodes.map((code,n)=>({before:definitions.get(code),after:afterFacts[n]})),interfaces:{hotel:manifest.hotel,discoveryBefore,discoveryAfter,mappings:logos.map((logo,n)=>({logo,before:beforeFacts[n],after:afterFacts[posCodes.length+n]}))},receipts:checks.map((checkNumber,n)=>({hotel:manifest.hotel,checkNumber,before:beforeFacts[logos.length+n],after:afterFacts[posCodes.length+logos.length+n]}))}};
  return finish(qualified);
 }
 const posted:ArPostedGenerates[]=graphs.map(graph=>{
  const rules=definitions.get(String(graph.root.transactionCode)),generatedRules=graph.children.map(c=>definitions.get(String(c.transactionCode))),evidence={postingId:String(graph.root.transactionNo),childIds:graph.children.map(c=>String(c.transactionNo)),rules,rulesAfter:rules,generatedRules,generatedRulesAfter:generatedRules};
  for(const key of verifyArOnlyPostedGraph(graph,evidence,manifest.hotel).ids){if(claimed.has(key))throw Error('document_invoice_ar_tax_unverified');claimed.add(key);}return evidence;
 });
 const simulations=postedOnly?[]:await currentEvidence(reader,initial,claimed,readRules);
 const fresh=await readFresh(!!posAtoms.length),after=structuredClone(arOnlyTaxSource(fresh));if(canonical(before)!==canonical(after))throw Error('document_source_changed');
 const afterDefinitions=new Map<string,unknown>(),codes=[...definitions.keys()];
 for(let start=0;start<codes.length;start+=4){const batch=codes.slice(start,start+4),results=await Promise.allSettled(batch.map(code=>reader.invoiceTransactionCodeRules!(code)));for(let n=0;n<batch.length;n++){const result=results[n];if(result.status==='rejected')throw result.reason;if(canonical(definitions.get(batch[n]))!==canonical(result.value))throw Error('document_source_changed');afterDefinitions.set(batch[n],result.value);}}
 const refreshed=<T extends ArPostedGenerates|ArSimulation>(e:T):T=>({...e,rulesAfter:afterDefinitions.get(String(record(record(e.rules).transactionCode).code)),generatedRulesAfter:e.generatedRules.map(r=>afterDefinitions.get(String(record(record(r).transactionCode).code)))});
 const qualified:InvoicePacket={...fresh,arSimulations:simulations.map(refreshed),...posAtoms.length?{arOnlyPosProof:{version:1,kind:'ar-only-direct-pos-vat7',sourceBefore:before,sourceAfter:after,definitions:[...definitions].map(([code,before])=>({before,after:afterDefinitions.get(code)}))}}:graphs.length?{arPostedGenerates:posted.map(refreshed),arOnlyPostedProof:{version:1,kind:'ar-only-posted-generates-vat7',sourceBefore:before,sourceAfter:after}}:{currentArTaxProof:{version:1,kind:postedOnly?'posted-vat7':'ar-only-current-vat7',sourceBefore:before,sourceAfter:after}}};
 return finish(qualified);
}
export async function readArOnlyInvoiceModel(reader:ArOnlyInvoiceReader,manifest:DocumentInvoice,now?:Date){
 for(let attempt=0;attempt<3;attempt++){
  try{return arOnlyInvoiceModel(await readArOnlyInvoicePacket(reader,manifest),now);}catch(error){
   const unstable=error instanceof OperaError&&['duplicate_member','pagination_changed','pagination_incomplete'].includes(error.code)||error instanceof Error&&error.message==='document_invoice_pagination_changed';
   if(!unstable)throw error;
   if(attempt===2)throw Error('document_invoice_source_unstable',{cause:error});
  }
 }
 throw Error('document_invoice_source_unstable');
}
