import {amountCents} from '../opera/normalize';
import {canonical} from './ar-tax';
import {verifyCurrentArRuleWitnesses,type CurrentArRulePair} from './ar-current-rule-witness';
import {discoverTransferredCurrentArRoots} from './ar-only-transferred-current-rule-claims';
import {verifyTransferProjectionCalculation,type TransferProjectionCalculation} from './transfer-projection-calculation';
import {verifyPostedEmbeddedVatClaims,type PostedEmbeddedVatComponent,type PostedEmbeddedRootClaim} from './ar-only-posted-wrapper-claims';
import {verifyArOnlyWrapperOwnership} from './ar-only-wrapper-net-vat-proof';
import type {InvoicePacket} from './model';

export interface SameAccountArAdjustmentComponent {kind:'same-account-current-ar-adjustment-vat7';roots:TransferProjectionCalculation[]}
export interface SameAccountArAdjustmentClaim {role:'taxable';component:'same-account-current-ar-adjustment-vat7';sourceKind:'ar-detail';signedCents:number;projectedVatUnits:bigint}
type Row=Record<string,unknown>;
const fail=():never=>{throw Error('document_invoice_ar_only_wrapper_adjustment_unverified');};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail();
const rows=(v:unknown):Row[]=>Array.isArray(v)?v.map(object):fail();
const id=(v:unknown)=>{const key=String(v);return /^[1-9][0-9]{0,15}$/.test(key)?key:fail();};
const only=(v:Row,keys:string[])=>{if(Object.keys(v).some(k=>!keys.includes(k)))fail();};
const empty=(v:unknown)=>v===undefined||Array.isArray(v)&&v.length===0;
const day=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
function signed(p:Row):number{
 let total=0;for(const [key,sign]of [['debitAmount',1],['creditAmount',-1]] as const){if(p[key]===undefined)continue;const m=object(p[key]),n=amountCents(m,'THB');if(m.amount!==n/100)fail();total+=n*sign;}
 if(!Number.isSafeInteger(total)||!total||p.debitAmount!==undefined&&p.creditAmount!==undefined&&amountCents(p.debitAmount,'THB')&&amountCents(p.creditAmount,'THB'))fail();return total;
}

/** Read planning and region derivation use raw, exact AR ownership. Callers
 * cannot supply exclusion IDs or move an arbitrary reservation row into AR. */
export function inspectWrapperArAdjustmentRegion(packet:InvoicePacket):{roots:Row[];reservation:InvoicePacket}{
 if(packet.arTransfer||packet.manifest.collection_role!=='standalone')fail();
 const selected=rows(object(packet.postings).invoicePostingsDetails),roots=discoverTransferredCurrentArRoots(packet),account=object(packet.account),m=packet.manifest;
 const owned=new Set(roots.map(r=>id(r.transactionNo)));if(!owned.size||!day(m.folio_date))fail();
 for(const root of roots){const key=id(root.transactionNo),s=selected.find(v=>id(v.transactionNo)===key)??fail(),amount=signed(s),info=object(root.aRInfo);
  if(amount>=0||signed(root)!==amount||root.transactionType!=='Revenue'||root.deferredTax!==false||String(info.accountNumber)!==String(account.accountNo)||String(info.invoiceNo)!==m.invoice_no||String(root.folioNo)!==m.folio_no||root.transactionCode!==s.transactionCode||!day(root.transactionDate)||root.transactionDate!==s.transactionDate||String(root.transactionDate)<=m.folio_date!)fail();
  if(amountCents(root.postedAmount,'THB')!==amount||object(root.postedAmount).amount!==amount/100)fail();
  for(const v of [s,root]){
   if(v.transactionType!==undefined&&v.transactionType!=='Revenue'||v.transactionAmount!==undefined&&v.transactionAmount!==amount/100||v.hotelId!==undefined&&v.hotelId!==m.hotel||v.folioNo!==undefined&&String(v.folioNo)!==m.folio_no||v.paidOut!==undefined&&v.paidOut!==false||v.deferredTax!==undefined&&v.deferredTax!==false||v.referenceTransactionNo!==undefined||v.referencePackageTransactionNo!==undefined||!empty(v.subPostings)||!empty(v.financialTransactionIdList)||v.groupTypeInfo!==undefined&&Object.keys(object(v.groupTypeInfo)).length)fail();
   if(v.postedAmount!==undefined&&(amountCents(v.postedAmount,'THB')!==amount||object(v.postedAmount).amount!==amount/100))fail();
   if(v.folioWindowNo!==undefined&&(!Number.isSafeInteger(v.folioWindowNo)||Number(v.folioWindowNo)<1)||v.internalFolioWindowID!==undefined&&String(v.internalFolioWindowID)!==String(object(packet.invoice).internalFolioWindowID))fail();
   if(v.guestInfo!==undefined&&String(object(object(v.guestInfo).reservationId).id)!==m.reservation_id)fail();
   if(v.reservationId!==undefined&&String(object(v.reservationId).id)!==m.reservation_id)fail();
  }
  for(const field of ['folioWindowNo','cashierInfo','reference','remark'])if(s[field]!==undefined&&root[field]!==undefined&&canonical(s[field])!==canonical(root[field]))fail();
 }
 let budget=0;const scan=(v:unknown,depth=0):void=>{
  if(++budget>20000||depth>8)fail();if(v==null)return;if(Array.isArray(v)){for(const item of v)scan(item,depth+1);return;}const r=object(v);
  if(r.transactionNo!==undefined&&owned.has(id(r.transactionNo)))fail();
  for(const key of ['referenceTransactionNo','referencePackageTransactionNo'])if(r[key]!==undefined&&owned.has(String(r[key])))fail();
  if(r.financialTransactionIdList!==undefined){const list=Array.isArray(r.financialTransactionIdList)?r.financialTransactionIdList:[r.financialTransactionIdList];for(const member of list){const key=member&&typeof member==='object'?String(object(member).id):String(member);if(owned.has(key))fail();}}
  for(const key of ['posting','postingBreakdown','taxes','subPostings'])if(r[key]!==undefined)scan(r[key],depth+1);
 };
 for(const row of packet.taxRows)scan(row);for(const s of selected)if(!owned.has(id(s.transactionNo)))scan(s);
 const reservation={...packet,postings:{...object(packet.postings),invoicePostingsDetails:selected.filter(s=>!owned.has(id(s.transactionNo)))},arDetails:[]};
 verifyArOnlyWrapperOwnership(reservation);return {roots,reservation};
}

/** Current rules/calculators corroborate only the original signed AR gross.
 * The projected VAT never creates posted tax IDs or changes Invoice amounts. */
export function verifyWrapperArAdjustmentClaims(packet:InvoicePacket,posted:PostedEmbeddedVatComponent,adjustment:SameAccountArAdjustmentComponent):Map<string,PostedEmbeddedRootClaim|SameAccountArAdjustmentClaim>{
 only(object(adjustment),['kind','roots']);if(adjustment.kind!=='same-account-current-ar-adjustment-vat7'||!Array.isArray(adjustment.roots))fail();
 const {roots,reservation}=inspectWrapperArAdjustmentRegion(packet),selected=rows(object(packet.postings).invoicePostingsDetails),pairs:CurrentArRulePair[]=[];
 if(adjustment.roots.length!==roots.length||new Set(adjustment.roots.map(e=>e.postingId)).size!==roots.length||!Array.isArray(posted.components))fail();
 for(const e of [...posted.components,...adjustment.roots]){if(!Array.isArray(e.generatedRules)||!Array.isArray(e.generatedRulesAfter)||e.generatedRules.length!==e.generatedRulesAfter.length)fail();pairs.push({before:e.rules,after:e.rulesAfter},...e.generatedRules.map((before,n)=>({before,after:e.generatedRulesAfter[n]})));}
 verifyCurrentArRuleWitnesses(packet.manifest.hotel,pairs);
 const result=new Map<string,PostedEmbeddedRootClaim|SameAccountArAdjustmentClaim>(verifyPostedEmbeddedVatClaims(reservation,posted));
 for(const root of roots){const key=id(root.transactionNo),e=adjustment.roots.find(e=>e.postingId===key)??fail(),s=selected.find(s=>id(s.transactionNo)===key)??fail(),amount=signed(s),d=object(object(e.rules).transactionCode),classification=object(d.classification),setup=object(d.trxSetup);
  only(object(e),['postingId','rules','rulesAfter','generatedRules','generatedRulesAfter','calculation','calculationAfter']);
  if(d.code!==root.transactionCode||d.hotelId!==packet.manifest.hotel||classification.type!=='Revenue'||object(classification.transactionType).code!=='Lodging'||object(classification.group).code!=='RM'||setup.manualPosting!==true||setup.generatesType!=='INCLUSIVE'||setup.taxInclusive!==true||setup.nonTaxable!==false||d.compTransaction!==false||!empty(d.associatedTransactionCodes)||!empty(d.transactionAdjustments))fail();
  const defs=rows(object(packet.postings).trxCodesInfo).filter(v=>v.hotelId===packet.manifest.hotel&&v.transactionCode===root.transactionCode),ar=(packet.arDetails??[]).flatMap(p=>rows(object(p.response).trxCodesInfo)).filter(v=>v.hotelId===packet.manifest.hotel&&v.transactionCode===root.transactionCode);
  if(defs.length!==1||!ar.length||defs[0].transactionGroup!=='RM'||ar.some(v=>v.transactionGroup!=='RM')||new Set(ar.map(canonical)).size!==1)fail();
  for(const raw of e.generatedRules){
   const leaf=object(object(raw).transactionCode),lc=object(leaf.classification),kind=object(lc.transactionType),group=object(lc.group).code,ls=object(leaf.trxSetup),lg=object(leaf.generatesSetup);
   if(lc.type!=='Revenue'||ls.taxInclusive!==false||ls.nonTaxable!==false||ls.manualPosting!==false||ls.generatesType!==undefined||leaf.compTransaction!==false||!empty(leaf.associatedTransactionCodes)||!empty(leaf.transactionAdjustments)||!empty(lg.generates))fail();
   only(lg,['addBaseAmtTo','generates']);const flags=object(lg.addBaseAmtTo);only(flags,['bucket1','bucket2','bucket3']);if([1,2,3].some(n=>flags['bucket'+n]!==false))fail();
   if(group==='SVC'){if(kind.code!=='NonRevenue'||Object.hasOwn(kind,'taxCode'))fail();}
   else if(group==='TAX'){if(kind.code!=='Tax'||!Number.isSafeInteger(kind.taxCode)||Number(kind.taxCode)<1||Number(kind.taxCode)>20||!/\bVAT\b/i.test(String(object(leaf.description).defaultText)))fail();}
   else fail();
  }
  const {projectedVatUnits}=verifyTransferProjectionCalculation(e,packet.manifest.hotel,String(root.transactionCode),amount/100);
  if(result.has(key))fail();result.set(key,{role:'taxable',component:'same-account-current-ar-adjustment-vat7',sourceKind:'ar-detail',signedCents:amount,projectedVatUnits});
 }
 return result;
}
