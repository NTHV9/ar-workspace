import {useEffect,useState} from 'react';
import type {Session} from '@supabase/supabase-js';
import {parseAccess,type UserAccess} from './model';
export function useWorkspaceAccess(session:Session|null){
 const [result,setResult]=useState<{token:string;owner:string;access:UserAccess|null;error:string}|null>(null);
 useEffect(()=>{
  if(!session){setResult(null);return;}
  let alive=true,controller:AbortController|undefined;
  const token=session.access_token,owner=session.user.id;
  const load=async()=>{controller?.abort();const current=new AbortController();controller=current;
   try{const r=await fetch('/api/access/me',{headers:{Authorization:'Bearer '+token},signal:current.signal});if(!r.ok)throw Error(r.status===401?'Your session has ended. Sign in again.':r.status===403?'Your workspace access is not approved or has been suspended. Contact your administrator.':'Access could not be verified. Reload to try again.');const access=parseAccess(await r.json());if(alive&&!current.signal.aborted)setResult({token,owner,access,error:''});}
   catch(error){if(alive&&!current.signal.aborted)setResult({token,owner,access:null,error:error instanceof Error?error.message:'Access could not be verified.'});}
  };
  void load();addEventListener('focus',load);return()=>{alive=false;controller?.abort();removeEventListener('focus',load);};
 },[session?.access_token,session?.user.id]);
 // A same-user token renewal must not unmount dirty editors while the grant is rechecked.
 // Explicit failures and another identity never inherit the prior verified grant.
 const sameOwner=!!session&&result?.owner===session.user.id;
 return sameOwner&&(result?.token===session.access_token||!!result?.access&&!result.error)?{access:result?.access??null,error:result?.error??''}:{access:null,error:''};
}
