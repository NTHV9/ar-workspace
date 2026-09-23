import {periodPreviewScope,readPeriodPreview,savePeriodPreview} from './period-preview-cache';
import {useEffect,useState} from 'react';
import {regionHotels,type RegionId} from '../domain/hotels';
import type {DashboardOverviewScope} from '../../worker/dashboard/hotel-model';
import type {Source} from './data';
import {hotelOverviewResult,type HotelOverview} from './hotel-data';
export const overviewSegments=['entries','activity','balances','external','payments','paid'] as const;
export type OverviewSegment=typeof overviewSegments[number];
const empty=():DashboardOverviewScope=>({balances:null,activity:null,external:null,entries:null,payments:null,paid:null});
export function initialOverview(from:string,to:string,region:RegionId):HotelOverview {
 return {from,to,region,total:empty(),hotels:regionHotels(region).map(hotel=>({hotel,...empty()})),segments:Object.fromEntries(overviewSegments.map(key=>[key,'loading']))};
}
export function applyOverviewSegment(previous:HotelOverview,key:OverviewSegment,next:HotelOverview|null):HotelOverview {
 const available=next&&next.total[key]!==null&&next.hotels.every(h=>h[key]!==null);
 const retained=!available&&previous.total[key]!==null;
 return {...previous,
  total:{...previous.total,...(!retained?{[key]:next?.total[key]??null}:{})},
  hotels:previous.hotels.map(h=>({...h,...(!retained?{[key]:next?.hotels.find(n=>n.hotel===h.hotel)?.[key]??null}:{})})),
  segments:{...previous.segments,[key]:available?'ready':'error'},
  retained:[...(previous.retained??[]).filter(k=>k!==key),...(retained?[key]:[])],
 };
}
/** Three in flight at most. A slow payment reader cannot hold completed invoice or send results. */
export async function loadOverviewSegments(path:string,token:string,signal:AbortSignal,onResult:(key:OverviewSegment,value:unknown|null)=>void){
 let cursor=0;
 async function worker(){while(!signal.aborted&&cursor<overviewSegments.length){
  const key=overviewSegments[cursor++];
  try{
   const response=await fetch(path+'&segment='+key,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
   if(!response.ok)throw Error('dashboard_unavailable');
   const value:unknown=await response.json();if(!signal.aborted)onResult(key,value);
  }catch{if(!signal.aborted)onResult(key,null);}
 }}
 await Promise.all(Array.from({length:3},worker));
}
export function useProgressiveOverview(path:string|null,token:string,revision:number,from:string,to:string,region:RegionId,grant=''):Source<HotelOverview>{
 const cacheScope=periodPreviewScope(grant);
 const key=JSON.stringify([path,token,cacheScope]);
 const cached=()=>{try{return path&&cacheScope?readPeriodPreview(sessionStorage,cacheScope,path,from,to,region):undefined;}catch{return undefined;}};
 const loading=(data:HotelOverview|undefined)=>data?{...data,segments:Object.fromEntries(overviewSegments.map(s=>[s,'loading']))}:undefined;
 const [stored,setStored]=useState<Source<HotelOverview>&{key:string}>(()=>({key,state:path?'loading':'idle',data:loading(cached())}));
 useEffect(()=>{
  const controller=new AbortController();
  setStored(old=>({key,state:path?'loading':'idle',data:path?{...(old.key===key&&old.data?old.data:cached()??initialOverview(from,to,region)),segments:Object.fromEntries(overviewSegments.map(s=>[s,'loading']))}:undefined}));
  if(path)void loadOverviewSegments(path,token,controller.signal,(segment,value)=>{
   let checked:HotelOverview|null=null;
   try{if(value!==null)checked=hotelOverviewResult(value,from,to,region);}catch{/* A malformed group is an isolated failure. */}
   if(controller.signal.aborted)return;
   setStored(old=>{
    if(old.key!==key||!old.data)return old;
    const data=applyOverviewSegment(old.data,segment,checked);
    return {key,data,state:Object.values(data.segments??{}).some(s=>s==='loading')?'loading':Object.values(data.segments??{}).some(s=>s==='error')?'error':'ready'};
   });
  });
  return()=>controller.abort();
 },[path,token,revision,key,from,to,region,cacheScope]);
 useEffect(()=>{if(path&&cacheScope&&stored.key===key&&stored.state==='ready'&&stored.data){try{savePeriodPreview(sessionStorage,cacheScope,path,stored.data);}catch{/* Optional preview only. */}}},[stored,key,path,cacheScope]);
 return stored.key===key?stored:{state:path?'loading':'idle',data:loading(cached())};
}
