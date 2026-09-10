import {afterEach,expect,it,vi} from 'vitest';
import {OperaReader} from '../worker/opera/client';
import {readCorroboratedApplications} from '../worker/opera/applied-payments';
const query={hotel:'KAT' as const,accountId:'A',invoiceTransactionId:'101',invoiceNo:'201'};
const money=(amount:string)=>({amount,currencyCode:'THB'});
function setup(options:{wrongAmount?:boolean;wrongDate?:boolean;wrongScope?:boolean;changedInvoice?:boolean;netMismatch?:boolean;reversal?:boolean}={}){
 const calls:string[]=[];let reads=0;
 const invoice={hotelId:'KAT',transactionNo:'101',invoiceNo:'201',invoiceType:'Normal',transactionDate:'2026-09-01',originalAmount:money('1000.00'),amount:money('1000.00'),payments:money(options.reversal?'250.00':'300.00'),balance:money(options.reversal?'750.00':'700.00'),compressed:false};
 const rows=[{transactionNo:301,originalAmount:money(options.wrongAmount?'600.00':'500.00'),appliedAmount:money(options.netMismatch?'-200.00':'-300.00'),postingDate:options.wrongDate?'2026-08-30':'2026-09-01'},...(options.reversal?[{transactionNo:302,originalAmount:money('50.00'),appliedAmount:money('50.00'),postingDate:'2026-09-02'}]:[])];
 vi.stubGlobal('fetch',async(input:string|URL|Request)=>{const u=new URL(input instanceof Request?input.url:String(input));calls.push(u.pathname);
  if(u.pathname.endsWith('/invoiceAppliedPayments'))return Response.json({details:rows});
  if(u.pathname.includes('/transactions/101/')){reads++;return Response.json({details:[{hotelId:'KAT',accountId:{id:'A'},invoices:[options.changedInvoice&&reads>1?{...invoice,balance:money('500.00')}:invoice]}]});}
  const debit=u.pathname.includes('/transactions/302/');return Response.json({details:[{hotelId:options.wrongScope?'TSK':'KAT',accountId:{id:'A'},payments:[{hotelId:options.wrongScope?'TSK':'KAT',transactionNo:debit?'302':'301',transactionDate:debit?'2026-09-02':'2026-09-01',postingDate:debit?'2026-09-02':'2026-09-01',amount:money(debit?'50.00':'-500.00'),amountUsed:money(debit?'50.00':'-300.00'),balance:money(debit?'0.00':'-200.00'),transferredIn:false,transferredOut:false}]}]});
 });return {reader:new OperaReader({origin:'https://synthetic.opera.invalid',appKey:'synthetic',hotelId:'KAT'},async()=> 'synthetic'),calls};
}
afterEach(()=>vi.unstubAllGlobals());
it('verifies scoped slim payment rows and reconciles their net credit with invoice amounts',async()=>{const {reader,calls}=setup();const r=await readCorroboratedApplications(reader,query);expect(r.links).toEqual([expect.objectContaining({hotel:'KAT',accountId:'A',invoiceTransactionId:'101',paymentTransactionId:'301',appliedAmount:'300.00',applicationDate:null,applicationEventId:null})]);expect(r.coverage).toMatchObject({contract:'scoped_payment_rows_correlated_v1',invoiceTotalsReconciled:true,applicationEventHistory:false});expect(r.payments[0]).toMatchObject({amount:'-500.00',unallocatedAmount:'-200.00'});expect(calls.every(p=>p.startsWith('/ars/v1/'))).toBe(true);});
it('keeps a debit application negative so reversal-like postings cannot inflate applied totals',async()=>{const {reader}=setup({reversal:true});const r=await readCorroboratedApplications(reader,query);expect(r.links.map(l=>l.appliedAmount)).toEqual(['300.00','-50.00']);expect(r.coverage.invoiceTotalsReconciled).toBe(true);});
for(const option of ['wrongAmount','wrongDate','wrongScope','changedInvoice','netMismatch'] as const)it(`rejects ${option} rather than guessing an application relationship`,async()=>{const {reader}=setup({[option]:true});await expect(readCorroboratedApplications(reader,query)).rejects.toMatchObject({code:'invalid_response'});});
