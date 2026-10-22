import {amountCents} from '../opera/normalize';
import type {DocumentInvoice} from '../documents/native-invoice';
import {canonical} from './ar-tax';
type Row=Record<string,unknown>;
const fail=():never=>{throw Error('document_invoice_ar_tax_unverified');};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail();
const list=(v:unknown):Row[]=>Array.isArray(v)?v.map(object):fail();
const id=(v:unknown)=>{if(typeof v==='number'&&!Number.isSafeInteger(v))return fail();const s=String(v);return /^[1-9][0-9]{0,15}$/.test(s)?s:fail();};
const accountNumber=(v:unknown)=>{if(!['string','number'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v)||!String(v).trim())return fail();return String(v);};
const signed=(p:Row)=>{const debit=p.debitAmount===undefined?0:amountCents(p.debitAmount,'THB'),credit=p.creditAmount===undefined?0:amountCents(p.creditAmount,'THB');if(!debit&&!credit||debit&&credit)return fail();return debit-credit;};
export interface ArPostedGenerates {postingId:string;childIds:string[];rules:unknown;rulesAfter:unknown;generatedRules:unknown[];generatedRulesAfter:unknown[]}
export interface PostedGenerateGraph {root:Row;children:Row[];definitions:Map<string,Row>}

/** Nested generates are a second view of selected postings, not additional money.
 * Admit only a closed one-level graph with identical standalone child records. */
export function discoverPostedGenerates(manifest:DocumentInvoice,account:Row,postings:unknown,details:{ids:string[];response:unknown}[]):PostedGenerateGraph[]{
 const accountNo=accountNumber(account.accountNo);
 const selectedRows=list(object(postings).invoicePostingsDetails),selected=new Map(selectedRows.map(p=>[id(p.transactionNo),p]));
 if(selected.size!==selectedRows.length)fail();
 const entries=new Map<string,{row:Row;definition:Row}>(),postingDefinitions=list(object(postings).trxCodesInfo);
 for(const page of details){
  const response=object(page.response),rows=list(response.transactions),definitions=list(response.trxCodesInfo);
  if(new Set(page.ids).size!==page.ids.length||rows.length!==page.ids.length)fail();
  for(const row of rows){const key=id(row.transactionNo),matches=definitions.filter(d=>d.hotelId===manifest.hotel&&d.transactionCode===row.transactionCode);
   if(entries.has(key)||!page.ids.includes(key)||!selected.has(key)||matches.length!==1)fail();entries.set(key,{row,definition:matches[0]});
  }
 }
 const scoped=(p:Row,parentDate?:unknown)=>{
  const current=selected.get(id(p.transactionNo)),info=object(p.aRInfo),definition=entries.get(id(p.transactionNo))!.definition;
  if(!current)return fail();
  const code=postingDefinitions.filter(d=>d.hotelId===manifest.hotel&&d.transactionCode===p.transactionCode);
  if(!current||code.length!==1||code[0].transactionGroup!==definition.transactionGroup||!definition.transactionGroup||p.hotelId!==undefined&&p.hotelId!==manifest.hotel||accountNumber(info.accountNumber)!==accountNo||String(info.invoiceNo)!==manifest.invoice_no||String(p.folioNo)!==manifest.folio_no||p.transactionCode!==current.transactionCode||p.transactionDate!==current.transactionDate||parentDate!==undefined&&p.transactionDate!==parentDate||p.transactionType!=='Revenue'||p.deferredTax!==false)fail();
  if(p.guestInfo!==undefined&&String(object(object(p.guestInfo).reservationId).id)!==manifest.reservation_id)fail();
  if(signed(p)!==signed(current)||canonical(p.debitAmount)!==canonical(current.debitAmount)||canonical(p.creditAmount)!==canonical(current.creditAmount)||amountCents(p.postedAmount,'THB')!==signed(p))fail();
  if(p.transactionAmount!==undefined&&amountCents({amount:p.transactionAmount,currencyCode:'THB'},'THB')!==signed(p))fail();
 };
 const groups:PostedGenerateGraph[]=[],claimed=new Set<string>();
 const material=['transactionNo','referenceTransactionNo','transactionCode','transactionDate','postingDate','revenueDate','postedAmount','transactionType','debitAmount','creditAmount','transactionAmount','deferredTax'];
 for(const {row:root} of entries.values()){
  const nested=root.subPostings===undefined?[]:list(root.subPostings);if(!nested.length)continue;
  if(nested.length>5||root.referenceTransactionNo!==undefined)fail();scoped(root);
  const children:Row[]=[],definitions=new Map<string,Row>([[String(root.transactionCode),entries.get(id(root.transactionNo))!.definition]]);
  for(const child of nested){
   const key=id(child.transactionNo),entry=entries.get(key);if(!entry)return fail();if(key===id(root.transactionNo)||claimed.has(key)||id(child.referenceTransactionNo)!==id(root.transactionNo))fail();
   const top=entry.row;if(material.some(k=>canonical(child[k])!==canonical(top[k]))||top.subPostings!==undefined&&list(top.subPostings).length||child.subPostings!==undefined&&list(child.subPostings).length)fail();
   if(['postingDate','revenueDate'].some(k=>root[k]!==top[k]))fail();
   if(child.aRInfo!==undefined&&(accountNumber(object(child.aRInfo).accountNumber)!==accountNo||String(object(child.aRInfo).invoiceNo)!==manifest.invoice_no)||child.guestInfo!==undefined&&String(object(object(child.guestInfo).reservationId).id)!==manifest.reservation_id)fail();
   if(child.hotelId!==undefined&&child.hotelId!==manifest.hotel||child.folioNo!==undefined&&String(child.folioNo)!==manifest.folio_no||child.folioWindowNo!==undefined&&child.folioWindowNo!==top.folioWindowNo||root.folioWindowNo!==undefined&&top.folioWindowNo!==root.folioWindowNo)fail();
   scoped(top,root.transactionDate);claimed.add(key);children.push(top);
   if(definitions.has(String(top.transactionCode)))fail();definitions.set(String(top.transactionCode),entry.definition);
  }
  groups.push({root,children,definitions});
 }
 // A selected generated child cannot be silently treated as a standalone root.
 for(const {row} of entries.values())if(row.referenceTransactionNo!==undefined&&!claimed.has(id(row.transactionNo)))fail();
 return groups;
}

/** Validate posted exclusive generates against explicit stable rules. Formula
 * checks never replace posted amounts; selected AR lines still own gross. */
export function verifyPostedGenerates(graph:PostedGenerateGraph,e:ArPostedGenerates,hotel:string):{vatCents:number;ids:string[]}{
 const {root,children,definitions}=graph,code=String(root.transactionCode),ids=[id(root.transactionNo),...children.map(c=>id(c.transactionNo))];
 if(e.postingId!==ids[0]||new Set(e.childIds).size!==children.length||e.childIds.length!==children.length||children.some(c=>!e.childIds.includes(id(c.transactionNo)))||canonical(e.rules)!==canonical(e.rulesAfter)||canonical(e.generatedRules)!==canonical(e.generatedRulesAfter))fail();
 const definition=object(object(e.rules).transactionCode),setup=object(definition.trxSetup),generates=object(definition.generatesSetup),classification=object(definition.classification);
 if(definition.hotelId!==hotel||definition.code!==code||classification.type!=='Revenue'||object(classification.group).code!==definitions.get(code)!.transactionGroup||setup.generatesType!=='EXCLUSIVE'||setup.taxInclusive!==false||setup.nonTaxable!==false||definition.compTransaction===true||list(definition.associatedTransactionCodes).length)fail();
 const rules=list(generates.generates);if(rules.length!==children.length||e.generatedRules.length!==children.length)fail();
 const base=signed(root),bucket:Record<string,number>={Base:base,Bucket1:0,Bucket2:0,Bucket3:0};
 const add=(raw:unknown,amount:number)=>{const flags=object(raw);for(const n of [1,2,3]){const flag=flags['bucket'+n];if(typeof flag!=='boolean')fail();if(flag)bucket['Bucket'+n]+=amount;}};
 add(generates.addBaseAmtTo,base);const seen=new Set<string>();let vatCents=0,vatCount=0;
 for(const g of rules){
  const childCode=String(g.code),matches=children.filter(c=>c.transactionCode===childCode);if(seen.has(childCode)||matches.length!==1)fail();seen.add(childCode);
  const rule=object(g.rule),percentage=object(rule.percentage),posting=object(rule.posting),rate=percentage.amount,basis=percentage.calculatedOn;
  if(Object.keys(rule).some(k=>!['percentage','posting','uDFFunctionName','uDF'].includes(k))||rule.uDF||rule.uDFFunctionName||Object.keys(posting).some(k=>k!=='adjustmentType')||posting.adjustmentType!=='NoAdjustment'||percentage.useTaxBracket!==false||Object.keys(percentage).some(k=>!['amount','calculatedOn','useTaxBracket'].includes(k))||typeof rate!=='number'||!Number.isFinite(rate)||rate<=0||rate>100||typeof basis!=='string'||!['Base','Bucket1','Bucket2','Bucket3'].includes(basis))fail();
  const amount=signed(matches[0]);if(Math.sign(amount)!==Math.sign(base)||Math.abs(amount-bucket[basis as string]*(rate as number)/100)>.500001)fail();
  const codes=e.generatedRules.map(v=>object(object(v).transactionCode)).filter(d=>d.hotelId===hotel&&d.code===childCode);if(codes.length!==1)fail();
  const childDefinition=codes[0],childClassification=object(childDefinition.classification),group=object(childClassification.group).code;
  if(childClassification.type!=='Revenue'||childDefinition.compTransaction===true)fail();
  if(group!==definitions.get(childCode)!.transactionGroup||childDefinition.generatesSetup!==undefined&&object(childDefinition.generatesSetup).generates!==undefined&&list(object(childDefinition.generatesSetup).generates).length||childDefinition.associatedTransactionCodes!==undefined&&list(childDefinition.associatedTransactionCodes).length)fail();
  if(group==='TAX'&&rate===7&&/\bVAT\b/i.test(String(object(childDefinition.description).defaultText))){vatCents+=amount;vatCount++;}
  else if(group!=='SVC')fail();add(g.addGeneratedAmtTo,amount);
 }
 if(!vatCount||!Number.isSafeInteger(vatCents))fail();return {vatCents,ids};
}
