import {verifySourceClaimsDisplayMembership} from './source-claims-display-membership';
import {createPosDisplaySuppressionCatalog} from './zero-pos-display-proof';
import {createEmbeddedCancellationCatalog,type ArEmbeddedCancellationDisplayProof} from './embedded-cancellation-display-proof';
import type {EmbeddedCancellationDisplayReadResult} from './embedded-cancellation-display-read';
import {verifyArCountryDisplayProof,type ArCountryDisplayProof} from './country-display-proof';
import type {CountryDisplayReadResult} from './country-display-read';
import {UNIT,CENT,precise,abs,rounded} from './money-precision';
import {verifyArPaymentOffsetDisplayProof,type ArPaymentOffsetDisplayProof} from './payment-offset-display-proof';
import type {PaymentOffsetDisplayReadResult} from './payment-offset-display-read';
import {verifyArPosDisplayProof,type ArPosDisplayProof} from './pos-display-proof';
import {deriveInvoiceDisplayModel} from './derive-display-model';
import {verifySelectedWrapperDisplayGroups} from './selected-wrapper-display';
import type {ArPosDisplayReadResult} from './pos-display-read';
import {verifyArOnlySourceClaimsWithDisplayRegion,type ArOnlySourceClaimsProof} from './ar-only-source-claims';
import {verifyArOnlyZeroVatNetProof,type ArOnlyZeroVatNetProof} from './ar-only-zero-vat-net-proof';
import {verifyArOnlyPosSalesProof,type ArOnlyPosSalesProof} from './ar-only-pos-sales-proof';
import {verifyArOnlyPosSignedMultiVatProof,type ArOnlyPosSignedMultiVatProof} from './ar-only-pos-signed-multi-vat-proof';
import {verifyArRateDisplayProof,type ArRateDisplayProof} from './ar-rate-display-proof';
import type {ArRateDisplayResult} from './ar-rate-display-read';
import {verifyArOnlyPosMultiVatProof,type ArOnlyPosMultiVatProof} from './ar-only-pos-multi-vat-proof';
import {verifyArOnlyPosDiscountProof,type ArOnlyPosDiscountProof} from './ar-only-pos-discount-proof';
import {verifyArOnlyPosFeeProof,type ArOnlyPosFeeProof} from './ar-only-pos-fee-proof';
import {invoiceDisplayReference} from './display-reference';
import {verifyArOnlyPosServiceProof,type ArOnlyPosServiceProof} from './ar-only-pos-service-proof';
import {verifyArOnlyWrapperNetVatProof,type ArOnlyWrapperNetVatProof} from './ar-only-wrapper-net-vat-proof';
import {directGroupKey,directVatDefinition,verifyDirectZeroTaxProof,type DirectZeroTaxProof} from './direct-zero-tax';
import {verifyArOnlyPostedProof,type ArOnlyPostedProof} from './ar-only-posted-proof';
import {verifyArOnlyPosProof,type ArOnlyPosProof} from './ar-only-pos-proof';
import {verifyArOnlyNonVatProof,type ArOnlyNonVatProof} from './ar-only-nonvat-proof';
import {qualifyNativeNonVat} from './native-nonvat';
import {verifyCurrentArTaxProof,type CurrentArTaxProof} from './current-ar-tax';
import type {NativeTaxControls} from './native-tax-controls';
import {verifyEmbeddedGenerateProof,type EmbeddedGenerateProof} from './embedded-generates';
import {verifyArSimulation,type ArSimulation} from './ar-tax';
import {discoverPostedGenerates,verifyPostedGenerates,type ArPostedGenerates} from './posted-generates';
import {revalidateArTransfer,type ArTransferEvidence} from './ar-transfer';
import {amountCents} from '../opera/normalize';
import type {DocumentInvoice} from '../documents/native-invoice';
import type {InvoiceModel,InvoiceLine} from './types';
type Row=Record<string,unknown>;
const fail=(stage:string):never=>{throw Error('document_invoice_'+stage);};
export const record=(v:unknown):Row=>{if(!v||typeof v!=='object'||Array.isArray(v))return fail('data_invalid');return v as Row;};
const optional=(v:unknown):Row=>v==null?{}:record(v);
const rows=(v:unknown):Row[]=>{if(!Array.isArray(v))return fail('data_invalid');return v.map(record);};
// OPERA omits this optional field for charges whose VAT is a separate posting.
export const invoiceTaxEntries=(breakdown:Row)=>breakdown.taxes===undefined?[]:rows(breakdown.taxes);
const text=(v:unknown)=>{if(v==null)return '';if(!['string','number'].includes(typeof v))return fail('data_invalid');const s=String(v);if(s.length>2000||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(s))return fail('data_invalid');return s.trim();};
const id=(v:unknown)=>{const s=text(v);if(!/^[1-9][0-9]{0,15}$/.test(s))return fail('identity_invalid');return s;};
export const dateText=(v:unknown)=>{const s=text(v);if(!s)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)return fail('date_invalid');return s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(2,4);};
const cents=(v:unknown)=>amountCents(v,'THB');
const optionalCents=(v:unknown)=>v==null?0:cents(v);
const sum=(values:number[])=>{const total=values.reduce((n,v)=>n+v,0);if(!Number.isSafeInteger(total))return fail('amount_invalid');return total;};
// Preserve OPERA's fractional generates until the entire invoice is totalled.
// Rounding each night's VAT to cents would change the native footer by satang.


export interface InvoicePacket {arCountryDisplayProof?:ArCountryDisplayProof;arCountryDisplayGap?:CountryDisplayReadResult['gap'];arPaymentOffsetDisplayProof?:ArPaymentOffsetDisplayProof;arPaymentOffsetDisplayGap?:PaymentOffsetDisplayReadResult['gap'];arPosDisplayProof?:ArPosDisplayProof;arPosDisplayGap?:ArPosDisplayReadResult['gap'];arOnlySourceClaimsProof?:ArOnlySourceClaimsProof;arOnlyZeroVatNetProof?:ArOnlyZeroVatNetProof;arOnlyPosSalesProof?:ArOnlyPosSalesProof;arOnlyPosSignedMultiVatProof?:ArOnlyPosSignedMultiVatProof;arRateDisplayProof?:ArRateDisplayProof;arRateDisplayGap?:ArRateDisplayResult['gap'];arOnlyPosMultiVatProof?:ArOnlyPosMultiVatProof;arOnlyPosDiscountProof?:ArOnlyPosDiscountProof;arOnlyPosFeeProof?:ArOnlyPosFeeProof;arOnlyPosServiceProof?:ArOnlyPosServiceProof;arOnlyWrapperNetVatProof?:ArOnlyWrapperNetVatProof;arOnlyNonVatProof?:ArOnlyNonVatProof;arOnlyPosProof?:ArOnlyPosProof;arOnlyPostedProof?:ArOnlyPostedProof;directZeroTaxProof?:DirectZeroTaxProof;currentArTaxProof?:CurrentArTaxProof;embeddedGenerateProof?:EmbeddedGenerateProof;arTransfer?:ArTransferEvidence;arPostedGenerates?:ArPostedGenerates[];arSimulations?:ArSimulation[];nativeTaxControls?:NativeTaxControls;manifest:DocumentInvoice;account:unknown;invoice:unknown;reservation:unknown;postings:unknown;taxRows:unknown[];taxCodes:unknown[];arDetails?:{ids:string[];response:unknown}[];payeeTaxNumber?:string;customReference?:string}
export interface InvoicePacket {arEmbeddedCancellationDisplayProof?:ArEmbeddedCancellationDisplayProof;arEmbeddedCancellationDisplayGap?:EmbeddedCancellationDisplayReadResult['gap']}
export function invoiceModel(packet:InvoicePacket,now:Date=new Date()):InvoiceModel{
 const {manifest:m}=packet,a=record(packet.account),i=record(packet.invoice),reservation=record(packet.reservation),postingData=record(packet.postings);
 if(a.hotelId!==m.hotel||text(record(a.accountId).id)!==m.account_id||i.hotelId!==m.hotel||id(i.transactionNo)!==m.id||text(i.invoiceNo)!==m.invoice_no||text(i.folioNo)!==m.folio_no||!m.reservation_id||!m.folio_no||!m.invoice_no||!['standalone','parent'].includes(m.collection_role)||m.open<=0||i.parentInvoiceNo!=null)return fail('scope_invalid');
 if(reservation.hotelId!==m.hotel||!rows(reservation.reservationIdList).some(r=>r.type==='Reservation'&&text(r.id)===m.reservation_id))return fail('scope_invalid');
 const arOutstanding=cents(i.balance),currentAmount=cents(i.amount);if(arOutstanding!==Math.round(m.open*100)||i.folioDate!==m.folio_date)throw Error('document_source_changed');
 const codes=rows(postingData.trxCodesInfo),postings=rows(postingData.invoicePostingsDetails);if(!postings.length||postings.length>=4000)return fail('postings_incomplete');
 const postingDates=new Map(postings.map(p=>[String(p.transactionNo),text(p.transactionDate)]));
 const seen=new Set<string>(),lines:InvoiceLine[]=postings.map(p=>{
  const postingId=id(p.transactionNo);if(seen.has(postingId))return fail('posting_duplicate');seen.add(postingId);
  const code=codes.filter(c=>c.hotelId===m.hotel&&c.transactionCode===p.transactionCode);if(code.length!==1||!text(code[0].description))return fail('posting_code_invalid');
  const debit=optionalCents(p.debitAmount),credit=optionalCents(p.creditAmount);if(!debit&&!credit||debit&&credit)return fail('posting_amount_invalid');
  const reference=invoiceDisplayReference(text(p.checkNo),text(p.reference));
  return {id:postingId,date:dateText(p.transactionDate),description:text(code[0].description),reference,debit,credit};
 }).sort((x,y)=>postingDates.get(x.id)!.localeCompare(postingDates.get(y.id)!)||Number(x.id)-Number(y.id));
 const rawDebit=sum(lines.map(l=>l.debit)),rawCredit=sum(lines.map(l=>l.credit)),sourceNet=rawDebit-rawCredit;if(!Number.isSafeInteger(sourceNet)||sourceNet!==currentAmount)throw Error('document_source_changed');
 const netRows=packet.taxRows.map(record),byId=new Map<string,Row>();
 for(const entry of netRows){const p=record(entry.posting),key=id(p.transactionNo);if(byId.has(key))return fail('tax_duplicate');byId.set(key,entry);}
 const childRows=new Map<string,Row[]>();for(const e of netRows){const p=record(e.posting),parent=text(p.referencePackageTransactionNo);if(parent){const group=childRows.get(parent)??[];group.push(e);childRows.set(parent,group);}}
 const arRows=new Map<string,{posting:Row;code:Row}>();
 for(const page of packet.arDetails??[]){
  const detail=record(page.response),transactions=rows(detail.transactions),definitions=rows(detail.trxCodesInfo);
  // transactionDetails was explicitly requested with includeGenerates=true.
  // Accept this path only when the complete response contains exactly the
  // requested AR roots and no additional generated taxes or nested postings.
  if(!page.ids.length||new Set(page.ids).size!==page.ids.length||transactions.length!==page.ids.length)return fail('ar_tax_unsupported');
  for(const p of transactions){const key=id(p.transactionNo),codes=definitions.filter(c=>c.hotelId===m.hotel&&c.transactionCode===p.transactionCode);
   if(!page.ids.includes(key)||arRows.has(key)||byId.has(key)||!lines.some(l=>l.id===key)||codes.length!==1)return fail('ar_tax_scope_invalid');
   arRows.set(key,{posting:p,code:codes[0]});
  }
 }
 const wrapperNetComponents=packet.arOnlyWrapperNetVatProof?verifyArOnlyWrapperNetVatProof(packet):undefined;
 const posAtoms=packet.arOnlyPosSalesProof?verifyArOnlyPosSalesProof(packet):packet.arOnlyPosSignedMultiVatProof?verifyArOnlyPosSignedMultiVatProof(packet):packet.arOnlyPosMultiVatProof?verifyArOnlyPosMultiVatProof(packet):packet.arOnlyPosDiscountProof?verifyArOnlyPosDiscountProof(packet):packet.arOnlyPosFeeProof?verifyArOnlyPosFeeProof(packet):packet.arOnlyPosServiceProof?verifyArOnlyPosServiceProof(packet):packet.arOnlyPosProof?verifyArOnlyPosProof(packet):undefined;
 const sourceClaimsVerification=packet.arOnlySourceClaimsProof?verifyArOnlySourceClaimsWithDisplayRegion(packet):undefined,sourceClaims=sourceClaimsVerification?.claims;
 const zeroVatNetAtoms=packet.arOnlyZeroVatNetProof?verifyArOnlyZeroVatNetProof(packet):undefined;
 const nonVatAtoms=packet.arOnlyNonVatProof?verifyArOnlyNonVatProof(packet):undefined;
 const postedProof=packet.arOnlyPostedProof?verifyArOnlyPostedProof(packet):false;
 const graphs=arRows.size?discoverPostedGenerates(m,a,postingData,packet.arDetails??[]):[],postedEvidence=packet.arPostedGenerates??[],postedById=new Map<string,{rootId:string;vatCents:number}>();
 let transfer:ArTransferEvidence|undefined;
 if(packet.arTransfer){if(!packet.nativeTaxControls)return fail('ar_tax_unverified');transfer=revalidateArTransfer(packet.arTransfer,{...packet.arTransfer.proof,manifest:m,account:a,invoice:i,postings:postingData,postedRows:[...arRows.values()].map(r=>r.posting)});}
 if(postedEvidence.length!==graphs.length||new Set(postedEvidence.map(e=>e.postingId)).size!==postedEvidence.length||graphs.length&&!packet.nativeTaxControls&&!postedProof)return fail('ar_tax_unverified');
 for(const graph of graphs){const rootId=String(graph.root.transactionNo),e=postedEvidence.find(p=>p.postingId===rootId);if(!e)return fail('ar_tax_unverified');const verified=verifyPostedGenerates(graph,e,m.hotel);for(const key of verified.ids){if(postedById.has(key))return fail('ar_tax_unverified');postedById.set(key,{rootId,vatCents:verified.vatCents});}}
 const simulations=packet.arSimulations??[],simulationIds=new Set(simulations.map(e=>e.postingId));if(simulationIds.size!==simulations.length||simulations.some(e=>!arRows.has(e.postingId)||postedById.has(e.postingId)))return fail('ar_tax_unverified');
 const currentRules=packet.currentArTaxProof?verifyCurrentArTaxProof(packet):false,strictFullVat=currentRules||postedProof||!!posAtoms||!!nonVatAtoms||!!wrapperNetComponents||!!zeroVatNetAtoms||!!sourceClaims;
 const claimedDirectIds=[...(posAtoms?.keys()??[]),...(nonVatAtoms?.keys()??[]),...(zeroVatNetAtoms?.keys()??[]),...(sourceClaims?.keys()??[])];
 const taxCodes=packet.taxCodes.map(record),taxSeen=new Set<string>([...postedById.keys(),...claimedDirectIds]),componentSeen=new Set<string>(claimedDirectIds);let vatUnits=0n,nonTaxableUnits=0n,excludedFooterCents=0;
 const directQualification=packet.directZeroTaxProof?verifyDirectZeroTaxProof(packet):undefined;
 const verifiedEmbeddedNonTax=packet.embeddedGenerateProof?verifyEmbeddedGenerateProof(packet,packet.embeddedGenerateProof):new Set<string>();
 const directGroups=new Map<string,{base:bigint;vat:bigint;baseCount:number;taxCount:number;hasCheck:boolean;candidates:{id:string;signedCents:number}[];eligible:boolean}>();let needsNativeControls=false,allNonTaxableDirect=true;const nonVatCandidates:{id:string;signedCents:number}[]=[];const paymentAmounts:number[]=[];
 for(const line of lines){const composed=sourceClaims?.get(line.id);if(composed){if(composed.component==='transferred-current-ar-rules-vat7')vatUnits+=composed.projectedVatUnits;else if((composed.component==='posted-embedded-vat'||composed.component==='posted-embedded-revenue-vat'))vatUnits+=composed.actualPostedVatUnits;else if(composed.role==='vat')vatUnits+=BigInt(composed.signedCents)*CENT;else if(composed.role==='nonvat')nonTaxableUnits+=BigInt(composed.signedCents)*CENT;else if(composed.role==='excluded-tax-footer'){excludedFooterCents+=composed.signedCents;if(!Number.isSafeInteger(excludedFooterCents))return fail('amount_invalid');}continue;}const zero=zeroVatNetAtoms?.get(line.id);if(zero){if(zero.role==='nonvat')nonTaxableUnits+=BigInt(zero.signedCents)*CENT;continue;}const nonVat=nonVatAtoms?.get(line.id);if(nonVat!==undefined){nonTaxableUnits+=BigInt(nonVat)*CENT;continue;}const pos=posAtoms?.get(line.id);if(pos){if(pos.role==='vat')vatUnits+=BigInt(pos.signedCents)*CENT;continue;}const root=byId.get(line.id);if((zeroVatNetAtoms||sourceClaims)&&(!root||!['Wrapper','Payment'].includes(String(record(root.posting).transactionType))&&!(record(root.posting).transactionType==='Revenue'&&root.postingBreakdown!==undefined&&invoiceTaxEntries(record(root.postingBreakdown)).length)))return fail(sourceClaims?'ar_only_source_claims_unverified':'ar_only_zero_vat_net_unverified');if(!root){
   const posted=postedById.get(line.id);if(posted){if(posted.rootId===line.id)vatUnits+=BigInt(posted.vatCents)*CENT;continue;}
   const ar=arRows.get(line.id);if(!ar)return fail('tax_coverage_missing');const p=ar.posting,info=record(p.aRInfo),selected=postings.find(row=>String(row.transactionNo)===line.id)!;
   const accountMatches=text(info.accountNumber)===text(a.accountNo)||!!transfer&&text(info.accountNumber)===transfer.sourceAccountNumber&&transfer.postingIds.includes(line.id);
   if(strictFullVat&&(text(p.transactionDate)!==text(selected.transactionDate)||p.hotelId!==undefined&&p.hotelId!==m.hotel||p.guestInfo!==undefined&&optional(p.guestInfo).reservationId!==undefined&&text(record(optional(p.guestInfo).reservationId).id)!==m.reservation_id))return fail('ar_tax_scope_invalid');
   if(!text(a.accountNo)||!accountMatches||text(info.invoiceNo)!==m.invoice_no||text(p.folioNo)!==m.folio_no||p.transactionCode!==selected.transactionCode||p.transactionType!=='Revenue')return fail('ar_tax_scope_invalid');
   if(p.deferredTax!==false||p.subPostings!==undefined&&(!Array.isArray(p.subPostings)||p.subPostings.length>0)||!text(ar.code.transactionGroup)||['TAX','SVC'].includes(text(ar.code.transactionGroup)))return fail('ar_tax_unsupported');
   if(optionalCents(p.debitAmount)!==line.debit||optionalCents(p.creditAmount)!==line.credit||Math.abs(cents(p.postedAmount))!==Math.abs(line.debit-line.credit))return fail('tax_reconciliation_failed');
   // A complete includeGenerates response without generated rows does not prove
   // an AR adjustment is non-taxable. OPERA's current AR folio can include VAT
   // absent from this reservation-ledger response. Never fabricate a zero tax.
   const evidence=simulations.find(e=>e.postingId===line.id);if(!evidence||!packet.nativeTaxControls&&!strictFullVat)return fail('ar_tax_unverified');
   const calculated=verifyArSimulation(evidence,m.hotel,String(p.transactionCode),(line.debit-line.credit)/100);
   if(strictFullVat&&(calculated.nonTaxable!==0||abs(precise({amount:calculated.vat,currencyCode:'THB'})*107n-BigInt(line.debit-line.credit)*CENT*7n)>100000000n))return fail('current_ar_tax_unverified');
   if(calculated.nonTaxable!==0)allNonTaxableDirect=false;
   vatUnits+=precise({amount:calculated.vat,currencyCode:'THB'});nonTaxableUnits+=precise({amount:calculated.nonTaxable,currencyCode:'THB'});continue;
  }const rootPosting=record(root.posting);
  if(strictFullVat&&!['Revenue','Wrapper','Payment'].includes(String(rootPosting.transactionType)))return fail('current_ar_tax_unverified');
  if(strictFullVat){const selected=postings.find(p=>String(p.transactionNo)===line.id)!;if(rootPosting.transactionCode!==selected.transactionCode||text(rootPosting.transactionDate)!==text(selected.transactionDate)||Math.abs(cents(rootPosting.postedAmount))!==Math.abs(line.debit-line.credit))return fail('tax_scope_invalid');}
  if(rootPosting.hotelId!==m.hotel||text(rootPosting.folioNo)!==m.folio_no||text(record(record(rootPosting.guestInfo).reservationId).id)!==m.reservation_id)return fail('tax_scope_invalid');
  if(rootPosting.transactionType==='Payment'){
   const selected=postings.find(p=>String(p.transactionNo)===line.id)!;
   if(rootPosting.transactionCode!==selected.transactionCode||componentSeen.has(line.id))return fail('payment_scope_invalid');
   if(root.postingBreakdown!==undefined)return fail('payment_tax_unsupported');
   const paidDebit=optionalCents(rootPosting.debitAmount),paidCredit=optionalCents(rootPosting.creditAmount),signed=paidDebit-paidCredit;
   if(!signed||paidDebit&&paidCredit||!Number.isSafeInteger(signed)||signed!==line.debit-line.credit||Math.abs(cents(rootPosting.postedAmount))!==Math.abs(signed))return fail('payment_reconciliation_failed');
   // AR can express a deposit as a negative debit. Its reservation ledger
   // supplies the printed debit/credit side; payment never reduces charge VAT.
   componentSeen.add(line.id);paymentAmounts.push(signed);line.debit=paidDebit;line.credit=paidCredit;continue;
  }
  // OPERA groups both the visible wrapper and its component postings under the
  // original package reference; this is distinct from the wrapper's posting ID.
  const components=rootPosting.transactionType==='Wrapper'?(childRows.get(id(rootPosting.referencePackageTransactionNo))??[]).filter(e=>record(e.posting).transactionType!=='Wrapper'):[root];if(!components.length)return fail('tax_coverage_missing');let rootGross=0n;
  for(const component of components){const p=record(component.posting),key=id(p.transactionNo);if(componentSeen.has(key))return fail('tax_duplicate');componentSeen.add(key);
   if(strictFullVat&&p.transactionType!=='Revenue')return fail('current_ar_tax_unverified');
   if(p.hotelId!==m.hotel||text(p.folioNo)!==m.folio_no||text(record(record(p.guestInfo).reservationId).id)!==m.reservation_id)return fail('tax_scope_invalid');
   const breakdown=record(component.postingBreakdown),grossAmount=precise(breakdown.grossAmount),net=precise(breakdown.netAmount);let generated=0n,vat=0n;
   const taxes=invoiceTaxEntries(breakdown);
   for(const raw of taxes){const key=id(raw.transactionNo);if(taxSeen.has(key)||text(raw.referenceTransactionNo)!==text(p.transactionNo))return fail('tax_scope_invalid');if(strictFullVat&&(raw.hotelId!==undefined&&raw.hotelId!==m.hotel||raw.folioNo!==undefined&&text(raw.folioNo)!==m.folio_no||raw.guestInfo!==undefined&&optional(raw.guestInfo).reservationId!==undefined&&text(record(optional(raw.guestInfo).reservationId).id)!==m.reservation_id))return fail('tax_scope_invalid');taxSeen.add(key);const definitions=taxCodes.filter(c=>c.hotelId===m.hotel&&c.transactionCode===raw.transactionCode);if(definitions.length!==1)return fail('tax_code_invalid');const code=definitions[0],amount=precise(raw.amount);generated+=amount;
    if(code.transactionGroup==='TAX'&&/\bvat\b/i.test(text(code.description)))vat+=amount;else if(code.transactionGroup!=='SVC'&&!verifiedEmbeddedNonTax.has(key)){
     // Some OPERA restaurant SVC generates retain the F&B accounting group.
     // Its label alone is insufficient: the whole invoice must match native tax
     // controls before this generate can be treated as service rather than VAT.
     if(code.transactionGroup!=='F&B'||!/\bSVC\b/i.test(text(code.description))||!packet.nativeTaxControls)return fail('tax_code_unsupported');
     needsNativeControls=true;
    }
   }
   if(abs(grossAmount-net-generated)>10000000n)return fail('tax_reconciliation_failed');
   if(!taxes.length&&rootPosting.transactionType!=='Wrapper'){
    if(strictFullVat)return fail('current_ar_tax_unverified');
    const selected=postings.find(row=>String(row.transactionNo)===line.id)!,definitions=codes.filter(c=>c.hotelId===m.hotel&&c.transactionCode===selected.transactionCode);
    if(definitions.length!==1||p.transactionCode!==selected.transactionCode)return fail('tax_scope_invalid');
    const code=definitions[0],isTax=code.transactionGroup==='TAX',restaurantVat=code.transactionGroup==='F&B'&&/\bvat\b/i.test(text(code.description)),isVat=directVatDefinition(code);
    if(restaurantVat){if(!packet.nativeTaxControls)return fail('tax_code_unsupported');needsNativeControls=true;}
    if(isTax&&!isVat)return fail('tax_code_unsupported');
    const check=text(selected.checkNo),groupKey=directGroupKey(selected),group=directGroups.get(groupKey)??{base:0n,vat:0n,baseCount:0,taxCount:0,hasCheck:!!check,candidates:[],eligible:true};
    if(isVat){if(taxSeen.has(key))return fail('tax_scope_invalid');taxSeen.add(key);group.vat+=grossAmount;group.taxCount++;vatUnits+=grossAmount;}
    else{
     group.base+=grossAmount;group.baseCount++;
     // The native aggregate may qualify only whole, fully scoped direct charge
     // atoms. A check group can contain multiple charges with different tax
     // treatment; retain each signed amount instead of only the group's net.
     let eligible=false;
     try{const d=optionalCents(p.debitAmount),c=optionalCents(p.creditAmount);eligible=p.transactionType==='Revenue'&&text(p.transactionDate)===text(selected.transactionDate)&&d-c===line.debit-line.credit&&!(d&&c)&&Math.abs(cents(p.postedAmount))===Math.abs(d-c)&&grossAmount===BigInt(d-c)*CENT;}catch{/* Legacy classification remains; this row cannot support replacement. */}
     group.eligible&&=eligible;group.candidates.push({id:key,signedCents:line.debit-line.credit});
    }
    directGroups.set(groupKey,group);
   }else if(vat!==0n){
    // OPERA generates VAT either on net + service or on net alone. Both bases
    // retain the posted VAT; the reconciled SVC generate is never guessed as VAT.
    const rateTolerance=vat%CENT===0n?CENT*107n/2n:100000000n;
    if(strictFullVat&&!wrapperNetComponents?.has(key)&&abs(vat*107n-grossAmount*7n)>rateTolerance)return fail('current_ar_tax_unverified');
    if(abs(vat*107n-grossAmount*7n)>rateTolerance&&abs(vat*100n-net*7n)>rateTolerance){
     if(!packet.nativeTaxControls)return fail('tax_rate_unsupported');
     needsNativeControls=true;
    }
    vatUnits+=vat;
   }else{if(strictFullVat)return fail('current_ar_tax_unverified');nonTaxableUnits+=grossAmount;allNonTaxableDirect=false;}
   rootGross+=grossAmount;
  }
  if(rounded(rootGross)!==line.debit-line.credit)return fail('tax_reconciliation_failed');
 }
 for(const group of directGroups.values()){
  if(group.taxCount){
   // Printed POS net/SVC/VAT rows have already been rounded by OPERA. Verify
   // each exact date/check group within one satang; sum its actual VAT, never
   // calculate replacement VAT or infer a taxable base from a tax percentage.
   if(!group.hasCheck||!group.baseCount)return fail('tax_scope_invalid');
   if(abs(group.vat*100n-group.base*7n)>CENT*100n){
    if(!packet.nativeTaxControls)return fail('tax_rate_unsupported');
    needsNativeControls=true;
   }
  }else{nonTaxableUnits+=group.base;allNonTaxableDirect&&=group.eligible;nonVatCandidates.push(...group.candidates);}
 }
 const debit=sum(lines.map(l=>l.debit)),credit=sum(lines.map(l=>l.credit)),gross=debit-credit-sum(paymentAmounts);
 const vat=rounded(vatUnits);let nonTaxable=rounded(nonTaxableUnits),taxableNet=gross-vat-nonTaxable-excludedFooterCents;
 if(packet.nativeTaxControls?.fullTotals&&packet.nativeTaxControls.nonTaxable!==nonTaxable&&allNonTaxableDirect&&nonVatCandidates.length){
  const qualified=qualifyNativeNonVat({chargeGross:gross,postedVAT:vat,inferredNonVAT:nonTaxable,candidates:nonVatCandidates,fullTotals:packet.nativeTaxControls.fullTotals});
  nonTaxable=qualified.nonTaxable;taxableNet=qualified.taxableNet;needsNativeControls=true;
 }
 if(directQualification==='native'){const totals=packet.nativeTaxControls?.fullTotals;if(!totals||totals.currency!=='THB'||totals.gross!==gross||totals.vat!==vat||totals.net!==taxableNet||totals.nonTaxable!==nonTaxable)return fail('native_nonvat_unverified');}
 if(!Number.isSafeInteger(gross)||!Number.isSafeInteger(taxableNet))return fail('amount_invalid');
 if(currentRules){if(nonTaxable!==0||needsNativeControls||directGroups.size||graphs.length||transfer)return fail('current_ar_tax_unverified');}
 else if(wrapperNetComponents){if(nonTaxable!==0||needsNativeControls||directGroups.size||graphs.length||transfer)return fail('ar_only_wrapper_net_vat_unverified');}
 else if(sourceClaims){if(nonTaxable!==sum([...sourceClaims.values()].filter(c=>c.role==='nonvat').map(c=>c.signedCents))||needsNativeControls||directGroups.size||graphs.length||transfer)return fail('ar_only_source_claims_unverified');}
 else if(zeroVatNetAtoms){if(nonTaxable!==sum([...zeroVatNetAtoms.values()].filter(a=>a.role==='nonvat').map(a=>a.signedCents))||needsNativeControls||directGroups.size||graphs.length||transfer)return fail('ar_only_zero_vat_net_unverified');}
 else if(nonVatAtoms){if(nonTaxable!==sum([...nonVatAtoms.values()])||needsNativeControls||directGroups.size||graphs.length||transfer)return fail('ar_only_nonvat_unverified');}
 else if(posAtoms){if(nonTaxable!==0||needsNativeControls||directGroups.size||graphs.length||transfer)return fail('ar_only_pos_unverified');}
 else if(postedProof){if(nonTaxable!==0||needsNativeControls||directGroups.size||transfer)return fail('ar_only_posted_unverified');}
 else if((simulations.length||graphs.length||transfer||needsNativeControls)&&(!packet.nativeTaxControls||packet.nativeTaxControls.vat!==vat||packet.nativeTaxControls.nonTaxable!==nonTaxable))return fail('ar_tax_unverified');
 const address=optional(optional(a.address).address),addressLines=address.addressLine==null?[]:rowsOfText(address.addressLine),country=optional(address.country);
 const billAddress=[text(a.accountName),...addressLines,[text(address.cityName),text(address.postalCode)].filter(Boolean).join(' '),text(country.value??country.code)].filter(Boolean);if(!billAddress[0])return fail('address_invalid');
 if(packet.arCountryDisplayProof){const selectedCountry=text(country.value??country.code),name=verifyArCountryDisplayProof(packet,packet.arCountryDisplayProof);if(!selectedCountry||billAddress.at(-1)!==selectedCountry)return fail('country_display_unverified');billAddress[billAddress.length-1]=name;}
 const stay=record(reservation.roomStay),ids=rows(reservation.reservationIdList),cashier=optional(i.cashierInfo);
 const guestProfile=optional(i.guestProfileId),reservationGuest=optional(reservation.reservationGuest),guestParts=[text(reservationGuest.givenName),text(reservationGuest.surname)].filter(Boolean);
 const guestName=guestProfile.id!=null&&text(guestProfile.id)===text(reservationGuest.id)&&guestParts.length?guestParts.join(' '):text(i.guestName);
 const voucher=m.hotel==='KAT'?text(i.reference)||text(packet.customReference):text(packet.customReference);
 const printed=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now),part=(type:string)=>printed.find(p=>p.type===type)?.value??'';
 // Display evidence changes derived wrapper labels only, after the complete
 // financial proof has passed. The source packet and all money remain intact.
 if(packet.arRateDisplayProof){const labels=verifyArRateDisplayProof(packet,packet.arRateDisplayProof);for(const line of lines){const label=labels.get(line.id);if(label!==undefined)line.description=label;}}
 // The printed balance belongs to these invoice postings. AR allocations made
 // outside them reduce the account/Statement balance, not this source invoice.
 // sourceNet already reconciles exactly to OPERA's current invoice amount.
 const model:InvoiceModel={hotel:m.hotel,accountId:m.account_id,invoiceId:m.id,folio:m.folio_no,voucher,address:billAddress,company:text(a.accountName),guest:guestName,taxId:text(packet.payeeTaxNumber),room:text(stay.roomId),arrival:dateText(stay.arrivalDate),departure:dateText(stay.departureDate),adults:text(stay.adultCount),children:text(stay.childCount),confirmation:text(ids.find(r=>r.type==='Confirmation')?.id),cashierNo:text(cashier.cashierId),cashierName:text(cashier.cashierName),printDate:`${part('day')}/${part('month')}/${part('year')}`,printTime:`${part('hour')}:${part('minute')}`,lines,debit,credit,gross,taxableNet,nonTaxable,vat,outstanding:sourceNet};
 if(packet.arPosDisplayProof||packet.arPaymentOffsetDisplayProof||packet.arEmbeddedCancellationDisplayProof){
  const region=sourceClaimsVerification?.posRegion,posAuthority=region&&packet.arPosDisplayProof?verifySourceClaimsDisplayMembership(packet,region):region??posAtoms;if(packet.arPosDisplayProof&&!posAuthority)return fail('ar_pos_display_unverified');
  const groups=packet.arPosDisplayProof?[...verifyArPosDisplayProof(packet,packet.arPosDisplayProof,posAuthority!).groups,...verifySelectedWrapperDisplayGroups(packet,packet.arPosDisplayProof)]:[],catalog=packet.arPaymentOffsetDisplayProof?verifyArPaymentOffsetDisplayProof(packet,packet.arPaymentOffsetDisplayProof):undefined,suppression=packet.arEmbeddedCancellationDisplayProof?createEmbeddedCancellationCatalog(packet,packet.arEmbeddedCancellationDisplayProof):packet.arPosDisplayProof?createPosDisplaySuppressionCatalog(packet,packet.arPosDisplayProof):undefined,sourceDates=new Map(postings.map(p=>[String(p.transactionNo),text(p.transactionDate)]));return deriveInvoiceDisplayModel(model,groups,sourceDates,catalog,suppression);
 }
 return model;
}
function rowsOfText(v:unknown):string[]{if(!Array.isArray(v))return fail('address_invalid');return v.map(text);}
