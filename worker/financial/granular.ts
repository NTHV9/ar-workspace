import type {WorkflowStep} from 'cloudflare:workers';
import {makeReader} from '../opera/probe';
import {discoverAccountIds} from '../refresh/read-snapshot';
import {readFinancialHistory,type FinancialInvoice,type FinancialPayment,type AppliedPaymentLink} from '../opera/financial-history';
import type {OperaReader} from '../opera/client';
import type {FinancialIngestionEnv} from './refresh';
import type {FinancialRun,FinancialAccountContext,FinancialCounts,FinancialWorkflowResult,FinancialPaymentMappingResult} from './model';
import type {HotelId} from '../../src/domain/hotels';
import {mapFinancialReads} from '../opera/bounded-read';
interface Ports{
 rpc<T>(name:string,args?:Record<string,unknown>):Promise<T>;
 stage(accountId:string,kind:'invoice'|'payment'|'application',rows:(FinancialInvoice|FinancialPayment|AppliedPaymentLink)[]):Promise<void>;
 context(value:unknown,hotel:HotelId,accountId:string):FinancialAccountContext;
 mapping(reader:OperaReader,invoice:FinancialInvoice,observedAt:string):Promise<{links:AppliedPaymentLink[];error?:string}>;
 paymentMapping?(reader:OperaReader,payment:FinancialPayment,observedAt:string):Promise<FinancialPaymentMappingResult>;
}
const config={retries:{limit:1,delay:'5 seconds' as const,backoff:'constant' as const},timeout:'10 minutes' as const};
/** Durable outputs are counts only; exact source identities/rows live in private SQL staging. */
export async function runGranularFinancialHistory(env:FinancialIngestionEnv,run:FinancialRun,step:Pick<WorkflowStep,'do'|'sleep'>,ports:Ports):Promise<FinancialWorkflowResult>{
 const reader=()=>makeReader(env,run.hotel),observedAt=run.startedAt?new Date(run.startedAt).toISOString():new Date().toISOString();
 // Different date ranges of the same hotel must wait for its SQL lease. Durable
 // sleeps release this Workflow's slot so other hotels can run in the meantime.
 // Only a busy claim waits; terminal RPC errors retain the short retry budget.
 for(let attempt=0;attempt<1440;attempt++){
  const claim=await step.do(attempt===0?'financial-v2-claim':`financial-v2-claim-${attempt}`,{retries:{limit:1,delay:'5 seconds',backoff:'constant'},timeout:'2 minutes'},async()=>{
   const claimed=await ports.rpc<boolean>('ar_financial_claim');if(typeof claimed!=='boolean')throw Error('financial_claim_invalid');return {claimed};
  });
  if(claim.claimed)break;
  if(attempt===1439)throw Error('financial_queue_timeout');
  await step.sleep(`financial-v2-claim-wait-${attempt}`,'1 minute');
 }
 const discovery=await step.do('financial-v2-discovery',config,async()=>{if(run.discovered)return {accounts:run.accounts};const ids=(await discoverAccountIds(reader(),run.hotel)).sort();return ports.rpc<{accounts:number}>('ar_financial_discovery_set',{p_accounts:ids});});
 if(!Number.isSafeInteger(discovery.accounts)||discovery.accounts<0)throw Error('financial_discovery_invalid');
 for(let ordinal=0;ordinal<discovery.accounts;ordinal++){
  const prepared=await step.do(`financial-v2-history-${ordinal}`,config,async()=>{
   const saved=await ports.rpc<{accountId:string;historyReady:boolean;mappingCount:number;staged:boolean;counts:FinancialCounts}>('ar_financial_account_get',{p_ordinal:ordinal});
   if(saved.historyReady)return {mappingCount:saved.mappingCount,counts:saved.counts};
   if(!await ports.rpc<boolean>('ar_financial_renew'))throw Error('financial_lease_invalid');const source=reader(),accountId=saved.accountId;
   const account=ports.context(await source.account(accountId),run.hotel,accountId),history=await readFinancialHistory(source,{hotel:run.hotel,accountId,start:run.from,end:run.to},{observedAt});
   history.invoices.sort((a,b)=>a.transactionId.localeCompare(b.transactionId));history.payments.sort((a,b)=>a.transactionId.localeCompare(b.transactionId));
   await ports.stage(accountId,'invoice',history.invoices);await ports.stage(accountId,'payment',history.payments);
   return ports.rpc<{mappingCount:number;counts:FinancialCounts}>('ar_financial_history_ready',{p_account:accountId,p_context:account,p_coverage:history.coverage});
  });
  if(!Number.isSafeInteger(prepared.mappingCount)||prepared.mappingCount<0)throw Error('financial_mapping_batch_invalid');
  for(let batch=0;batch<Math.ceil(prepared.mappingCount/10);batch++)await step.do(`financial-v2-mapping-${ordinal}-${batch}`,config,async()=>{
   if(!await ports.rpc<boolean>('ar_financial_renew'))throw Error('financial_lease_invalid');
   const saved=await ports.rpc<{accountId:string}>('ar_financial_account_get',{p_ordinal:ordinal});
   const work=await ports.rpc<{saved:boolean;invoices?:FinancialInvoice[];verified?:number;unknown?:number;links?:number}>('ar_financial_mapping_batch_get',{p_account:saved.accountId,p_batch:batch});
   if(work.saved)return {verified:work.verified??0,unknown:work.unknown??0,links:work.links??0};
   if(!Array.isArray(work.invoices)||!work.invoices.length||work.invoices.length>10||work.invoices.some(i=>i.hotel!==run.hotel||i.accountId!==saved.accountId))throw Error('financial_mapping_batch_invalid');
   const links:AppliedPaymentLink[]=[],verified:string[]=[],failures:{invoiceId:string;code:string}[]=[],source=reader();
   const mapped=await mapFinancialReads(work.invoices,invoice=>ports.mapping(source,invoice,observedAt));
   for(const [index,result]of mapped.entries()){const invoice=work.invoices[index];if(result.error)failures.push({invoiceId:invoice.transactionId,code:result.error});else{verified.push(invoice.transactionId);links.push(...result.links);}}
   return ports.rpc<{verified:number;unknown:number;links:number}>('ar_financial_mapping_batch_save',{p_account:saved.accountId,p_batch:batch,p_ids:work.invoices.map(i=>i.transactionId),p_verified:verified,p_links:links,p_failures:failures});
  });
  if(run.stepsVersion===3){
   if(!ports.paymentMapping)throw Error('financial_payment_mapping_not_configured');
   const preparedPayments=await step.do(`financial-v3-payment-prepare-${ordinal}`,config,async()=>{
    if(!await ports.rpc<boolean>('ar_financial_renew'))throw Error('financial_lease_invalid');
    const saved=await ports.rpc<{accountId:string}>('ar_financial_account_get',{p_ordinal:ordinal});
    return ports.rpc<{mappingCount:number}>('ar_financial_payment_prepare',{p_account:saved.accountId});
   });
   if(!Number.isSafeInteger(preparedPayments.mappingCount)||preparedPayments.mappingCount<0)throw Error('financial_payment_batch_invalid');
   for(let batch=0;batch<Math.ceil(preparedPayments.mappingCount/5);batch++)await step.do(`financial-v3-payment-${ordinal}-${batch}`,config,async()=>{
    if(!await ports.rpc<boolean>('ar_financial_renew'))throw Error('financial_lease_invalid');
    const saved=await ports.rpc<{accountId:string}>('ar_financial_account_get',{p_ordinal:ordinal});
    const work=await ports.rpc<{saved:boolean;payments?:FinancialPayment[];verified?:number;unknown?:number;links?:number}>('ar_financial_payment_batch_get',{p_account:saved.accountId,p_batch:batch});
    if(work.saved)return {verified:work.verified??0,unknown:work.unknown??0,links:work.links??0};
    if(!Array.isArray(work.payments)||!work.payments.length||work.payments.length>5||work.payments.some(p=>p.hotel!==run.hotel||p.accountId!==saved.accountId||p.kind!=='payment'))throw Error('financial_payment_batch_invalid');
    const results:FinancialPaymentMappingResult[]=[],source=reader();
    for(const payment of work.payments){if(!await ports.rpc<boolean>('ar_financial_renew'))throw Error('financial_lease_invalid');results.push(await ports.paymentMapping!(source,payment,observedAt));}
    return ports.rpc<{verified:number;unknown:number;links:number}>('ar_financial_payment_batch_save',{p_account:saved.accountId,p_batch:batch,p_results:results});
   });
  }
  await step.do(`financial-v2-finalize-${ordinal}`,config,async()=>{if(!await ports.rpc<boolean>('ar_financial_renew'))throw Error('financial_lease_invalid');const saved=await ports.rpc<{accountId:string}>('ar_financial_account_get',{p_ordinal:ordinal});return ports.rpc<FinancialCounts>('ar_financial_history_finalize',{p_account:saved.accountId});});
 }
 return step.do('financial-v2-publish',config,async()=>{if(!await ports.rpc<boolean>('ar_financial_renew'))throw Error('financial_lease_invalid');const after=(await discoverAccountIds(reader(),run.hotel)).sort();return ports.rpc<FinancialWorkflowResult>('ar_financial_publish',{p_accounts:after});});
}
