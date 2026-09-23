import {hotelOverviewResult,type HotelOverview} from './hotel-data';
import type {RegionId} from '../domain/hotels';
const storageKey='ar-period-preview-v1';
const maxAge=120000,maxEntries=8,maxBytes=500000;
type Entry={scope:string;path:string;savedAt:number;value:HotelOverview};
export function clearPeriodPreview(storage:Storage|undefined=typeof sessionStorage==='undefined'?undefined:sessionStorage){try{storage?.removeItem(storageKey);}catch{/* Storage can be disabled. */}}
function entries(storage:Storage,now:number):Entry[]{
 try{const raw=storage.getItem(storageKey);if(!raw||raw.length>maxBytes)return [];const data:unknown=JSON.parse(raw);if(!Array.isArray(data))return [];
 return data.filter((e):e is Entry=>!!e&&typeof e==='object'&&typeof e.scope==='string'&&typeof e.path==='string'&&typeof e.savedAt==='number'&&e.savedAt<=now&&now-e.savedAt<maxAge).slice(-maxEntries);
 }catch{return [];}
}
export function readPeriodPreview(storage:Storage,scope:string,path:string,from:string,to:string,region:RegionId,now=Date.now()):HotelOverview|undefined{
 if(!scope)return;
 const found=entries(storage,now).find(e=>e.scope===scope&&e.path===path);if(!found)return;
 try{return hotelOverviewResult(found.value,from,to,region);}catch{return;}
}
export function savePeriodPreview(storage:Storage,scope:string,path:string,value:HotelOverview,now=Date.now()){
 if(!scope)return;
 try{let next=[...entries(storage,now).filter(e=>e.scope===scope&&e.path!==path),{scope,path,savedAt:now,value}].slice(-maxEntries);
 while(JSON.stringify(next).length>maxBytes&&next.length)next=next.slice(1);
 storage.setItem(storageKey,JSON.stringify(next));
 }catch{/* Quota/private-mode failures must not block the live reader. */}
}
/** App checks backend access before mounting Dashboard; this binds the preview to that grant and tab. */
export function periodPreviewScope(grant:string){
 try{const tab=sessionStorage.getItem('ar-google-tab-v1');return tab&&grant?JSON.stringify([tab,grant]):'';}catch{return '';}
}
