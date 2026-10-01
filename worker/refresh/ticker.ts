import type {WorkflowStep} from 'cloudflare:workers';
import {configuredOperaHotels} from '../hotels';
import {requestRefresh,type RefreshEnv} from './backend';
const windowMs=15*60*1000,intervalMs=5*60*1000;
export async function currentTickerId(start:number){
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('ar-current-ticker-v1:'+start)));bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
 const hex=[...bytes.slice(0,16)].map(n=>n.toString(16).padStart(2,'0')).join('');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
export async function dispatchCurrentTicker(env:RefreshEnv,time=Date.now()){
 if(env.OPERA_REFRESH_ENABLED!=='true'||!env.AR_REFRESH||!env.OPERA_CLIENT_ID||!env.OPERA_CLIENT_SECRET||!env.OPERA_APP_KEY)return {enabled:false};
 const start=Math.floor(time/windowMs)*windowMs,id=await currentTickerId(start);
 try{await env.AR_REFRESH.create({id,params:{runId:id,hotel:'KAT',currentTickerStart:start}});}catch{await(await env.AR_REFRESH.get(id)).status();}
 return {enabled:true,id};
}
/** Fixed five-minute wake-ups from an established maintenance event. Durable
 * sleeps release active capacity; hotel jobs still use database freshness locks. */
export async function runCurrentTicker(env:RefreshEnv,start:number,step:Pick<WorkflowStep,'do'|'sleepUntil'>){
 if(!Number.isSafeInteger(start)||start%windowMs!==0)throw Error('refresh_ticker_invalid');
 const hotels=configuredOperaHotels(env.OPERA_HOTEL_IDS),runtime={...env,REFRESH_STALE_MINUTES:'5'};
 for(let round=0;round<3;round++){
  await step.sleepUntil('current-wake-'+round,new Date(start+round*intervalMs));
  await step.do('current-tick-'+round,{retries:{limit:0,delay:'5 seconds'},timeout:'3 minutes'},async()=>{
   if(env.OPERA_REFRESH_ENABLED!=='true'||Date.now()>=start+(round+1)*intervalMs)return {skipped:true};
   const results=await Promise.allSettled(hotels.map(hotel=>requestRefresh(runtime,hotel,null,'open')));
   return {hotels:results.length,unavailable:results.filter(result=>result.status==='rejected').length};
  });
 }
 return {status:'finished',ticks:3,hotels:hotels.length};
}
