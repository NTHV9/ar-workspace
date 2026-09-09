import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { Portfolio } from './Portfolio';
import { AccountDetail } from './AccountDetail';
import { demoAccounts, demoInvoices } from './demo';
import { refreshLabel } from './ui';
import type { DocumentSelection } from './DocumentRoute';
import type { Account, Invoice, RefreshState } from './domain/portfolio';
const DocumentRoute=lazy(()=>import('./DocumentRoute'));
const CreateDocumentDialog=lazy(()=>import('./DocumentRoute').then(m=>({default:m.CreateDocumentDialog})));
const StatementRendererProof=lazy(()=>import('./StatementRendererProof'));
const PdfValidation=lazy(()=>import('./PdfValidation'));
interface ConfigResponse { documentEditorMaxBytes?:number; googleEnabled?: boolean; supabaseUrl?: string; publishableKey?: string }
interface PortfolioResponse { accounts: Account[]; status?: 'connected' | 'not_connected'; refresh?: RefreshState }
type SavedInvoice = Omit<Invoice, 'accountId' | 'invoiceNo' | 'folioNo' | 'date' | 'due' | 'stage'> & { account_id: string; invoice_no: string; folio_no: string; transaction_date: string };
interface InvoiceResponse { invoices: SavedInvoice[] }
interface RefreshJobsResponse { jobs?: { id?: string; status: string; created: boolean }[] }
async function readJson<T extends object>(response: Response): Promise<T> {
  const data: unknown = await response.json();
  if(!data || typeof data !== 'object' || Array.isArray(data))throw new Error('The data service returned an invalid response. Please retry.');
  return data as T;
}
export function App() {
  const [params,setParams]=useState(new URLSearchParams(location.search));
  const [documentEditorMaxBytes,setDocumentEditorMaxBytes]=useState(67108864);
  const [documentSelection,setDocumentSelection]=useState<DocumentSelection|null>(null);
  const paramsRef=useRef(params); const review=params.get('mode')==='review';
  const [client,setClient]=useState<SupabaseClient|null>(null), [session,setSession]=useState<Session|null>(null);
  const [accounts,setAccounts]=useState<Account[]>([]), [invoices,setInvoices]=useState<Invoice[]>([]);
  const [accountsOwner,setAccountsOwner]=useState<string|null>(null);
  const [refresh,setRefresh]=useState<RefreshState|undefined>();
  const [refreshError,setRefreshError]=useState(''),[requestingRefresh,setRequestingRefresh]=useState(false);
  const [connected,setConnected]=useState(false);
  const openedOwner=useRef<string|null>(null);
  const loadAbort=useRef<AbortController|null>(null);
  const refreshAbort=useRef<AbortController|null>(null);
  const refreshRevision=useRef(0);
  const [reloadVersion,setReloadVersion]=useState(0);
  const [invoiceState,setInvoiceState]=useState('ready');
  const invoiceOwner=useRef('');
  const sessionRef=useRef(session); sessionRef.current=session;
  const [state,setState]=useState('loading'),[error,setError]=useState('');
  const [googleEnabled,setGoogleEnabled]=useState(false);
  const [probeResult,setProbeResult]=useState<unknown>(null),[checkingOpera,setCheckingOpera]=useState(false);
  const checkOpera=async()=>{
    if(!session)return;const token=session.access_token;setCheckingOpera(true);setProbeResult(null);
    try{
      const results=[];
      for(const hotel of ['KAT','TSK']){
        if(sessionRef.current?.access_token!==token)return;
        const response=await fetch(`/api/opera/probe?hotel=${hotel}`,{method:'POST',headers:{Authorization:`Bearer ${token}`}});
        results.push({hotel,httpStatus:response.status,result:await response.json()});
      }
      if(sessionRef.current?.access_token===token)setProbeResult(results);
    }catch{if(sessionRef.current?.access_token===token)setProbeResult({error:'Connection check unavailable. Please retry.'});}
    finally{if(sessionRef.current?.access_token===token)setCheckingOpera(false);}
  };
  const [password,setPassword]=useState(''),[email,setEmail]=useState('ar@katathani.com'),[busy,setBusy]=useState(false);
  const savedPortfolio=useRef({search:'?mode=review',scroll:0});
  const hotel=params.get('hotel')||'All';
  const update=(key:string,value:string)=>{const next=new URLSearchParams(paramsRef.current);value?next.set(key,value):next.delete(key);paramsRef.current=next;history.replaceState(null,'',`?${next}`);setParams(next);};
  useEffect(()=>{const pop=()=>{const next=new URLSearchParams(location.search);paramsRef.current=next;setParams(next);};addEventListener('popstate',pop);return()=>removeEventListener('popstate',pop);},[]);
  useEffect(()=>{let alive=true;let unsubscribe:(()=>void)|undefined;fetch('/api/config').then(r=>{if(!r.ok)throw new Error();return readJson<ConfigResponse>(r);}).then(config=>{if(!alive)return;setGoogleEnabled(config.googleEnabled===true);if(typeof config.documentEditorMaxBytes==='number'&&config.documentEditorMaxBytes>0)setDocumentEditorMaxBytes(config.documentEditorMaxBytes);if(!config.supabaseUrl||!config.publishableKey){setState('unavailable');return;}const c=createClient(config.supabaseUrl,config.publishableKey,{auth:{flowType:'pkce',detectSessionInUrl:true}});setClient(c);c.auth.getSession().then(({data})=>{if(alive){setSession(data.session);setState('ready');}});unsubscribe=c.auth.onAuthStateChange((_event,s)=>setSession(s)).data.subscription.unsubscribe;}).catch(()=>{if(alive)setState('unavailable');});return()=>{alive=false;unsubscribe?.();};},[]);
  const load=async()=>{
    if(!session)return;
    const token=session.access_token, owner=session.user.id, revision=refreshRevision.current;
    let accessLost=false;
    loadAbort.current?.abort(); const controller=new AbortController();loadAbort.current=controller;
    setReloadVersion(v=>v+1);setState('loading');setError('');
    try {
      const response=await fetch('/api/portfolio',{signal:controller.signal,headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok){
        accessLost=response.status===401||response.status===403;
        throw new Error(response.status===403?'This account is not authorized.':response.status===401?'Your session has expired. Sign in again.':'The data service is unavailable. Last saved data is retained. Please try again.');
      }
      const data=await readJson<PortfolioResponse>(response);
      if(controller.signal.aborted||sessionRef.current?.access_token!==token)return;
      setAccounts(data.accounts);setAccountsOwner(owner);setState('ready');setConnected(data.status==='connected');if(data.refresh&&revision===refreshRevision.current)setRefresh(data.refresh);
    } catch(error) {
      if(controller.signal.aborted||sessionRef.current?.access_token!==token)return;
      if(accessLost){setAccounts([]);setAccountsOwner(null);}
      setError((error as Error).message);setState('error');
    }
  };
  useEffect(()=>{if(session&&!review)void load();},[session?.access_token,review]);
  useEffect(()=>{setRequestingRefresh(false);return()=>refreshAbort.current?.abort();},[session?.access_token]);
  useEffect(()=>{setAccounts([]);setAccountsOwner(null);setInvoices([]);setError('');setRefresh(undefined);setProbeResult(null);setCheckingOpera(false);setRefreshError('');setConnected(false);setRequestingRefresh(false);openedOwner.current=null;return()=>{loadAbort.current?.abort();refreshAbort.current?.abort();};},[session?.user.id]);
  const visible=review?demoAccounts:accountsOwner===session?.user.id?accounts:[];
  const active=visible.find(a=>a.id===params.get('account')&&a.hotel===params.get('property'));
  useEffect(()=>{let alive=true;const controller=new AbortController();const ownerKey=`${session?.user.id}/${active?.hotel}/${active?.id}`;if(invoiceOwner.current!==ownerKey){setInvoices([]);invoiceOwner.current=ownerKey;}setInvoiceState('ready');if(active&&!review&&session){setInvoiceState('loading');fetch(`/api/accounts/${encodeURIComponent(active.hotel)}/${encodeURIComponent(active.id)}`,{signal:controller.signal,headers:{Authorization:`Bearer ${session.access_token}`}}).then(async r=>{if(!r.ok)throw new Error();return readJson<InvoiceResponse>(r);}).then(d=>{if(alive){setInvoiceState('ready');setInvoices(d.invoices.map((i)=>({...i,accountId:i.account_id,invoiceNo:i.invoice_no,folioNo:i.folio_no,date:i.transaction_date,due:null,stage:'Not available'})));}}).catch(()=>{if(alive){setInvoiceState('error');setError('Invoice data is unavailable. Please retry.');}});}return()=>{alive=false;controller.abort();};},[active?.id,active?.hotel,review,session?.access_token,reloadVersion]);
  const requestRefresh=async(reason:'manual'|'open',scopeHotel='All',accountId?:string)=>{
    const current=sessionRef.current;
    if(!current||review||refreshAbort.current&&!refreshAbort.current.signal.aborted&&requestingRefresh)return;
    const token=current.access_token,controller=new AbortController();refreshAbort.current=controller;
    refreshRevision.current++;
    setRequestingRefresh(true);setRefreshError('');
    try {
      const response=await fetch('/api/refresh',{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({hotel:scopeHotel,accountId,reason})});
      if(!response.ok)throw new Error();
      const result=await readJson<RefreshJobsResponse>(response);
      if(controller.signal.aborted||sessionRef.current?.access_token!==token)return;
      const running=result.jobs?.some((job:{status:string})=>['queued','running'].includes(job.status))===true;
      if(running)setRefresh(previous=>({hotels:previous?.hotels??[],running:true}));
      const status=await fetch('/api/refresh',{signal:controller.signal,headers:{Authorization:`Bearer ${token}`}});
      if(!status.ok)throw new Error();
      const next=await readJson<RefreshState>(status);
      if(controller.signal.aborted||sessionRef.current?.access_token!==token)return;
      setRefresh({...next,running:next.running||running});
    } catch { if(!controller.signal.aborted&&sessionRef.current?.access_token===token)setRefreshError('OPERA refresh is unavailable. Saved data is retained.'); }
    finally { if(!controller.signal.aborted&&sessionRef.current?.access_token===token)setRequestingRefresh(false); }
  };
  useEffect(()=>{
    if(!session||review||openedOwner.current===session.user.id)return;
    openedOwner.current=session.user.id;void requestRefresh('open');
  },[session?.user.id,review]);
  useEffect(()=>{
    if(review||!session||!refresh?.running)return;
    const controller=new AbortController(),token=session.access_token;
    let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      try {
        const response=await fetch('/api/refresh',{signal:controller.signal,headers:{Authorization:`Bearer ${token}`}});
        if(!response.ok)throw new Error();
        const next=await readJson<RefreshState>(response);
        if(controller.signal.aborted||sessionRef.current?.access_token!==token)return;
        setRefresh(next);setRefreshError('');
        if(!next.running){void load();return;}
      } catch { if(controller.signal.aborted)return;setRefreshError('Refresh status is temporarily unavailable. Saved data is retained.'); }
      timer=setTimeout(poll,3000);
    };
    timer=setTimeout(poll,3000);
    return()=>{controller.abort();clearTimeout(timer);};
  },[session?.access_token,review,refresh?.running]);
  const openAccount=(a:Account)=>{savedPortfolio.current={search:location.search,scroll:window.scrollY};const next=new URLSearchParams(paramsRef.current);next.set('account',a.id);next.set('property',a.hotel);history.pushState(null,'',`?${next}`);paramsRef.current=next;setParams(next);window.scrollTo(0,0);};
  const back=()=>{const next=new URLSearchParams(paramsRef.current);next.delete('account');next.delete('property');next.delete('documentJob');next.delete('documents');next.delete('pdfCheck');next.delete('pdfHotel');history.pushState(null,'',`?${next}`);paramsRef.current=next;setParams(next);requestAnimationFrame(()=>window.scrollTo(0,savedPortfolio.current.scroll));};
  const login=async()=>{if(!client)return;setBusy(true);setError('');const {error}=await client.auth.signInWithPassword({email,password});setPassword('');setBusy(false);if(error)setError('Sign-in failed. Check your email and web app password.');};
  const google=async()=>{if(!client)return;setError('');const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin}});if(error)setError('Google sign-in is not configured yet. Please use email and password.');};
  return <div className="app-shell"><header className="app-header"><a className="brand" href="/"><span className="brand-mark">KATATHANI<small>COLLECTION</small></span><span><b>Katathani AR Collection System</b><small>{review?'Finance operations workspace · Synthetic data':'Finance operations workspace'}</small></span></a><nav className="main-nav" aria-label="Main navigation"><button className="active" onClick={back}>Portfolio</button>{['Collections','Documents','Gmail','Reports'].map(n=>n==='Documents'&&!review?<button key={n} onClick={()=>update('documents','1')}>{n}</button>:<span key={n} title="Outside this increment">{n}</span>)}</nav><div className="header-right">{!active&&<div className="hotel-switch">{['All','KAT','TSK'].map(h=><button key={h} className={hotel===h?'active':''} onClick={()=>update('hotel',h)}>{h==='All'?'All Hotels':h}</button>)}</div>}{session&&<button className="icon-button" aria-label="Sign out" onClick={()=>client?.auth.signOut()}><LogOut size={15}/></button>}</div></header>
    {review?<a className="review-exit" href="/">Synthetic review · Open live workspace</a>:null}
    {!review&&!session?<section className="login-panel panel"><ShieldCheck size={26}/><h1>Your AR workspace</h1><p>Sign in to view hotel receivables.</p><button className="google-button" disabled={!client||busy||!googleEnabled} onClick={google}>Sign in with Google</button>{!googleEnabled&&<small>Google sign-in configuration is pending.</small>}<div className="login-divider">or use your web app password</div><form onSubmit={e=>{e.preventDefault();void login();}}><label>Email<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="primary-button" disabled={!client||busy}>{busy?'Signing in…':'Sign in'}</button></form>{state==='unavailable'&&<p className="error-message" role="alert">Authentication service is unavailable. Please try again later.</p>}{error&&<p className="error-message" role="alert">{error}</p>}<small>Access is restricted to approved Katathani AR staff.</small><a className="review-link" href="/?mode=review">View the synthetic design review</a></section>:<>{!review&&<div className="live-status"><span>{connected?'OPERA connected':'No verified OPERA refresh yet'} / {refreshLabel(refresh,active?.hotel||hotel)}</span><button onClick={()=>requestRefresh('manual',active?.hotel||hotel,active?.id)} disabled={requestingRefresh||refresh?.running}><RefreshCw size={13}/>{requestingRefresh||refresh?.running?'Refreshing OPERA...':'Refresh OPERA'}</button><button onClick={checkOpera} disabled={checkingOpera}>{checkingOpera?'Checking OPERA…':'Check OPERA connection'}</button><button onClick={load} disabled={state==='loading'}><RefreshCw size={13}/> Reload saved data</button></div>}{!review&&refreshError&&<div className="page-error information-note" role="status">{refreshError}</div>}{!review&&probeResult!==null&&<details className="panel" style={{margin:24,padding:16}} open><summary>OPERA connection diagnostics · field types and counts only</summary><pre style={{whiteSpace:'pre-wrap',maxHeight:340,overflow:'auto'}}>{JSON.stringify(probeResult,null,2)}</pre></details>}{error&&<div className="error-message page-error" role="alert">{error}<button onClick={load}>Retry</button></div>}{!review&&session&&params.has('rendererCheck')?<Suspense fallback={<p>Loading renderer proof...</p>}><StatementRendererProof token={session.access_token}/></Suspense>:!review&&session&&(params.has('documentJob')||params.has('documents'))?<Suspense fallback={<p>Loading documents…</p>}><DocumentRoute key={session.user.id+':'+(params.get('documentJob')??'list')} token={session.access_token} maxBytes={documentEditorMaxBytes} jobId={params.get('documentJob')??undefined} onOpen={id=>update('documentJob',id)} onClose={()=>{update('documentJob','');update('documents','');}}/></Suspense>:!review&&state==='loading'?<div className="loading-state" role="status">Loading your workspace…</div>:!review&&session&&params.has('pdfCheck')?<Suspense fallback={<p>Loading PDF viewer…</p>}><PdfValidation runId={params.get('pdfCheck')!} hotel={params.get('pdfHotel')??''} token={session.access_token}/></Suspense>:active?<AccountDetail key={active.hotel+active.id} account={active} invoices={review?demoInvoices(active):invoices} review={review} refresh={refresh} back={back} loading={invoiceState==='loading'} unavailable={invoiceState==='error'} onPrepare={ids=>setDocumentSelection({hotel:active.hotel,accountId:active.id,accountName:active.name,ids})}/>:<Portfolio accounts={visible} hotel={hotel} review={review} refresh={refresh} params={params} update={update} openAccount={openAccount}/>}</>}
    {documentSelection&&session&&!review&&<Suspense fallback={<p>Loading document options…</p>}><CreateDocumentDialog selection={documentSelection} token={session.access_token} onClose={()=>setDocumentSelection(null)} onCreated={id=>{setDocumentSelection(null);update('documentJob',id);}}/></Suspense>}
  </div>;
}
