import {invoiceModel,type InvoicePacket} from './model';
import {canonical} from './ar-tax';
import {arOnlyTaxSource} from './current-ar-tax';
import {sourceClaimsDisplayFinancialPacket} from './source-claims-display-membership';
import {invoiceDisplayReference} from './display-reference';
import {amountCents} from '../opera/normalize';
import {comparePosDisplayGroups,inspectPosDisplayPages,type ArPosDisplayProof,type VerifiedPosDisplayGroup} from './pos-display-proof';
type Row=Record<string,unknown>;
const fail=():never=>{throw Error('document_invoice_selected_wrapper_display_unverified');};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail();
const rows=(v:unknown):Row[]=>Array.isArray(v)&&v.length<=4000?v.map(object):fail();
const text=(v:unknown,max=2000)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v)?v:fail();
const id=(v:unknown)=>{const value=typeof v==='number'&&Number.isSafeInteger(v)?String(v):text(v,16);return /^[1-9][0-9]{0,15}$/.test(value)?value:fail();};
const amount=(v:unknown)=>v===undefined?0:amountCents(v,'THB');
const cashier=(p:Row)=>{const value=object(p.cashierInfo).cashierId;return Number.isSafeInteger(value)&&Number(value)>=0?value:fail();};
/** Empirical TSAN display membership, after the unchanged whole financial pass.
 * No source row is hidden or granted financial authority by this certificate. */
export function verifySelectedWrapperDisplayGroups(packet:InvoicePacket,proof:ArPosDisplayProof):VerifiedPosDisplayGroup[]{
 if(packet.manifest.hotel!=='TSAN')return [];
 const financial=invoiceModel(sourceClaimsDisplayFinancialPacket(packet)),source=canonical(arOnlyTaxSource(packet));
 if(!proof||proof.version!==1||proof.kind!=='ar-pos-checkno-source-display'||canonical(proof.sourceBefore)!==source||canonical(proof.sourceAfter)!==source||!Array.isArray(proof.contexts)||proof.contexts.length>8)return fail();
 const m=packet.manifest,selected=rows(object(packet.postings).invoicePostingsDetails),entries=packet.taxRows.map(object),byId=new Map<string,Row>(),sources=new Map<string,Row>(),groups:VerifiedPosDisplayGroup[]=[],owned=new Set<string>(),contexts=new Set<string>();
 for(const s of selected){const key=id(s.transactionNo);if(byId.has(key))return fail();byId.set(key,s);}for(const e of entries){const key=id(object(e.posting).transactionNo);if(sources.has(key))return fail();sources.set(key,e);}
 for(const c of proof.contexts){
  const context=JSON.stringify([c.hotel,c.reservationId,c.folioWindowNo]);if(contexts.has(context)||c.hotel!==m.hotel||c.reservationId!==m.reservation_id||canonical(c.before)!==canonical(c.after))return fail();contexts.add(context);
  const parsed=inspectPosDisplayPages(c,c.before);
  for(const [groupId,header]of parsed.headers){
   const members=parsed.members.get(groupId)!;
   if(!members.some(s=>byId.has(id(s.transactionNo))&&object(sources.get(id(s.transactionNo))?.posting).transactionType==='Wrapper'))continue;
   const ids=members.map(s=>id(s.transactionNo)),references=new Set<string>(),types=new Set<string>();let day:string|undefined,check:string|undefined,groupCashier:unknown,eligible=true;
   for(const member of members){
    const key=id(member.transactionNo),s=byId.get(key)??fail(),entry=sources.get(key)??fail(),p=object(entry.posting),type=text(p.transactionType),b=entry.postingBreakdown===undefined?undefined:object(entry.postingBreakdown),taxes=b?.taxes===undefined?[]:rows(b.taxes),debit=amount(s.debitAmount),credit=amount(s.creditAmount),line=financial.lines.find(l=>l.id===key),reference=text(s.reference??''),memberDay=text(s.transactionDate,10),memberCheck=text(s.checkNo,80);
    if(!['Wrapper','Revenue'].includes(type)||type==='Revenue'&&!taxes.length||debit<=0||credit)eligible=false;
    if(owned.has(key)||debit<0||credit<0||debit&&credit||!line||line.debit!==debit||line.credit!==credit||p.hotelId!==m.hotel||String(p.folioNo)!==m.folio_no||id(object(object(p.guestInfo).reservationId).id)!==m.reservation_id||p.folioWindowNo!==c.folioWindowNo||p.transactionDate!==memberDay||p.checkNo!==memberCheck||!memberCheck.trim()||p.transactionCode!==s.transactionCode||member.transactionCode!==s.transactionCode||member.transactionDate!==memberDay||member.checkNo!==memberCheck||text(p.reference??'').trim()!==reference.trim()||text(member.reference??'').trim()!==reference.trim()||cashier(s)!==cashier(p)||cashier(s)!==cashier(member)||amount(p.debitAmount)!==debit||amount(p.creditAmount)!==credit)return fail();
    if(day!==undefined&&(day!==memberDay||check!==memberCheck||groupCashier!==cashier(s)))return fail();day=memberDay;check=memberCheck;groupCashier=cashier(s);types.add(type);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)return fail();
    for(const v of [s,p]){
     if(v.hotelId!==undefined&&v.hotelId!==m.hotel||v.folioNo!==undefined&&String(v.folioNo)!==m.folio_no||v.folioWindowNo!==undefined&&v.folioWindowNo!==c.folioWindowNo||v.transactionType!==undefined&&v.transactionType!==type||v.postedAmount!==undefined&&amount(v.postedAmount)!==debit-credit||v.transactionAmount!==undefined&&v.transactionAmount!==(debit-credit)/100||v.paidOut!==undefined&&v.paidOut!==false||v.deferredTax!==undefined&&v.deferredTax!==false||v.referenceTransactionNo!==undefined||v.financialTransactionIdList!==undefined||v.groupTypeInfo!==undefined||v.subPostings!==undefined&&rows(v.subPostings).length)return fail();
     if(type==='Revenue'&&v.referencePackageTransactionNo!==undefined||type==='Wrapper'&&v.referencePackageTransactionNo!==undefined&&id(v.referencePackageTransactionNo)!==id(p.referencePackageTransactionNo))return fail();
    }
    for(const v of [entry,...b?[b]:[]])if(v.financialTransactionIdList!==undefined||v.groupTypeInfo!==undefined||v.subPostings!==undefined&&rows(v.subPostings).length)return fail();
    if(type==='Wrapper')id(p.referencePackageTransactionNo);else if(b&&amount(b.grossAmount)!==debit-credit)return fail();
    const projected=invoiceDisplayReference(memberCheck,reference);if(!projected.trim())return fail();references.add(projected);
    const locations=c.before.flatMap(raw=>rows(object(raw).windows).filter(w=>w.section==='current').flatMap(w=>rows(w.folios)).flatMap(f=>rows(f.postings).filter(r=>r.groupTypeInfo!==undefined&&object(r.groupTypeInfo).subGroupId===groupId&&id(r.transactionNo)===key).map(()=>f)));if(locations.length!==1||String(locations[0].folioNo)!==m.folio_no)return fail();
   }
   if(selected.some(s=>s.transactionDate===day&&s.checkNo===check&&object(sources.get(id(s.transactionNo))?.posting).folioWindowNo===c.folioWindowNo&&!ids.includes(id(s.transactionNo))))return fail();
   if(header.transactionDate!==day||header.checkNo!==check||cashier(header)!==groupCashier||!ids.includes(id(header.transactionNo)))return fail();
   if(!eligible||!types.has('Wrapper')||!types.has('Revenue'))continue;
   if(references.size!==1)return fail();
   const description=text(object(header.groupTypeInfo).groupDescription).trim();if(!description)return fail();ids.forEach(key=>owned.add(key));groups.push({representativeId:id(header.transactionNo),sourceIds:ids.sort((a,b)=>BigInt(a)<BigInt(b)?-1:1),date:day!,description,reference:[...references][0]});
  }
 }
 // Independent financial membership declarations cannot also own these roots.
 const children=new Map<string,string>();for(const key of owned){const e=sources.get(key)!,p=object(e.posting);if(p.transactionType==='Revenue')for(const child of rows(object(e.postingBreakdown).taxes)){const childId=id(child.transactionNo);if(children.has(childId)||owned.has(childId))return fail();children.set(childId,key);}}
 let budget=0;const reverse=(raw:unknown,depth=0):void=>{if(++budget>20000||depth>8)return fail();if(raw==null)return;if(Array.isArray(raw)){raw.forEach(v=>reverse(v,depth+1));return;}const v=object(raw);if(v.referenceTransactionNo!==undefined){const parent=id(v.referenceTransactionNo);if(owned.has(parent)&&children.get(id(v.transactionNo))!==parent)return fail();}if(v.referencePackageTransactionNo!==undefined&&owned.has(id(v.referencePackageTransactionNo)))return fail();if(v.financialTransactionIdList!==undefined){const list=Array.isArray(v.financialTransactionIdList)?v.financialTransactionIdList:[v.financialTransactionIdList];for(const member of list){const key=id(member&&typeof member==='object'?object(member).id:member);if(owned.has(key))return fail();}}for(const key of ['posting','postingBreakdown','taxes','subPostings'])if(v[key]!==undefined)reverse(v[key],depth+1);};if(owned.size){reverse(selected);reverse(entries);}
 return groups.sort(comparePosDisplayGroups);
}
