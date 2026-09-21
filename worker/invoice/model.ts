import {amountCents} from '../opera/normalize';
import type {DocumentInvoice} from '../documents/native-invoice';
import type {InvoiceModel,InvoiceLine} from './types';
type Row=Record<string,unknown>;
const fail=(stage:string):never=>{throw Error('document_invoice_'+stage);};
export const record=(v:unknown):Row=>{if(!v||typeof v!=='object'||Array.isArray(v))return fail('data_invalid');return v as Row;};
const optional=(v:unknown):Row=>v==null?{}:record(v);
const rows=(v:unknown):Row[]=>{if(!Array.isArray(v))return fail('data_invalid');return v.map(record);};
const text=(v:unknown)=>{if(v==null)return '';if(!['string','number'].includes(typeof v))return fail('data_invalid');const s=String(v);if(s.length>2000||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(s))return fail('data_invalid');return s.trim();};
const id=(v:unknown)=>{const s=text(v);if(!/^[1-9][0-9]{0,15}$/.test(s))return fail('identity_invalid');return s;};
export const dateText=(v:unknown)=>{const s=text(v);if(!s)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)return fail('date_invalid');return s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(2,4);};
const cents=(v:unknown)=>amountCents(v,'THB');
const optionalCents=(v:unknown)=>v==null?0:cents(v);
const sum=(values:number[])=>{const total=values.reduce((n,v)=>n+v,0);if(!Number.isSafeInteger(total))return fail('amount_invalid');return total;};
// Preserve OPERA's fractional generates until the entire invoice is totalled.
// Rounding each night's VAT to cents would change the native footer by satang.
const UNIT=1000000000000n,CENT=UNIT/100n;
function precise(v:unknown):bigint{
 const a=record(v);if(a.currencyCode!=='THB'||typeof a.amount!=='number'||!Number.isFinite(a.amount))return fail('currency_invalid');
 const m=String(a.amount).match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);if(!m)return fail('amount_invalid');
 const frac=m[3]??'',shift=12+Number(m[4]??0)-frac.length;if(Math.abs(shift)>50)return fail('amount_invalid');let n=BigInt(m[2]+frac);n=shift>=0?n*10n**BigInt(shift):n/10n**BigInt(-shift);return m[1]?-n:n;
}
const abs=(n:bigint)=>n<0n?-n:n;
const rounded=(units:bigint)=>{const n=Number((abs(units)+CENT/2n)/CENT)*(units<0n?-1:1);if(!Number.isSafeInteger(n))return fail('amount_invalid');return n;};

export interface InvoicePacket {manifest:DocumentInvoice;account:unknown;invoice:unknown;reservation:unknown;postings:unknown;taxRows:unknown[];taxCodes:unknown[];payeeTaxNumber?:string}
export function invoiceModel(packet:InvoicePacket,now:Date=new Date()):InvoiceModel{
 const {manifest:m}=packet,a=record(packet.account),i=record(packet.invoice),reservation=record(packet.reservation),postingData=record(packet.postings);
 if(a.hotelId!==m.hotel||text(record(a.accountId).id)!==m.account_id||i.hotelId!==m.hotel||id(i.transactionNo)!==m.id||text(i.invoiceNo)!==m.invoice_no||text(i.folioNo)!==m.folio_no||!m.reservation_id||!m.folio_no||!m.invoice_no||!['standalone','parent'].includes(m.collection_role)||m.open<=0||i.parentInvoiceNo!=null)return fail('scope_invalid');
 if(reservation.hotelId!==m.hotel||!rows(reservation.reservationIdList).some(r=>r.type==='Reservation'&&text(r.id)===m.reservation_id))return fail('scope_invalid');
 const outstanding=cents(i.balance),currentAmount=cents(i.amount);if(outstanding!==Math.round(m.open*100)||i.folioDate!==m.folio_date)throw Error('document_source_changed');
 const codes=rows(postingData.trxCodesInfo),postings=rows(postingData.invoicePostingsDetails);if(!postings.length||postings.length>=4000)return fail('postings_incomplete');
 const postingDates=new Map(postings.map(p=>[String(p.transactionNo),text(p.transactionDate)]));
 const seen=new Set<string>(),lines:InvoiceLine[]=postings.map(p=>{
  const postingId=id(p.transactionNo);if(seen.has(postingId))return fail('posting_duplicate');seen.add(postingId);
  const code=codes.filter(c=>c.hotelId===m.hotel&&c.transactionCode===p.transactionCode);if(code.length!==1||!text(code[0].description))return fail('posting_code_invalid');
  const debit=optionalCents(p.debitAmount),credit=optionalCents(p.creditAmount);if(!debit&&!credit||debit&&credit)return fail('posting_amount_invalid');
  // OPERA's AR posting check number is the printed reference. The financial
  // transaction identity remains separate for tax and scope verification.
  return {id:postingId,date:dateText(p.transactionDate),description:text(code[0].description),reference:text(p.checkNo),debit,credit};
 }).sort((x,y)=>postingDates.get(x.id)!.localeCompare(postingDates.get(y.id)!)||Number(x.id)-Number(y.id));
 const debit=sum(lines.map(l=>l.debit)),credit=sum(lines.map(l=>l.credit)),gross=debit-credit;if(!Number.isSafeInteger(gross)||gross!==currentAmount)throw Error('document_source_changed');
 const netRows=packet.taxRows.map(record),byId=new Map<string,Row>();
 for(const entry of netRows){const p=record(entry.posting),key=id(p.transactionNo);if(byId.has(key))return fail('tax_duplicate');byId.set(key,entry);}
 const childRows=new Map<string,Row[]>();for(const e of netRows){const p=record(e.posting),parent=text(p.referencePackageTransactionNo);if(parent){const group=childRows.get(parent)??[];group.push(e);childRows.set(parent,group);}}
 const taxCodes=packet.taxCodes.map(record),taxSeen=new Set<string>(),componentSeen=new Set<string>();let vatUnits=0n,nonTaxableUnits=0n;
 for(const line of lines){const root=byId.get(line.id);if(!root)return fail('tax_coverage_missing');const rootPosting=record(root.posting);
  if(rootPosting.hotelId!==m.hotel||text(rootPosting.folioNo)!==m.folio_no||text(record(record(rootPosting.guestInfo).reservationId).id)!==m.reservation_id)return fail('tax_scope_invalid');
  // OPERA groups both the visible wrapper and its component postings under the
  // original package reference; this is distinct from the wrapper's posting ID.
  const components=rootPosting.transactionType==='Wrapper'?(childRows.get(id(rootPosting.referencePackageTransactionNo))??[]).filter(e=>record(e.posting).transactionType!=='Wrapper'):[root];if(!components.length)return fail('tax_coverage_missing');let rootGross=0n;
  for(const component of components){const p=record(component.posting),key=id(p.transactionNo);if(componentSeen.has(key))return fail('tax_duplicate');componentSeen.add(key);
   if(p.hotelId!==m.hotel||text(p.folioNo)!==m.folio_no||text(record(record(p.guestInfo).reservationId).id)!==m.reservation_id)return fail('tax_scope_invalid');
   const breakdown=record(component.postingBreakdown),grossAmount=precise(breakdown.grossAmount),net=precise(breakdown.netAmount);let generated=0n,vat=0n;
   for(const raw of rows(breakdown.taxes)){const key=id(raw.transactionNo);if(taxSeen.has(key)||text(raw.referenceTransactionNo)!==text(p.transactionNo))return fail('tax_scope_invalid');taxSeen.add(key);const definitions=taxCodes.filter(c=>c.hotelId===m.hotel&&c.transactionCode===raw.transactionCode);if(definitions.length!==1)return fail('tax_code_invalid');const code=definitions[0],amount=precise(raw.amount);generated+=amount;
    if(code.transactionGroup==='TAX'&&/\bvat\b/i.test(text(code.description)))vat+=amount;else if(code.transactionGroup!=='SVC')return fail('tax_code_unsupported');
   }
   if(abs(grossAmount-net-generated)>10000000n)return fail('tax_reconciliation_failed');
   if(vat!==0n){if(abs(vat*107n-grossAmount*7n)>100000000n)return fail('tax_rate_unsupported');vatUnits+=vat;}else nonTaxableUnits+=grossAmount;
   rootGross+=grossAmount;
  }
  if(rounded(rootGross)!==line.debit-line.credit)return fail('tax_reconciliation_failed');
 }
 const vat=rounded(vatUnits),nonTaxable=rounded(nonTaxableUnits),taxableNet=gross-vat-nonTaxable;if(!Number.isSafeInteger(taxableNet))return fail('amount_invalid');
 const address=optional(optional(a.address).address),addressLines=address.addressLine==null?[]:rowsOfText(address.addressLine),country=optional(address.country);
 const billAddress=[text(a.accountName),...addressLines,[text(address.cityName),text(address.postalCode)].filter(Boolean).join(' '),text(country.value??country.code)].filter(Boolean);if(!billAddress[0])return fail('address_invalid');
 const stay=record(reservation.roomStay),ids=rows(reservation.reservationIdList),cashier=optional(i.cashierInfo);
 const printed=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now),part=(type:string)=>printed.find(p=>p.type===type)?.value??'';
 return {hotel:m.hotel,accountId:m.account_id,invoiceId:m.id,folio:m.folio_no,voucher:text(i.reference),address:billAddress,company:text(a.accountName),guest:text(i.guestName),taxId:text(packet.payeeTaxNumber),room:text(stay.roomId),arrival:dateText(stay.arrivalDate),departure:dateText(stay.departureDate),adults:text(stay.adultCount),children:text(stay.childCount),confirmation:text(ids.find(r=>r.type==='Confirmation')?.id),cashierNo:text(cashier.cashierId),cashierName:text(cashier.cashierName),printDate:`${part('day')}/${part('month')}/${part('year')}`,printTime:`${part('hour')}:${part('minute')}`,lines,debit,credit,gross,taxableNet,nonTaxable,vat,outstanding};
}
function rowsOfText(v:unknown):string[]{if(!Array.isArray(v))return fail('address_invalid');return v.map(text);}
