import type {AgingInvoice} from './aging-model';
export type InvoiceSortKey='hotel'|'invoiceNo'|'folioNo'|'guest'|'date'|'age'|'open';
export const invoiceColumns:readonly [InvoiceSortKey,string][]=[['hotel','Hotel'],['invoiceNo','Invoice No.'],['folioNo','Folio No.'],['guest','Guest'],['date','Source date'],['age','OPERA age'],['open','Open · THB']];
const text=(v:string)=>v.normalize('NFKC').toLocaleLowerCase().trim();
export function filterSortInvoices(rows:AgingInvoice[],search:string,key:InvoiceSortKey,descending:boolean){
 const query=text(search);
 return rows.filter(row=>!query||[row.hotel,row.invoiceNo,row.folioNo,row.guest].some(value=>text(value).includes(query))).sort((a,b)=>{
  const x=a[key],y=b[key],empty=(v:string|number|null)=>v===null||v==='';
  if(empty(x)!==empty(y))return empty(x)?1:-1;
  const compared=empty(x)?0:typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'en',{numeric:true,sensitivity:'base'});
  return compared*(descending?-1:1)||a.hotel.localeCompare(b.hotel)||a.accountId.localeCompare(b.accountId)||a.id.localeCompare(b.id,'en',{numeric:true});
 });
}
