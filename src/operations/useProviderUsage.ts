import {createContext,useCallback,useEffect,useRef,useState} from 'react';
import {parseProviderUsage,type ProviderId,type ProviderUsageResponse} from './provider-usage';
export interface ProviderUsageReader {data:ProviderUsageResponse|null;loading:boolean;error:string|null;refresh:()=>Promise<void>;updateSetting:(provider:ProviderId,warningPercent:number,revision:number)=>void;setDirty:(provider:ProviderId,dirty:boolean)=>void;hasUnsaved:()=>boolean}
export const ProviderUsageContext=createContext<ProviderUsageReader|null>(null);
const TTL=60000;
/** One mounted administrator reader owns the session cache and shares it with Storage. */
export function useProviderUsage(token:string,administrator:boolean):ProviderUsageReader {
 const identity=administrator?token:'';
 const dirty=useRef(new Set<ProviderId>());
 const current=useRef(identity);current.current=identity;
 const cache=useRef<{identity:string;data:ProviderUsageResponse|null;checked:number}>({identity:'',data:null,checked:0});
 const pending=useRef<{identity:string;controller:AbortController;promise:Promise<void>}|null>(null);
 const [state,setState]=useState<{identity:string;data:ProviderUsageResponse|null;loading:boolean;error:string|null}>({identity:'',data:null,loading:false,error:null});
 const read=useCallback((force=false):Promise<void>=>{
  if(!identity)return Promise.resolve();
  if(pending.current?.identity===identity&&!pending.current.controller.signal.aborted)return pending.current.promise;
  if(!force&&cache.current.identity===identity&&Date.now()-cache.current.checked<TTL)return Promise.resolve();
  pending.current?.controller.abort();const controller=new AbortController();
  setState(previous=>({identity,data:previous.identity===identity?previous.data:null,loading:true,error:null}));
  const promise=(async()=>{try{const r=await fetch('/api/operations/provider-usage',{headers:{Authorization:'Bearer '+identity},signal:controller.signal});if(!r.ok)throw Error();const data=parseProviderUsage(await r.json());if(cache.current.identity===identity)data.providers=data.providers.map(provider=>{const known=cache.current.data?.providers.find(p=>p.provider===provider.provider);return known&&known.settingsRevision>provider.settingsRevision?{...provider,warningPercent:known.warningPercent,settingsRevision:known.settingsRevision}:provider;});if(current.current!==identity||controller.signal.aborted)return;cache.current={identity,data,checked:Date.now()};setState({identity,data,loading:false,error:null});}
  catch{if(current.current===identity&&!controller.signal.aborted){cache.current.checked=Date.now();setState(previous=>({identity,data:previous.identity===identity?previous.data:null,loading:false,error:'Provider usage could not be checked. Last-known evidence is retained; retry to check again.'}));}}
  finally{if(pending.current?.controller===controller)pending.current=null;}})();pending.current={identity,controller,promise};return promise;
 },[identity]);
 useEffect(()=>{dirty.current.clear();cache.current={identity,data:null,checked:0};setState({identity,data:null,loading:!!identity,error:null});void read();const focus=()=>void read();addEventListener('focus',focus);return()=>{removeEventListener('focus',focus);pending.current?.controller.abort();cache.current={identity:'',data:null,checked:0};};},[identity,read]);
 const refresh=useCallback(()=>read(true),[read]);
 const updateSetting=useCallback((provider:ProviderId,warningPercent:number,revision:number)=>{if(!identity||current.current!==identity)return;if(cache.current.identity!==identity||!cache.current.data)return;const data={providers:cache.current.data.providers.map(p=>p.provider===provider&&revision>=p.settingsRevision?{...p,warningPercent,settingsRevision:revision}:p)};cache.current={...cache.current,data};setState(previous=>previous.identity===identity?{...previous,data}:previous);},[identity]);
 return {data:identity&&state.identity===identity?state.data:null,loading:!!identity&&(state.identity!==identity||state.loading),error:identity&&state.identity===identity?state.error:null,refresh,updateSetting,setDirty:(provider,value)=>{if(value)dirty.current.add(provider);else dirty.current.delete(provider);},hasUnsaved:()=>!!identity&&dirty.current.size>0};
}
