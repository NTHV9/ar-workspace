import {canonical} from './ar-tax';
import {arOnlyTaxSource,type CurrentArTaxSource} from './current-ar-tax';
import type {InvoicePacket} from './model';
type Row=Record<string,unknown>;
export interface ArOnlyWrapperNetVatComponent {wrapperId:string;packageReference:string;componentId:string;generateIds:string[];rules:unknown;rulesAfter:unknown;generatedRules:unknown[];generatedRulesAfter:unknown[]}
export interface ArOnlyWrapperNetVatProof {version:1;kind:'ar-only-wrapper-net-vat7';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource;components:ArOnlyWrapperNetVatComponent[]}
export interface WrapperNetVatCandidate {wrapperId:string;packageReference:string;posting:Row;breakdown:Row;taxes:Row[]}
const fail=():never=>{throw Error('document_invoice_ar_only_wrapper_net_vat_unverified');};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail();
const rows=(v:unknown):Row[]=>Array.isArray(v)?v.map(object):fail();
const id=(v:unknown)=>{const s=String(v);return /^[1-9][0-9]{0,15}$/.test(s)?s:fail();};
const code=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(v)?v:fail();
const UNIT=1000000000000n,CENT=UNIT/100n,abs=(v:bigint)=>v<0n?-v:v;
function units(raw:unknown):bigint{
 const m=object(raw);if(m.currencyCode!=='THB'||typeof m.amount!=='number'||!Number.isFinite(m.amount))fail();
 const match=String(m.amount).match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);if(!match)return fail();
 const fraction=match[3]??'',shift=12+Number(match[4]??0)-fraction.length;if(Math.abs(shift)>50)fail();let value=BigInt(match[2]+fraction);value=shift>=0?value*10n**BigInt(shift):value/10n**BigInt(-shift);return match[1]?-value:value;
}
const signed=(p:Row)=>{const d=p.debitAmount===undefined?0n:units(p.debitAmount),c=p.creditAmount===undefined?0n:units(p.creditAmount);if(!d&&!c||d&&c)fail();return d-c;};
const rounded=(v:bigint)=>(abs(v)+CENT/2n)/CENT*(v<0n?-1n:1n);
const taxes=(b:Row)=>b.taxes===undefined?[]:rows(b.taxes);
const vat=(p:InvoicePacket,t:Row[])=>t.reduce((n,t)=>{const d=p.taxCodes.map(object).filter(d=>d.hotelId===p.manifest.hotel&&d.transactionCode===t.transactionCode);return n+(d.length===1&&d[0].transactionGroup==='TAX'&&/\bVAT\b/i.test(String(d[0].description))?units(t.amount):0n);},0n);
/** Discovery is not admission: identify components rejected by the existing full
 * gross ratio, then require the separate exact rule/membership verifier below. */
export function discoverWrapperNetVat(packet:InvoicePacket):WrapperNetVatCandidate[]{
 const selected=rows(object(packet.postings).invoicePostingsDetails),source=packet.taxRows.map(object),result:WrapperNetVatCandidate[]=[];
 for(const s of selected){const root=source.find(e=>String(object(e.posting).transactionNo)===String(s.transactionNo));if(!root||object(root.posting).transactionType!=='Wrapper')continue;
  const parent=object(root.posting),reference=String(parent.referencePackageTransactionNo);
  for(const entry of source){const p=object(entry.posting);if(p.transactionType==='Wrapper'||String(p.referencePackageTransactionNo)!==reference||entry.postingBreakdown===undefined)continue;
   const b=object(entry.postingBreakdown),t=taxes(b),postedVat=vat(packet,t),gross=units(b.grossAmount),tolerance=postedVat%CENT===0n?CENT*107n/2n:100000000n;
   if(postedVat&&abs(postedVat*107n-gross*7n)>tolerance)result.push({wrapperId:id(parent.transactionNo),packageReference:id(parent.referencePackageTransactionNo),posting:p,breakdown:b,taxes:t});
  }
 }
 return result;
}
/** Every package member is consumed from the complete paginated source, with
 * global identity ownership. No selected wrapper definition is copied onto a
 * component whose code is visible only in its actual source posting. */
export function verifyArOnlyWrapperOwnership(packet:InvoicePacket){
 const m=packet.manifest,source=packet.taxRows.map(object),selected=rows(object(packet.postings).invoicePostingsDetails),selectedIds=new Set(selected.map(s=>id(s.transactionNo))),sourceIds=new Set<string>(),packages=new Set<string>(),componentIds=new Set<string>(),taxIds=new Set<string>();
 for(const entry of source){const key=id(object(entry.posting).transactionNo);if(sourceIds.has(key))fail();sourceIds.add(key);}if(selectedIds.size!==selected.length)fail();
 // Ordinary selected Revenue keeps the existing strict model admission. Claim
 // its embedded tax identities now so wrapper ownership cannot alias them.
 for(const s of selected){const entry=source.find(e=>id(object(e.posting).transactionNo)===id(s.transactionNo));if(!entry||object(entry.posting).transactionType!=='Revenue'||entry.postingBreakdown===undefined)continue;
  for(const t of taxes(object(entry.postingBreakdown))){const key=id(t.transactionNo);if(taxIds.has(key)||sourceIds.has(key)||selectedIds.has(key))fail();taxIds.add(key);}
 }
 const scope=(p:Row,date:unknown,window?:unknown)=>{
  if(p.hotelId!==m.hotel||String(p.folioNo)!==m.folio_no||String(object(object(p.guestInfo).reservationId).id)!==m.reservation_id||p.transactionDate!==date||typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isSafeInteger(p.folioWindowNo)||Number(p.folioWindowNo)<1||window!==undefined&&p.folioWindowNo!==window)fail();
  if(p.referenceTransactionNo!==undefined||p.subPostings!==undefined&&(!Array.isArray(p.subPostings)||p.subPostings.length)||p.deferredTax!==undefined&&p.deferredTax!==false)fail();
 };
 for(const s of selected){const root=source.find(e=>id(object(e.posting).transactionNo)===id(s.transactionNo))??fail(),p=object(root.posting);
  if(p.transactionType==='Payment')continue;
  if(p.transactionType==='Revenue'&&root.postingBreakdown!==undefined&&taxes(object(root.postingBreakdown)).length)continue;
  if(p.transactionType!=='Wrapper')fail();scope(p,s.transactionDate,s.folioWindowNo);
  const selectedAmount=signed(s);
  if(p.transactionCode!==s.transactionCode||abs(units(p.postedAmount))!==abs(selectedAmount)||(p.debitAmount!==undefined||p.creditAmount!==undefined)&&signed(p)!==selectedAmount||p.transactionAmount!==undefined&&units({amount:p.transactionAmount,currencyCode:'THB'})!==selectedAmount)fail();
  const reference=id(p.referencePackageTransactionNo);if(packages.has(reference)||source.filter(e=>object(e.posting).transactionType==='Wrapper'&&String(object(e.posting).referencePackageTransactionNo)===reference).length!==1)fail();packages.add(reference);
  const parts=source.filter(e=>object(e.posting).transactionType!=='Wrapper'&&String(object(e.posting).referencePackageTransactionNo)===reference);if(!parts.length)fail();let gross=0n;
  for(const entry of parts){const part=object(entry.posting),key=id(part.transactionNo);if(selectedIds.has(key)||componentIds.has(key)||part.transactionType!=='Revenue')fail();componentIds.add(key);scope(part,s.transactionDate,p.folioWindowNo);code(part.transactionCode);
   const b=object(entry.postingBreakdown),g=units(b.grossAmount);if(signed(part)!==g||abs(units(part.postedAmount))!==abs(g))fail();gross+=g;
   let generated=0n;for(const t of taxes(b)){const taxId=id(t.transactionNo);if(taxIds.has(taxId)||sourceIds.has(taxId)||selectedIds.has(taxId)||id(t.referenceTransactionNo)!==key||t.transactionDate!==part.transactionDate)fail();taxIds.add(taxId);code(t.transactionCode);
    if(t.hotelId!==undefined&&t.hotelId!==m.hotel||t.folioNo!==undefined&&String(t.folioNo)!==m.folio_no||t.folioWindowNo!==undefined&&t.folioWindowNo!==p.folioWindowNo||t.guestInfo!==undefined&&String(object(object(t.guestInfo).reservationId).id)!==m.reservation_id||t.subPostings!==undefined&&(!Array.isArray(t.subPostings)||t.subPostings.length)||t.deferredTax!==undefined&&t.deferredTax!==false||t.referencePackageTransactionNo!==undefined)fail();
    if(packet.taxCodes.map(object).filter(d=>d.hotelId===m.hotel&&d.transactionCode===t.transactionCode).length!==1)fail();generated+=units(t.amount);
   }
   if(abs(g-units(b.netAmount)-generated)>10000000n)fail();
  }
  if(rounded(gross)!==rounded(signed(s)))fail();
 }
 // This narrow profile cannot resolve a package anchor that is also a monetary
 // posting identity. Refuse the ambiguity without reconstructing an anchor row.
 for(const reference of packages)if(sourceIds.has(reference)||selectedIds.has(reference)||componentIds.has(reference)||taxIds.has(reference))fail();
 const owned=new Set([...selectedIds,...packages,...componentIds,...taxIds]);
 for(const entry of source){const p=object(entry.posting),key=id(p.transactionNo),reference=String(p.referencePackageTransactionNo);
  if(p.referenceTransactionNo!==undefined&&owned.has(String(p.referenceTransactionNo)))fail();
  if(p.referencePackageTransactionNo!==undefined&&owned.has(reference)&&(!packages.has(reference)||!selectedIds.has(key)&&!componentIds.has(key)))fail();
 }
}
const flags=(raw:unknown)=>{const f=object(raw);if(Object.keys(f).some(k=>!['bucket1','bucket2','bucket3'].includes(k))||[1,2,3].some(n=>typeof f['bucket'+n]!=='boolean'))fail();return f;};
/** Stable current definitions validate the observed posted relationship. They
 * are not asserted to be the configuration in effect on its historical date. */
export function canPlanWrapperNetVatComponent(packet:InvoicePacket,c:WrapperNetVatCandidate,e:ArOnlyWrapperNetVatComponent):boolean{
 const hotel=packet.manifest.hotel,parentCode=code(c.posting.transactionCode),net=units(c.breakdown.netAmount),gross=units(c.breakdown.grossAmount);
 if(e.wrapperId!==c.wrapperId||e.packageReference!==c.packageReference||e.componentId!==id(c.posting.transactionNo)||!Array.isArray(e.generateIds)||e.generateIds.length!==2||new Set(e.generateIds).size!==2||c.taxes.length!==2||c.taxes.some(t=>!e.generateIds.includes(id(t.transactionNo)))||canonical(e.rules)!==canonical(e.rulesAfter)||canonical(e.generatedRules)!==canonical(e.generatedRulesAfter)||e.generatedRules.length!==2)return false;
 const root=object(object(e.rules).transactionCode),classification=object(root.classification),setup=object(root.trxSetup),generates=object(root.generatesSetup);
 if(root.hotelId!==hotel||root.code!==parentCode||classification.type!=='Revenue'||!['FoodAndBeverage','Lodging'].includes(String(object(classification.transactionType).code))||!['F&B','RM'].includes(String(object(classification.group).code))||setup.generatesType!=='INCLUSIVE'||setup.taxInclusive!==true||setup.nonTaxable!==false||root.compTransaction!==false||rows(root.associatedTransactionCodes).length||root.transactionAdjustments!==undefined&&rows(root.transactionAdjustments).length||Object.keys(generates).some(k=>!['addBaseAmtTo','generates'].includes(k)))return false;
 const rules=rows(generates.generates);if(rules.length!==2||!net||!gross||(net>0n)!==(gross>0n))return false;
 const buckets:Record<string,string[]>={Base:['base'],Bucket1:[],Bucket2:[],Bucket3:[]},add=(raw:unknown,key:string)=>{const f=flags(raw);for(const n of [1,2,3])if(f['bucket'+n])buckets['Bucket'+n].push(key);};add(generates.addBaseAmtTo,'base');
 const seen=new Set<string>();let postedTotal=net;
 for(let index=0;index<rules.length;index++){
  const g=rules[index],childCode=code(g.code),matches=c.taxes.filter(t=>t.transactionCode===childCode),leafs=e.generatedRules.map(v=>object(object(v).transactionCode)).filter(d=>d.hotelId===hotel&&d.code===childCode),definitions=packet.taxCodes.map(object).filter(d=>d.hotelId===hotel&&d.transactionCode===childCode);
  if(seen.has(childCode)||matches.length!==1||leafs.length!==1||definitions.length!==1||g.level!=='TransactionCode'||Object.keys(g).some(k=>!['generateId','rule','addGeneratedAmtTo','level','code','description'].includes(k)))return false;seen.add(childCode);
  const leaf=leafs[0],lc=object(leaf.classification),kind=object(lc.transactionType),ls=object(leaf.trxSetup),lg=object(leaf.generatesSetup),group=object(lc.group).code;
  if(lc.type!=='Revenue'||group!==definitions[0].transactionGroup||ls.taxInclusive!==false||ls.nonTaxable!==false||ls.manualPosting!==false||ls.generatesType!==undefined||leaf.compTransaction!==false||rows(leaf.associatedTransactionCodes).length||leaf.transactionAdjustments!==undefined&&rows(leaf.transactionAdjustments).length||lg.generates!==undefined&&rows(lg.generates).length||Object.keys(lg).some(k=>!['addBaseAmtTo','generates'].includes(k))||[1,2,3].some(n=>flags(lg.addBaseAmtTo)['bucket'+n]!==false))return false;
  const rule=object(g.rule),percentage=object(rule.percentage),posting=object(rule.posting),rate=index===0?10:7,basis=String(percentage.calculatedOn),members=buckets[basis];
  if(Object.keys(rule).some(k=>!['percentage','posting','uDFFunctionName','uDF'].includes(k))||rule.uDF||rule.uDFFunctionName||Object.keys(percentage).some(k=>!['amount','calculatedOn','useTaxBracket'].includes(k))||percentage.amount!==rate||percentage.useTaxBracket!==false||Object.keys(posting).some(k=>k!=='adjustmentType')||posting.adjustmentType!=='NoAdjustment'||!members||canonical(members)!==canonical(['base']))return false;
  if(index===0?(kind.code!=='NonRevenue'||group!=='SVC'||Object.hasOwn(kind,'taxCode')):(kind.code!=='Tax'||group!=='TAX'||!Number.isSafeInteger(kind.taxCode)||Number(kind.taxCode)<1||Number(kind.taxCode)>20||!/\bVAT\b/i.test(String(definitions[0].description))))return false;
  const amount=units(matches[0].amount),expected=net*BigInt(rate)/100n,tolerance=amount%CENT===0n?CENT/2n:100000n;
  if(!amount||(amount>0n)!==(net>0n)||abs(amount-expected)>tolerance)return false;postedTotal+=amount;add(g.addGeneratedAmtTo,id(matches[0].transactionNo));
 }
 if(abs(gross-postedTotal)>10000000n)return false;
 return true;
}
export function verifyArOnlyWrapperNetVatProof(packet:InvoicePacket):Set<string>{
 const proof=packet.arOnlyWrapperNetVatProof??fail();
 if(proof.version!==1||proof.kind!=='ar-only-wrapper-net-vat7'||'nativeTaxControls'in packet||packet.currentArTaxProof||packet.arOnlyPostedProof||packet.arOnlyPosProof||packet.arOnlyNonVatProof||packet.embeddedGenerateProof||packet.directZeroTaxProof||packet.arTransfer||packet.arDetails?.length||packet.arSimulations?.length||packet.arPostedGenerates?.length)fail();
 const source=canonical(arOnlyTaxSource(packet));if(canonical(proof.sourceBefore)!==source||canonical(proof.sourceAfter)!==source)fail();verifyArOnlyWrapperOwnership(packet);
 const candidates=discoverWrapperNetVat(packet);if(!candidates.length||!Array.isArray(proof.components)||proof.components.length!==candidates.length||new Set(proof.components.map(e=>e.componentId)).size!==candidates.length)fail();
 const result=new Set<string>();for(const c of candidates){const e=proof.components.find(e=>e.componentId===id(c.posting.transactionNo))??fail();if(!canPlanWrapperNetVatComponent(packet,c,e))fail();result.add(e.componentId);}return result;
}
