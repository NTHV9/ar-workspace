import {canonical} from './ar-tax';
import {currentArTaxSource,type CurrentArTaxSource} from './current-ar-tax';
import {directNonVatProvenance} from './direct-nonvat-policy';
import type {EmbeddedNonVatGroup} from './embedded-generates';
import {amountCents} from '../opera/normalize';
import type {NativeTaxControls} from './native-tax-controls';
import type {InvoicePacket} from './model';
type Row=Record<string,unknown>;
const fail=():never=>{throw Error('document_invoice_direct_zero_tax_unverified');};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail();
const list=(v:unknown):Row[]=>Array.isArray(v)?v.map(object):fail();
const text=(v:unknown)=>v==null?'':String(v).trim();
const id=(v:unknown)=>{const s=text(v);return /^[1-9][0-9]{0,15}$/.test(s)?s:fail();};
const signed=(p:Row)=>{const d=p.debitAmount==null?0:amountCents(p.debitAmount,'THB'),c=p.creditAmount==null?0:amountCents(p.creditAmount,'THB');if(!d&&!c||d&&c)return fail();return d-c;};
export const directGroupKey=(p:Row)=>JSON.stringify([text(p.transactionDate),text(p.checkNo)?'check':'posting',text(p.checkNo)||id(p.transactionNo)]);
export const directVatDefinition=(d:Row)=>(d.transactionGroup==='TAX'||d.transactionGroup==='F&B')&&/\bvat\b/i.test(text(d.description));
/** OPERA may reorder selected postings between identical reads. Normalize only
 * that set, after checking its exact IDs; every row field and all other source
 * arrays remain part of the freshness fence. */
function directSource(packet:CurrentArTaxSource):CurrentArTaxSource{
 const source=structuredClone(currentArTaxSource(packet)),postings=object(source.postings),selected=list(postings.invoicePostingsDetails);
 if(new Set(selected.map(p=>id(p.transactionNo))).size!==selected.length)fail();
 postings.invoicePostingsDetails=[...selected].sort((a,b)=>id(a.transactionNo).localeCompare(id(b.transactionNo)));
 return source;
}
export interface DirectZeroTaxPlan {candidates:{id:string;posting:Row;definition:Row;signedCents:number}[];source:CurrentArTaxSource;fingerprint:string}
export interface DirectZeroTaxProof {version:1;sourceBefore:CurrentArTaxSource;sourceAfter:CurrentArTaxSource;groups:EmbeddedNonVatGroup[];nativeControls?:NativeTaxControls}
/** Mirror the model's complete date/check groups. Only direct groups with no
 * posted VAT are candidates; wrappers, embedded generates and AR graphs retain
 * their own independent qualification. Keep every signed posting atom. */
export function inspectDirectZeroTax(packet:CurrentArTaxSource):DirectZeroTaxPlan{
 const m=packet.manifest,a=object(packet.account),i=object(packet.invoice),data=object(packet.postings),selected=list(data.invoicePostingsDetails),definitions=list(data.trxCodesInfo),raw=packet.taxRows.map(object),byId=new Map(raw.map(e=>[id(object(e.posting).transactionNo),e]));
 if(a.hotelId!==m.hotel||text(object(a.accountId).id)!==m.account_id||i.hotelId!==m.hotel||id(i.transactionNo)!==m.id||text(i.invoiceNo)!==m.invoice_no||text(i.folioNo)!==m.folio_no||i.folioDate!==m.folio_date||i.parentInvoiceNo!=null||amountCents(i.balance,'THB')!==Math.round(m.open*100)||byId.size!==raw.length||new Set(selected.map(p=>id(p.transactionNo))).size!==selected.length)fail();
 const groups=new Map<string,{taxCount:number;rows:{selected:Row;posting:Row;breakdown:Row;definition:Row}[]}>();
 for(const s of selected){const entry=byId.get(id(s.transactionNo));if(!entry)continue;const p=object(entry.posting);if(['Wrapper','Payment'].includes(text(p.transactionType)))continue;
  const b=object(entry.postingBreakdown);if(b.taxes!==undefined&&list(b.taxes).length)continue;
  const ds=definitions.filter(d=>d.hotelId===m.hotel&&d.transactionCode===s.transactionCode);if(ds.length!==1)fail();
  const key=directGroupKey(s),group=groups.get(key)??{taxCount:0,rows:[]};if(directVatDefinition(ds[0]))group.taxCount++;else group.rows.push({selected:s,posting:p,breakdown:b,definition:ds[0]});groups.set(key,group);
 }
 const candidates:DirectZeroTaxPlan['candidates']=[];
 for(const group of groups.values()){if(group.taxCount)continue;for(const row of group.rows){const {selected:s,posting:p,breakdown:b,definition}=row,amount=signed(s),gross=object(b.grossAmount),net=object(b.netAmount),posted=object(p.postedAmount),day=text(p.transactionDate);
   if(p.transactionType!=='Revenue'||p.hotelId!==m.hotel||text(p.folioNo)!==m.folio_no||text(object(object(p.guestInfo).reservationId).id)!==m.reservation_id||p.transactionCode!==s.transactionCode||day!==text(s.transactionDate)||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day||signed(p)!==amount||gross.currencyCode!=='THB'||net.currencyCode!=='THB'||posted.currencyCode!=='THB'||typeof posted.amount!=='number'||gross.amount!==amount/100||net.amount!==gross.amount||Math.abs(Number(posted.amount))!==Math.abs(amount/100))fail();
   candidates.push({id:id(p.transactionNo),posting:p,definition,signedCents:amount});
  }}
 const source=directSource(packet);return {candidates,source,fingerprint:canonical(source)};
}
function verifyExplicit(g:DirectZeroTaxPlan['candidates'][number],e:EmbeddedNonVatGroup,hotel:string){
 const provenance=directNonVatProvenance(e.rules,hotel,String(g.posting.transactionCode),g.definition);
 if(e.postingId!==g.id||!provenance||e.provenance!==provenance||canonical(e.rules)!==canonical(e.rulesAfter)||canonical(e.calculation)!==canonical(e.calculationAfter))fail();
 const calculation=object(e.calculation),result=object(calculation.result),charges=list(result.charges),amount=g.signedCents/100;if(charges.length!==1||result.totalAmount!==amount)fail();const charge=charges[0];
 if(charge.transactionCode!==g.posting.transactionCode||charge.level!=='TransactionCode'||charge.basePosting!==true||charge.sequence!==0||charge.amount!==amount)fail();
 for(const scoped of [calculation,result,charge])if(Object.hasOwn(scoped,'hotelId')&&scoped.hotelId!==hotel||Object.hasOwn(scoped,'currencyCode')&&scoped.currencyCode!=='THB')fail();
}
export function verifyDirectZeroTaxProof(packet:InvoicePacket):'explicit'|'native'{
 const proof=packet.directZeroTaxProof??fail(),plan=inspectDirectZeroTax(packet);
 if(proof.version!==1||!plan.candidates.length||canonical(directSource(proof.sourceBefore))!==plan.fingerprint||canonical(directSource(proof.sourceAfter))!==plan.fingerprint)fail();
 if(proof.nativeControls){if(proof.groups.length||!proof.nativeControls.fullTotals||canonical(proof.nativeControls)!==canonical(packet.nativeTaxControls))fail();return 'native';}
 if(proof.groups.length!==plan.candidates.length||new Set(proof.groups.map(g=>g.postingId)).size!==plan.candidates.length)fail();
 for(const g of plan.candidates)verifyExplicit(g,proof.groups.find(e=>e.postingId===g.id)??fail(),packet.manifest.hotel);return 'explicit';
}
/** Ordinary PDF reads call this even when the legacy model would return a
 * successful zero-tax inference. No current flag supplies a taxable-net guess. */
export async function readDirectZeroTaxEvidence(packet:InvoicePacket,readRules:((code:string)=>Promise<unknown>)|undefined,readFresh:()=>Promise<InvoicePacket>,readCalculation:((code:string,amount:number)=>Promise<unknown>)|undefined,readNative:(()=>Promise<NativeTaxControls>)|undefined):Promise<InvoicePacket>{
 const plan=inspectDirectZeroTax(packet);if(!plan.candidates.length)return packet;
 const codes=[...new Set(plan.candidates.map(g=>String(g.posting.transactionCode)))];
 const readAll=async()=>{const values=new Map<string,unknown>();for(const code of codes)values.set(code,await readRules!(code));return values;};
 const before=readRules&&readCalculation?await readAll():undefined;
 const explicit=before&&plan.candidates.every(g=>directNonVatProvenance(before.get(String(g.posting.transactionCode)),packet.manifest.hotel,String(g.posting.transactionCode),g.definition));
 let groups:EmbeddedNonVatGroup[]=[],nativeControls:NativeTaxControls|undefined;
 const calculationReader=()=>{const values=new Map<string,unknown>();return async(code:string,amount:number)=>{const key=JSON.stringify([code,amount]);if(!values.has(key))values.set(key,await readCalculation!(code,amount));return values.get(key);};};
 const calculationBefore=calculationReader(),calculationAfterRead=calculationReader();
 if(explicit){for(const g of plan.candidates){const code=String(g.posting.transactionCode),rules=before.get(code),calculation=await calculationBefore(code,g.signedCents/100),e={postingId:g.id,rules,rulesAfter:rules,calculation,calculationAfter:calculation,provenance:directNonVatProvenance(rules,packet.manifest.hotel,code,g.definition)};verifyExplicit(g,e,packet.manifest.hotel);groups.push(e);}}
 else{if(!readNative)fail();nativeControls=await readNative!();if(!nativeControls.fullTotals)fail();}
 const fresh=await readFresh();if(canonical(directSource(fresh))!==plan.fingerprint)throw Error('document_source_changed');
 if(explicit){const after=await readAll();for(let n=0;n<groups.length;n++){const g=plan.candidates[n],e=groups[n],rulesAfter=after.get(String(g.posting.transactionCode)),calculationAfter=await calculationAfterRead(String(g.posting.transactionCode),g.signedCents/100);if(canonical(e.rules)!==canonical(rulesAfter)||canonical(e.calculation)!==canonical(calculationAfter))throw Error('document_source_changed');groups[n]={...e,rulesAfter,calculationAfter};}}
 const result:InvoicePacket={...packet,...nativeControls?{nativeTaxControls:nativeControls}:{},directZeroTaxProof:{version:1,sourceBefore:plan.source,sourceAfter:directSource(fresh),groups,nativeControls}};verifyDirectZeroTaxProof(result);return result;
}
