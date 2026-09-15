import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {writesHeld} from './write-hold';

export interface FinancialLogRetentionEnv extends RefreshEnv {FINANCIAL_LOG_RETENTION_ENABLED?:string}
export interface FinancialLogRetentionResult {
 status:'succeeded'|'busy'|'error';deleted:number;moreEligible:boolean;retentionMonths:1;checkedAt:string;error?:'cleanup_failed';
}
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const timestamp=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
function checkedResult(value:unknown):FinancialLogRetentionResult {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('financial_log_cleanup_unavailable');
 const v=value as Record<string,unknown>;
 if(v.status!=='succeeded'&&v.status!=='busy'&&v.status!=='error'||
    typeof v.deleted!=='number'||!Number.isSafeInteger(v.deleted)||v.deleted<0||v.deleted>1000||
    typeof v.moreEligible!=='boolean'||v.retentionMonths!==1||
    typeof v.checkedAt!=='string'||!timestamp.test(v.checkedAt)||!Number.isFinite(Date.parse(v.checkedAt))||
    (v.status==='error'?v.error!=='cleanup_failed':v.error!==undefined))throw Error('financial_log_cleanup_unavailable');
 return {status:v.status,deleted:v.deleted,moreEligible:v.moreEligible,retentionMonths:1,checkedAt:v.checkedAt,...(v.status==='error'?{error:'cleanup_failed' as const}:{})};
}

/** One bounded batch. SQL owns the calendar-month cutoff and exact row claims. */
export async function sweepFinancialLogs(env:FinancialLogRetentionEnv):Promise<{enabled:false}|({enabled:true}&FinancialLogRetentionResult)> {
 if(writesHeld(env)||env.FINANCIAL_LOG_RETENTION_ENABLED!=='true'||env.ACCEPTANCE)return {enabled:false};
 try{
  const actor=await backendRpc<unknown>(env,'ar_financial_service_actor',{});
  if(typeof actor!=='string'||!uuid.test(actor))throw Error('financial_log_cleanup_unavailable');
  const result=checkedResult(await backendRpc<unknown>(env,'ar_financial_log_prune',{p_actor:actor,p_limit:1000}));
  return {enabled:true,...result};
 }catch{throw Error('financial_log_cleanup_unavailable');}
}
