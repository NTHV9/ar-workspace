import {backendRpc,type RefreshEnv} from '../refresh/backend';
import {writesHeld} from '../operations/write-hold';
import {isRegionId,type RegionId} from '../../src/domain/hotels';
const segments=new Set(['entries','activity','balances','external','payments','paid']);
/** Existing cron/workflows call this; no provider calls and no additional service. */
export async function warmPeriodSummaries(env:RefreshEnv,region?:RegionId){
 if(env.ACCEPTANCE||writesHeld(env))return {planned:0,completed:0,failed:0};
 try{
  const plan=await backendRpc<{actor:string|null;tasks:Array<{region:RegionId;from:string;to:string;segment:string}>}>(env,'ar_period_summary_plan',{p_region:region??null});
  if(!plan||!Array.isArray(plan.tasks)||plan.tasks.length>36||plan.tasks.some(t=>!isRegionId(t.region)||region&&t.region!==region||!segments.has(t.segment)||!/^\d{4}-\d{2}-\d{2}$/.test(t.from)||!/^\d{4}-\d{2}-\d{2}$/.test(t.to)||t.from>t.to)||plan.tasks.length&&(!plan.actor||!/^[0-9a-f-]{36}$/.test(plan.actor)))throw Error('period_plan_invalid');
  let cursor=0,completed=0,failed=0;
  async function run(){while(cursor<plan.tasks.length){const task=plan.tasks[cursor++];try{
   const value=await backendRpc<Record<string,unknown>>(env,'ar_dashboard_region_cached_segment',{p_actor:plan.actor,p_region:task.region,p_from:task.from,p_to:task.to,p_type:null,p_segment:task.segment});
   if(!value||'error'in value)throw Error('period_summary_unavailable');completed++;
  }catch{failed++;}}}
  await Promise.all([run(),run()]);return {planned:plan.tasks.length,completed,failed};
 }catch{return {planned:0,completed:0,failed:1};}
}
