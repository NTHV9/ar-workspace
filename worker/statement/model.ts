import {amountCents} from '../opera/normalize';
import type {DocumentInvoice} from '../documents/native-invoice';
export interface StatementRow {id:string;date:string;folio:string;guest:string;arrival:string;departure:string;voucher:string;debit:number;credit:number;balance:number}
export interface StatementModel {hotel:string;accountId:string;accountNo:string;address:string[];printDate:string;rows:StatementRow[];total:number;aging:{label:string;cents:number}[]}
const obj=(x:unknown):Record<string,unknown>=>x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:{};
const text=(x:unknown)=>{if(x==null)return '';if(!['string','number'].includes(typeof x))throw Error('document_statement_data_invalid');const s=String(x);if(s.length>1000||/[\u0000-\u0008\u000b-\u001f]/.test(s))throw Error('document_statement_data_invalid');return s;};
const date=(x:unknown)=>{const s=text(x);if(!s)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('document_statement_date_invalid');return s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(2,4);};
export function statementModel(raw:unknown,manifest:DocumentInvoice[],printDate:string):StatementModel {
 const a=obj(obj(raw).accountDetails);if(!manifest.length||manifest.length>500)throw Error('document_statement_selection_invalid');
 const scope=manifest[0];if(a.hotelId!==scope.hotel||text(obj(a.accountId).id)!==scope.account_id||!Array.isArray(a.invoices))throw Error('document_statement_scope_invalid');
 // Positive THB assertion on the enclosing account before allowing omitted item currency.
 amountCents(obj(a.summary).total);
 const seen=new Set<string>();const rows=manifest.map(item=>{
  if(seen.has(item.id)||item.hotel!==scope.hotel||item.account_id!==scope.account_id||!['standalone','parent'].includes(item.collection_role))throw Error('document_statement_selection_invalid');seen.add(item.id);
  const hits=(a.invoices as unknown[]).map(obj).filter(i=>text(i.transactionNo)===item.id);if(hits.length!==1)throw Error('document_source_changed');const i=hits[0];
  const balance=amountCents(i.balance,'THB'),debit=amountCents(i.amount,'THB'),payments=amountCents(i.payments,'THB');
  if(i.parentInvoiceNo!=null||balance<=0||balance!==Math.round(item.open*100)||text(i.invoiceNo)!==item.invoice_no||text(i.folioNo)!==item.folio_no||debit-payments!==balance)throw Error('document_source_changed');
  const stay=obj(obj(i.reservationInfo).roomStay);
  return {id:item.id,date:date(i.transactionDate),folio:text(i.folioNo),guest:text(i.guestName),arrival:date(stay.arrivalDate),departure:date(stay.departureDate),voucher:text(i.reference),debit,credit:-payments,balance};
 });
 const agingRaw=obj(a.agingInfo).aging;if(!Array.isArray(agingRaw)||agingRaw.length!==6)throw Error('document_statement_aging_invalid');
 const seq=new Set<number>();const aging=agingRaw.map(obj).sort((x,y)=>Number(x.sequence)-Number(y.sequence)).map(b=>{if(!Number.isSafeInteger(b.sequence)||seq.has(Number(b.sequence)))throw Error('document_statement_aging_invalid');seq.add(Number(b.sequence));const label=text(b.agingBucketRange);if(!label)throw Error('document_statement_aging_invalid');return {label,cents:amountCents(obj(b.balanceInfo).total,'THB')};});
 const address=obj(obj(a.address).address);const lines=address.addressLine;if(lines!=null&&!Array.isArray(lines))throw Error('document_statement_address_invalid');
 const country=obj(address.country);const addresses=[text(a.accountName),...(Array.isArray(lines)?lines.map(text):[]),[text(address.cityName),text(address.postalCode)].filter(Boolean).join(' '),text(country.value??country.code)].filter(Boolean);
 if(!addresses[0]||!text(a.accountNo))throw Error('document_statement_address_invalid');
 const total=rows.reduce((n,r)=>n+r.balance,0);if(!Number.isSafeInteger(total))throw Error('document_statement_amount_invalid');
 return {hotel:scope.hotel,accountId:scope.account_id,accountNo:text(a.accountNo),address:addresses,printDate:date(printDate),rows,total,aging};
}
