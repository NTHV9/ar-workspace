import {canonical} from './ar-tax';
import {discoverWrapperNetVat,verifyArOnlyWrapperOwnership,type ArOnlyWrapperNetVatComponent,type WrapperNetVatCandidate} from './ar-only-wrapper-net-vat-proof';
import {precise,rounded,abs} from './money-precision';
import type {InvoicePacket} from './model';
export interface PostedEmbeddedVatComponent {kind:'posted-embedded-vat';components:ArOnlyWrapperNetVatComponent[]}
export interface PostedEmbeddedRootClaim {role:'taxable';component:'posted-embedded-vat';sourceKind:'reservation-wrapper';signedCents:number;actualPostedVatUnits:bigint}
type Row=Record<string,unknown>;
const fail=():never=>{throw Error('document_invoice_posted_wrapper_claims_unverified');};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail();
const rows=(v:unknown):Row[]=>Array.isArray(v)?v.map(object):fail();
const id=(v:unknown)=>{const s=String(v);return /^[1-9][0-9]{0,15}$/.test(s)?s:fail();};
const only=(v:Row,keys:string[])=>{if(Object.keys(v).some(k=>!keys.includes(k)))fail();};
const empty=(v:unknown)=>v===undefined||Array.isArray(v)&&!v.length;
/** A nominal relation selects reads only. Every member of an affected package
 * is subsequently proved from its original posted tree and actual amounts. */
export function discoverPostedWrapperRegion(packet:InvoicePacket):WrapperNetVatCandidate[]{
 const affected=new Set(discoverWrapperNetVat(packet).map(c=>c.wrapperId)),selected=rows(object(packet.postings).invoicePostingsDetails),source=packet.taxRows.map(object),result:WrapperNetVatCandidate[]=[];
 for(const s of selected){if(!affected.has(id(s.transactionNo)))continue;const entry=source.find(e=>id(object(e.posting).transactionNo)===id(s.transactionNo))??fail(),root=object(entry.posting),reference=id(root.referencePackageTransactionNo);
  for(const raw of source){const p=object(raw.posting);if(p.transactionType==='Wrapper'||String(p.referencePackageTransactionNo)!==reference)continue;const breakdown=object(raw.postingBreakdown);result.push({wrapperId:id(s.transactionNo),packageReference:reference,posting:p,breakdown,taxes:breakdown.taxes===undefined?[]:rows(breakdown.taxes)});}
 }
 return result;
}
/** The same selected wrapper assertions apply before either supported read
 * strategy. Omitted fields are not invented; source ownership is validated first. */
export function verifySelectedWrapperSourceAssertions(packet:InvoicePacket):void{
 const source=packet.taxRows.map(object);for(const s of rows(object(packet.postings).invoicePostingsDetails)){const matches=source.filter(e=>String(object(e.posting).transactionNo)===String(s.transactionNo));if(matches.length!==1)fail();const p=object(matches[0].posting);if(p.transactionType!=='Wrapper')continue;const reference=id(p.referencePackageTransactionNo);if(s.deferredTax!==undefined&&s.deferredTax!==false||s.referenceTransactionNo!==undefined||s.subPostings!==undefined&&(!Array.isArray(s.subPostings)||s.subPostings.length)||s.referencePackageTransactionNo!==undefined&&String(s.referencePackageTransactionNo)!==reference)fail();}
}
const flags=(raw:unknown)=>{const f=object(raw);only(f,['bucket1','bucket2','bucket3']);if([1,2,3].some(n=>typeof f['bucket'+n]!=='boolean'))fail();return f;};
export function verifyPostedEmbeddedVatClaims(packet:InvoicePacket,evidence:PostedEmbeddedVatComponent):Map<string,PostedEmbeddedRootClaim>{
 only(object(evidence),['kind','components']);if(evidence.kind!=='posted-embedded-vat')fail();verifyArOnlyWrapperOwnership(packet);verifySelectedWrapperSourceAssertions(packet);
 const candidates=discoverPostedWrapperRegion(packet);if(!candidates.length||!Array.isArray(evidence.components)||evidence.components.length!==candidates.length||new Set(evidence.components.map(c=>c.componentId)).size!==candidates.length)fail();
 const definitions=new Map<string,string>(),owned=new Set<string>(),vatByWrapper=new Map<string,bigint>(),selected=rows(object(packet.postings).invoicePostingsDetails),hotel=packet.manifest.hotel;
 const definition=(raw:unknown,after:unknown)=>{if(canonical(raw)!==canonical(after))fail();const d=object(object(raw).transactionCode);if(d.hotelId!==hotel||typeof d.code!=='string')fail();const key=JSON.stringify([hotel,d.code]),fingerprint=canonical(raw),previous=definitions.get(key);if(previous!==undefined&&previous!==fingerprint)fail();definitions.set(key,fingerprint);return d;};
 for(const c of candidates){const e=evidence.components.find(e=>e.componentId===id(c.posting.transactionNo))??fail();only(object(e),['wrapperId','packageReference','componentId','generateIds','rules','rulesAfter','generatedRules','generatedRulesAfter']);
  if(e.wrapperId!==c.wrapperId||e.packageReference!==c.packageReference||!Array.isArray(e.generateIds)||e.generateIds.length!==2||new Set(e.generateIds).size!==2||c.taxes.length!==2||c.taxes.some(t=>!e.generateIds.includes(id(t.transactionNo)))||!Array.isArray(e.generatedRules)||!Array.isArray(e.generatedRulesAfter)||e.generatedRules.length!==2||canonical(e.generatedRules)!==canonical(e.generatedRulesAfter))fail();
  const d=definition(e.rules,e.rulesAfter),classification=object(d.classification),setup=object(d.trxSetup),generates=object(d.generatesSetup),net=precise(c.breakdown.netAmount),gross=precise(c.breakdown.grossAmount);
  if(d.code!==c.posting.transactionCode||classification.type!=='Revenue'||!['FoodAndBeverage','Lodging'].includes(String(object(classification.transactionType).code))||!['F&B','RM'].includes(String(object(classification.group).code))||setup.generatesType!=='INCLUSIVE'||setup.taxInclusive!==true||setup.nonTaxable!==false||d.compTransaction!==false||!empty(d.associatedTransactionCodes)||!empty(d.transactionAdjustments)||!net||!gross||(net>0n)!==(gross>0n))fail();only(generates,['addBaseAmtTo','generates']);
  const configured=rows(generates.generates);if(configured.length!==2)fail();const buckets:Record<string,string[]>={Base:['base'],Bucket1:[],Bucket2:[],Bucket3:[]},add=(raw:unknown,key:string)=>{const f=flags(raw);for(const n of [1,2,3])if(f['bucket'+n])buckets['Bucket'+n].push(key);};add(generates.addBaseAmtTo,'base');
  let generated=0n,vat=0n;const codes=new Set<string>();
  for(const [index,g]of configured.entries()){only(g,['generateId','rule','addGeneratedAmtTo','level','code','description']);if(g.level!=='TransactionCode'||typeof g.code!=='string'||codes.has(g.code))fail();codes.add(String(g.code));const matches=c.taxes.filter(t=>t.transactionCode===g.code),leafMatches=e.generatedRules.map((r,n)=>definition(r,e.generatedRulesAfter[n])).filter(d=>d.code===g.code),sourceDefs=packet.taxCodes.map(object).filter(d=>d.hotelId===hotel&&d.transactionCode===g.code);if(matches.length!==1||leafMatches.length!==1||sourceDefs.length!==1)fail();
   const leaf=leafMatches[0],lc=object(leaf.classification),kind=object(lc.transactionType),ls=object(leaf.trxSetup),lg=object(leaf.generatesSetup),group=object(lc.group).code;
   if(lc.type!=='Revenue'||group!==sourceDefs[0].transactionGroup||ls.taxInclusive!==false||ls.nonTaxable!==false||ls.manualPosting!==false||ls.generatesType!==undefined||leaf.compTransaction!==false||!empty(leaf.associatedTransactionCodes)||!empty(leaf.transactionAdjustments)||!empty(lg.generates))fail();only(lg,['addBaseAmtTo','generates']);if(Object.values(flags(lg.addBaseAmtTo)).some(v=>v!==false))fail();
   if(index===0?(kind.code!=='NonRevenue'||group!=='SVC'||Object.hasOwn(kind,'taxCode')):(kind.code!=='Tax'||group!=='TAX'||!Number.isSafeInteger(kind.taxCode)||Number(kind.taxCode)<1||Number(kind.taxCode)>20||!/\bVAT\b/i.test(String(sourceDefs[0].description))))fail();
   const rule=object(g.rule),percentage=object(rule.percentage),posting=object(rule.posting);only(rule,['percentage','posting','uDFFunctionName','uDF']);only(percentage,['amount','calculatedOn','useTaxBracket']);only(posting,['adjustmentType']);if(rule.uDF||rule.uDFFunctionName||typeof percentage.amount!=='number'||!Number.isFinite(percentage.amount)||percentage.amount<0||percentage.useTaxBracket!==false||posting.adjustmentType!=='NoAdjustment'||!buckets[String(percentage.calculatedOn)]?.length)fail();
   const t=matches[0],amount=precise(t.amount);if(!amount||(amount>0n)!==(net>0n))fail();generated+=amount;if(index===1)vat+=amount;add(g.addGeneratedAmtTo,id(t.transactionNo));owned.add(id(t.transactionNo));
  }
  if(abs(gross-net-generated)>10000000n||c.posting.transactionAmount!==undefined&&precise({amount:c.posting.transactionAmount,currencyCode:'THB'})!==gross)fail();owned.add(c.wrapperId);owned.add(c.packageReference);owned.add(e.componentId);vatByWrapper.set(c.wrapperId,(vatByWrapper.get(c.wrapperId)??0n)+vat);
 }
 // An explicit member declaration is a separate ownership assertion. It may
 // neither hide members of this tree nor claim them from another source row.
 let budget=0;const visit=(v:unknown,depth=0):void=>{if(++budget>200000||depth>16)fail();if(!v||typeof v!=='object')return;if(Array.isArray(v)){for(const x of v)visit(x,depth+1);return;}const r=object(v),isOwned=r.transactionNo!==undefined&&owned.has(String(r.transactionNo));if(isOwned&&(r.financialTransactionIdList!==undefined&&(!Array.isArray(r.financialTransactionIdList)||r.financialTransactionIdList.length)||r.groupTypeInfo!==undefined&&Object.keys(object(r.groupTypeInfo)).length||r.paidOut!==undefined&&r.paidOut!==false))fail();if(Array.isArray(r.financialTransactionIdList)&&r.financialTransactionIdList.some(x=>x&&typeof x==='object'&&owned.has(String(object(x).id))))fail();for(const x of Object.values(r))visit(x,depth+1);};visit(selected);visit(packet.taxRows);
 const result=new Map<string,PostedEmbeddedRootClaim>();for(const [wrapperId,actualPostedVatUnits]of vatByWrapper){const s=selected.find(s=>id(s.transactionNo)===wrapperId)??fail(),signed=(s.debitAmount===undefined?0n:precise(s.debitAmount))-(s.creditAmount===undefined?0n:precise(s.creditAmount));const packageReference=candidates.find(c=>c.wrapperId===wrapperId)?.packageReference??fail();if(s.deferredTax!==undefined&&s.deferredTax!==false||s.referenceTransactionNo!==undefined||s.subPostings!==undefined&&(!Array.isArray(s.subPostings)||s.subPostings.length)||s.referencePackageTransactionNo!==undefined&&String(s.referencePackageTransactionNo)!==packageReference)fail();if(s.transactionType!==undefined&&s.transactionType!=='Wrapper'||s.transactionAmount!==undefined&&precise({amount:s.transactionAmount,currencyCode:'THB'})!==signed||s.postedAmount!==undefined&&precise(s.postedAmount)!==signed)fail();result.set(wrapperId,{role:'taxable',component:'posted-embedded-vat',sourceKind:'reservation-wrapper',signedCents:rounded(signed),actualPostedVatUnits});}return result;
}

