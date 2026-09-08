import { useEffect, useRef, useState } from 'react';
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { Portfolio } from './Portfolio';
import { AccountDetail } from './AccountDetail';
import { demoAccounts, demoInvoices } from './demo';
import type { Account, Invoice } from './domain/portfolio';
export function App() {
  const [params,setParams]=useState(new URLSearchParams(location.search));
  const paramsRef=useRef(params); const review=params.get('mode')==='review';
  const [client,setClient]=useState<SupabaseClient|null>(null), [session,setSession]=useState<Session|null>(null);
  const [accounts,setAccounts]=useState<Account[]>([]), [invoices,setInvoices]=useState<Invoice[]>([]);
  const [accountsOwner,setAccountsOwner]=useState<string|null>(null);
  const [reloadVersion,setReloadVersion]=useState(0);
  const [invoiceState,setInvoiceState]=useState('ready');
  const invoiceOwner=useRef('');
  const sessionRef=useRef(session); sessionRef.current=session;
  const [state,setState]=useState('loading'),[error,setError]=useState('');
  const [googleEnabled,setGoogleEnabled]=useState(false);
  const [password,setPassword]=useState(''),[email,setEmail]=useState('ar@katathani.com'),[busy,setBusy]=useState(false);
  const savedPortfolio=useRef({search:'?mode=review',scroll:0});
  const hotel=params.get('hotel')||'All';
  const update=(key:string,value:string)=>{const next=new URLSearchParams(paramsRef.current);value?next.set(key,value):next.delete(key);paramsRef.current=next;history.replaceState(null,'',`?${next}`);setParams(next);};
  useEffect(()=>{const pop=()=>{const next=new URLSearchParams(location.search);paramsRef.current=next;setParams(next);};addEventListener('popstate',pop);return()=>removeEventListener('popstate',pop);},[]);
  useEffect(()=>{let alive=true;let unsubscribe:(()=>void)|undefined;fetch('/api/config').then(r=>{if(!r.ok)throw new Error();return r.json();}).then(config=>{if(!alive)return;setGoogleEnabled(config.googleEnabled===true);if(!config.supabaseUrl||!config.publishableKey){setState('unavailable');return;}const c=createClient(config.supabaseUrl,config.publishableKey,{auth:{flowType:'pkce',detectSessionInUrl:true}});setClient(c);c.auth.getSession().then(({data})=>{if(alive){setSession(data.session);setState('ready');}});unsubscribe=c.auth.onAuthStateChange((_event,s)=>setSession(s)).data.subscription.unsubscribe;}).catch(()=>{if(alive)setState('unavailable');});return()=>{alive=false;unsubscribe?.();};},[]);
  const load=async()=>{
    if(!session)return;
    const token=session.access_token, owner=session.user.id;
    let accessLost=false;
    setReloadVersion(v=>v+1);setState('loading');setError('');
    try {
      const response=await fetch('/api/portfolio',{headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok){
        accessLost=response.status===401||response.status===403;
        throw new Error(response.status===403?'This account is not authorized.':response.status===401?'Your session has expired. Sign in again.':'The data service is unavailable. Last saved data is retained. Please try again.');
      }
      const data=await response.json();
      if(sessionRef.current?.access_token!==token)return;
      setAccounts(data.accounts);setAccountsOwner(owner);setState('ready');
    } catch(error) {
      if(sessionRef.current?.access_token!==token)return;
      if(accessLost){setAccounts([]);setAccountsOwner(null);}
      setError((error as Error).message);setState('error');
    }
  };
  useEffect(()=>{if(session&&!review)void load();},[session?.access_token,review]);
  useEffect(()=>{setAccounts([]);setAccountsOwner(null);setInvoices([]);setError('');},[session?.user.id]);
  const visible=review?demoAccounts:accountsOwner===session?.user.id?accounts:[];
  const active=visible.find(a=>a.id===params.get('account')&&a.hotel===params.get('property'));
  useEffect(()=>{let alive=true;const ownerKey=`${session?.user.id}/${active?.hotel}/${active?.id}`;if(invoiceOwner.current!==ownerKey){setInvoices([]);invoiceOwner.current=ownerKey;}setInvoiceState('ready');if(active&&!review&&session){setInvoiceState('loading');fetch(`/api/accounts/${encodeURIComponent(active.hotel)}/${encodeURIComponent(active.id)}`,{headers:{Authorization:`Bearer ${session.access_token}`}}).then(async r=>{if(!r.ok)throw new Error();return r.json();}).then(d=>{if(alive){setInvoiceState('ready');setInvoices(d.invoices.map((i:Record<string,unknown>)=>({...i,accountId:i.account_id,invoiceNo:i.invoice_no,folioNo:i.folio_no,date:i.transaction_date,due:null,stage:'Not available'})));}}).catch(()=>{if(alive){setInvoiceState('error');setError('Invoice data is unavailable. Please retry.');}});}return()=>{alive=false;};},[active?.id,active?.hotel,review,session?.access_token,reloadVersion]);
  const openAccount=(a:Account)=>{savedPortfolio.current={search:location.search,scroll:window.scrollY};const next=new URLSearchParams(paramsRef.current);next.set('account',a.id);next.set('property',a.hotel);history.pushState(null,'',`?${next}`);paramsRef.current=next;setParams(next);window.scrollTo(0,0);};
  const back=()=>{const next=new URLSearchParams(paramsRef.current);next.delete('account');next.delete('property');history.pushState(null,'',`?${next}`);paramsRef.current=next;setParams(next);requestAnimationFrame(()=>window.scrollTo(0,savedPortfolio.current.scroll));};
  const login=async()=>{if(!client)return;setBusy(true);setError('');const {error}=await client.auth.signInWithPassword({email,password});setPassword('');setBusy(false);if(error)setError('Sign-in failed. Check your email and web app password.');};
  const google=async()=>{if(!client)return;setError('');const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin}});if(error)setError('Google sign-in is not configured yet. Please use email and password.');};
  return <div className="app-shell"><header className="app-header"><a className="brand" href="/"><span className="brand-mark">KATATHANI<small>COLLECTION</small></span><span><b>Katathani AR Collection System</b><small>{review?'Finance operations workspace · Synthetic data':'Finance operations workspace'}</small></span></a><nav className="main-nav" aria-label="Main navigation"><button className="active" onClick={back}>Portfolio</button>{['Collections','Documents','Gmail','Reports'].map(n=><span key={n} title="Outside this first increment">{n}</span>)}</nav><div className="header-right">{!active&&<div className="hotel-switch">{['All','KAT','TSK'].map(h=><button key={h} className={hotel===h?'active':''} onClick={()=>update('hotel',h)}>{h==='All'?'All Hotels':h}</button>)}</div>}{session&&<button className="icon-button" aria-label="Sign out" onClick={()=>client?.auth.signOut()}><LogOut size={15}/></button>}</div></header>
    {review?<a className="review-exit" href="/">Synthetic review · Open live workspace</a>:null}
    {!review&&!session?<section className="login-panel panel"><ShieldCheck size={26}/><h1>Your AR workspace</h1><p>Sign in to view hotel receivables.</p><button className="google-button" disabled={!client||busy||!googleEnabled} onClick={google}>Sign in with Google</button>{!googleEnabled&&<small>Google sign-in configuration is pending.</small>}<div className="login-divider">or use your web app password</div><form onSubmit={e=>{e.preventDefault();void login();}}><label>Email<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="primary-button" disabled={!client||busy}>{busy?'Signing in…':'Sign in'}</button></form>{state==='unavailable'&&<p className="error-message" role="alert">Authentication service is unavailable. Please try again later.</p>}{error&&<p className="error-message" role="alert">{error}</p>}<small>Access is restricted to approved Katathani AR staff.</small><a className="review-link" href="/?mode=review">View the synthetic design review</a></section>:<>{!review&&<div className="live-status"><span>OPERA not connected · No verified receivables loaded</span><button onClick={load} disabled={state==='loading'}><RefreshCw size={13}/> Reload saved data</button></div>}{error&&<div className="error-message page-error" role="alert">{error}<button onClick={load}>Retry</button></div>}{!review&&state==='loading'?<div className="loading-state" role="status">Loading your workspace…</div>:active?<AccountDetail key={active.hotel+active.id} account={active} invoices={review?demoInvoices(active):invoices} review={review} back={back} loading={invoiceState==='loading'} unavailable={invoiceState==='error'}/>:<Portfolio accounts={visible} hotel={hotel} review={review} params={params} update={update} openAccount={openAccount}/>}</>}
  </div>;
}
