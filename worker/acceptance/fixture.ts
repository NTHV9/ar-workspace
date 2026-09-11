import {PDFDocument,StandardFonts} from 'pdf-lib';
import type {FetchPort} from '../opera/client';
export interface AcceptanceInvoice {id:string;invoiceNo:string;folioNo:string;reservationId:string;date:string;arrival:string;guest:string;reference:string;original:number;open:number}
export interface AcceptanceFixture {accountId:string;accountNo:string;name:string;hotel:'KAT';businessDate:string;invoices:AcceptanceInvoice[]}
const money=(amount:number)=>({amount,currencyCode:'THB'});
const shift=(day:string,n:number)=>{const value=new Date(day+'T00:00:00Z');value.setUTCDate(value.getUTCDate()+n);return value.toISOString().slice(0,10);};
export function newAcceptanceFixture(id:string,day=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Bangkok'})):AcceptanceFixture{
 if(!/^[0-9a-f-]{36}$/.test(id)||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('acceptance_invalid');
 return {accountId:'SYN-'+id,accountNo:'SYN-AR-001',name:'SYNTHETIC ACCEPTANCE — NOT A CUSTOMER',hotel:'KAT',businessDate:day,invoices:[21,41,72].map((age,n)=>({id:String(910001+n),invoiceNo:String(920001+n),folioNo:String(930001+n),reservationId:String(940001+n),date:shift(day,-age),arrival:shift(day,-age-3),guest:n===1?'Chloé Synthetic':'Synthetic Guest '+String.fromCharCode(65+n),reference:'SYN-VOUCHER-'+(n+1),original:1000*(n+1),open:1000*(n+1)}))};
}
export function checkedAcceptanceFixture(raw:unknown):AcceptanceFixture{
 if(!raw||typeof raw!=='object')throw Error('acceptance_fixture_invalid');const f=raw as AcceptanceFixture;
 if(f.hotel!=='KAT'||typeof f.accountId!=='string'||!/^SYN-[0-9a-f-]{36}$/.test(f.accountId)||f.name!=='SYNTHETIC ACCEPTANCE — NOT A CUSTOMER'||f.accountNo!=='SYN-AR-001'||!/^\d{4}-\d{2}-\d{2}$/.test(f.businessDate)||!Array.isArray(f.invoices)||f.invoices.length!==3)throw Error('acceptance_fixture_invalid');
 for(const [index,row] of f.invoices.entries())if(row.id!==String(910001+index)||row.invoiceNo!==String(920001+index)||row.folioNo!==String(930001+index)||row.reservationId!==String(940001+index)||row.original!==1000*(index+1)||!Number.isFinite(row.open)||row.open<0||row.open>row.original||Math.round(row.open*100)!==row.open*100||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!/^\d{4}-\d{2}-\d{2}$/.test(row.arrival)||typeof row.guest!=='string'||row.guest.length>100||typeof row.reference!=='string'||!row.reference.startsWith('SYN-'))throw Error('acceptance_fixture_invalid');
 return f;
}
const paymentId=(row:AcceptanceInvoice)=>String(Number(row.id)+1000);
function rawInvoice(f:AcceptanceFixture,row:AcceptanceInvoice,history=false){return {hotelId:f.hotel,transactionNo:row.id,invoiceNo:row.invoiceNo,folioNo:row.folioNo,reservationId:{id:row.reservationId},folioDate:row.date,transactionDate:row.date,invoiceType:'Normal',originalAmount:money(row.original),amount:money(row.original),payments:money((history?1:-1)*(row.original-row.open)),balance:money(row.open),age:Math.round((Date.parse(f.businessDate)-Date.parse(row.date))/86400000),guestName:row.guest,reference:row.reference,printed:false,compressed:false,reservationInfo:{roomStay:{arrivalDate:row.arrival,departureDate:row.date}}};}
function rawPayment(f:AcceptanceFixture,row:AcceptanceInvoice){const paid=row.original-row.open;return {hotelId:f.hotel,transactionNo:paymentId(row),transactionCode:'9000',transactionDate:f.businessDate,postingDate:f.businessDate,amount:money(-paid),amountUsed:money(-paid),balance:money(0),transferredIn:false,transferredOut:false};}
export function acceptanceAccount(f:AcceptanceFixture){
 const debit=f.invoices.reduce((n,r)=>n+r.original,0),balance=f.invoices.reduce((n,r)=>n+r.open,0),bands=[[0,30,'Up to 30'],[31,60,'31 - 60'],[61,90,'61 - 90'],[91,120,'91 - 120'],[121,150,'121 - 150'],[151,99999,'151 and Over']] as const;
 return {accountDetails:{hotelId:f.hotel,accountId:{id:f.accountId},accountNo:f.accountNo,accountName:f.name,type:'SYNTHETIC',balance:money(balance),summary:{debit:money(debit),credit:money(debit-balance),total:money(balance)},address:{address:{addressLine:['Synthetic test address only'],cityName:'Test workspace',country:{code:'TH',value:'Thailand'}}},agingInfo:{aging:bands.map(([start,end,label],index)=>{const rows=f.invoices.filter(r=>{const age=(Date.parse(f.businessDate)-Date.parse(r.date))/86400000;return age>=start&&age<=end;}),amount=rows.reduce((n,r)=>n+r.open,0),original=rows.reduce((n,r)=>n+r.original,0);return {agingBucketRange:label,agingStartDay:start,agingEndDay:end,sequence:index+1,balanceInfo:{debit:money(original),credit:money(original-amount),total:money(amount)}};})},invoices:f.invoices.filter(r=>r.open!==0).map(r=>rawInvoice(f,r)),payments:[]}};
}
/** Test source adapter only. No network fallthrough and no OPERA credentials. */
export function acceptanceTransport(fixture:Promise<AcceptanceFixture>|AcceptanceFixture,hotel:string):FetchPort{
 return async request=>{
  const f=checkedAcceptanceFixture(await fixture),u=new URL(request.url);if(u.origin!=='https://ar-acceptance.invalid'||request.method!=='GET'||!['KAT','TSK'].includes(hotel))throw Error('acceptance_fixture_request_forbidden');
  const page=(rows:unknown[],key:string,total=rows.length,offset=Number(u.searchParams.get('offset')??0),limit=Number(u.searchParams.get('limit')??20))=>({[key]:rows.slice(offset,offset+limit),totalResults:total,hasMore:offset+limit<total,offset:rows.length?offset+limit:0,limit});
  if(u.pathname===`/bof/v1/hotels/${hotel}/businessDate`)return Response.json({hotels:[{hotelId:hotel,businessDate:f.businessDate}]});
  if(u.pathname==='/ars/v1/accounts')return Response.json(page(hotel===f.hotel?[{hotelId:hotel,accountId:{id:f.accountId},accountNo:f.accountNo,accountName:f.name}]:[],'accountsDetails'));
  if(hotel!==f.hotel)throw Error('acceptance_fixture_scope_invalid');
  const account=encodeURIComponent(f.accountId);
  if(u.pathname===`/ars/v1/hotels/${hotel}/accounts/${account}`)return Response.json(acceptanceAccount(f));
  if(u.pathname===`/ars/v1/invoicePayments/accounts/${account}`){
   const instructions=u.searchParams.getAll('fetchInstructions'),numbers=u.searchParams.getAll('invoiceNo'),includeZero=u.searchParams.get('inclZeroBalance')==='true',from=u.searchParams.get('start'),to=u.searchParams.get('end');
   const within=(day:string)=>(!from||day>=from)&&(!to||day<=to);
   const invoices=instructions.includes('Invoices')?f.invoices.filter(r=>(includeZero||r.open!==0)&&(!numbers.length||numbers.includes(r.invoiceNo))&&within(r.date)).map(r=>rawInvoice(f,r,true)):[];
   const payments=instructions.includes('Payments')&&includeZero&&within(f.businessDate)?f.invoices.filter(r=>r.open<r.original).map(r=>rawPayment(f,r)):[];
   const offset=Number(u.searchParams.get('offset')??0),limit=Number(u.searchParams.get('limit')??20),all=[...invoices.map(value=>({kind:'invoice',value})),...payments.map(value=>({kind:'payment',value}))],selected=all.slice(offset,offset+limit);
   return Response.json({details:selected.length?[{hotelId:hotel,accountId:{id:f.accountId},invoices:selected.filter(r=>r.kind==='invoice').map(r=>r.value),payments:selected.filter(r=>r.kind==='payment').map(r=>r.value)}]:[],totalResults:all.length,hasMore:offset+limit<all.length,offset:all.length?offset+limit:0,limit});
  }
  const detail=new RegExp(`^/ars/v1/hotels/${hotel}/accounts/${account}/transactions/([0-9]+)/invoicePaymentDetails$`).exec(u.pathname);
  if(detail){const invoice=f.invoices.find(r=>r.id===detail[1]),payment=f.invoices.find(r=>paymentId(r)===detail[1]&&r.open<r.original);return Response.json({details:[{hotelId:hotel,accountId:{id:f.accountId},invoices:invoice?[rawInvoice(f,invoice,true)]:[],payments:payment?[rawPayment(f,payment)]:[]}],hasMore:false,totalResults:invoice||payment?1:0,offset:20,limit:20});}
  const mapping=new RegExp(`^/ars/v1/hotels/${hotel}/transactions/([0-9]+)/accounts/${account}/invoiceAppliedPayments$`).exec(u.pathname);
  if(mapping){const row=f.invoices.find(r=>r.id===mapping[1]);if(!row)throw Error('acceptance_fixture_scope_invalid');return Response.json({details:row.open<row.original?[{hotelId:hotel,transactionNo:row.id,invoiceNo:row.invoiceNo,paymentTrxNo:paymentId(row),appliedAmount:money(row.original-row.open),transactionDate:row.date}]:[]});}
  const stay=new RegExp(`^/csh/v1/hotels/${hotel}/reservations/([0-9]+)/folios$`).exec(u.pathname);
  if(stay){const row=f.invoices.find(r=>r.reservationId===stay[1]);if(!row)throw Error('acceptance_fixture_scope_invalid');return Response.json({reservationFolioInformation:{reservationInfo:{hotelId:hotel,reservationIdList:[{id:row.reservationId,type:'Reservation'}],roomStay:{arrivalDate:row.arrival,departureDate:row.date}},folioHistory:[{folioWindowNo:1,folios:[{invoiceNo:row.invoiceNo,folioNo:row.folioNo}]}]}});}
  const report=new RegExp(`^/med/config/v1/hotels/${hotel}/reservations/([0-9]+)/folioReports$`).exec(u.pathname);
  if(report){const row=f.invoices.find(r=>r.reservationId===report[1]);if(!row||u.searchParams.get('folioWindowNo')!=='1'||u.searchParams.get('folioDate')!==row.date)throw Error('acceptance_fixture_scope_invalid');const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),sheet=pdf.addPage([595,842]);['SYNTHETIC TEST INVOICE','NO PAYMENT REQUESTED',`Hotel ${hotel} · Account ${f.accountNo}`,`Invoice No. ${row.invoiceNo}`,`Folio No. ${row.folioNo}`,row.guest,`THB ${row.open.toFixed(2)}`].forEach((line,i)=>sheet.drawText(line,{x:50,y:770-i*34,size:i<2?16:12,font}));const bytes=await pdf.save();return Response.json({folio:{hotelId:hotel,reservationId:{id:row.reservationId},folio:btoa(String.fromCharCode(...bytes))}});}
  throw Error('acceptance_fixture_request_unsupported');
 };
}
