import {assertWritesEnabled} from '../operations/write-hold';
import {runGranularFinancialHistory} from './granular';
import {readCorroboratedApplications} from '../opera/applied-payments';
import type {WorkflowStep} from 'cloudflare:workers';
import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {makeReader} from '../opera/probe';
import {OperaError,type OperaReader} from '../opera/client';
import {discoverAccountIds,readBusinessDate} from '../refresh/read-snapshot';
import {readFinancialHistory,type FinancialHotel,type FinancialInvoice,type FinancialPayment,type AppliedPaymentLink} from '../opera/financial-history';
import type {FinancialAccountContext,FinancialCounts,FinancialHistoryRequest,FinancialRun,FinancialRunReceipt,FinancialWorkflowResult} from './model';
export type {FinancialHistoryRequest,FinancialRunReceipt,FinancialWorkflowResult} from './model';
export interface FinancialIngestionEnv extends RefreshEnv {AR_FINANCIAL?:RefreshEnv['AR_REFRESH'];FINANCIAL_HISTORY_ENABLED?:string;FINANCIAL_HISTORY_WINDOW_DAYS?:string;FINANCIAL_HISTORY_DATE_FILTER_PROOF?:string}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fail=(code='financial_invalid'):never=>{throw Error(code);};
function date(value:unknown):string {if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000-')||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)return fail();return value;}
function shift(value:string,days:number){const d=new Date(value+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function object(value:unknown):Record<string,unknown> {if(!value||typeof value!=='object'||Array.isArray(value))return fail('financial_invalid_response');return value as Record<string,unknown>;}
function exactText(value:unknown,max=200):string {if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f\x7f]/.test(value))return fail('financial_invalid_response');return value;}
export function financialWorkflow(env:FinancialIngestionEnv,version?:number){return version===2?env.AR_FINANCIAL:env.AR_REFRESH;}
function enabled(env:FinancialIngestionEnv){return env.FINANCIAL_HISTORY_ENABLED==='true'&&typeof env.FINANCIAL_HISTORY_DATE_FILTER_PROOF==='string'&&/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$/.test(env.FINANCIAL_HISTORY_DATE_FILTER_PROOF);}
async function rpc<T>(env:FinancialIngestionEnv,name:string,args:Record<string,unknown>):Promise<T>{const v=await backendRpc<unknown>(env,name,args);if(v&&typeof v==='object'&&'error' in v)throw Error(typeof v.error==='string'&&/^financial_[a-z_]{1,80}$/.test(v.error)?v.error:'financial_unavailable');return v as T;}
function safeError(value:unknown):string {if(value instanceof OperaError)return value.code;return value instanceof Error&&/^financial_[a-z_]{1,80}$/.test(value.message)?value.message:'financial_unavailable';}
function requestInput(actor:string,input:FinancialHistoryRequest){
 if(!uuid.test(actor)||!uuid.test(input.commandId)||!['KAT','TSK'].includes(input.hotel)||!['manual','scheduled','backfill','open'].includes(input.reason))return fail();
 const from=input.from===undefined?null:date(input.from),to=input.to===undefined?null:date(input.to);
 if((from===null)!==(to===null)||input.reason==='backfill'&&from===null||from!==null&&to!==null&&(from>to||(Date.parse(to)-Date.parse(from))/86400000>=366))return fail();
 return {hotel:input.hotel,reason:input.reason,from,to};
}
/** Root dispatches the returned ID to one durable Workflow; this function never creates an instance. */
export async function requestFinancialHistory(env:FinancialIngestionEnv,actor:string,input:FinancialHistoryRequest):Promise<FinancialRunReceipt>{
 const request=requestInput(actor,input),days=Number(env.FINANCIAL_HISTORY_WINDOW_DAYS??31);if(!Number.isSafeInteger(days)||days<1||days>366)return fail('financial_configuration_invalid');
 if(!enabled(env))return {status:'not_enabled',created:false};
 const previous=await rpc<FinancialRunReceipt|null>(env,'ar_financial_command_get',{p_actor:actor,p_command:input.commandId,p_request:request});if(previous)return previous;
 const to=request.to??date(await readBusinessDate(makeReader(env,input.hotel),input.hotel)),from=request.from??shift(to,-days+1);
 return rpc(env,'ar_financial_request',{p_actor:actor,p_command:input.commandId,p_request:request,p_from:from,p_to:to,p_proof:env.FINANCIAL_HISTORY_DATE_FILTER_PROOF,p_stale_minutes:Number(env.REFRESH_STALE_MINUTES??30)});
}
function context(value:unknown,hotel:FinancialHotel,accountId:string):FinancialAccountContext {
 const header=object(object(value).accountDetails);if(header.hotelId!==hotel||object(header.accountId).id!==accountId)return fail('financial_account_scope');
 return {name:exactText(header.accountName,1000),type:exactText(header.type),accountNo:header.accountNo===null||header.accountNo===undefined?null:exactText(header.accountNo)};
}
async function stageRows(env:FinancialIngestionEnv,actor:string,runId:string,accountId:string,kind:'invoice'|'payment'|'application',rows:(FinancialInvoice|FinancialPayment|AppliedPaymentLink)[]){
 for(let at=0;at<rows.length;at+=500)await rpc(env,'ar_financial_stage_batch',{p_actor:actor,p_run_id:runId,p_account:accountId,p_kind:kind,p_batch:at/500,p_rows:rows.slice(at,at+500)});
}
async function mapFinancialInvoice(reader:OperaReader,invoice:FinancialInvoice,observedAt:string):Promise<{links:AppliedPaymentLink[];error?:string}>{
 try{
  const mapping=await readCorroboratedApplications(reader,{hotel:invoice.hotel,accountId:invoice.accountId,invoiceTransactionId:invoice.transactionId,...(invoice.invoiceNo!==null&&/^[0-9]+$/.test(invoice.invoiceNo)?{invoiceNo:invoice.invoiceNo}:{})},{observedAt},undefined,invoice);
  if(invoice.currentAmount===null||invoice.openAmount===null||invoice.cumulativePayments===null)throw new OperaError('invalid_response',undefined,'financial_mapping_history_unknown');
  const cents=(value:string)=>BigInt(value.replace('.','')),abs=(value:bigint)=>value<0n?-value:value,total=mapping.links.reduce((sum,link)=>sum+cents(link.appliedAmount!),0n);
  if(total!==cents(invoice.currentAmount)-cents(invoice.openAmount)||abs(total)!==abs(cents(invoice.cumulativePayments)))throw new OperaError('invalid_response',undefined,'financial_mapping_history_changed');
  return {links:mapping.links};
 }catch(error){if(!(error instanceof OperaError))throw error;return {links:[],error:/^financial_[a-z_]{1,80}$/.test(error.stage??'')?error.stage!:'financial_mapping_'+error.code};}
}
const stepConfig={retries:{limit:1,delay:'5 seconds' as const,backoff:'constant' as const},timeout:'20 minutes' as const};
const zeroCounts:FinancialCounts={invoices:0,payments:0,applications:0};
/** Private source rows stay inside callbacks/DB staging; durable step outputs are counts only. */
export async function runFinancialHistory(env:FinancialIngestionEnv,payload:{actor:string;runId:string},step:Pick<WorkflowStep,'do'>):Promise<FinancialWorkflowResult>{
 assertWritesEnabled(env);
 const {actor,runId}=payload;if(!uuid.test(actor)||!uuid.test(runId))return fail();
 const args={p_actor:actor,p_run_id:runId};
 if(!enabled(env)){try{await rpc(env,'ar_financial_fail',{...args,p_code:'financial_history_disabled'});}catch{/* source reads and publication remain disabled */}return {status:'not_enabled',accounts:0,...zeroCounts};}
 let accountCount=0;
 try{
  const run=await rpc<FinancialRun>(env,'ar_financial_run_get',args);if(!run||run.owner!==actor||run.id!==runId||!['KAT','TSK'].includes(run.hotel)||!run.proof||!['queued','running','succeeded','failed'].includes(run.status))return fail('financial_run_invalid');
  date(run.from);date(run.to);if(run.status==='succeeded')return {status:'succeeded',accounts:run.accounts,...run.counts};if(run.status==='failed')return fail('financial_run_failed');
  if(run.stepsVersion===2)return await runGranularFinancialHistory(env,run,step,{rpc:(name,extra={})=>rpc(env,name,{...extra,...args}),stage:(account,kind,rows)=>stageRows(env,actor,runId,account,kind,rows),context,mapping:mapFinancialInvoice});
  const reader=makeReader(env,run.hotel);
  await step.do('financial-claim',{retries:{limit:20,delay:'30 seconds',backoff:'constant'},timeout:'12 minutes'},async()=>{if(!await rpc<boolean>(env,'ar_financial_claim',args))return fail('financial_lease_busy');return {claimed:true};});
  const discovery=await step.do('financial-discovery',stepConfig,async()=>{
   if(run.discovered)return {accounts:run.accounts};const ids=(await discoverAccountIds(reader,run.hotel)).sort();
   return rpc<{accounts:number}>(env,'ar_financial_discovery_set',{...args,p_accounts:ids});
  });
  accountCount=discovery.accounts;if(!Number.isSafeInteger(accountCount)||accountCount<0)return fail('financial_discovery_invalid');const expectedAccounts:string[]=[];
  for(let ordinal=0;ordinal<accountCount;ordinal++){
   const saved=await rpc<{ordinal:number;accountId:string;staged:boolean;counts:FinancialCounts}>(env,'ar_financial_account_get',{...args,p_ordinal:ordinal});
   if(!saved||saved.ordinal!==ordinal||typeof saved.staged!=='boolean')return fail('financial_discovery_invalid');const accountId=exactText(saved.accountId);expectedAccounts.push(accountId);
   await step.do(`financial-account-${ordinal}`,stepConfig,async()=>{
    if(saved.staged)return saved.counts;
    if(!await rpc<boolean>(env,'ar_financial_renew',args))return fail('financial_lease_invalid');
    const accountContext=context(await reader.account(accountId),run.hotel,accountId);
    const history=await readFinancialHistory(reader,{hotel:run.hotel,accountId,start:run.from,end:run.to},{observedAt:run.startedAt?new Date(run.startedAt).toISOString():undefined});
    history.invoices.sort((a,b)=>a.transactionId.localeCompare(b.transactionId));history.payments.sort((a,b)=>a.transactionId.localeCompare(b.transactionId));
    const eligible=history.invoices.filter(i=>i.entryClassification==='invoice'&&['standalone','parent'].includes(i.collectionRole));const applications:AppliedPaymentLink[]=[];
    const verified:string[]=[],mappingFailures:{invoiceId:string;code:string}[]=[];
    for(const [index,invoice]of eligible.entries()){
     if(index%10===0&&!await rpc<boolean>(env,'ar_financial_renew',args))return fail('financial_lease_invalid');
     const mapped=await mapFinancialInvoice(reader,invoice,history.coverage.observedAt);if(mapped.error)mappingFailures.push({invoiceId:invoice.transactionId,code:mapped.error});else{applications.push(...mapped.links);verified.push(invoice.transactionId);}
    }
    applications.sort((a,b)=>a.invoiceTransactionId.localeCompare(b.invoiceTransactionId)||a.paymentTransactionId.localeCompare(b.paymentTransactionId));
    await stageRows(env,actor,runId,accountId,'invoice',history.invoices);await stageRows(env,actor,runId,accountId,'payment',history.payments);await stageRows(env,actor,runId,accountId,'application',applications);
    const counts={invoices:history.invoices.length,payments:history.payments.length,applications:applications.length};
    return rpc<FinancialCounts>(env,'ar_financial_account_done',{...args,p_account:accountId,p_context:accountContext,p_counts:counts,p_coverage:{...history.coverage,mappingVerified:verified.length,mappingFailures,mappingContractVersion:'correlated_v1'},p_mapping_invoices:verified});
   });
  }
  return await step.do('financial-publish',stepConfig,async()=>{
   if(!await rpc<boolean>(env,'ar_financial_renew',args))return fail('financial_lease_invalid');const after=(await discoverAccountIds(reader,run.hotel)).sort();
   if(JSON.stringify(after)!==JSON.stringify([...expectedAccounts].sort()))return fail('financial_discovery_changed');
   return rpc<FinancialWorkflowResult>(env,'ar_financial_publish',{...args,p_accounts:after});
  });
 }catch(e){const code=safeError(e);await step.do('financial-record-failure',stepConfig,async()=>{await rpc(env,'ar_financial_fail',{...args,p_code:code});return {status:'failed'};});return {status:'failed',accounts:accountCount,...zeroCounts,error:code};}
}
