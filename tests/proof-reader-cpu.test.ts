import {expect,it} from 'vitest';
import {createFinancialProofReader,type FinancialProofReader} from '../worker/opera/proof-reader';

it('avoids full-body copies for realistic large unshared responses',async()=>{
 const body=JSON.stringify({details:Array.from({length:2000},(_,id)=>({id,items:Array.from({length:10},(_,n)=>({amount:n,currency:'THB',description:'Synthetic source detail'}))}))});
 const repeats=60;let expectedRows=0,actualRows=0;
 const before=process.cpuUsage();for(let n=0;n<repeats;n++)expectedRows+=structuredClone(JSON.parse(body)).details.length;
 const baseline=process.cpuUsage(before),baselineCpuMs=(baseline.user+baseline.system)/1000;
 const read=async()=>JSON.parse(body);
 const source={financialTransactionDetail:read,financialHistoryPage:read,paymentAppliedInvoices:read,invoiceHistory:read,appliedInvoicePayments:read} satisfies FinancialProofReader;
 const scoped=createFinancialProofReader(source),start=process.cpuUsage();
 for(let n=0;n<repeats;n++){const result=await scoped.reader.financialTransactionDetail({hotel:'KAT',accountId:'synthetic',transactionId:String(n+1)}) as {details:unknown[]};actualRows+=result.details.length;}
 const after=process.cpuUsage(start),optimizedCpuMs=(after.user+after.system)/1000;
 expect(actualRows).toBe(expectedRows);expect(scoped.stats()).toMatchObject({calls:repeats,copiedResponses:0,failures:0});
 console.info(JSON.stringify({responseBytes:Buffer.byteLength(body),reads:repeats,baselineCpuMs,optimizedCpuMs}));
},20000);
