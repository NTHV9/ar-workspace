import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {parseCollectionPolicy,type CollectionPolicy} from '../domain/collection-policy';
interface PolicyContextValue {policy:CollectionPolicy|null;loading:boolean;error:string;refresh:()=>Promise<void>}
const PolicyContext=createContext<PolicyContextValue>({policy:null,loading:false,error:'Collection rules are unavailable.',refresh:async()=>{}});
export function CollectionPolicyProvider({token,children}:{token:string|null;children:ReactNode}){
 const [policy,setPolicy]=useState<CollectionPolicy|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const request=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{request.current?.abort();if(!token){setPolicy(null);setError('');setLoading(false);return;}const controller=new AbortController();request.current=controller;setLoading(true);setError('');try{const r=await fetch('/api/collection-policy',{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});if(!r.ok)throw Error();const next=parseCollectionPolicy(await r.json());if(!controller.signal.aborted)setPolicy(next);}catch{if(!controller.signal.aborted){setPolicy(null);setError('Collection rules could not be loaded. New collection handoffs remain unavailable.');}}finally{if(!controller.signal.aborted)setLoading(false);}},[token]);
 useEffect(()=>{void refresh();return()=>request.current?.abort();},[refresh]);
 return <PolicyContext.Provider value={{policy,loading,error,refresh}}>{children}</PolicyContext.Provider>;
}
export const useCollectionPolicy=()=>useContext(PolicyContext);
