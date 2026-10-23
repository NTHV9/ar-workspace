import {canonical} from './ar-tax';
export interface PosReceiptEvidence {hotel:string;checkNumber:string;before:unknown;after:unknown}
export interface PosInterfaceEvidence {hotel:string;discoveryBefore:unknown;discoveryAfter:unknown;mappings:{logo:string;before:unknown;after:unknown}[]}
type Row=Record<string,unknown>;
const fail=():never=>{throw Error('document_invoice_pos_receipt_service_unverified');};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail();
const rows=(v:unknown):Row[]=>Array.isArray(v)?v.map(object):fail();
const amountPattern='(?:0|[1-9][0-9]*|[1-9][0-9]{0,2}(?:,[0-9]{3})+)\\.[0-9]{2}';
const cents=(s:string)=>{if(!new RegExp('^'+amountPattern+'$').test(s))return fail();const n=BigInt(s.replaceAll(',','').replace('.',''));if(n>BigInt(Number.MAX_SAFE_INTEGER))return fail();return Number(n);};
const abs=(n:bigint)=>n<0n?-n:n;
/** This parser describes a closed receipt. It does not transform its printed
 * CHK into an OPERA lookup key and never supplies replacement posting money. */
export function parseFullServiceReceipt(raw:unknown,expectedDate:string):{date:string;printedCheck:string;baseCents:number;serviceCents:number;vatCents:number;totalCents:number}{
 const response=object(raw),text=response.checkDetailsInfo;if(typeof text!=='string'||!text.length||text.length>32000||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(text.replaceAll('\r','').replaceAll('\n',''))||response.currencyCode!==undefined&&response.currencyCode!=='THB'||response.checkDate!==undefined&&response.checkDate!==expectedDate)fail();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(expectedDate)||new Date(expectedDate+'T00:00:00Z').toISOString().slice(0,10)!==expectedDate)return fail();
 const lines=(text as string).replaceAll('\r\n','\n').split('\n').map(l=>l.trim()).filter(Boolean);
 if(lines.some(l=>/\b(?:Tips?|Discount|Gratuity|Rounding)\b|\bDisc\./i.test(l)||new RegExp('-(?:THB\\s*)?'+amountPattern,'i').test(l)))fail();
 const check=lines.flatMap((l,index)=>{const m=/^CHK\s+([A-Za-z0-9_.-]+)\b/.exec(l);return m?[{printed:m[1],index}]:[];}),closed=lines.flatMap((l,index)=>/^[-* ]*Check Closed[-* ]*$/i.test(l)?[index]:[]);
 const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 const dates=lines.flatMap((l,index)=>{const m=/^(\d{1,2})\s+([A-Za-z]{3})'(\d{2})\s+([01]?\d|2[0-3]):([0-5]\d)\s+(AM|PM)$/i.exec(l);if(!m)return [];const month=months.findIndex(v=>v.toLowerCase()===m[2].toLowerCase()),hour=Number(m[4]),suffix=m[6].toUpperCase();if(month<0||hour>12&&suffix!=='PM'||hour===0&&suffix!=='AM')fail();const date=String(2000+Number(m[3]))+'-'+String(month+1).padStart(2,'0')+'-'+m[1].padStart(2,'0');return [{date,index}];});
 const foods=lines.flatMap((l,index)=>{const m=new RegExp('^(FOOD|BEVERAGE)\\s+THB\\s*('+amountPattern+')$','i').exec(l);return m?[{kind:m[1].toUpperCase(),amount:cents(m[2]),index}]:[];});
 if(check.length!==1||closed.length!==1||dates.length!==2||foods.length<1||foods.length>2||new Set(foods.map(f=>f.kind)).size!==foods.length||foods.some((f,n)=>f.amount<=0||f.index!==foods[0].index+n)||check[0].index>=foods[0].index||dates[0].index>=foods[0].index||dates[1].index<=closed[0]||dates.some(d=>d.date!==expectedDate))fail();
 const at=(index:number,label:string)=>{const m=new RegExp('^'+label+'\\s+THB\\s*('+amountPattern+')$','i').exec(lines[index]??'');return m?cents(m[1]):fail();};
 const start=foods[0].index+foods.length,serviceCents=at(start,'Service Charge 10%'),vatCents=at(start+1,'Vat 7%'),totalCents=at(start+2,'Payment'),change=at(start+3,'Change Due');
 const tenders=lines.flatMap((l,index)=>{const m=new RegExp('^ROOM CHARGE\\s+THB\\s*('+amountPattern+')$','i').exec(l);return m?[{amount:cents(m[1]),index}]:[];});
 const baseCents=foods.reduce((n,f)=>n+f.amount,0);
 if(!Number.isSafeInteger(baseCents)||serviceCents<=0||vatCents<=0||totalCents<=0||change!==0||tenders.length!==1||tenders[0].amount!==totalCents||tenders[0].index<=start+3||tenders[0].index>=closed[0]||BigInt(baseCents)+BigInt(serviceCents)+BigInt(vatCents)!==BigInt(totalCents)||abs(BigInt(serviceCents)*100n-BigInt(baseCents)*10n)>100n||abs(BigInt(vatCents)*100n-(BigInt(baseCents)+BigInt(serviceCents))*7n)>100n)fail();
 const consumed=new Set([...foods.map(f=>f.index),start,start+1,start+2,start+3,tenders[0].index]);
 for(let n=0;n<lines.length;n++){if(consumed.has(n))continue;const money=new RegExp('THB\\s*('+amountPattern+')','i').exec(lines[n]),tenderMoney=n>start+3&&n<closed[0]&&new RegExp(amountPattern+'$').test(lines[n]);if((money||tenderMoney)&&!(money&&n>start+3&&n<closed[0]&&cents(money[1])===0&&/^(CASH|VISA|MASTERCARD|AMEX|CREDIT CARD)\s+THB/i.test(lines[n])))fail();}
 return {date:expectedDate,printedCheck:check[0].printed,baseCents,serviceCents,vatCents,totalCents};
}
/** SC is a fee family, not a service classification. This only proves a typed
 * mapping; the exact receipt/group conjunction must separately prove service. */
export function verifyMappedScCode(e:PosInterfaceEvidence,code:string):true{return verifyMappedCode(e,code,false);}
export function verifyMappedFeeCode(e:PosInterfaceEvidence,code:string):true{return verifyMappedCode(e,code,true);}
export function verifyMappedDiscountCode(e:PosInterfaceEvidence,code:string):true{return verifyMappedCode(e,code,false,'DC');}
export function verifyMappedSalesCode(e:PosInterfaceEvidence,code:string):true{return verifyMappedCode(e,code,false,'ST');}
function verifyMappedCode(e:PosInterfaceEvidence,code:string,allowCorroboratingTip:boolean,family='SC'):true{
 if(!e||typeof e.hotel!=='string'||!e.hotel||typeof code!=='string'||!code||canonical(e.discoveryBefore)!==canonical(e.discoveryAfter))fail();
 const interfaces=rows(object(e.discoveryBefore).hotelInterfaces),logos=new Set<string>();
 for(const row of interfaces){if(row.hotelId!==e.hotel||row.interfaceType!=='Pos'||row.activeFlag!==true||typeof row.logo!=='string'||!row.logo||logos.has(row.logo))fail();logos.add(row.logo as string);}
 if(!logos.size||!Array.isArray(e.mappings)||e.mappings.length!==logos.size||new Set(e.mappings.map(m=>m.logo)).size!==logos.size)fail();
 let uses=0,witness=false;
 for(const mapping of e.mappings){if(!logos.has(mapping.logo)||canonical(mapping.before)!==canonical(mapping.after))fail();const info=object(object(mapping.before).details).transactionsInfo,data=object(info),itemizers=rows(data.itemizers),transactions=rows(data.transactionCodes);
  if(data.allChargesCode===code||data.miniBarCode===code||data.postingAccounts!==undefined&&rows(data.postingAccounts).some(p=>p.transactionCode===code))fail();
  for(const row of transactions){if(row.code===code)fail();const items=row.itemizersShortInfo===undefined?[]:rows(row.itemizersShortInfo);if(row.tipCode===code&&(!allowCorroboratingTip||!items.some(item=>item.code===code)))fail();
   for(const item of items){if(item.code!==code)continue;uses++;if(!Number.isSafeInteger(item.itemNumber)||Number(item.itemNumber)<1)fail();const resolved=itemizers.filter(i=>i.splitPost===item.itemNumber);if(!resolved.length)fail();let localWitness=false;
    for(const alias of resolved){if(alias.splitFactor!==1||typeof alias.splitCode!=='string'||!new RegExp('^'+family+'(?:0|[1-9]|1[0-6])$').test(alias.splitCode))fail();if(alias.splitCode!==family+'0')localWitness=true;}
    if(!localWitness)fail();witness=true;
   }
  }
 }
 if(!uses||!witness)fail();return true;
}
