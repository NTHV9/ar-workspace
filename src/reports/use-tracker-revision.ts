import {useEffect} from 'react';
import {isRegionId} from '../domain/hotels';
import {notifyRegisterChanged} from '../register/model';
export function trackerRevisionKey(value:unknown):string|null {
 if(!value||typeof value!=='object'||!('rows' in value)||!Array.isArray(value.rows))return null;
 const rows=value.rows as {region?:unknown;revision?:unknown}[];
 if(rows.some(r=>!r||!isRegionId(r.region)||typeof r.revision!=='string'||!/^\d{1,20}$/.test(r.revision))||new Set(rows.map(r=>r.region)).size!==rows.length)return null;
 return JSON.stringify([...rows].sort((a,b)=>String(a.region).localeCompare(String(b.region))).map(r=>[r.region,r.revision]));
}
/** Data revisions change only with committed business/source facts. Status checks
 * do not trigger reloads; each editor's existing dirty guard preserves edits. */
export function useTrackerRevision(token:string|undefined,accessKey:string){
 useEffect(()=>{
  if(!token||!accessKey)return;const controller=new AbortController();let prior:string|null=null,inflight=false;
  const poll=async()=>{if(inflight)return;inflight=true;try{
   const response=await fetch('/api/reports/tracker-revisions',{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});if(!response.ok)return;
   const key=trackerRevisionKey(await response.json());if(key===null||controller.signal.aborted)return;
   if(prior!==null&&prior!==key)notifyRegisterChanged();prior=key;
  }catch{/* A failed background check never replaces saved or dirty data. */}finally{inflight=false;}};
  void poll();const interval=setInterval(()=>void poll(),60000);return()=>{controller.abort();clearInterval(interval);};
 },[token,accessKey]);
}
