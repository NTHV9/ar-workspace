import type {DirectNonVatProvenance} from './direct-nonvat-policy';
const fail=():never=>{throw Error('document_invoice_zero_vat_net_calculation_unverified');};
type Row=Record<string,unknown>;
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail();
const only=(v:Row,keys:string[])=>{if(Object.keys(v).some(k=>!keys.includes(k)))fail();};
/** The inclusive false row is the calculator's base representation, not a second
 * posted charge. This function validates layout and never returns money. */
export function verifyZeroVatNetCalculation(raw:unknown,hotel:string,code:string,signedCents:number,inclusive:boolean):void{
 if(!Number.isSafeInteger(signedCents)||!signedCents)fail();const response=object(raw),result=object(response.result),amount=signedCents/100;
 only(response,['result','links','hotelId','currencyCode']);only(result,['charges','totalAmount','hotelId','currencyCode']);if(!Array.isArray(result.charges)||result.charges.length!==(inclusive?2:1)||result.totalAmount!==amount)fail();
 const charges=(result.charges as unknown[]).map(object);for(const row of [response,result,...charges])if(row.hotelId!==undefined&&row.hotelId!==hotel||row.currencyCode!==undefined&&row.currencyCode!=='THB')fail();
 for(let n=0;n<charges.length;n++){const row=charges[n];only(row,['transactionCode','description','level','amount','bucket','sequence','basePosting','hotelId','currencyCode']);if(row.transactionCode!==code||row.level!=='TransactionCode'||row.sequence!==0||row.amount!==amount||row.basePosting!==(n===0))fail();const bucket=object(row.bucket),keys=Object.keys(bucket);
  if(inclusive&&n===0){if(keys.length)fail();}else if(keys.length!==3||keys.some(k=>!['bucket1','bucket2','bucket3'].includes(k))||[1,2,3].some(i=>bucket['bucket'+i]!==amount))fail();
 }
}
export type ZeroVatNetProvenance=DirectNonVatProvenance|'ordinary-revenue-zero-vat-net'|'exclusive-nonrevenue-zero-vat-net';
