import {readVerifiedDirectZeroClaims,type VerifiedDirectZeroClaims} from './ar-only-zero-vat-net-proof';
import {amountCents} from '../opera/normalize';
import {canonical} from './ar-tax';
import {arOnlyTaxSource,type CurrentArTaxSource} from './current-ar-tax';
import type {InvoicePacket} from './model';
type Row=Record<string,unknown>;
export type PosRole='base'|'service'|'vat'|'fee'|'discount';
export interface ArOnlyPosDefinition {before:unknown;after:unknown}
export interface ArOnlyPosProof {version:1;kind:'ar-only-direct-pos-vat7';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource;definitions:ArOnlyPosDefinition[]}
export interface ArOnlyPosAtom {id:string;code:string;selected:Row;posting:Row;definition:Row;signedCents:number;group:string}
const fail=(category:string):never=>{throw Error('document_invoice_ar_only_pos_unverified:'+category);};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail('shape');
const rows=(v:unknown):Row[]=>Array.isArray(v)?v.map(object):fail('shape');
const text=(v:unknown)=>v==null?'':String(v).trim();
const id=(v:unknown)=>{const s=text(v);return /^[1-9][0-9]{0,15}$/.test(s)?s:fail('identity');};
const signed=(p:Row)=>{const d=p.debitAmount===undefined?0:amountCents(p.debitAmount,'THB'),c=p.creditAmount===undefined?0:amountCents(p.creditAmount,'THB');if(!d&&!c||d&&c)fail('amount');return d-c;};
const hasTaxes=(e:Row)=>{const b=object(e.postingBreakdown);return b.taxes!==undefined&&rows(b.taxes).length>0;};
const reservation=(p:Row)=>text(object(object(p.guestInfo).reservationId).id);
/** Cashier is deliberately absent: it may reject an ambiguous check, never
 * subdivide a check until its amounts happen to agree with seven percent. */
export const arOnlyPosGroupKey=(p:Row)=>JSON.stringify([p.hotelId,reservation(p),text(p.folioNo),p.folioWindowNo??null,p.transactionDate,text(p.checkNo)]);
const receiptKey=(p:Row)=>JSON.stringify([p.hotelId,reservation(p),text(p.folioNo),p.transactionDate,text(p.checkNo)]);
const knownWindow=(p:Row)=>Number.isSafeInteger(p.folioWindowNo)&&Number(p.folioWindowNo)>0;
const cashier=(p:Row)=>p.cashierInfo===undefined?undefined:object(p.cashierInfo).cashierId;
/** Inspect only exact selected atoms. The full paginated reservation response
 * supplies a closure check, never additional invoice money. */
export function inspectArOnlyPos(packet:InvoicePacket):ArOnlyPosAtom[]{return inspectArOnlyPosSource(packet,new Set());}
export function inspectArOnlyPosRemainder(packet:InvoicePacket,token:VerifiedDirectZeroClaims):ArOnlyPosAtom[]{return inspectArOnlyPosSource(packet,new Set(readVerifiedDirectZeroClaims(packet,token).keys()));}
function inspectArOnlyPosSource(packet:InvoicePacket,excluded:ReadonlySet<string>):ArOnlyPosAtom[]{
 const m=packet.manifest,data=object(packet.postings),selected=rows(data.invoicePostingsDetails),definitions=rows(data.trxCodesInfo),entries=packet.taxRows.map(object),byId=new Map<string,Row>();
 for(const entry of entries){const key=id(object(entry.posting).transactionNo);if(byId.has(key))fail('duplicate-posted-id');byId.set(key,entry);}
 const ids=new Set<string>(),atoms:ArOnlyPosAtom[]=[];
 for(const s of selected){const key=id(s.transactionNo);if(ids.has(key))fail('duplicate-selected-id');ids.add(key);if(excluded.has(key)){if(!byId.has(key))fail('exclusion-source');continue;}const entry=byId.get(key);if(!entry)continue;const p=object(entry.posting);
  if(p.transactionType==='Wrapper'||p.transactionType==='Payment')continue;
  if(hasTaxes(entry))continue;
  const check=text(s.checkNo),amount=signed(s),breakdown=object(entry.postingBreakdown),matches=definitions.filter(d=>d.hotelId===m.hotel&&d.transactionCode===s.transactionCode);
  if(matches.length!==1||p.transactionType!=='Revenue'||p.hotelId!==m.hotel||reservation(p)!==m.reservation_id||text(p.folioNo)!==m.folio_no||p.transactionCode!==s.transactionCode||p.transactionDate!==s.transactionDate||!check||text(p.checkNo)!==check||!knownWindow(p))fail('scope');
  if(s.folioWindowNo!==undefined&&p.folioWindowNo!==undefined&&s.folioWindowNo!==p.folioWindowNo||cashier(s)!==undefined&&cashier(p)!==undefined&&canonical(cashier(s))!==canonical(cashier(p)))fail('scope');
  if(signed(p)!==amount||amountCents(p.postedAmount,'THB')!==amount||amountCents(breakdown.grossAmount,'THB')!==amount||amountCents(breakdown.netAmount,'THB')!==amount||object(breakdown.grossAmount).amount!==amount/100||object(breakdown.netAmount).amount!==amount/100)fail('amount');
  if(p.transactionAmount!==undefined&&p.transactionAmount!==amount/100)fail('amount');
  for(const view of [s,p]){if(view.transactionType!==undefined&&view.transactionType!=='Revenue'||view.paidOut!==undefined&&view.paidOut!==false)fail('scope');if(view.transactionAmount!==undefined&&view.transactionAmount!==amount/100||view.postedAmount!==undefined&&(amountCents(view.postedAmount,'THB')!==amount||object(view.postedAmount).amount!==amount/100))fail('amount');if(view.financialTransactionIdList!==undefined&&(!Array.isArray(view.financialTransactionIdList)||view.financialTransactionIdList.length)||view.groupTypeInfo!==undefined&&Object.keys(object(view.groupTypeInfo)).length)fail('nested-posting');if(view.deferredTax!==undefined&&view.deferredTax!==false||view.subPostings!==undefined&&rows(view.subPostings).length||view.referenceTransactionNo!==undefined||view.referencePackageTransactionNo!==undefined)fail('nested-posting');}
  atoms.push({id:key,code:String(s.transactionCode),selected:s,posting:p,definition:matches[0],signedCents:amount,group:arOnlyPosGroupKey(p)});
 }
 if([...excluded].some(id=>!ids.has(id)))fail('exclusion-coverage');
 const owned=new Set(atoms.map(a=>a.id));
 let membershipBudget=0;const memberClosure=(raw:unknown,depth=0):void=>{if(++membershipBudget>20000||depth>8)fail('membership-closure');if(raw==null)return;if(Array.isArray(raw)){for(const value of raw)memberClosure(value,depth+1);return;}const row=object(raw);if(row.financialTransactionIdList!==undefined){const members=Array.isArray(row.financialTransactionIdList)?row.financialTransactionIdList:[row.financialTransactionIdList];for(const member of members){if(++membershipBudget>20000)fail('membership-closure');const key=member&&typeof member==='object'&&!Array.isArray(member)?text((member as Row).id):text(member);if(owned.has(key))fail('linked-membership');}}for(const field of ['posting','postingBreakdown','taxes','subPostings'])if(row[field]!==undefined)memberClosure(row[field],depth+1);};memberClosure(selected);memberClosure(entries);
 for(const entry of entries){const p=object(entry.posting);for(const field of ['referenceTransactionNo','referencePackageTransactionNo'])if(p[field]!==undefined&&owned.has(text(p[field])))fail('linked-descendant');}
 const groups=new Set(atoms.map(a=>a.group)),receipts=new Set(atoms.map(a=>receiptKey(a.posting)));
 for(const entry of entries){const p=object(entry.posting);if(ids.has(id(p.transactionNo))||!['Revenue','Tax'].includes(text(p.transactionType))||!text(p.checkNo))continue;
  if(groups.has(arOnlyPosGroupKey(p))||!knownWindow(p)&&receipts.has(receiptKey(p)))fail('unselected-check-sibling');
 }
 for(const group of groups){const identities=atoms.filter(a=>a.group===group).flatMap(a=>[cashier(a.selected),cashier(a.posting)]).filter(v=>v!==undefined).map(canonical);if(new Set(identities).size>1)fail('cashier-ambiguity');}
 return atoms;
}
export function verifyArOnlyPosMetadata(atom:ArOnlyPosAtom,evidence:ArOnlyPosDefinition,hotel:string){
 if(canonical(evidence.before)!==canonical(evidence.after))fail('metadata-changed');
 const d=object(object(evidence.before).transactionCode),classification=object(d.classification),setup=object(d.trxSetup),group=object(classification.group).code,type=object(classification.transactionType).code;
 if(d.hotelId!==hotel||d.code!==atom.code||classification.type!=='Revenue'||group!==atom.definition.transactionGroup||setup.nonTaxable!==false||setup.taxInclusive!==false||d.compTransaction===true)fail('metadata-scope');
 if(d.generatesSetup!==undefined&&object(d.generatesSetup).generates!==undefined&&rows(object(d.generatesSetup).generates).length||d.associatedTransactionCodes!==undefined&&rows(d.associatedTransactionCodes).length)fail('metadata-descendants');
 return {definition:d,group,type};
}
export function verifyArOnlyPosDefinition(atom:ArOnlyPosAtom,evidence:ArOnlyPosDefinition,hotel:string):PosRole{
 const {definition:d,group,type}=verifyArOnlyPosMetadata(atom,evidence,hotel);
 if(type==='Tax'&&['TAX','F&B'].includes(String(group))&&/\bVAT\b/i.test(text(object(d.description).defaultText)))return 'vat';
 if(type==='NonRevenue'&&group==='SVC')return 'service';
 if(type==='FoodAndBeverage'&&['F&B','RM'].includes(String(group)))return 'base';
 return fail('role');
}
export function arOnlyPosPartitionFailure(atoms:ArOnlyPosAtom[],result:ReadonlyMap<string,{role:PosRole;signedCents:number}>):('partition-coverage'|'partition-vat'|undefined){
 if(result.size!==atoms.length)return 'partition-coverage';
 const groups=new Map<string,{base:number;vat:number;baseCount:number;vatCount:number}>();
 for(const atom of atoms){const entry=result.get(atom.id);if(!entry||entry.signedCents!==atom.signedCents)return 'partition-coverage';const r=entry!.role,key=JSON.stringify([atom.group,Math.sign(atom.signedCents)]),group=groups.get(key)??{base:0,vat:0,baseCount:0,vatCount:0};
  if(r==='vat'){group.vat+=atom.signedCents;group.vatCount++;}else{group.base+=atom.signedCents;if(r==='base')group.baseCount++;}groups.set(key,group);
 }
 for(const group of groups.values())if(!group.baseCount||group.vatCount!==1||!Number.isSafeInteger(group.base)||!Number.isSafeInteger(group.vat)||BigInt(group.vat)*100n-BigInt(group.base)*7n>100n||BigInt(group.base)*7n-BigInt(group.vat)*100n>100n)return 'partition-vat';
}
export function verifyArOnlyPosPartitions(atoms:ArOnlyPosAtom[],result:ReadonlyMap<string,{role:PosRole;signedCents:number}>):void{const reason=arOnlyPosPartitionFailure(atoms,result);if(reason)fail(reason);}

export function verifyArOnlyPosProof(packet:InvoicePacket):Map<string,{role:PosRole;signedCents:number}>{
 const proof=packet.arOnlyPosProof??fail('envelope');
 if(proof.version!==1||proof.kind!=='ar-only-direct-pos-vat7'||'nativeTaxControls'in packet||packet.currentArTaxProof||packet.arOnlyPostedProof||packet.arPostedGenerates?.length||packet.arDetails?.length||packet.arTransfer||packet.embeddedGenerateProof||packet.directZeroTaxProof||packet.arSimulations?.length)fail('envelope');
 const source=canonical(arOnlyTaxSource(packet));if(canonical(proof.sourceBefore)!==source||canonical(proof.sourceAfter)!==source)fail('source');
 const atoms=inspectArOnlyPos(packet),codes=[...new Set(atoms.map(a=>a.code))];if(!atoms.length||!Array.isArray(proof.definitions)||proof.definitions.length!==codes.length)fail('metadata-coverage');
 const definitions=new Map<string,ArOnlyPosDefinition>();for(const e of proof.definitions){const code=text(object(object(e.before).transactionCode).code);if(definitions.has(code)||!codes.includes(code))fail('metadata-coverage');definitions.set(code,e);}
 const result=new Map<string,{role:PosRole;signedCents:number}>();
 for(const atom of atoms)result.set(atom.id,{role:verifyArOnlyPosDefinition(atom,definitions.get(atom.code)??fail('metadata-coverage'),packet.manifest.hotel),signedCents:atom.signedCents});
 verifyArOnlyPosPartitions(atoms,result);
 return result;
}
