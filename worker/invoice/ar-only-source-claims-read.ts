import {exclusiveNonRevenueZeroVatNetProvenance} from './exclusive-nonrevenue-zero-vat-net';
import {canPlanExplicitOthersRevenuePos} from './ar-only-explicit-others-revenue-pos-claims';
import {canPlanExplicitNetNonRevenuePos} from './ar-only-explicit-net-nonrevenue-pos-claims';
import {canPlanExclusiveNonRevenuePos} from './ar-only-exclusive-nonrevenue-pos-claims';
import {canPlanExplicitRevenuePos} from './ar-only-explicit-revenue-pos-claims';
import {canPlanPostedPosFee} from './ar-only-posted-pos-fee-plan';
import {beginArOnlyPosInterfaceRead} from './ar-only-pos-interface-read';
import {canPlanPostedPosClaims} from './ar-only-posted-tax-claims';
import {canPlanCompleteArOnlyPosDiscount} from './ar-only-pos-discount-proof';
import {arOnlyPosGroupKey,type ArOnlyPosAtom} from './ar-only-pos-proof';
import {amountCents} from '../opera/normalize';
import type {ArOnlyInvoiceReader} from './ar-only-read';
import {invoiceModel,record,type InvoicePacket} from './model';
import {inspectArOnlyNonVat} from './ar-only-nonvat-proof';
import {zeroVatNetProvenance,type ArOnlyZeroVatNetGroup} from './ar-only-zero-vat-net-proof';
import {directNonVatProvenance} from './direct-nonvat-policy';
import {arOnlyTaxSource} from './current-ar-tax';
import {canonical} from './ar-tax';
import {readArOnlyBatch} from './ar-only-evidence-read';
const fail=():never=>{throw Error('document_invoice_ar_only_source_claims_unverified');};
/** Planning discovers read scopes only. No exclusion token or claim is minted. */
function discoverSourceClaimsPosAtoms(packet:InvoicePacket):ArOnlyPosAtom[]{
 const zero=new Set(inspectArOnlyNonVat(packet).candidates.map(g=>g.id)),data=record(packet.postings),selected=data.invoicePostingsDetails;if(!Array.isArray(selected)||!Array.isArray(data.trxCodesInfo))fail();
 const sourceDefinitions=(data.trxCodesInfo as unknown[]).map(record);
 const byId=new Map((selected as unknown[]).map(s=>[String(record(s).transactionNo),record(s)])),atoms:ArOnlyPosAtom[]=[];
 for(const raw of packet.taxRows){const e=record(raw),p=record(e.posting),s=byId.get(String(p.transactionNo));if(!s||zero.has(String(p.transactionNo))||['Wrapper','Payment'].includes(String(p.transactionType)))continue;const taxes=record(e.postingBreakdown).taxes;if(Array.isArray(taxes)&&taxes.length)continue;const definition=sourceDefinitions.find(d=>d.hotelId===packet.manifest.hotel&&d.transactionCode===s.transactionCode)??fail(),signedCents=(s.debitAmount==null?0:amountCents(s.debitAmount,'THB'))-(s.creditAmount==null?0:amountCents(s.creditAmount,'THB'));atoms.push({id:String(p.transactionNo),code:String(p.transactionCode),posting:p,selected:s,definition,signedCents,group:arOnlyPosGroupKey(p)});}
 return atoms;
}
export function discoverSourceClaimsPosCodes(packet:InvoicePacket):string[]{return [...new Set(discoverSourceClaimsPosAtoms(packet).map(a=>a.code))];}
/** Read scopes only: candidate discovery never supplies a financial exclusion
 * token, ownership certificate or final POS membership. */
export function discoverSourceClaimsPosDisplayContexts(packet:InvoicePacket):{hotel:string;reservationId:string;folioWindowNo:number}[]{
 const contexts=new Map<number,{hotel:string;reservationId:string;folioWindowNo:number}>(),m=packet.manifest;
 for(const atom of discoverSourceClaimsPosAtoms(packet)){const p=atom.posting,window=p.folioWindowNo;if(p.hotelId!==m.hotel||String(record(record(p.guestInfo).reservationId).id)!==m.reservation_id||String(p.folioNo)!==m.folio_no||!Number.isSafeInteger(window)||Number(window)<1||Number(window)>999)fail();contexts.set(Number(window),{hotel:m.hotel,reservationId:m.reservation_id!,folioWindowNo:Number(window)});}
 if(contexts.size>8)fail();return [...contexts.values()].sort((a,b)=>a.folioWindowNo-b.folioWindowNo);
}
/** Collect both components around one actual full-source fence, then verify the
 * original packet through its exclusive composed financial envelope. */
export async function readArOnlySourceClaims(reader:ArOnlyInvoiceReader,initial:InvoicePacket,readFresh:()=>Promise<InvoicePacket>):Promise<InvoicePacket>{
 const plan=inspectArOnlyNonVat(initial),posCodes=discoverSourceClaimsPosCodes(initial);if(!plan.candidates.length||!posCodes.length||!reader.invoiceTransactionCodeRules||!reader.invoiceChargeSimulation)fail();
 const codes=[...new Set([...plan.candidates.map(g=>String(g.posting.transactionCode)),...posCodes])],before=structuredClone(arOnlyTaxSource(initial));
 const rulesBefore=await readArOnlyBatch(codes.map(code=>()=>reader.invoiceTransactionCodeRules!(code))),rules=new Map(codes.map((code,n)=>[code,rulesBefore[n]]));
 const scopes=[...new Map(plan.candidates.map(g=>[JSON.stringify([g.posting.transactionCode,g.signedCents]),{code:String(g.posting.transactionCode),cents:g.signedCents}])).entries()];
 const readCalculations=async()=>new Map((await readArOnlyBatch(scopes.map(([,s])=>()=>reader.invoiceChargeSimulation!(s.code,s.cents/100)))).map((value,n)=>[scopes[n][0],value]));
 const classified=plan.candidates.map(g=>{const code=String(g.posting.transactionCode),r=rules.get(code),provenance=directNonVatProvenance(r,initial.manifest.hotel,code,g.definition)??zeroVatNetProvenance(r,initial.manifest.hotel,code,g.definition)??exclusiveNonRevenueZeroVatNetProvenance(r,initial.manifest.hotel,code,g.definition)??fail();return {g,code,r,provenance};});
 const planningAtoms=discoverSourceClaimsPosAtoms(initial),planningDefinitions=posCodes.map(code=>({before:rules.get(code),after:rules.get(code)}));
 const explicitOthersRevenue=canPlanExplicitOthersRevenuePos(planningAtoms,planningDefinitions,initial.manifest.hotel);
 const explicitNetNonRevenue=!explicitOthersRevenue&&canPlanExplicitNetNonRevenuePos(planningAtoms,planningDefinitions,initial.manifest.hotel);
 const exclusiveNonRevenue=!explicitOthersRevenue&&!explicitNetNonRevenue&&canPlanExclusiveNonRevenuePos(planningAtoms,planningDefinitions,initial.manifest.hotel);
 const explicitRevenue=explicitOthersRevenue||explicitNetNonRevenue||exclusiveNonRevenue?undefined:canPlanExplicitRevenuePos(planningAtoms,planningDefinitions,initial.manifest.hotel);
 const postedFee=!explicitOthersRevenue&&!explicitNetNonRevenue&&!exclusiveNonRevenue&&!explicitRevenue&&canPlanPostedPosFee(planningAtoms,planningDefinitions,initial.manifest.hotel,true),interfaces=postedFee||explicitRevenue?.fees.size?await beginArOnlyPosInterfaceRead(reader,initial.manifest.hotel):undefined;
 const posted=!explicitOthersRevenue&&!explicitNetNonRevenue&&!exclusiveNonRevenue&&!explicitRevenue&&!postedFee&&!canPlanCompleteArOnlyPosDiscount(planningAtoms,planningDefinitions,initial.manifest.hotel)&&canPlanPostedPosClaims(planningAtoms,planningDefinitions,initial.manifest.hotel,true);
 const calculations=await readCalculations();
 const groups:ArOnlyZeroVatNetGroup[]=classified.map(({g,code,r,provenance})=>{const calculation=calculations.get(JSON.stringify([code,g.signedCents]));return {postingId:g.id,rules:r,rulesAfter:r,calculation,calculationAfter:calculation,provenance};});
 const fresh=await readFresh(),after=structuredClone(arOnlyTaxSource(fresh));if(canonical(before)!==canonical(after))throw Error('document_source_changed');
 const afterValues=await readArOnlyBatch(codes.map(code=>()=>reader.invoiceTransactionCodeRules!(code))),rulesAfter=new Map(codes.map((code,n)=>[code,afterValues[n]]));for(const code of codes)if(canonical(rules.get(code))!==canonical(rulesAfter.get(code)))throw Error('document_source_changed');
 const calculationsAfter=await readCalculations();for(const [key,value]of calculations)if(canonical(value)!==canonical(calculationsAfter.get(key)))throw Error('document_source_changed');
 const qualified:InvoicePacket={...fresh,arOnlySourceClaimsProof:{version:1,kind:'ar-only-source-claims',sourceBefore:before,sourceAfter:after,directZero:{groups:groups.map((g,n)=>{const candidate=plan.candidates[n],code=String(candidate.posting.transactionCode);return {...g,rulesAfter:rulesAfter.get(code),calculationAfter:calculationsAfter.get(JSON.stringify([code,candidate.signedCents]))};})},ordinaryPos:{definitions:posCodes.map(code=>({before:rules.get(code),after:rulesAfter.get(code)}))}}};
 if(explicitOthersRevenue){const v1=qualified.arOnlySourceClaimsProof;if(!v1||v1.version!==1)return fail();qualified.arOnlySourceClaimsProof={version:2,kind:v1.kind,sourceBefore:v1.sourceBefore,sourceAfter:v1.sourceAfter,components:[{kind:'direct-zero',groups:v1.directZero.groups},{kind:'posted-pos-explicit-others-revenue',definitions:v1.ordinaryPos.definitions}]};}
 if(explicitNetNonRevenue){const v1=qualified.arOnlySourceClaimsProof;if(!v1||v1.version!==1)return fail();qualified.arOnlySourceClaimsProof={version:2,kind:v1.kind,sourceBefore:v1.sourceBefore,sourceAfter:v1.sourceAfter,components:[{kind:'direct-zero',groups:v1.directZero.groups},{kind:'posted-pos-explicit-net-nonrevenue',definitions:v1.ordinaryPos.definitions}]};}
 if(exclusiveNonRevenue){const v1=qualified.arOnlySourceClaimsProof;if(!v1||v1.version!==1)return fail();qualified.arOnlySourceClaimsProof={version:2,kind:v1.kind,sourceBefore:v1.sourceBefore,sourceAfter:v1.sourceAfter,components:[{kind:'direct-zero',groups:v1.directZero.groups},{kind:'posted-pos-exclusive-nonrevenue',definitions:v1.ordinaryPos.definitions}]};}
 if(explicitRevenue){const v1=qualified.arOnlySourceClaimsProof;if(!v1||v1.version!==1)return fail();const interfaceEvidence=interfaces?await interfaces.finish():undefined;qualified.arOnlySourceClaimsProof={version:2,kind:v1.kind,sourceBefore:v1.sourceBefore,sourceAfter:v1.sourceAfter,components:[{kind:'direct-zero',groups:v1.directZero.groups},{kind:'posted-pos-explicit-revenue-base',definitions:v1.ordinaryPos.definitions,...interfaceEvidence?{interfaces:interfaceEvidence}:{}}]};}
 if(postedFee){const v1=qualified.arOnlySourceClaimsProof;if(!v1||v1.version!==1||!interfaces)return fail();qualified.arOnlySourceClaimsProof={version:2,kind:v1.kind,sourceBefore:v1.sourceBefore,sourceAfter:v1.sourceAfter,components:[{kind:'direct-zero',groups:v1.directZero.groups},{kind:'posted-pos-mapped-fee',definitions:v1.ordinaryPos.definitions,interfaces:await interfaces.finish()}]};}
 if(posted){const v1=qualified.arOnlySourceClaimsProof;if(!v1||v1.version!==1)return fail();qualified.arOnlySourceClaimsProof={version:2,kind:v1.kind,sourceBefore:v1.sourceBefore,sourceAfter:v1.sourceAfter,components:[{kind:'direct-zero',groups:v1.directZero.groups},{kind:'posted-pos-vat',definitions:v1.ordinaryPos.definitions}]};}
 invoiceModel(qualified);return qualified;
}

