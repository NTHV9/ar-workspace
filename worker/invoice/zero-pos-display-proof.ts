import {revalidateEmbeddedCancellationCatalog,type EmbeddedCancellationCatalog} from './embedded-cancellation-display-proof';
import {canonical} from './ar-tax';
import {invoiceModel,type InvoicePacket} from './model';
import type {InvoiceModel} from './types';
import {verifyArOnlySourceClaimsWithDisplayRegion,readVerifiedSourceClaimsPosRegion} from './ar-only-source-claims';
import {sourceClaimsDisplayFinancialPacket,verifySourceClaimsDisplayMembership} from './source-claims-display-membership';
import {verifyArPosDisplayProof,type ArPosDisplayProof} from './pos-display-proof';
import {amountCents} from '../opera/normalize';
export interface PosDisplaySuppression {representativeId:string;sourceIds:string[];date:string}
export interface PosOnlyDisplaySuppressionCatalog {version:1;kind:'tsan-current-ar-closed-pos-cancellation';packet:InvoicePacket;proof:ArPosDisplayProof;suppressed:PosDisplaySuppression[]}
export type PosDisplaySuppressionCatalog=PosOnlyDisplaySuppressionCatalog|EmbeddedCancellationCatalog;
const fail=():never=>{throw Error('document_invoice_pos_display_suppression_unverified');};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail();
const column=(v:unknown)=>BigInt(v===undefined?0:amountCents(v,'THB'));
const columns=(v:Record<string,unknown>)=>({debit:column(v.debitAmount),credit:column(v.creditAmount)});
const financialKeys=new Set(['manifest','account','invoice','reservation','postings','taxRows','taxCodes','arDetails','payeeTaxNumber','customReference','arOnlySourceClaimsProof','arOnlyZeroVatNetProof','arOnlyPosSalesProof','arOnlyPosSignedMultiVatProof','arOnlyPosMultiVatProof','arOnlyPosDiscountProof','arOnlyPosFeeProof','arOnlyPosServiceProof','arOnlyWrapperNetVatProof','arOnlyNonVatProof','arOnlyPosProof','arOnlyPostedProof','directZeroTaxProof','currentArTaxProof','embeddedGenerateProof','arTransfer','arPostedGenerates','arSimulations','nativeTaxControls']);
/** Eligibility concerns literal independently qualified source columns only.
 * No zero gross/net inference or replacement monetary values participate. */
export function createPosDisplaySuppressionCatalog(input:InvoicePacket,proof:ArPosDisplayProof):PosOnlyDisplaySuppressionCatalog|undefined{
 if(input.manifest.hotel!=='TSAN'||!input.arOnlySourceClaimsProof||![1,2].includes(input.arOnlySourceClaimsProof.version))return undefined;
 const packet=sourceClaimsDisplayFinancialPacket(input);if(Object.keys(packet).some(key=>!financialKeys.has(key)))return fail();invoiceModel(packet);
 const region=verifyArOnlySourceClaimsWithDisplayRegion(packet).posRegion??fail(),original=readVerifiedSourceClaimsPosRegion(packet,region),membership=verifySourceClaimsDisplayMembership(packet,region),groups=verifyArPosDisplayProof(packet,proof,membership).groups,byId=new Map(original.atoms.map(a=>[a.id,a])),suppressed:PosDisplaySuppression[]=[];
 for(const group of groups){
  if(group.sourceIds.length<2||group.sourceIds.some(key=>!byId.has(key)))continue;const codes=new Map<string,typeof original.atoms[number][]>();let eligible=true;
  for(const key of group.sourceIds){const atom=byId.get(key)!,chosen=columns(atom.selected),posted=columns(atom.posting);if(chosen.debit!==posted.debit||chosen.credit!==posted.credit||chosen.debit===0n&&chosen.credit===0n){eligible=false;break;}const same=codes.get(atom.code)??[];same.push(atom);codes.set(atom.code,same);}
  if(!eligible)continue;
  for(const atoms of codes.values()){
   if(atoms.length!==2||atoms[0].id===atoms[1].id||original.identities.get(atoms[0].id)?.role!==original.identities.get(atoms[1].id)?.role){eligible=false;break;}const a=columns(atoms[0].selected),b=columns(atoms[1].selected);if(a.debit+b.debit!==0n||a.credit+b.credit!==0n){eligible=false;break;}
  }
  if(eligible)suppressed.push({representativeId:group.representativeId,sourceIds:[...group.sourceIds],date:group.date});
 }
 if(!suppressed.length)return undefined;return {version:1,kind:'tsan-current-ar-closed-pos-cancellation',packet:structuredClone(packet),proof:structuredClone(proof),suppressed};
}
export function revalidatePosDisplaySuppressionCatalog(raw:unknown):{catalog:PosDisplaySuppressionCatalog;financialModel:InvoiceModel}{
 const value=object(raw);if(value.kind==='tsan-current-ar-closed-embedded-cancellation')return revalidateEmbeddedCancellationCatalog(raw);if(Object.keys(value).sort().join('|')!==['kind','packet','proof','suppressed','version'].sort().join('|')||value.version!==1||value.kind!=='tsan-current-ar-closed-pos-cancellation')return fail();const packet=object(value.packet) as unknown as InvoicePacket;if(canonical(sourceClaimsDisplayFinancialPacket(packet))!==canonical(packet))return fail();const proof=object(value.proof);if(Object.keys(proof).sort().join('|')!==['contexts','kind','sourceAfter','sourceBefore','version'].sort().join('|'))return fail();const regenerated=createPosDisplaySuppressionCatalog(packet,proof as unknown as ArPosDisplayProof);if(!regenerated||canonical(regenerated.suppressed)!==canonical(value.suppressed))return fail();return {catalog:regenerated,financialModel:invoiceModel(packet)};
}
