import {isHotelId} from '../domain/hotels';
import {hasAuthCallback} from '../navigation';
const KEY='ar-preparation-return-v1',TAB='ar-google-tab-v1',uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type ReturnMarker={version:1;actor:string;tab:string;scope:'document'|'batch'|'create';id:string;hotel?:string};
const valid=(m:ReturnMarker)=>m&&Object.keys(m).sort().join(',')===(m.scope==='create'?'actor,hotel,id,scope,tab,version':'actor,id,scope,tab,version')&&m.version===1&&uuid.test(m.actor)&&typeof m.tab==='string'&&m.tab.startsWith(TAB+'-')&&uuid.test(m.tab.slice(TAB.length+1))&&(['document','batch'].includes(m.scope)?uuid.test(m.id):m.scope==='create'&&typeof m.id==='string'&&m.id.length>0&&m.id.length<=256&&isHotelId(m.hotel));
function collectionDestination(input:URLSearchParams){const next=new URLSearchParams();for(const key of ['region','hotel','qstage','qpurpose'])if(input.has(key))next.set(key,input.get(key)!);next.set('collections','1');return next;}
/** An old async Exit must not replace a different live document or an active batch. */
export function exitedDocumentDestination(input:URLSearchParams,jobId:string):URLSearchParams|null{
 if(!uuid.test(jobId)||input.get('documentJob')!==jobId||input.has('collectionBatch'))return null;
 return collectionDestination(input);
}

/** UX fence only. The caller must durably enqueue exact Exit before recording it. */
export function rememberExitReturn(storage:Storage,actor:string,params:URLSearchParams,hasCreates:boolean):boolean{
 try{
  if(hasAuthCallback(params))return false;
  const document=params.get('documentJob'),batch=params.get('collectionBatch'),account=params.get('account'),hotel=params.get('property');
  const scope=document&&uuid.test(document)?{scope:'document' as const,id:document}:batch&&uuid.test(batch)?{scope:'batch' as const,id:batch}:hasCreates&&account&&isHotelId(hotel)?{scope:'create' as const,id:account,hotel}:null;
  if(!scope)return false;
  const marker={version:1 as const,actor,tab:storage.getItem(TAB)??'',...scope};if(!valid(marker))return false;
  const raw=JSON.stringify(marker);if(new TextEncoder().encode(raw).byteLength>2048)return false;storage.setItem(KEY,raw);return true;
 }catch{return false;}
}

/** Consume before document/batch effects mount; never authorizes server deletion. */
export function consumeExitReturn(storage:Storage,input:URLSearchParams):URLSearchParams{
 const original=new URLSearchParams(input);
 try{
  const raw=storage.getItem(KEY);if(raw===null)return original;
  storage.removeItem(KEY);if(raw.length>2048||hasAuthCallback(input))return original;
  const marker=JSON.parse(raw) as ReturnMarker;if(!valid(marker)||marker.tab!==storage.getItem(TAB))return original;
  // This session's existing actor binds local UX state; no token is copied.
  const storedSession=JSON.parse(storage.getItem(marker.tab)??'null');if(storedSession?.user?.id!==marker.actor)return original;
  const matches=marker.scope==='document'?input.get('documentJob')===marker.id:marker.scope==='batch'?input.get('collectionBatch')===marker.id:input.get('account')===marker.id&&input.get('property')===marker.hotel;
  if(!matches)return original;
  if(marker.scope==='batch'){
   storage.removeItem('ar-account-batch:'+marker.actor+':'+marker.id);
   for(const region of ['phuket','khao-lak']){const key='ar-account-batch-active:'+marker.actor+':'+region;if(storage.getItem(key)===marker.id)storage.removeItem(key);}
  }
  return collectionDestination(input);
 }catch{return original;}
}
