import type {OperaReader} from './client';
export type FinancialProofReader=Pick<OperaReader,'financialTransactionDetail'|'financialHistoryPage'|'paymentAppliedInvoices'|'invoiceHistory'|'appliedInvoicePayments'>;
export interface ProofReadStats {calls:number;joinedQueued:number;peakActive:number;ioMs:number;queueMs:number;failures:number;copiedResponses:number}

/** Source methods return fresh parsed JSON per actual read, as OperaReader does.
 * A scheduler belongs to one durable step. Only not-yet-started identical reads
 * can join: an AFTER check must never receive an older request already in flight. */
export function createFinancialProofReader(source:FinancialProofReader){
 const counters:ProofReadStats={calls:0,joinedQueued:0,peakActive:0,ioMs:0,queueMs:0,failures:0,copiedResponses:0};
 type Job={key:string;run:()=>Promise<unknown>;resolve:(value:unknown)=>void;reject:(error:unknown)=>void;queuedAt:number};
 type Pending={promise:Promise<unknown>;consumers:number};
 const queue:Job[]=[],waiting=new Map<string,Pending>();let active=0,scheduled=false;
 const drain=()=>{
  scheduled=false;
  while(active<3&&queue.length){
   const job=queue.shift()!;waiting.delete(job.key);active++;counters.calls++;counters.peakActive=Math.max(counters.peakActive,active);
   const start=Date.now();counters.queueMs+=Math.max(0,start-job.queuedAt);
   void (async()=>{try{job.resolve(await job.run());}catch(error){counters.failures++;job.reject(error);}finally{counters.ioMs+=Math.max(0,Date.now()-start);active--;drain();}})();
  }
 };
 const wrap=<A extends unknown[]>(name:string,read:(...args:A)=>Promise<unknown>)=>async(...input:A)=>{
  const args=structuredClone(input),key=JSON.stringify([name,args]);let pending=waiting.get(key);
  if(pending){counters.joinedQueued++;pending.consumers++;}
  else{
   pending={promise:new Promise<unknown>((resolve,reject)=>queue.push({key,run:()=>read(...args),resolve,reject,queuedAt:Date.now()})),consumers:1};waiting.set(key,pending);
   if(!scheduled){scheduled=true;void Promise.resolve().then(drain);}
  }
  const result=await pending.promise;
  // Once execution starts, consumers cannot join. A lone caller already owns
  // its freshly parsed response; copying large unused fields wastes CPU/memory.
  if(pending.consumers===1)return result;
  counters.copiedResponses++;return structuredClone(result);
 };
 const reader:FinancialProofReader={
  financialTransactionDetail:wrap('detail',source.financialTransactionDetail.bind(source)),
  financialHistoryPage:wrap('history',source.financialHistoryPage.bind(source)),
  paymentAppliedInvoices:wrap('paymentInvoices',source.paymentAppliedInvoices.bind(source)),
  invoiceHistory:wrap('invoiceHistory',source.invoiceHistory.bind(source)),
  appliedInvoicePayments:wrap('invoicePayments',source.appliedInvoicePayments.bind(source)),
 };
 return {reader,stats:():ProofReadStats=>({...counters})};
}
