import type {WorkflowStep} from 'cloudflare:workers';
import {backendRpc} from '../refresh/backend';
import type {EmailEnv} from './shared';
import {checkDelivery} from './delivery';
export interface ReconcileEnv extends EmailEnv {GMAIL_RECONCILE_ENABLED?:string;GMAIL_RECONCILE_BATCH?:string}
export const gmailReconcileCron='*/5 * * * *';
export async function requestMailReconcile(env:ReconcileEnv,trigger:'manual'|'scheduled'){
 const value=Number(env.GMAIL_RECONCILE_BATCH??3),limit=Number.isSafeInteger(value)&&value>=1&&value<=20?value:3;
 const run=await backendRpc<{id:string;created:boolean;state:string}>(env,'ar_mail_reconcile_request',{p_trigger:trigger,p_limit:limit});
 if(!run.created||run.state==='complete')return run;
 try{if(!env.AR_REFRESH)throw Error();await env.AR_REFRESH.create({id:run.id,params:{runId:run.id,hotel:'MAIL',mailReconcile:true}});}
 catch{try{if(!env.AR_REFRESH)throw Error();await(await env.AR_REFRESH.get(run.id)).status();}catch{await backendRpc(env,'ar_mail_reconcile_finish',{p_id:run.id,p_checked:0,p_verified:0,p_review:0,p_unavailable:0,p_failed:true});throw Error('mail_reconcile_unavailable');}}
 return run;
}
export async function runMailReconcile(env:ReconcileEnv,id:string,step:Pick<WorkflowStep,'do'>){
 const run=await step.do('read-reconcile-batch',()=>backendRpc<{state:string;lease_until:string;deliveries:{id:string;owner:string}[]}>(env,'ar_mail_reconcile_get',{p_id:id}));
 if(run.state!=='running'||Date.parse(run.lease_until)<=Date.now())return {state:'inactive'};
 let checked=0,verified=0,review=0,unavailable=0,leaseLost=false;
 for(const item of run.deliveries){
  let result='unavailable';try{result=await step.do(`verify-sent-${item.id}`,{retries:{limit:0,delay:'5 seconds'},timeout:'2 minutes'},async()=>{
   if(!await backendRpc<boolean>(env,'ar_mail_reconcile_guard',{p_id:id}))return 'lease_expired';
   try{const outcome=await checkDelivery(env,item.owner,item.id);const state='state' in outcome?outcome.state:null;return state==='sent'?'verified':state==='review_required'?'review':'waiting';}catch{return 'unavailable';}
  });}catch{/* Step timeout is a read failure, never a send retry. */}
  if(result==='lease_expired'){leaseLost=true;break;}
  checked++;if(result==='verified')verified++;if(result==='review')review++;if(result==='unavailable')unavailable++;
 }
 await step.do('record-reconcile-result',()=>backendRpc<boolean>(env,'ar_mail_reconcile_finish',{p_id:id,p_checked:checked,p_verified:verified,p_review:review,p_unavailable:unavailable,p_failed:leaseLost}));
 return {checked,verified,review,unavailable};
}
