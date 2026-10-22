import {amountCents} from '../opera/normalize';
import {canonical} from './ar-tax';
import type {InvoicePacket} from './model';
type Row=Record<string,unknown>;
export type EmbeddedSource=Pick<InvoicePacket,'manifest'|'account'|'invoice'|'postings'|'taxRows'|'taxCodes'|'arDetails'>;
export interface EmbeddedGenerateGroup {postingId:string;generateIds:string[];rules:unknown;rulesAfter:unknown;generatedRules:unknown[];generatedRulesAfter:unknown[]}
export interface EmbeddedGenerateProof {version:1;sourceBefore:EmbeddedSource;sourceAfter:EmbeddedSource;groups:EmbeddedGenerateGroup[]}
export class EmbeddedGenerateUnverified extends Error {constructor(){super('document_invoice_embedded_generates_unverified');}}
const fail=():never=>{throw new EmbeddedGenerateUnverified();};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail();
const list=(v:unknown):Row[]=>Array.isArray(v)?v.map(object):fail();
const id=(v:unknown)=>{if(typeof v==='number'&&!Number.isSafeInteger(v))return fail();const s=String(v);return /^[1-9][0-9]{0,15}$/.test(s)?s:fail();};
const code=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(v)?v:fail();
const day=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v?v:fail();
const UNIT=1000000000000n,CENT=UNIT/100n,abs=(v:bigint)=>v<0n?-v:v,sign=(v:bigint)=>v<0n?-1:v>0n?1:0;
// Same 12-decimal source precision as invoiceModel; never round each generate.
function decimal(v:unknown):bigint{
 if(typeof v!=='number'||!Number.isFinite(v))return fail();const match=String(v).match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);if(!match)return fail();
 const fraction=match[3]??'',shift=12+Number(match[4]??0)-fraction.length;if(Math.abs(shift)>50)return fail();let n=BigInt(match[2]+fraction);n=shift>=0?n*10n**BigInt(shift):n/10n**BigInt(-shift);return match[1]?-n:n;
}
const units=(v:unknown)=>{const a=object(v);if(a.currencyCode!=='THB')return fail();return decimal(a.amount);};
const rounded=(v:bigint)=>Number((abs(v)+CENT/2n)/CENT)*sign(v);
const signed=(v:Row)=>{const d=v.debitAmount===undefined?0:amountCents(v.debitAmount,'THB'),c=v.creditAmount===undefined?0:amountCents(v.creditAmount,'THB');if(!d&&!c||d&&c)return fail();return d-c;};
const sorted=(rows:Row[])=>[...rows].sort((a,b)=>String(a.transactionNo??a.transactionCode).localeCompare(String(b.transactionNo??b.transactionCode)));
export interface EmbeddedPlan {groups:{posting:Row;breakdown:Row;taxes:Row[]}[];codes:string[];fingerprint:string;source:EmbeddedSource}
/** Narrow initial profile: complete direct Revenue/Payment coverage, and every
 * Revenue amount already has explicit VAT covering its entire before-VAT base.
 * Wrappers, AR-only rows, zero-VAT/taxless charges and partial bases stay outside. */
export function inspectEmbeddedSource(packet:EmbeddedSource):EmbeddedPlan{
 const m=packet.manifest,a=object(packet.account),invoice=object(packet.invoice),data=object(packet.postings);
 if(packet.arDetails?.length||a.hotelId!==m.hotel||String(object(a.accountId).id)!==m.account_id||invoice.hotelId!==m.hotel||id(invoice.transactionNo)!==m.id||String(invoice.invoiceNo)!==m.invoice_no||String(invoice.folioNo)!==m.folio_no||invoice.folioDate!==m.folio_date||invoice.parentInvoiceNo!=null||!m.reservation_id||amountCents(invoice.balance,'THB')!==Math.round(m.open*100))fail();
 const selected=list(data.invoicePostingsDetails),definitions=list(data.trxCodesInfo),taxDefinitions=packet.taxCodes.map(object),sourceRows=packet.taxRows.map(object),byId=new Map(sourceRows.map(e=>[id(object(e.posting).transactionNo),e]));
 if(!selected.length||selected.length>=4000||new Set(selected.map(p=>id(p.transactionNo))).size!==selected.length||byId.size!==sourceRows.length)fail();
 if(selected.reduce((n,p)=>n+signed(p),0)!==amountCents(invoice.amount,'THB'))fail();
 const groups:EmbeddedPlan['groups']=[],relevant:Row[]=[],allTaxIds=new Set<string>(),selectedIds=new Set(selected.map(p=>id(p.transactionNo))),requiredCodes=new Set<string>();let hasException=false;
 for(const row of selected){
  const entry=byId.get(id(row.transactionNo));if(!entry)return fail();const p=object(entry.posting),rootCode=code(p.transactionCode),rootDefinitions=definitions.filter(d=>d.hotelId===m.hotel&&d.transactionCode===rootCode);
  if(rootDefinitions.length!==1||row.transactionCode!==rootCode||p.hotelId!==m.hotel||String(p.folioNo)!==m.folio_no||String(object(object(p.guestInfo).reservationId).id)!==m.reservation_id||day(p.transactionDate)!==day(row.transactionDate)||signed(p)!==signed(row)||abs(units(p.postedAmount))!==BigInt(Math.abs(signed(row)))*CENT)fail();
  relevant.push(entry);
  if(p.transactionType==='Payment'){if(entry.postingBreakdown!==undefined)fail();continue;}
  if(p.transactionType!=='Revenue')fail();
  const b=object(entry.postingBreakdown),taxes=list(b.taxes),gross=units(b.grossAmount),net=units(b.netAmount);if(!taxes.length||taxes.length>5||rounded(gross)!==signed(row)||!net||sign(net)!==sign(gross))fail();
  let sum=0n,vat=0n,vatCount=0;
  const seenCodes=new Set<string>();
  for(const t of taxes){
   const key=id(t.transactionNo),childCode=code(t.transactionCode),matches=taxDefinitions.filter(d=>d.hotelId===m.hotel&&d.transactionCode===childCode),amount=units(t.amount);
   if(allTaxIds.has(key)||selectedIds.has(key)||id(t.referenceTransactionNo)!==id(p.transactionNo)||day(t.transactionDate)!==day(p.transactionDate)||matches.length!==1||seenCodes.has(childCode)||!amount||sign(amount)!==sign(net))fail();
   // The embedded schema can omit child scope, but explicit scope must agree
   // with the already scoped parent. Stable conflicting snapshots are not proof.
   if(Object.hasOwn(t,'hotelId')&&t.hotelId!==m.hotel||Object.hasOwn(t,'folioNo')&&String(t.folioNo)!==m.folio_no)fail();
   if(Object.hasOwn(t,'guestInfo')){const guest=object(t.guestInfo);if(Object.hasOwn(guest,'reservationId')&&String(object(guest.reservationId).id)!==m.reservation_id)fail();}
   seenCodes.add(childCode);allTaxIds.add(key);requiredCodes.add(childCode);sum+=amount;
   const definition=matches[0];if(definition.transactionGroup==='TAX'&&/\bVAT\b/i.test(String(definition.description))){vat+=amount;vatCount++;}
   else if(!['SVC','F&B'].includes(String(definition.transactionGroup)))fail();
   if(definition.transactionGroup==='F&B')hasException=true;
  }
  if(abs(gross-net-sum)>10000000n||vatCount!==1||!vat)fail();
  const tolerance=vat%CENT===0n?CENT*50n:100000000n;
  if(abs(vat*100n-(gross-vat)*7n)>tolerance)fail();
  requiredCodes.add(rootCode);groups.push({posting:p,breakdown:b,taxes});
 }
 if(!hasException||!groups.length||requiredCodes.size>30)fail();
 const usedTaxCodes=new Set(groups.flatMap(g=>g.taxes.map(t=>String(t.transactionCode)))),usedPostingCodes=new Set(selected.map(p=>String(p.transactionCode)));
 const postingFields=['transactionNo','transactionCode','transactionDate','transactionType','folioNo','folioWindowNo','internalFolioWindowID','hotelId','debitAmount','creditAmount','postedAmount','referenceTransactionNo','referencePackageTransactionNo'];
 const netVatFacts=sorted(relevant.map(e=>({transactionNo:object(e.posting).transactionNo,posting:{...Object.fromEntries(postingFields.map(k=>[k,object(e.posting)[k]??null])),reservationId:object(object(e.posting).guestInfo).reservationId},postingBreakdown:e.postingBreakdown===undefined?null:{...object(e.postingBreakdown),taxes:sorted(list(object(e.postingBreakdown).taxes))}})));
 const fingerprint=canonical({manifest:m,account:{hotelId:a.hotelId,accountId:a.accountId,accountNo:a.accountNo??null},invoice:{hotelId:invoice.hotelId,transactionNo:invoice.transactionNo,invoiceNo:invoice.invoiceNo,folioNo:invoice.folioNo,folioDate:invoice.folioDate,internalFolioWindowID:invoice.internalFolioWindowID??null,reservationId:invoice.reservationId??null,amount:invoice.amount,balance:invoice.balance,parentInvoiceNo:invoice.parentInvoiceNo??null},postings:sorted(selected),netVatFacts,postingCodes:sorted(definitions.filter(d=>usedPostingCodes.has(String(d.transactionCode)))),taxCodes:sorted(taxDefinitions.filter(d=>usedTaxCodes.has(String(d.transactionCode))))});
 const source:EmbeddedSource={manifest:structuredClone(m),account:{hotelId:a.hotelId,accountId:structuredClone(a.accountId),accountNo:a.accountNo},invoice:structuredClone(invoice),postings:structuredClone(data),taxRows:structuredClone(relevant),taxCodes:structuredClone(packet.taxCodes),arDetails:[]};
 return {groups,codes:[...requiredCodes].sort(),fingerprint,source};
}
const sameSet=(a:Set<string>,b:Set<string>)=>a.size===b.size&&[...a].every(x=>b.has(x));
function verifyGroup(plan:EmbeddedPlan,group:EmbeddedPlan['groups'][number],e:EmbeddedGenerateGroup,hotel:string):string[]{
 const p=group.posting,taxes=group.taxes,parentCode=code(p.transactionCode),root=object(object(e.rules).transactionCode),setup=object(root.trxSetup),generates=object(root.generatesSetup),classification=object(root.classification);
 const sourceDefinitions=list(object(plan.source.postings).trxCodesInfo),sourceTaxCodes=plan.source.taxCodes.map(object),rootSource=sourceDefinitions.filter(d=>d.hotelId===hotel&&d.transactionCode===parentCode);
 if(e.postingId!==id(p.transactionNo)||e.generateIds.length!==taxes.length||new Set(e.generateIds).size!==taxes.length||taxes.some(t=>!e.generateIds.includes(id(t.transactionNo)))||canonical(e.rules)!==canonical(e.rulesAfter)||canonical(e.generatedRules)!==canonical(e.generatedRulesAfter))fail();
 if(rootSource.length!==1||root.hotelId!==hotel||root.code!==parentCode||classification.type!=='Revenue'||object(classification.group).code!==rootSource[0].transactionGroup||setup.generatesType!=='INCLUSIVE'||setup.taxInclusive!==true||setup.nonTaxable!==false||root.compTransaction!==false||list(root.associatedTransactionCodes).length||Object.keys(generates).some(k=>!['generates','addBaseAmtTo'].includes(k)))fail();
 const rules=list(generates.generates);if(rules.length!==taxes.length||e.generatedRules.length!==taxes.length)fail();
 const base=units(group.breakdown.netAmount),bucket:Record<string,{amount:bigint;members:Set<string>}>=Object.fromEntries(['Base','Bucket1','Bucket2','Bucket3'].map(k=>[k,{amount:k==='Base'?base:0n,members:new Set(k==='Base'?['base']:[])}]));
 const add=(raw:unknown,value:bigint,members:Set<string>)=>{const flags=object(raw);for(const n of [1,2,3]){const flag=flags['bucket'+n];if(typeof flag!=='boolean')fail();if(flag){bucket['Bucket'+n].amount+=value;for(const member of members)bucket['Bucket'+n].members.add(member);}}};
 add(generates.addBaseAmtTo,base,new Set(['base']));const seen=new Set<string>(),nonTaxIds:string[]=[],fullBase=new Set(['base']);let vatBase:Set<string>|undefined;
 for(const ruleEntry of rules){
  const childCode=code(ruleEntry.code),matches=taxes.filter(t=>t.transactionCode===childCode),codes=e.generatedRules.map(v=>object(object(v).transactionCode)).filter(d=>d.hotelId===hotel&&d.code===childCode),source=sourceTaxCodes.filter(d=>d.hotelId===hotel&&d.transactionCode===childCode);
  if(seen.has(childCode)||matches.length!==1||codes.length!==1||source.length!==1||ruleEntry.level!=='TransactionCode'||Object.keys(ruleEntry).some(k=>!['generateId','rule','addGeneratedAmtTo','level','code','description'].includes(k)))fail();seen.add(childCode);
  const leaf=codes[0],leafClass=object(leaf.classification),kind=object(leafClass.transactionType),leafSetup=object(leaf.trxSetup),leafGenerates=object(leaf.generatesSetup),leafGroup=object(leafClass.group).code;
  if(leafClass.type!=='Revenue'||leafGroup!==source[0].transactionGroup||leafSetup.nonTaxable!==false||leafSetup.taxInclusive!==false||leafSetup.manualPosting!==false||leafSetup.generatesType!==undefined||leaf.compTransaction!==false||list(leaf.associatedTransactionCodes).length||leafGenerates.generates!==undefined&&list(leafGenerates.generates).length||Object.keys(leafGenerates).some(k=>!['generates','addBaseAmtTo'].includes(k)))fail();
  const leafFlags=object(leafGenerates.addBaseAmtTo);if([1,2,3].some(n=>leafFlags['bucket'+n]!==false))fail();
  const rule=object(ruleEntry.rule),percentage=object(rule.percentage),posting=object(rule.posting),rate=percentage.amount,basis=percentage.calculatedOn;
  if(Object.keys(rule).some(k=>!['percentage','posting','uDFFunctionName','uDF'].includes(k))||rule.uDF||rule.uDFFunctionName||posting.adjustmentType!=='NoAdjustment'||Object.keys(posting).some(k=>k!=='adjustmentType')||Object.keys(percentage).some(k=>!['amount','calculatedOn','useTaxBracket'].includes(k))||percentage.useTaxBracket!==false||typeof rate!=='number'||!Number.isFinite(rate)||rate<=0||rate>100||typeof basis!=='string'||!['Base','Bucket1','Bucket2','Bucket3'].includes(basis))fail();
  const amount=units(matches[0].amount),expected=bucket[basis as string].amount*decimal(rate)/(100n*UNIT),tolerance=amount%CENT===0n?CENT/2n:100000n;
  if(abs(amount-expected)>tolerance)fail();
  const key=id(matches[0].transactionNo);
  if(kind.code==='Tax'){
   if(leafGroup!=='TAX'||!Number.isSafeInteger(kind.taxCode)||Number(kind.taxCode)<1||Number(kind.taxCode)>20||rate!==7||!/\bVAT\b/i.test(String(source[0].description))||vatBase)fail();vatBase=new Set(bucket[basis as string].members);
  }else{
   if(kind.code!=='NonRevenue'||!['F&B','SVC'].includes(String(leafGroup))||Object.hasOwn(kind,'taxCode'))fail();nonTaxIds.push(key);fullBase.add(key);
  }
  add(ruleEntry.addGeneratedAmtTo,amount,new Set([key]));
 }
 if(!vatBase||!sameSet(vatBase,fullBase))fail();return nonTaxIds;
}
/** Rebind every rule and both scoped source snapshots to the current packet.
 * Returns only non-Tax generate identities; posted VAT is still summed by model. */
export function verifyEmbeddedGenerateProof(packet:EmbeddedSource,proof:EmbeddedGenerateProof):Set<string>{
 const plan=inspectEmbeddedSource(packet),before=inspectEmbeddedSource(proof.sourceBefore),after=inspectEmbeddedSource(proof.sourceAfter);
 if(proof.version!==1||plan.fingerprint!==before.fingerprint||plan.fingerprint!==after.fingerprint||proof.groups.length!==plan.groups.length||new Set(proof.groups.map(g=>g.postingId)).size!==plan.groups.length)fail();
 const result=new Set<string>();for(const group of plan.groups){const e=proof.groups.find(g=>g.postingId===id(group.posting.transactionNo));if(!e)return fail();for(const key of verifyGroup(plan,group,e,packet.manifest.hotel))result.add(key);}return result;
}
