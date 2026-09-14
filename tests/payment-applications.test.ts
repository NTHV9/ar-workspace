import {describe,expect,it} from 'vitest';
import {OperaReader} from '../worker/opera/client';
import {readPaymentApplications} from '../worker/opera/payment-applications';
import {type FinancialPayment,readScopedFinancialInvoiceHistory} from '../worker/opera/financial-history';

type Obj=Record<string,unknown>;
const scope={hotel:'KAT' as const,accountId:'synthetic-account'};
const observedAt='2026-09-14T09:00:00.000Z';
const money=(amount:string)=>({amount,currencyCode:'THB'});
const structured=(value:unknown)=>structuredClone(value) as Obj;
type Route='paymentDetail'|'paymentHistory'|'paymentScopeHistory'|'invoiceHistory'|'invoiceDetail'|'invoiceBack';
function setup(options:{count?:number;debit?:boolean;zero?:boolean;sparse?:boolean;mutate?:(route:Route,count:number,value:Obj,url:URL)=>Obj}={}){
 const count=options.zero?0:options.count??2,debit=options.debit===true,used=count*100,posted=used+200;
 const signed=(n:number)=>`${debit?'':'-'}${n}.00`,sourcePayment={hotelId:'KAT',transactionNo:301,transactionCode:'9000',transactionDate:'2026-09-14',postingDate:'2026-09-14',revenueDate:'2026-09-13',transferDate:null,amount:money(signed(posted)),amountUsed:money(`${used}.00`),balance:money('200.00'),transferredIn:false,transferredOut:false};
 const payment:FinancialPayment={...scope,kind:'payment',transactionId:'301',transactionCode:'9000',transactionDate:'2026-09-14',postingDate:'2026-09-14',revenueDate:'2026-09-13',transferDate:null,currency:'THB',amount:signed(posted),appliedAmount:`${used}.00`,unallocatedAmount:'200.00',transferredIn:false,transferredOut:false,transfer:'none_reported',classification:'unknown',reversal:'unknown'};
 const invoices=Array.from({length:count},(_,index)=>({hotelId:'KAT',transactionNo:1001+index,invoiceNo:String(2001+index),folioNo:String(3001+index),invoiceType:'Normal',transactionDate:'2025-08-01',postingDate:'2025-08-02',revenueDate:'2025-07-31',transferDate:null,originalAmount:money('300.00'),amount:money('300.00'),payments:money(debit?'0.00':'300.00'),balance:money(debit?'300.00':'0.00'),closeDate:debit?null:'2026-09-14',compressed:false,transferredIn:false,transferredOut:false}));
 const applications=invoices.map(invoice=>({transactionNo:invoice.transactionNo,invoiceNo:invoice.invoiceNo,originalAmount:money('300.00'),appliedAmount:money(debit?'-100.00':'100.00'),postingDate:invoice.postingDate,guestName:'Synthetic private guest'}));
 const reads:Record<Route,number>={paymentDetail:0,paymentHistory:0,paymentScopeHistory:0,invoiceHistory:0,invoiceDetail:0,invoiceBack:0},calls:URL[]=[];
 const group=(invoices:unknown[]=[],payments:unknown[]=[])=>({details:[{hotelId:'KAT',accountId:{id:scope.accountId},invoices,payments}]});
 const reader=new OperaReader({origin:'https://opera.synthetic.invalid',appKey:'synthetic',hotelId:'KAT'},async()=>'synthetic',async request=>{
  expect(request.method).toBe('GET');expect(request.redirect).toBe('manual');const url=new URL(request.url);calls.push(url);let route:Route,value:Obj;
  if(url.pathname.includes('/invoicePayments/accounts/')&&url.searchParams.getAll('fetchInstructions').join(',')==='Payments'){
   route='paymentScopeHistory';expect(url.searchParams.get('start')).toBe('2026-09-14');expect(url.searchParams.get('end')).toBe('2026-09-14');const limit=Number(url.searchParams.get('limit'));
   value={...group([],[sourcePayment]),hasMore:false,totalResults:1,offset:limit,limit};
  }else if(url.pathname.includes('/invoicePayments/accounts/')){
   route='invoiceHistory';const numbers=url.searchParams.getAll('invoiceNo'),selected=invoices.filter(invoice=>numbers.includes(invoice.invoiceNo)),offset=Number(url.searchParams.get('offset')),limit=Number(url.searchParams.get('limit'));
   value={...group(selected.slice(offset,offset+limit)),hasMore:offset+limit<selected.length,totalResults:selected.length,offset:offset+limit,limit};
  }else if(url.pathname.endsWith('/invoiceAppliedPayments')){
   if(url.pathname.includes('/transactions/301/')){route='paymentHistory';expect(url.searchParams.has('invoiceNo')).toBe(false);value={details:applications};}
   else{route='invoiceBack';value={details:[{transactionNo:301,originalAmount:money(signed(posted)),appliedAmount:money(debit?'100.00':'-100.00'),postingDate:'2026-09-14'},{transactionNo:-1,originalAmount:money('17.00'),appliedAmount:money('17.00'),postingDate:'2025-08-02'}]};}
  }else if(url.pathname.includes('/transactions/301/')){route='paymentDetail';value=group([], [sourcePayment]);}
  else{
   route='invoiceDetail';const id=url.pathname.match(/\/transactions\/(\d+)\//)?.[1],invoice:Obj={...invoices.find(row=>String(row.transactionNo)===id)!};
   if(options.sparse){delete invoice.compressed;delete invoice.invoiceNo;delete invoice.folioNo;delete invoice.originalAmount;}
   value=group([invoice]);
  }
  reads[route]++;return Response.json(options.mutate?.(route,reads[route],structured(value),url)??value);
 });
 return {reader,payment,reads,calls};
}
const rows=(value:Obj)=>value.details as Obj[];
const groupRows=(value:Obj,kind:'invoices'|'payments')=>rows(value)[0][kind] as Obj[];

describe('payment history reaches old invoices independently of Bill Date',()=>{
 it('corroborates both directions, keeps paid-zero/old invoice facts and strips private descriptors',async()=>{
  const h=setup(),result=await readPaymentApplications(h.reader,h.payment,{observedAt});
  expect(result.payment).toEqual(h.payment);expect(result.invoices).toHaveLength(2);
  expect(result.invoices[0]).toMatchObject({transactionDate:'2025-08-01',postingDate:'2025-08-02',revenueDate:'2025-07-31',originalAmount:'300.00',currentAmount:'300.00',openAmount:'0.00',collectionRole:'standalone'});
  expect(result.links).toEqual([1001,1002].map(id=>expect.objectContaining({invoiceTransactionId:String(id),paymentTransactionId:'301',appliedAmount:'100.00',invoiceTransactionDate:'2025-08-01',applicationDate:null,applicationEventId:null})));
  expect(result.coverage).toMatchObject({contract:'payment_history_correlated_v1',paymentTotalsReconciled:true,invoicePairsCorroborated:true,applicationEventHistory:false,observedAt});
  expect(JSON.stringify(result)).not.toContain('Synthetic private guest');expect(h.reads).toEqual({paymentDetail:2,paymentHistory:2,paymentScopeHistory:2,invoiceHistory:2,invoiceDetail:4,invoiceBack:2});
  for(const url of h.calls.filter(url=>url.searchParams.has('invoiceNo')&&url.pathname.includes('/invoicePayments/'))){expect(url.searchParams.get('inclZeroBalance')).toBe('true');expect(url.searchParams.has('start')).toBe(false);expect(url.searchParams.has('end')).toBe(false);}
 });
 it('derives negative allocations from debit postings and retains raw unsigned allocation fields',async()=>{
  const h=setup({debit:true}),result=await readPaymentApplications(h.reader,h.payment);expect(result.links.map(row=>row.appliedAmount)).toEqual(['-100.00','-100.00']);expect(result.payment).toMatchObject({amount:'400.00',appliedAmount:'200.00',unallocatedAmount:'200.00'});
 });
 it('accepts stable sparse detail only with a complete scoped invoice context',async()=>{
  const h=setup({sparse:true}),result=await readPaymentApplications(h.reader,h.payment);expect(result.invoices[0]).toMatchObject({collectionRole:'standalone',invoiceNo:'2001',originalAmount:'300.00'});
 });
 it('can verify an explicitly unallocated payment with two empty histories and stable detail',async()=>{
  const h=setup({zero:true}),result=await readPaymentApplications(h.reader,h.payment);expect(result.invoices).toEqual([]);expect(result.links).toEqual([]);expect(h.reads).toEqual({paymentDetail:2,paymentHistory:2,paymentScopeHistory:2,invoiceHistory:0,invoiceDetail:0,invoiceBack:0});
 });
 it('batches printed numbers at 20 and rechecks both batches',async()=>{
  const h=setup({count:21}),result=await readPaymentApplications(h.reader,h.payment);expect(result.invoices).toHaveLength(21);
  expect(h.calls.filter(url=>url.searchParams.has('invoiceNo')&&url.pathname.includes('/invoicePayments/')).map(url=>url.searchParams.getAll('invoiceNo').length)).toEqual([20,20,1,1]);
 });
 it('accepts opposite raw original-payment sign when its exact magnitude corroborates the source',async()=>{
  const h=setup({mutate:(route,_count,value)=>{if(route==='invoiceBack')rows(value)[0].originalAmount=money('400.00');return value;}});
  expect((await readPaymentApplications(h.reader,h.payment)).links).toHaveLength(2);
 });
 it('accepts unrelated nonpayment invoice offsets without claiming their classification or full invoice totals',async()=>{
  const h=setup({mutate:(route,_count,value)=>{if(route==='invoiceBack')rows(value).push({transactionNo:800,arbitraryOffset:'unclassified'});return value;}});
  expect((await readPaymentApplications(h.reader,h.payment)).links).toHaveLength(2);
 });
 it('supports explicit compressed parent contexts while retaining their source role',async()=>{
  const h=setup({mutate:(route,_count,value)=>{if(route==='invoiceHistory'||route==='invoiceDetail')for(const row of groupRows(value,'invoices'))row.compressed=true;return value;}});
  expect((await readPaymentApplications(h.reader,h.payment)).invoices.every(row=>row.collectionRole==='parent')).toBe(true);
 });
 it('corroborates an expanded reciprocal pair using exact invoice and payment identities',async()=>{
  const h=setup({mutate:(route,_count,value,url)=>{
   if(route==='invoiceBack')return {details:[{hotelId:'KAT',accountId:{id:scope.accountId},transactionNo:url.pathname.match(/\/transactions\/(\d+)\//)![1],invoiceNo:url.searchParams.get('invoiceNo'),paymentTrxNo:301,appliedAmount:money('100.00'),transactionDate:'2025-08-01',postingDate:'2025-08-02'}]};return value;
  }});expect((await readPaymentApplications(h.reader,h.payment)).links).toHaveLength(2);
 });
});

describe('payment application proof fails closed',()=>{
 const cases:{name:string;route:Route;mutate:(value:Obj)=>void}[]=[
  {name:'missing payment',route:'paymentDetail',mutate:v=>{groupRows(v,'payments').length=0;}},
  {name:'wrong payment date',route:'paymentDetail',mutate:v=>{groupRows(v,'payments')[0].transactionDate='2026-09-13';}},
  {name:'changed transfer evidence',route:'paymentDetail',mutate:v=>{groupRows(v,'payments')[0].transferredOut=true;}},
  {name:'wrong payment currency',route:'paymentDetail',mutate:v=>{groupRows(v,'payments')[0].amount={amount:'-400.00',currencyCode:'USD'};}},
  {name:'missing payment allocation',route:'paymentDetail',mutate:v=>{delete groupRows(v,'payments')[0].amountUsed;}},
  {name:'duplicate payment-side invoice',route:'paymentHistory',mutate:v=>{rows(v).push(rows(v)[0]);}},
  {name:'wrong hotel echo',route:'paymentHistory',mutate:v=>{rows(v)[0].hotelId='TSK';}},
  {name:'wrong account echo',route:'paymentHistory',mutate:v=>{rows(v)[0].accountId={id:'other'};}},
  {name:'invalid application date',route:'paymentHistory',mutate:v=>{rows(v)[0].postingDate='2025-02-30';}},
  {name:'wrong invoice date',route:'paymentHistory',mutate:v=>{rows(v)[0].postingDate='2026-09-14';}},
  {name:'wrong invoice original amount',route:'paymentHistory',mutate:v=>{rows(v)[0].originalAmount=money('301.00');}},
  {name:'foreign application currency',route:'paymentHistory',mutate:v=>{rows(v)[0].appliedAmount={amount:100,currencyCode:'USD'};}},
  {name:'allocation total mismatch',route:'paymentHistory',mutate:v=>{rows(v)[0].appliedAmount=money('99.00');}},
  {name:'truncated payment-side history',route:'paymentHistory',mutate:v=>{v.hasMore=true;}},
  {name:'upstream payment error',route:'paymentHistory',mutate:v=>{v.error={message:'private'};}},
  {name:'upstream warning',route:'invoiceHistory',mutate:v=>{v.warnings=[{message:'private'}];}},
  {name:'group warning',route:'paymentDetail',mutate:v=>{rows(v)[0].warnings=[{message:'private'}];}},
  {name:'invoice row warning',route:'invoiceHistory',mutate:v=>{groupRows(v,'invoices')[0].warnings=[{message:'private'}];}},
  {name:'missing invoice cumulative',route:'invoiceHistory',mutate:v=>{delete groupRows(v,'invoices')[0].payments;}},
  {name:'conflicting invoice cumulative',route:'invoiceHistory',mutate:v=>{groupRows(v,'invoices')[0].payments=money('299.00');}},
  {name:'history role unverified',route:'invoiceHistory',mutate:v=>{delete groupRows(v,'invoices')[0].compressed;}},
  {name:'unmatched printed number',route:'invoiceHistory',mutate:v=>{groupRows(v,'invoices')[0].invoiceNo='9999';}},
  {name:'missing invoice detail',route:'invoiceDetail',mutate:v=>{groupRows(v,'invoices').length=0;}},
  {name:'mismatched independent invoice facts',route:'invoiceDetail',mutate:v=>{groupRows(v,'invoices')[0].balance=money('1.00');}},
  {name:'child detail',route:'invoiceDetail',mutate:v=>{groupRows(v,'invoices')[0].parentInvoiceNo=2005;}},
  {name:'missing reciprocal payment',route:'invoiceBack',mutate:v=>{rows(v).shift();}},
  {name:'duplicate reciprocal payment',route:'invoiceBack',mutate:v=>{rows(v).push(rows(v)[0]);}},
  {name:'wrong reciprocal applied amount',route:'invoiceBack',mutate:v=>{rows(v)[0].appliedAmount=money('-99.00');}},
  {name:'wrong reciprocal payment sign',route:'invoiceBack',mutate:v=>{rows(v)[0].appliedAmount=money('100.00');}},
  {name:'wrong reciprocal original amount',route:'invoiceBack',mutate:v=>{rows(v)[0].originalAmount=money('-401.00');}},
  {name:'wrong reciprocal payment date',route:'invoiceBack',mutate:v=>{rows(v)[0].postingDate='2026-09-13';}},
  {name:'cross-scope unrelated offset',route:'invoiceBack',mutate:v=>{rows(v)[1].accountId={id:'other'};}},
 ];
 for(const test of cases)it(`rejects ${test.name}`,async()=>{
  const h=setup({mutate:(route,_count,value)=>{if(route===test.route)test.mutate(value);return value;}});await expect(readPaymentApplications(h.reader,h.payment)).rejects.toBeInstanceOf(Error);
 });
 for(const route of ['paymentDetail','paymentHistory','invoiceHistory','invoiceDetail'] as const)it(`rejects changing ${route} facts`,async()=>{
  const h=setup({mutate:(kind,count,value)=>{
   if(kind===route&&count>(route==='invoiceDetail'?2:1)){
    if(route==='paymentDetail')groupRows(value,'payments')[0].revenueDate='2026-09-12';
    if(route==='paymentHistory')rows(value)[0].postingDate='2025-08-01';
    if(route==='invoiceHistory')groupRows(value,'invoices')[0].closeDate='2026-09-13';
    if(route==='invoiceDetail')groupRows(value,'invoices')[0].revenueDate='2025-07-30';
   }return value;
  }});await expect(readPaymentApplications(h.reader,h.payment)).rejects.toMatchObject({code:'invalid_response'});
 });
 it('does not interpret empty history as zero allocated money',async()=>{
  const h=setup({mutate:(route,_count,value)=>route==='paymentHistory'?{details:[]}:value});await expect(readPaymentApplications(h.reader,h.payment)).rejects.toMatchObject({stage:'financial_payment_mapping_total'});
 });
 it('requires amount/used/unallocated magnitudes to reconcile even when both detail reads agree',async()=>{
  const h=setup({mutate:(route,_count,value)=>{if(route==='paymentDetail')groupRows(value,'payments')[0].balance=money('199.00');return value;}});h.payment.unallocatedAmount='199.00';await expect(readPaymentApplications(h.reader,h.payment)).rejects.toMatchObject({stage:'financial_payment_mapping_allocation'});
 });
 it('cannot prove zero from missing amountUsed',async()=>{
  const h=setup({zero:true,mutate:(route,_count,value)=>{if(route==='paymentDetail')delete groupRows(value,'payments')[0].amountUsed;return value;}});h.payment.appliedAmount=null;await expect(readPaymentApplications(h.reader,h.payment)).rejects.toMatchObject({stage:'financial_payment_mapping_payment_facts'});
 });
 it('does not silently discard an allocated child when its parent is explicitly present',async()=>{
  const h=setup({mutate:(route,_count,value)=>{
   if(route==='invoiceHistory'){const invoices=groupRows(value,'invoices');invoices[0].compressed=true;invoices[1].parentInvoiceNo=2001;value.totalResults=1;}return value;
  }});await expect(readPaymentApplications(h.reader,h.payment)).rejects.toMatchObject({code:'invalid_response'});
 });
 it('cannot treat empty history with a provider error as a verified unallocated payment',async()=>{
  const h=setup({zero:true,mutate:(route,_count,value)=>route==='paymentHistory'?{details:[],error:{message:'private'}}:value});await expect(readPaymentApplications(h.reader,h.payment)).rejects.toMatchObject({stage:'financial_payment_mapping_upstream_notice'});
 });
 it('fails closed for reported transfer payments even if both source reads agree',async()=>{
  const h=setup({mutate:(route,_count,value)=>{if(route==='paymentDetail')groupRows(value,'payments')[0].transferredIn=true;return value;}});h.payment.transferredIn=true;h.payment.transfer='in';await expect(readPaymentApplications(h.reader,h.payment)).rejects.toMatchObject({stage:'financial_payment_mapping_payment_transfer'});
 });
 it('honors read budgets and invalid options before upstream access',async()=>{
  const h=setup();await expect(readPaymentApplications(h.reader,h.payment,{observedAt:'2026-02-30T09:00:00Z'})).rejects.toMatchObject({code:'invalid_request'});expect(h.calls).toHaveLength(0);
  await expect(readPaymentApplications(h.reader,h.payment,{maxRows:1})).rejects.toMatchObject({code:'response_too_large'});
 });
});

describe('scoped zero-inclusive financial invoice contexts',()=>{
 it('completes each page under the verified cursor convention',async()=>{
  const h=setup({count:12}),numbers=Array.from({length:12},(_,index)=>String(2001+index));
  const result=await readScopedFinancialInvoiceHistory(h.reader,scope,numbers,{pageSize:10});expect(result).toHaveLength(12);expect(h.calls.map(url=>url.searchParams.get('offset'))).toEqual(['0','10']);
 });
 it.each(['totalResults','offset','hasMore'] as const)('rejects conflicting %s metadata',async key=>{
  const h=setup({mutate:(route,_count,value)=>{if(route==='invoiceHistory')value[key]=key==='hasMore'?true:key==='offset'?0:3;return value;}});
  await expect(readScopedFinancialInvoiceHistory(h.reader,scope,['2001','2002'],{maxPages:2})).rejects.toBeInstanceOf(Error);
 });
 it('rejects more than 20 requested numbers before service access',async()=>{
  const h=setup();await expect(readScopedFinancialInvoiceHistory(h.reader,scope,Array.from({length:21},(_,n)=>String(2001+n)))).rejects.toMatchObject({code:'invalid_request'});expect(h.calls).toHaveLength(0);
 });
});

describe('complementary payment detail and refreshed history evidence',()=>{
 const sparse=(route:Route,value:Obj)=>{
  if(route==='paymentScopeHistory')for(const key of ['postingDate','revenueDate','transferDate'])delete groupRows(value,'payments')[0][key];
  if(route==='paymentDetail'){
   const payment=groupRows(value,'payments')[0];delete payment.transferredIn;delete payment.transferredOut;payment.transferDate='2026-09-12';
  }
  return value;
 };
 const staged=(payment:FinancialPayment)=>{payment.postingDate=null;payment.revenueDate=null;payment.transferDate=null;};
 it('corroborates complementary descriptors and returns the exact staged payment without inventing detail transfer flags',async()=>{
  const h=setup({mutate:(route,_count,value)=>sparse(route,value)});staged(h.payment);const result=await readPaymentApplications(h.reader,h.payment);
  expect(result.payment).toBe(h.payment);expect(result.payment).toMatchObject({postingDate:null,revenueDate:null,transferDate:null,transferredIn:false,transferredOut:false,transfer:'none_reported'});expect(result.links).toHaveLength(2);expect(h.reads.paymentScopeHistory).toBe(2);
 });
 it('requires the refreshed history to prove both false transfer flags when detail omits them',async()=>{
  const h=setup({mutate:(route,_count,value)=>{sparse(route,value);if(route==='paymentScopeHistory')delete groupRows(value,'payments')[0].transferredIn;return value;}});staged(h.payment);
  await expect(readPaymentApplications(h.reader,h.payment)).rejects.toMatchObject({code:'invalid_response'});
 });
 it('rejects a true transfer flag from either source',async()=>{
  for(const source of ['paymentDetail','paymentScopeHistory'] as const){
   const h=setup({mutate:(route,_count,value)=>{sparse(route,value);if(route===source)groupRows(value,'payments')[0].transferredOut=true;return value;}});staged(h.payment);
   await expect(readPaymentApplications(h.reader,h.payment)).rejects.toMatchObject({code:'invalid_response'});
  }
 });
 it('rejects conflicting known descriptors between detail and refreshed history even when staged descriptors are null',async()=>{
  const h=setup({mutate:(route,_count,value)=>{if(route==='paymentScopeHistory')groupRows(value,'payments')[0].revenueDate='2026-09-11';return value;}});staged(h.payment);
  await expect(readPaymentApplications(h.reader,h.payment)).rejects.toMatchObject({stage:'financial_payment_mapping_payment_changed'});
 });
 it('rejects a changing detail-only descriptor although all core payment facts remain unchanged',async()=>{
  const h=setup({mutate:(route,count,value)=>{sparse(route,value);if(route==='paymentDetail'&&count===2)groupRows(value,'payments')[0].transferDate='2026-09-11';return value;}});staged(h.payment);
  await expect(readPaymentApplications(h.reader,h.payment)).rejects.toMatchObject({stage:'financial_payment_mapping_payment_changed'});
 });
 it('rejects changing refreshed history transfer evidence at the final read',async()=>{
  const h=setup({mutate:(route,count,value)=>{sparse(route,value);if(route==='paymentScopeHistory'&&count===2)groupRows(value,'payments')[0].transferredOut=true;return value;}});staged(h.payment);
  await expect(readPaymentApplications(h.reader,h.payment)).rejects.toMatchObject({code:'invalid_response'});
 });
 it.each(['amount','amountUsed','balance','transactionDate','transactionNo'] as const)('requires exact detail %s despite complementary descriptors',async key=>{
  const h=setup({mutate:(route,_count,value)=>{sparse(route,value);if(route==='paymentDetail')groupRows(value,'payments')[0][key]=key==='transactionDate'?'2026-09-13':key==='transactionNo'?302:money('123.00');return value;}});staged(h.payment);
  await expect(readPaymentApplications(h.reader,h.payment)).rejects.toMatchObject({code:'invalid_response'});
 });
 it('does not infer a missing target payment from an empty fresh history',async()=>{
  const h=setup({mutate:(route,_count,value)=>route==='paymentScopeHistory'?{details:[],totalResults:0,hasMore:false}:value});
  await expect(readPaymentApplications(h.reader,h.payment)).rejects.toMatchObject({stage:'financial_payment_mapping_payment_history_identity'});
 });
 it('requires complete same-day history pagination before both transfer checks',async()=>{
  const h=setup({mutate:(route,_count,value,url)=>{
   if(route!=='paymentScopeHistory')return value;
   const payment=groupRows(value,'payments')[0],offset=Number(url.searchParams.get('offset'));
   if(offset===0){rows(value)[0].payments=Array.from({length:10},(_,index)=>({...payment,transactionNo:501+index}));value.hasMore=true;value.offset=10;}
   else value.offset=20;
   value.totalResults=11;return value;
  }});
  expect((await readPaymentApplications(h.reader,h.payment,{pageSize:10})).links).toHaveLength(2);expect(h.reads.paymentScopeHistory).toBe(4);
 });
 it('rejects a duplicate target in fresh history instead of accepting repeated transfer evidence',async()=>{
  const h=setup({mutate:(route,_count,value)=>{if(route==='paymentScopeHistory'){groupRows(value,'payments').push(groupRows(value,'payments')[0]);value.totalResults=2;}return value;}});
  await expect(readPaymentApplications(h.reader,h.payment)).rejects.toMatchObject({code:'duplicate_member'});
 });
 it('rejects incomplete fresh history even when its first page already contains the target',async()=>{
  const h=setup({mutate:(route,_count,value)=>{if(route==='paymentScopeHistory')value.totalResults=2;return value;}});
  await expect(readPaymentApplications(h.reader,h.payment)).rejects.toMatchObject({code:'pagination_incomplete'});
 });
});
