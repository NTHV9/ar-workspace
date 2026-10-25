type Row=Record<string,unknown>;
const object=(value:unknown):Row|undefined=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:undefined;
export type DirectNonVatProvenance='opera-non-taxable'|'owner-confirmed-tsan-6002-non-vat';
const description=(value:unknown)=>typeof value==='string'?value.trim().replace(/\s*\*$/,'').trim():'';

/** Owner confirmation, 22 October 2026: TSAN Taxi Service (6002) is NonVAT,
 * despite OPERA's nonTaxable:false flag. This is a hotel/transaction-code policy,
 * never an invoice override or inference from a transport description. Airport
 * Transportation uses OPERA's explicit nonTaxable:true, without an exception.
 * This helper grants no posted-row proof: the caller must separately establish
 * exact source scope, zero posted generates, net=gross and stable before/after
 * metadata plus an unchanged effective calculation returning only the signed
 * base charge. A zero-tax calculation alone is insufficient (other codes can
 * report zero generates without native NonVAT). Changed rules or posted tax
 * cannot be overridden by this policy. */
export function directNonVatProvenance(rules:unknown,hotel:string,code:string,source:Row):DirectNonVatProvenance|undefined{
 const root=object(object(rules)?.transactionCode),classification=object(root?.classification),kind=object(classification?.transactionType),group=object(classification?.group),setup=object(root?.trxSetup),generates=object(root?.generatesSetup),flags=object(generates?.addBaseAmtTo);
 if(!root||!classification||!kind||!group||!setup||!generates||!flags||root.hotelId!==hotel||root.code!==code||source.hotelId!==hotel||source.transactionCode!==code||classification.type!=='Revenue'||typeof kind.code!=='string'||['Tax','NonRevenue'].includes(kind.code)||Object.hasOwn(kind,'taxCode')||typeof group.code!=='string'||!group.code||group.code!==source.transactionGroup||group.code==='TAX'||setup.taxInclusive!==false||setup.generatesType!==undefined||root.compTransaction!==false||!Array.isArray(root.associatedTransactionCodes)||root.associatedTransactionCodes.length||generates.generates!==undefined&&(!Array.isArray(generates.generates)||generates.generates.length)||Object.keys(generates).some(key=>!['generates','addBaseAmtTo'].includes(key))||Object.keys(flags).some(key=>!['bucket1','bucket2','bucket3'].includes(key))||[1,2,3].some(n=>flags['bucket'+n]!==false))return;
 if(setup.nonTaxable===true)return 'opera-non-taxable';
 if(hotel==='TSAN'&&code==='6002'&&setup.nonTaxable===false&&kind.code==='Others'&&group.code==='MISC'&&description(object(root.description)?.defaultText)==='Taxi Service'&&description(source.description)==='Taxi Service')return 'owner-confirmed-tsan-6002-non-vat';
}
