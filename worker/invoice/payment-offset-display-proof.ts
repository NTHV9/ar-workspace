import {canonical} from './ar-tax';
import {arOnlyTaxSource,type CurrentArTaxSource} from './current-ar-tax';
import {amountCents} from '../opera/normalize';

type Row=Record<string,unknown>;
export interface ArPaymentOffsetDisplayProof {version:1;kind:'ar-owned-payment-offset-display';sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource;details:{ids:string[];before:unknown;after:unknown}[]}
export interface PaymentOffsetDisplayAtom {id:string;date:string;description:string;reference:string;debit:number;credit:number}
/** Serializable evidence, not a financial claim or an auxiliary-row flag.
 * The renderer regenerates the atoms from this closed proof before use. */
export interface PaymentOffsetDisplayCatalog {proof:ArPaymentOffsetDisplayProof;atoms:PaymentOffsetDisplayAtom[]}
const fail=():never=>{throw Error('document_invoice_payment_offset_display_unverified');};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail();
const rows=(v:unknown):Row[]=>{if(!Array.isArray(v)||v.length>4000)return fail();return v.map(object);};
const text=(v:unknown,max=2000)=>{if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v))return fail();return v;};
const id=(v:unknown)=>{const s=typeof v==='number'&&Number.isSafeInteger(v)?String(v):text(v,16);return /^[1-9][0-9]{0,15}$/.test(s)?s:fail();};
const integer=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max?Number(v):fail();
const date=(v:unknown)=>{const s=text(v,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)return fail();return s;};
const cents=(v:unknown)=>v===undefined?0:amountCents(v,'THB');
const order=(a:string,b:string)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0;
const keys=(v:Row,allowed:string[])=>{if(Object.keys(v).some(k=>!allowed.includes(k)))return fail();};
function payment(v:Row){
 if(v.transactionType!=='Payment'||v.paidOut!==false||v.deferredTax!==undefined&&v.deferredTax!==false||v.holdingLedgerTransaction!==undefined&&v.holdingLedgerTransaction!==false)return fail();
 if(v.referenceTransactionNo!==undefined||v.referencePackageTransactionNo!==undefined||v.parentTransactionNo!==undefined)return fail();
 for(const name of ['subPostings','financialTransactionIdList'])if(v[name]!==undefined&&rows(v[name]).length)return fail();
 if(v.groupTypeInfo!==undefined&&Object.keys(object(v.groupTypeInfo)).length)return fail();
 const debit=cents(v.debitAmount),credit=cents(v.creditAmount);if(!debit&&!credit||debit&&credit)return fail();
 if(v.postedAmount===undefined||cents(v.postedAmount)!==credit-debit||object(v.postedAmount).amount!==(credit-debit)/100||v.transactionAmount!==(credit-debit)/100)return fail();
 return {debit,credit};
}
interface Candidate {key:string;source:Row[];ids:string[]}
function discover(packet:CurrentArTaxSource):Candidate[]{
 // Ownership selects invoice_no, whereas the financial model identifies the
 // AR transaction. Bind both to the actual invoice/account source so a
 // serialized proof cannot retarget an otherwise unchanged model's selector.
 const m=packet.manifest,invoice=object(packet.invoice),account=object(packet.account);
 if(invoice.hotelId!==m.hotel||account.hotelId!==m.hotel||id(invoice.transactionNo)!==id(m.id)||id(invoice.invoiceNo)!==id(m.invoice_no)||id(invoice.folioNo)!==id(m.folio_no)||id(object(account.accountId).id)!==id(m.account_id)||invoice.accountId!==undefined&&id(object(invoice.accountId).id)!==id(m.account_id))return fail();
 const selected=rows(object(packet.postings).invoicePostingsDetails),selectedIds=new Set<string>();for(const p of selected){const key=id(p.transactionNo);if(selectedIds.has(key))return fail();selectedIds.add(key);}
 const entries=rows(packet.taxRows),rootIds=new Set<string>(),groups=new Map<string,Row[]>();
 for(const entry of entries){const p=object(entry.posting),key=id(p.transactionNo);if(rootIds.has(key))return fail();rootIds.add(key);if(p.transactionType!=='Payment'||selectedIds.has(key))continue;
  const reference=text(p.reference??'');if(!reference.trim())continue;
  const scope=JSON.stringify([p.hotelId,object(object(p.guestInfo).reservationId).id,p.folioNo,p.folioWindowNo,p.transactionDate,p.transactionCode,reference]),group=groups.get(scope)??[];group.push(p);groups.set(scope,group);
 }
 const result:Candidate[]=[];
 for(const [key,source]of groups){const amounts=source.map(p=>({debit:cents(p.debitAmount),credit:cents(p.creditAmount)}));if(source.length<2||amounts.some(a=>a.debit===a.credit)||amounts.reduce((n,a)=>n+BigInt(a.debit),0n)!==0n||amounts.reduce((n,a)=>n+BigInt(a.credit),0n)!==0n)continue;
  const cashier=integer(object(source[0].cashierInfo).cashierId);for(const p of source){payment(p);if(p.hotelId!==packet.manifest.hotel||id(object(object(p.guestInfo).reservationId).id)!==packet.manifest.reservation_id||id(p.folioNo)!==packet.manifest.folio_no||integer(p.folioWindowNo,1,999)<1||integer(object(p.cashierInfo).cashierId)!==cashier)return fail();date(p.transactionDate);if(!text(p.transactionCode,20).trim())return fail();}
  result.push({key,source,ids:source.map(p=>id(p.transactionNo)).sort(order)});
 }
 const ids=new Set(result.flatMap(g=>g.ids));if(ids.size>400)return fail();
 // Candidate payment roots cannot also be embedded tax/component IDs or links.
 let budget=0;const visit=(raw:unknown,embedded=false,depth=0):void=>{if(++budget>50000||depth>12)return fail();if(raw==null)return;if(Array.isArray(raw)){for(const v of raw)visit(v,embedded,depth+1);return;}if(typeof raw!=='object')return;const p=object(raw);if(embedded&&p.transactionNo!==undefined&&ids.has(String(p.transactionNo)))return fail();for(const key of ['referenceTransactionNo','referencePackageTransactionNo','parentTransactionNo'])if(p[key]!==undefined&&ids.has(String(p[key])))return fail();if(p.financialTransactionIdList!==undefined)for(const member of rows(p.financialTransactionIdList))if(ids.has(String(member.id)))return fail();for(const key of ['postingBreakdown','taxes','subPostings'])if(p[key]!==undefined)visit(p[key],true,depth+1);};
 for(const p of selected)visit(p);for(const e of entries){visit(e.posting);if(e.postingBreakdown!==undefined)visit(e.postingBreakdown,true);}
 for(const detail of packet.arDetails??[]){if(detail.ids.some(key=>ids.has(id(key))))return fail();const response=object(detail.response);if(response.transactions!==undefined)visit(response.transactions,true);}
 return result.sort((a,b)=>order(a.ids[0],b.ids[0]));
}
export function arPaymentOffsetDisplayIds(packet:CurrentArTaxSource):string[]{return discover(packet).flatMap(g=>g.ids).sort(order);}
export function verifyArPaymentOffsetDisplayProof(packet:CurrentArTaxSource,raw:ArPaymentOffsetDisplayProof):PaymentOffsetDisplayCatalog{
 const proof=object(raw);keys(proof,['version','kind','sourceBefore','sourceAfter','details']);if(proof.version!==1||proof.kind!=='ar-owned-payment-offset-display')return fail();
 const current=canonical(arOnlyTaxSource(packet));if(canonical(proof.sourceBefore)!==current||canonical(proof.sourceAfter)!==current)return fail();
 const groups=discover(packet),ids=groups.flatMap(g=>g.ids),seen=new Set<string>(),details=new Map<string,{row:Row;description:string}>();
 for(const block of rows(proof.details)){keys(block,['ids','before','after']);if(!Array.isArray(block.ids)||!block.ids.length||block.ids.length>40||canonical(block.before)!==canonical(block.after))return fail();
  const requested=block.ids.map(id);if(new Set(requested).size!==requested.length||requested.some(k=>!ids.includes(k)||seen.has(k)))return fail();for(const key of requested)seen.add(key);
  const response=object(block.before),transactions=rows(response.transactions),definitions=rows(response.trxCodesInfo);if(transactions.length!==requested.length)return fail();const local=new Set<string>(),codes=new Map<string,string>();
  for(const definition of definitions){const code=text(definition.transactionCode,20),description=text(definition.description).trim();if(definition.hotelId!==packet.manifest.hotel||!description||codes.has(code))return fail();codes.set(code,description);}
  const usedCodes=new Set<string>();for(const row of transactions){const key=id(row.transactionNo);if(!requested.includes(key)||local.has(key))return fail();local.add(key);const code=text(row.transactionCode,20),description=codes.get(code)??fail();usedCodes.add(code);details.set(key,{row,description});}
  if(usedCodes.size!==codes.size)return fail();
 }
 if(seen.size!==ids.length||details.size!==ids.length)return fail();const atoms:PaymentOffsetDisplayAtom[]=[];
 for(const group of groups){const owned:{source:Row;detail:Row;description:string;account:string}[]=[];
  for(const source of group.source){const actual=details.get(id(source.transactionNo))??fail(),detail=actual.row,sourceAmounts=payment(source),detailAmounts=payment(detail);
   if(detail.transactionCode!==source.transactionCode||date(detail.transactionDate)!==date(source.transactionDate)||text(detail.reference)!==text(source.reference)||detailAmounts.debit!==sourceAmounts.debit||detailAmounts.credit!==sourceAmounts.credit||integer(object(detail.cashierInfo).cashierId)!==integer(object(source.cashierInfo).cashierId))return fail();
   if(detail.hotelId!==undefined&&detail.hotelId!==source.hotelId||detail.folioNo!==undefined&&id(detail.folioNo)!==id(source.folioNo)||detail.folioWindowNo!==undefined&&integer(detail.folioWindowNo,1,999)!==source.folioWindowNo||detail.guestInfo!==undefined&&id(object(object(detail.guestInfo).reservationId).id)!==packet.manifest.reservation_id||detail.reservationId!==undefined&&id(object(detail.reservationId).id)!==packet.manifest.reservation_id)return fail();
   const ownership=object(detail.aRInfo),invoice=id(ownership.invoiceNo),account=text(ownership.accountNumber,80).trim();if(!account)return fail();if(invoice===packet.manifest.invoice_no)owned.push({source,detail,description:actual.description,account});
  }
  if(!owned.length)continue;if(owned.length!==2||owned[0].account!==owned[1].account)return fail();const amounts=owned.map(p=>payment(p.detail));if(amounts.some(a=>a.debit!==0)||amounts[0].credit===0||amounts[0].credit!==-amounts[1].credit)return fail();
  for(const p of owned)atoms.push({id:id(p.source.transactionNo),date:date(p.source.transactionDate),description:p.description,reference:text(p.source.reference).trim(),debit:0,credit:payment(p.source).credit});
 }
 atoms.sort((a,b)=>a.date.localeCompare(b.date)||order(a.id,b.id));return {proof:structuredClone(raw),atoms};
}
/** Re-derive rather than trusting serialized caller-provided display atoms. */
export function revalidatePaymentOffsetDisplayCatalog(raw:PaymentOffsetDisplayCatalog):PaymentOffsetDisplayCatalog{
 const catalog=object(raw);keys(catalog,['proof','atoms']);const proof=object(catalog.proof) as unknown as ArPaymentOffsetDisplayProof,result=verifyArPaymentOffsetDisplayProof(proof.sourceBefore,proof);if(canonical(result.atoms)!==canonical(catalog.atoms))return fail();return result;
}
