import {canonical} from './ar-tax';
import {arOnlyTaxSource,type CurrentArTaxSource} from './current-ar-tax';
import {inspectDirectZeroTax,verifyDirectZeroTaxProof} from './direct-zero-tax';
import type {EmbeddedNonVatGroup} from './embedded-generates';
import type {InvoicePacket} from './model';
export interface ArOnlyNonVatProof {version:1;kind:'ar-only-direct-nonvat';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource;groups:EmbeddedNonVatGroup[]}
const fail=():never=>{throw Error('document_invoice_ar_only_nonvat_unverified');};
/** The explicit policy proves a standalone zero atom, not historical generated,
 * deferred or package-owned money. Keep these exclusions out of the legacy
 * inspector so existing proof contracts do not change. */
export function inspectArOnlyNonVat(packet:InvoicePacket){
 const plan=inspectDirectZeroTax(packet),selected=(plan.source.postings as {invoicePostingsDetails:Record<string,unknown>[]}).invoicePostingsDetails;
 const candidateIds=new Set(plan.candidates.map(c=>c.id));
 let budget=0;const membership=(raw:unknown,depth=0):void=>{if(++budget>20000||depth>8)fail();if(raw==null)return;if(Array.isArray(raw)){for(const value of raw)membership(value,depth+1);return;}if(typeof raw!=='object')fail();const row=raw as Record<string,unknown>;if(row.financialTransactionIdList!==undefined){const members=Array.isArray(row.financialTransactionIdList)?row.financialTransactionIdList:[row.financialTransactionIdList];for(const member of members){if(++budget>20000)fail();const key=member&&typeof member==='object'&&!Array.isArray(member)?String((member as Record<string,unknown>).id):String(member);if(candidateIds.has(key))fail();}}for(const key of ['posting','postingBreakdown','taxes','subPostings'])if(row[key]!==undefined)membership(row[key],depth+1);};membership(selected);membership(plan.source.taxRows);
 for(const entry of plan.source.taxRows){const posting=(entry as {posting:Record<string,unknown>}).posting;
  if(candidateIds.has(String(posting.referenceTransactionNo))||candidateIds.has(String(posting.referencePackageTransactionNo)))fail();
 }
 for(const candidate of plan.candidates){
  const row=selected.find(row=>String(row.transactionNo)===candidate.id)??fail();
  for(const posting of [candidate.posting,row])if(posting.financialTransactionIdList!==undefined&&(!Array.isArray(posting.financialTransactionIdList)||posting.financialTransactionIdList.length)||posting.groupTypeInfo!==undefined&&(!posting.groupTypeInfo||typeof posting.groupTypeInfo!=='object'||Array.isArray(posting.groupTypeInfo)||Object.keys(posting.groupTypeInfo).length)||posting.subPostings!==undefined&&(!Array.isArray(posting.subPostings)||posting.subPostings.length!==0)||posting.referenceTransactionNo!==undefined||posting.referencePackageTransactionNo!==undefined||posting.deferredTax!==undefined&&posting.deferredTax!==false)fail();
 }
 return plan;
}
/** The legacy verifier's explicit branch remains the policy authority. This
 * envelope adds complete AR-only source fencing and never delegates a native
 * control field, so its native alternative cannot authorize admission. */
export function verifyArOnlyNonVatProof(packet:InvoicePacket):Map<string,number>{
 const proof=packet.arOnlyNonVatProof??fail();
 if(proof.version!==1||proof.kind!=='ar-only-direct-nonvat'||'nativeTaxControls'in packet||packet.directZeroTaxProof||packet.currentArTaxProof||packet.arOnlyPosProof||packet.arOnlyPostedProof||packet.embeddedGenerateProof||packet.arTransfer||packet.arDetails?.length||packet.arSimulations?.length||packet.arPostedGenerates?.length)fail();
 const source=canonical(arOnlyTaxSource(packet));if(canonical(proof.sourceBefore)!==source||canonical(proof.sourceAfter)!==source)fail();
 const plan=inspectArOnlyNonVat(packet);
 const delegated:InvoicePacket={...packet,directZeroTaxProof:{version:1,sourceBefore:proof.sourceBefore,sourceAfter:proof.sourceAfter,groups:proof.groups}};
 if(verifyDirectZeroTaxProof(delegated)!=='explicit')fail();
 return new Map(plan.candidates.map(c=>[c.id,c.signedCents]));
}
