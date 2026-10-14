import {useEffect} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {isRegionId} from '../domain/hotels';
import {notifyRegisterChanged} from '../register/model';
export function trackerRevisionKey(value:unknown):string|null {
 if(!value||typeof value!=='object'||!('rows' in value)||!Array.isArray(value.rows))return null;
 const rows=value.rows as {region?:unknown;revision?:unknown}[];
 if(rows.some(r=>!r||!isRegionId(r.region)||typeof r.revision!=='string'||!/^\d{1,20}$/.test(r.revision))||new Set(rows.map(r=>r.region)).size!==rows.length)return null;
 return JSON.stringify([...rows].sort((a,b)=>String(a.region).localeCompare(String(b.region))).map(r=>[r.region,r.revision]));
}
/** Data revisions change only with committed business/source facts. Refresh once
 * on the first valid read, then only on changes; dirty guards preserve edits. */
export function startTrackerRevisionWatch(client:SupabaseClient,token:string){
  const controller=new AbortController();let prior:string|null=null,inflight=false,pending=false,queued=false;
  let interval:ReturnType<typeof setInterval>;
  const poll=async()=>{
   if(controller.signal.aborted||inflight||document.visibilityState!=='visible')return;
   pending=false;inflight=true;try{
   const response=await fetch('/api/reports/tracker-revisions',{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});if(!response.ok)return;
   const key=trackerRevisionKey(await response.json());if(key===null||controller.signal.aborted)return;
   // Business data may have loaded before the first revision snapshot. One
   // guarded initial refresh prevents that snapshot silently absorbing an import.
   if(prior!==key)notifyRegisterChanged();prior=key;
  }catch{/* A failed background check never replaces saved or dirty data. */}finally{inflight=false;if(pending)requestCheck();}};
  // Hints carry no invoice data and are never used as authoritative revisions.
  // Keep one pending read so an event arriving during fetch cannot be lost.
  const requestCheck=()=>{
   if(controller.signal.aborted)return;pending=true;
   if(inflight||queued||document.visibilityState!=='visible')return;
   queued=true;void Promise.resolve().then(()=>{queued=false;void poll();});
  };
  const setFallback=(milliseconds:number)=>{clearInterval(interval);interval=setInterval(requestCheck,milliseconds);};
  setFallback(60000);
  // Subscribe before the baseline read, then reread on SUBSCRIBED to close
  // changes occurring between the initial API snapshot and channel readiness.
  const channel=client.channel(`ar-tracker-revisions-${crypto.randomUUID()}`)
   .on('postgres_changes',{event:'*',schema:'public',table:'ar_tracker_publications'},requestCheck)
   .subscribe(status=>{
    if(controller.signal.aborted)return;
    if(status==='SUBSCRIBED'){setFallback(60000);requestCheck();}
    else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED')setFallback(10000);
   });
  document.addEventListener('visibilitychange',requestCheck);window.addEventListener('focus',requestCheck);requestCheck();
  return()=>{
   controller.abort();clearInterval(interval);document.removeEventListener('visibilitychange',requestCheck);window.removeEventListener('focus',requestCheck);
   void client.removeChannel(channel).catch(()=>{/* Cleanup never replaces data. */});
  };
}
export function useTrackerRevision(client:SupabaseClient|null,token:string|undefined,accessKey:string){
 useEffect(()=>{
  if(!client||!token||!accessKey)return;
  return startTrackerRevisionWatch(client,token);
 },[client,token,accessKey]);
}
