import {directNonVatProvenance} from './direct-nonvat-policy';
type Row=Record<string,unknown>;
const object=(v:unknown):Row|undefined=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:undefined;
const empty=(v:unknown)=>v===undefined||Array.isArray(v)&&!v.length;
/** Actual zero posted tax supplies no VAT. This separate current report-domain
 * certificate places exclusive nonmanual F&B net in before-VAT, never NonVAT. */
export function exclusiveNonRevenueZeroVatNetProvenance(rules:unknown,hotel:string,code:string,source:Row):'exclusive-nonrevenue-zero-vat-net'|undefined{
 if(directNonVatProvenance(rules,hotel,code,source))return;
 const d=object(object(rules)?.transactionCode),c=object(d?.classification),kind=object(c?.transactionType),s=object(d?.trxSetup),g=object(d?.generatesSetup),flags=object(g?.addBaseAmtTo);
 if(!d||!c||!kind||!s||!g||!flags||d.hotelId!==hotel||d.code!==code||source.hotelId!==hotel||source.transactionCode!==code||source.transactionGroup!=='F&B'||c.type!=='Revenue'||kind.code!=='NonRevenue'||Object.hasOwn(kind,'taxCode')||object(c.group)?.code!=='F&B'||s.revenue!==false||s.manualPosting!==false||s.nonTaxable!==false||s.taxInclusive!==false||s.useForPaidout!==false||s.depositPostingOnly!==false||s.generatesType!==undefined||d.compTransaction!==false||!empty(d.associatedTransactionCodes)||!empty(d.transactionAdjustments)||d.adjustmentCode!==undefined||!empty(g.generates)||Object.keys(g).some(k=>!['addBaseAmtTo','generates'].includes(k))||Object.keys(flags).some(k=>!['bucket1','bucket2','bucket3'].includes(k))||[1,2,3].some(n=>flags['bucket'+n]!==false))return;
 return 'exclusive-nonrevenue-zero-vat-net';
}
