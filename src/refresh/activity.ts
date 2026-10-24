import type {RegionId} from '../domain/hotels';

/** Presence is a hint for optional refresh, never evidence of financial freshness. */
export function startRefreshActivity(region:RegionId,token:string,onWake:()=>void,activity={lastUsed:Date.now()}){
 const controller=new AbortController();let lastSent=-Infinity,inflight=false,active=true;
 const heartbeat=async()=>{
  if(controller.signal.aborted||inflight||Date.now()-lastSent<60000)return;
  lastSent=Date.now();inflight=true;
  const attempt=new AbortController(),abort=()=>attempt.abort();
  controller.signal.addEventListener('abort',abort,{once:true});const timeout=setTimeout(abort,20000);
  try{const response=await fetch('/api/refresh/activity',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({region}),signal:attempt.signal});await response.body?.cancel();}
  catch{/* Optional presence never blocks saved data or a foreground operation. */}finally{clearTimeout(timeout);controller.signal.removeEventListener('abort',abort);inflight=false;}
 };
 const check=()=>{
  if(controller.signal.aborted)return;
  const next=document.visibilityState==='visible'&&Date.now()-activity.lastUsed<=10*60000;
  if(next){if(!active)onWake();void heartbeat();}active=next;
 };
 const interact=()=>{
  if(document.visibilityState!=='visible')return;
  // Timers may have been suspended, or input may precede the next interval tick.
  if(Date.now()-activity.lastUsed>10*60000)active=false;
  activity.lastUsed=Date.now();check();
 };
 const visibility=()=>{if(document.visibilityState==='visible')interact();else check();};
 const events=['pointerdown','keydown','scroll','touchstart'] as const;
 for(const event of events)document.addEventListener(event,interact,{passive:true,capture:true});
 document.addEventListener('visibilitychange',visibility);window.addEventListener('focus',interact);
 const timer=setInterval(check,60000);check();
 return()=>{controller.abort();clearInterval(timer);for(const event of events)document.removeEventListener(event,interact,true);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('focus',interact);};
}
