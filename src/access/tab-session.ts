const prefix='ar-google-tab-v1';
let options:ReturnType<typeof initialize>|undefined;

/** A fresh navigation cannot inherit login from another tab or restored browser session. */
export function initialize(storage:Storage,legacy:Storage,project:string,navigation:string,callback:boolean,now=Date.now()){
 const pending=Number(storage.getItem(prefix+'-oauth'));
 const returning=callback&&pending>now-600000&&pending<=now;
 const previous=storage.getItem(prefix);
 if(previous&&navigation!=='reload'&&!returning){
  storage.removeItem(previous);storage.removeItem(previous+'-code-verifier');storage.removeItem(prefix);
 }
 // Only remove this project's obsolete app credentials, never unrelated storage.
 legacy.removeItem(`sb-${project}-auth-token`);
 legacy.removeItem(`sb-${project}-auth-token-code-verifier`);
 const key=storage.getItem(prefix)??prefix+'-'+crypto.randomUUID();storage.setItem(prefix,key);
 if(returning)storage.removeItem(prefix+'-oauth');
 return {storageKey:key,storage,persistSession:true,flowType:'pkce' as const,detectSessionInUrl:returning};
}
export function tabAuthOptions(url:string){
 return options??=initialize(sessionStorage,localStorage,new URL(url).hostname.split('.')[0],
  (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined)?.type??'navigate',new URLSearchParams(location.search).has('code'));
}
export function beginGoogleSignIn(){sessionStorage.setItem(prefix+'-oauth',String(Date.now()));}
