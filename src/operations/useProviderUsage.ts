import {createContext,useCallback,useEffect,useRef,useState} from 'react';
import {parseProviderUsage,type ProviderId,type ProviderUsageResponse} from './provider-usage';
export interface ProviderUsageReader {
 identity:string;data:ProviderUsageResponse|null;loading:boolean;error:string|null;refresh:()=>Promise<void>;
 updateSetting:(provider:ProviderId,warningPercent:number,revision:number)=>void;
 setDirty:(provider:ProviderId,dirty:boolean)=>void;hasUnsaved:()=>boolean;
}
export const ProviderUsageContext=createContext<ProviderUsageReader|null>(null);
const TTL=60000;
interface Cache {identity:string;data:ProviderUsageResponse|null;checked:number}
interface ReadState {identity:string;data:ProviderUsageResponse|null;loading:boolean;error:string|null}
/** Ownership survives credential renewal, and ends on sign-out or a different actor/workspace. */
export function useProviderUsage(token:string,administrator:boolean,ownerIdentity=token):ProviderUsageReader {
 const identity=administrator?ownerIdentity:'';
 const current=useRef(identity);current.current=identity;
 const credential=useRef(token);credential.current=token;
 const dirty=useRef({identity:'',providers:new Set<ProviderId>()});
 const cache=useRef<Cache>({identity:'',data:null,checked:0});
 const pending=useRef<{identity:string;token:string;controller:AbortController;promise:Promise<void>}|null>(null);
 const [state,setState]=useState<ReadState>({identity:'',data:null,loading:false,error:null});
 const read=useCallback((force=false):Promise<void>=>{
  if(!identity)return Promise.resolve();
  // Reclassify retained evidence even when the network is deduplicated or later fails.
  if(cache.current.identity===identity&&cache.current.data){
   const data=parseProviderUsage(cache.current.data);cache.current={...cache.current,data};
   setState(previous=>previous.identity===identity?{...previous,data}:previous);
  }
  if(pending.current?.identity===identity&&pending.current.token===token&&!pending.current.controller.signal.aborted)return pending.current.promise;
  if(!force&&cache.current.identity===identity&&Date.now()-cache.current.checked<TTL)return Promise.resolve();
  pending.current?.controller.abort();const controller=new AbortController();
  setState(previous=>({identity,data:previous.identity===identity?previous.data:null,loading:true,error:null}));
  const promise=(async()=>{
   try{
    const response=await fetch('/api/operations/provider-usage',{headers:{Authorization:'Bearer '+token},signal:controller.signal});
    if(!response.ok)throw Error();
    const data=parseProviderUsage(await response.json());
    if(current.current!==identity||credential.current!==token||controller.signal.aborted)return;
    if(cache.current.identity===identity)data.providers=data.providers.map(provider=>{
     const known=cache.current.data?.providers.find(p=>p.provider===provider.provider);
     return known&&known.settingsRevision>provider.settingsRevision?{...provider,warningPercent:known.warningPercent,settingsRevision:known.settingsRevision}:provider;
    });
    cache.current={identity,data,checked:Date.now()};setState({identity,data,loading:false,error:null});
   }catch{
    if(current.current===identity&&credential.current===token&&!controller.signal.aborted){
     const data=cache.current.identity===identity&&cache.current.data?parseProviderUsage(cache.current.data):null;
     cache.current={identity,data,checked:Date.now()};
     setState({identity,data,loading:false,error:'Provider usage could not be checked. Last-known evidence is retained; retry to check again.'});
    }
   }finally{if(pending.current?.controller===controller)pending.current=null;}
  })();
  pending.current={identity,token,controller,promise};return promise;
 },[identity,token]);
 useEffect(()=>{
  if(cache.current.identity!==identity){
   dirty.current={identity,providers:new Set()};cache.current={identity,data:null,checked:0};
   setState({identity,data:null,loading:!!identity,error:null});
  }
  void read(true);const focus=()=>void read();addEventListener('focus',focus);
  return()=>{removeEventListener('focus',focus);pending.current?.controller.abort();};
 },[identity,read]);
 const latestRead=useRef(read);latestRead.current=read;
 const refresh=useCallback(()=>latestRead.current(true),[]);
 const updateSetting=useCallback((provider:ProviderId,warningPercent:number,revision:number)=>{
  if(!identity||current.current!==identity||cache.current.identity!==identity||!cache.current.data)return;
  const data={providers:cache.current.data.providers.map(p=>p.provider===provider&&revision>=p.settingsRevision?{...p,warningPercent,settingsRevision:revision}:p)};
  cache.current={...cache.current,data};setState(previous=>previous.identity===identity?{...previous,data}:previous);
 },[identity]);
 const setDirty=useCallback((provider:ProviderId,value:boolean)=>{
  if(!identity||current.current!==identity||dirty.current.identity!==identity)return;
  if(value)dirty.current.providers.add(provider);else dirty.current.providers.delete(provider);
 },[identity]);
 // Installed navigation listeners can safely retain this function from the unauthenticated render.
 const hasUnsaved=useCallback(()=>!!current.current&&dirty.current.identity===current.current&&dirty.current.providers.size>0,[]);
 return {identity,data:identity&&state.identity===identity&&state.data?parseProviderUsage(state.data):null,
  loading:!!identity&&(state.identity!==identity||state.loading),error:identity&&state.identity===identity?state.error:null,
  refresh,updateSetting,setDirty,hasUnsaved};
}
