import {OperaStatusMenu} from './OperaStatusMenu';
import {clearPeriodPreview} from './dashboard/period-preview-cache';
import {SignInScreen} from './access/SignInScreen';
import './regional.css';
import {useWorkspaceAccess} from './access/use-workspace-access';
import {WorkspaceAccessContext} from './access/context';
import {hotelInRegion,hotelRegion,isRegionId,regionHotels,REGION_IDS,regionLabel,resolveRegion} from './domain/hotels';
import {latestInvoiceActivity} from './domain/invoice-display';
import {dashboardRemittanceContext,dashboardReturn} from './dashboard/links';
import {hasAuthCallback,initialWorkspaceParams} from './navigation';
import {dashboardScope} from './dashboard/model';
import type {AgingContext} from './dashboard/CurrentAging';

import {tabAuthOptions,beginGoogleSignIn} from './access/tab-session';
import {CollectionPolicyProvider} from './collection/PolicyContext';
import type {RemittanceContext} from './remittance/Remittances';

import { lazy, useEffect, useMemo, useRef, useState } from 'react';
import {LazyPanel} from './LazyPanel';
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { LogOut, RefreshCw } from 'lucide-react';
import { Portfolio } from './Portfolio';
import { AccountDetail } from './AccountDetail';
import { demoAccounts, demoInvoices } from './demo';
import { refreshLabel } from './ui';
import type { DocumentSelection,DocumentJobIdentity } from './DocumentRoute';
import type { Account, Invoice, RefreshState } from './domain/portfolio';
const UsersAccess=lazy(()=>import('./access/Settings'));
const Dashboard=lazy(()=>import('./dashboard/Dashboard'));
const Remittances=lazy(()=>import('./remittance/Remittances'));
const AcceptancePanel=lazy(()=>import('./operations/AcceptancePanel'));
const Operations=lazy(()=>import('./operations/Operations'));
const DriveStorage=lazy(()=>import('./drive/DriveStorage'));
const ExternalBillingReports=lazy(()=>import('./reports/ExternalBillingReports'));
const TemplateLibrary=lazy(()=>import('./email/TemplateLibrary'));
const CollectionQueue=lazy(()=>import('./CollectionQueue'));


const CollectionPolicySettings=lazy(()=>import('./collection/CollectionPolicySettings'));
const DocumentRoute=lazy(()=>import('./DocumentRoute'));
const CreateDocumentDialog=lazy(()=>import('./DocumentRoute').then(m=>({default:m.CreateDocumentDialog})));
const StatementRendererProof=lazy(()=>import('./StatementRendererProof'));
const PdfValidation=lazy(()=>import('./PdfValidation'));
interface ConfigResponse { acceptanceSelected?:boolean; writeHold?:boolean; documentEditorMaxBytes?:number; googleEnabled?: boolean; supabaseUrl?: string; publishableKey?: string }
interface PortfolioResponse { accounts: Account[]; status?: 'connected' | 'not_connected'; refresh?: RefreshState }
type SavedInvoice = Omit<Invoice, 'accountId' | 'invoiceNo' | 'folioNo' | 'date' | 'due' | 'stage'> & { account_id: string; invoice_no: string; folio_no: string; transaction_date: string };
interface InvoiceResponse { invoices: SavedInvoice[] }
interface RefreshJobsResponse { jobs?: { id?: string; status: string; created: boolean }[] }
const publicationKey=(refresh?:RefreshState)=>JSON.stringify((refresh?.hotels??[]).map(h=>[h.hotel,h.last_success_at] as const).sort(([a],[b])=>a.localeCompare(b)));
async function readJson<T extends object>(response: Response): Promise<T> {
  const data: unknown = await response.json();
  if(!data || typeof data !== 'object' || Array.isArray(data))throw new Error('The data service returned an invalid response. Please retry.');
  return data as T;
}
export function App() {
  useEffect(()=>{const original=new URLSearchParams(location.search),normalized=initialWorkspaceParams(original);if(!hasAuthCallback(original)&&normalized.toString()!==original.toString())history.replaceState(null,'','?'+normalized+location.hash);},[]);
  const [params,setParams]=useState(()=>initialWorkspaceParams(new URLSearchParams(location.search)));
  const recovery=false;
  const [authReady,setAuthReady]=useState(false);
  const loginCallback=useRef(new URLSearchParams(location.search).has('code'));
  const [documentEditorMaxBytes,setDocumentEditorMaxBytes]=useState(67108864);
  const [documentSelection,setDocumentSelection]=useState<DocumentSelection|null>(null);
  const agingContext=useRef<{owner:string;value:AgingContext}|null>(null);
  const remittanceContext=useRef<{owner:string;value:RemittanceContext}|null>(null);
  const remittanceDirty=useRef(false);
  const [remittanceLocked,setRemittanceLocked]=useState(false);
  const setRemittanceDirty=(value:boolean)=>{remittanceDirty.current=value;setRemittanceLocked(value);};
  const accountBeforeRemittance=useRef<string|null>(null);
  const policyDirty=useRef(false);const setPolicyDirty=(value:boolean)=>{policyDirty.current=value;};
  const documentDirty=useRef(false),documentEditing=useRef<'pdf'|'email'>('pdf');const setDocumentDirty=(value:boolean,kind:'pdf'|'email'='pdf')=>{documentDirty.current=value;documentEditing.current=kind;};
  const accountDirty=useRef(false);const setAccountDirty=(value:boolean)=>{accountDirty.current=value;};
  const templateDirty=useRef(false);
  const setTemplateDirty=(value:boolean)=>{templateDirty.current=value;};
  const paramsRef=useRef(params); const review=params.get('mode')==='review';
  const [client,setClient]=useState<SupabaseClient|null>(null), [session,setSession]=useState<Session|null>(null);
  const {access:workspaceAccess,error:accessError}=useWorkspaceAccess(session);
  useEffect(()=>{if(!authReady||!session||!loginCallback.current)return;loginCallback.current=false;const next=initialWorkspaceParams(new URLSearchParams());paramsRef.current=next;history.replaceState(null,'','?'+next);setParams(next);},[authReady,session]);
  const [accounts,setAccounts]=useState<Account[]>([]), [invoices,setInvoices]=useState<Invoice[]>([]);
  const [accountsOwner,setAccountsOwner]=useState<string|null>(null);
  const [refresh,setRefresh]=useState<RefreshState|undefined>();
  const [refreshError,setRefreshError]=useState(''),[requestingRefresh,setRequestingRefresh]=useState(false);
  const [connected,setConnected]=useState(false);
  const openedOwner=useRef<string|null>(null);
  const loadAbort=useRef<AbortController|null>(null);
  const loadedCatalog=useRef<{owner:string;region:string;publication:string}|null>(null);
  const pendingPublication=useRef<{owner:string;region:string;publication:string;force:boolean}|null>(null);
  const refreshAbort=useRef<AbortController|null>(null);
  const refreshRevision=useRef(0);
  const [reloadVersion,setReloadVersion]=useState(0);
  useEffect(()=>{if(!session?.user.id)return;const changed=()=>{clearPeriodPreview();setReloadVersion(n=>n+1);};window.addEventListener('ar-invoice-changed',changed);let channel:BroadcastChannel|undefined;try{channel=new BroadcastChannel('ar-invoice-changes');channel.onmessage=()=>window.dispatchEvent(new Event('ar-invoice-changed'));}catch{}return()=>{window.removeEventListener('ar-invoice-changed',changed);channel?.close();};},[session?.user.id]);
  const [invoiceState,setInvoiceState]=useState('ready');
  const invoiceOwner=useRef('');
  const sessionRef=useRef(session); sessionRef.current=session;
  const [state,setState]=useState('loading'),[error,setError]=useState('');
  const [googleEnabled,setGoogleEnabled]=useState(false);
  const [writeHold,setWriteHold]=useState(false);
  const [acceptanceSelected,setAcceptanceSelected]=useState(false);
  const [probeResult,setProbeResult]=useState<unknown>(null),[checkingOpera,setCheckingOpera]=useState(false);
  const checkOpera=async()=>{
    if(!session)return;const token=session.access_token;setCheckingOpera(true);setProbeResult(null);
    try{
      const results=[];
      for(const hotel of regionHotels(resolveRegion(paramsRef.current))){
        if(sessionRef.current?.access_token!==token)return;
        const response=await fetch(`/api/opera/probe?hotel=${hotel}`,{method:'POST',headers:{Authorization:`Bearer ${token}`}});
        results.push({hotel,httpStatus:response.status,result:await response.json()});
      }
      if(sessionRef.current?.access_token===token)setProbeResult(results);
    }catch{if(sessionRef.current?.access_token===token)setProbeResult({error:'Connection check unavailable. Please retry.'});}
    finally{if(sessionRef.current?.access_token===token)setCheckingOpera(false);}
  };
  const [busy,setBusy]=useState(false);
  const savedPortfolio=useRef({search:'?mode=review',scroll:0});
  const region=resolveRegion(params),hotels=regionHotels(region),hotel=hotelInRegion(params.get('hotel'),region)?params.get('hotel')!:'All';
  const accessReady=review||!!workspaceAccess&&workspaceAccess.regions.includes(region);
  const accessKey=workspaceAccess?(workspaceAccess.username??workspaceAccess.email??'')+':'+workspaceAccess.revision+':'+workspaceAccess.regions.join(','):'';
  useEffect(()=>{if(review||!workspaceAccess||workspaceAccess.regions.includes(region))return;const next=new URLSearchParams();next.set('region',workspaceAccess.regions[0]);next.set('hotel','All');if(paramsRef.current.has('dashboard')){next.set('dashboard','1');next.set('dashboardView',paramsRef.current.get('dashboardView')==='aging'?'aging':'period');}paramsRef.current=next;history.replaceState(null,'','?'+next);setParams(next);setAccounts([]);setInvoices([]);loadedCatalog.current=null;},[accessKey,region,review]);
  const synchronizeDocumentScope=(identity:DocumentJobIdentity)=>{
    // Only an authenticated, identity-checked job read can repair a job-only callback URL.
    const next=new URLSearchParams(location.search);if(next.get('documentJob')!==identity.id)return;
    const jobRegion=hotelRegion(identity.hotel),previousRegion=resolveRegion(next);
    next.set('region',jobRegion);
    const scopedHotel=next.get('hotel');if(scopedHotel&&scopedHotel!=='All'&&scopedHotel!==identity.hotel)next.set('hotel','All');
    if((next.has('account')||next.has('property'))&&(next.get('account')!==identity.accountId||next.get('property')!==identity.hotel)){
      for(const key of ['account','property','focusInvoice','accountSection'])next.delete(key);
    }
    if(previousRegion!==jobRegion){for(const key of ['accountFilter','type','search','dashboardType','dashboardAccount','dashboardDetail','dashboardMetric','dashboardStage','dashboardPage','dashboardDetailHotel','dashboardHotel','fromDashboard','qtype','qaccount','qfocus','remitHotel','remitAccount'])next.delete(key);}
    const queueAccount=next.get('qaccount');if(queueAccount&&queueAccount!==identity.hotel+':'+identity.accountId){next.delete('qaccount');next.delete('qfocus');}
    if(next.toString()===new URLSearchParams(location.search).toString())return;
    paramsRef.current=next;history.replaceState(null,'','?'+next);setParams(next);
  };
  const changeRegion=(value:string)=>{
    if(!isRegionId(value)||value===region||!review&&!workspaceAccess?.regions.includes(value))return;
    if((templateDirty.current||remittanceDirty.current||accountDirty.current||policyDirty.current||documentDirty.current)&&!window.confirm(documentDirty.current&&documentEditing.current==='pdf'?'Leave this preparation and discard tab-only PDF edits?':'Leave without saving or resolving the current changes?'))return;
    const next=new URLSearchParams(paramsRef.current);next.set('region',value);next.set('hotel','All');
    for(const key of ['account','property','focusInvoice','accountFilter','type','search','dashboardType','dashboardAccount','dashboardDetail','dashboardMetric','dashboardStage','dashboardPage','dashboardDetailHotel','dashboardHotel','fromDashboard','documentJob','documents','compose','pdfCheck','pdfHotel','remitHotel','remitAccount','accountSection','qfocus','qaccount','qtype'])next.delete(key);
    setDocumentSelection(null);if(agingContext.current)agingContext.current={...agingContext.current,value:{...agingContext.current.value,hotel:'All',type:undefined,accountKey:undefined,search:'',page:1,sort:{...agingContext.current.value.sort,hotel:'Total'},invoiceHotel:'Total',countSelection:null,countFilters:null}};if(remittanceContext.current)remittanceContext.current={...remittanceContext.current,value:{...remittanceContext.current.value,hotel:'All',type:'',account:'',search:'',page:0,selectedId:undefined}};accountBeforeRemittance.current=null;
    paramsRef.current=next;history.pushState(null,'','?'+next);setParams(next);
  };
  const update=(key:string,value:string)=>{const next=new URLSearchParams(paramsRef.current);value?next.set(key,value):next.delete(key);if(key==='hotel'){
    next.delete('dashboardPage');next.delete('dashboardDetailHotel');
    if(hotelInRegion(value,resolveRegion(next)))for(const queueKey of ['qaccount','qfocus']){const saved=next.get(queueKey);if(saved&&saved!=='All'&&!saved.startsWith(value+':'))next.delete(queueKey);}
  }paramsRef.current=next;history.replaceState(null,'',`?${next}`);setParams(next);};
  const signOut=()=>{
    if(!client)return;
    if((templateDirty.current||remittanceDirty.current||accountDirty.current||policyDirty.current||documentDirty.current)&&!window.confirm(documentDirty.current&&documentEditing.current==='pdf'?'Sign out and discard tab-only PDF edits?':'Sign out without saving or resolving the current changes?'))return;
    clearPeriodPreview();
    void client.auth.signOut({scope:'local'});
  };
  useEffect(()=>{const before=(event:BeforeUnloadEvent)=>{if(accountDirty.current||policyDirty.current){event.preventDefault();event.returnValue='';}};addEventListener('beforeunload',before);return()=>removeEventListener('beforeunload',before);},[]);
  useEffect(()=>{if(params.has('documents'))update('documents','');},[params]);
  useEffect(()=>{const pop=()=>{if((templateDirty.current||remittanceDirty.current||accountDirty.current||policyDirty.current||documentDirty.current)&&!window.confirm(documentDirty.current&&documentEditing.current==='pdf'?'Leave this preparation and discard tab-only PDF edits?':'Leave without saving or resolving the current changes?')){history.pushState(null,'',`?${paramsRef.current}`);return;}const original=new URLSearchParams(location.search),next=initialWorkspaceParams(original);if(!hasAuthCallback(original)&&next.toString()!==original.toString())history.replaceState(null,'','?'+next+location.hash);paramsRef.current=next;setParams(next);};addEventListener('popstate',pop);return()=>removeEventListener('popstate',pop);},[]);
  useEffect(()=>{let alive=true;let unsubscribe:(()=>void)|undefined;fetch('/api/config').then(r=>{if(!r.ok)throw new Error();return readJson<ConfigResponse>(r);}).then(config=>{if(!alive)return;setGoogleEnabled(config.googleEnabled===true);setWriteHold(config.writeHold===true);setAcceptanceSelected(config.acceptanceSelected===true);if(typeof config.documentEditorMaxBytes==='number'&&config.documentEditorMaxBytes>0)setDocumentEditorMaxBytes(config.documentEditorMaxBytes);if(!config.supabaseUrl||!config.publishableKey){setAuthReady(true);setState('unavailable');return;}const c=createClient(config.supabaseUrl,config.publishableKey,{auth:tabAuthOptions(config.supabaseUrl)});setClient(c);c.auth.getSession().then(({data})=>{if(alive){setSession(data.session);setAuthReady(true);setState('ready');}});unsubscribe=c.auth.onAuthStateChange((_event,s)=>{if(!s)clearPeriodPreview();if(alive)setSession(s);}).data.subscription.unsubscribe;}).catch(()=>{if(alive){setAuthReady(true);setState('unavailable');}});return()=>{alive=false;unsubscribe?.();};},[]);
  const load=async()=>{
    if(!accessReady||!session||sessionRef.current?.access_token!==session.access_token||resolveRegion(paramsRef.current)!==region)return;
    const token=session.access_token, owner=session.user.id, revision=refreshRevision.current;
    let accessLost=false,loaded=false;
    loadAbort.current?.abort(); const controller=new AbortController();loadAbort.current=controller;
    if(loadedCatalog.current?.owner!==owner||loadedCatalog.current.region!==region)setState('loading');setError('');
    try {
      const response=await fetch('/api/portfolio'+(region==='khao-lak'?'?region=khao-lak':''),{signal:controller.signal,headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok){
        accessLost=response.status===401||response.status===403;
        throw new Error(response.status===403?'This account is not authorized.':response.status===401?'Your session has expired. Sign in again.':'The data service is unavailable. Last saved data is retained. Please try again.');
      }
      const data=await readJson<PortfolioResponse>(response);
      if(controller.signal.aborted||sessionRef.current?.access_token!==token||resolveRegion(paramsRef.current)!==region)return;
      loadedCatalog.current={owner,region,publication:publicationKey(data.refresh)};
      loaded=true;
      setAccounts(data.accounts);setAccountsOwner(owner);setState('ready');setConnected(data.status==='connected');if(data.refresh&&revision===refreshRevision.current)setRefresh(data.refresh);setReloadVersion(v=>v+1);
    } catch(error) {
      if(controller.signal.aborted||sessionRef.current?.access_token!==token||resolveRegion(paramsRef.current)!==region)return;
      if(accessLost){setAccounts([]);setAccountsOwner(null);loadedCatalog.current=null;}
      setError((error as Error).message);setState('error');
    } finally {
      if(loadAbort.current===controller){
        loadAbort.current=null;const pending=pendingPublication.current;pendingPublication.current=null;
        // A hotel may finish while this response is in flight. Reload once only
        // if that newer publication was not already included in the response.
        if(loaded&&pending?.owner===owner&&pending.region===region&&(pending.force||pending.publication!==loadedCatalog.current?.publication))void load();
      }
    }
  };
  const reloadForRefresh=(next:RefreshState,force=false)=>{
    if(!session||!force&&loadedCatalog.current?.publication===publicationKey(next))return;
    if(loadAbort.current)pendingPublication.current={owner:session.user.id,region,publication:publicationKey(next),force};
    else void load();
  };
  useEffect(()=>{if(accessReady&&session&&!review&&!recovery&&!params.has('usersAccess'))void load();return()=>loadAbort.current?.abort();},[session?.access_token,review,recovery,region,accessReady,accessKey,params.has('usersAccess')]);
  useEffect(()=>{setRequestingRefresh(false);return()=>refreshAbort.current?.abort();},[session?.access_token,region]);
  useEffect(()=>{loadedCatalog.current=null;pendingPublication.current=null;setAccounts([]);setAccountsOwner(null);setInvoices([]);setError('');setRefresh(undefined);setProbeResult(null);setCheckingOpera(false);setRefreshError('');setConnected(false);setRequestingRefresh(false);openedOwner.current=null;return()=>{loadAbort.current?.abort();refreshAbort.current?.abort();};},[session?.user.id]);
  const visible=useMemo(()=>(review?demoAccounts:accountsOwner===session?.user.id?accounts:[]).filter(a=>hotelInRegion(a.hotel,region)),[review,accountsOwner,session?.user.id,accounts,region]);
  const active=visible.find(a=>a.id===params.get('account')&&a.hotel===params.get('property'));
  useEffect(()=>{let alive=true;const controller=new AbortController();const ownerKey=`${session?.user.id}/${active?.hotel}/${active?.id}`;if(invoiceOwner.current!==ownerKey){setInvoices([]);invoiceOwner.current=ownerKey;}setInvoiceState('ready');if(accessReady&&active&&!review&&session&&!recovery){setInvoiceState('loading');fetch(`/api/accounts/${encodeURIComponent(active.hotel)}/${encodeURIComponent(active.id)}`,{signal:controller.signal,headers:{Authorization:`Bearer ${session.access_token}`}}).then(async r=>{if(!r.ok)throw new Error();return readJson<InvoiceResponse>(r);}).then(d=>{if(alive){setInvoiceState('ready');setInvoices(d.invoices.map((i)=>({...i,accountId:i.account_id,invoiceNo:i.invoice_no,folioNo:i.folio_no,date:i.transaction_date,due:i.workflow?.due_date??null,stage:latestInvoiceActivity(i.workflow)})));}}).catch(()=>{if(alive){setInvoiceState('error');setError('Invoice data is unavailable. Please retry.');}});}return()=>{alive=false;controller.abort();};},[active?.id,active?.hotel,review,session?.access_token,reloadVersion,accessReady,accessKey]);
  const requestRefresh=async(reason:'manual'|'open',scopeHotel='All',accountId?:string)=>{
    if(!accessReady)return;
    if(writeHold)return;
    const current=sessionRef.current;
    if(!current||review||recovery||resolveRegion(paramsRef.current)!==region||refreshAbort.current&&!refreshAbort.current.signal.aborted&&requestingRefresh)return;
    const token=current.access_token,controller=new AbortController();refreshAbort.current=controller;
    refreshRevision.current++;
    setRequestingRefresh(true);setRefreshError('');
    try {
      const response=await fetch('/api/refresh',{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({hotel:scopeHotel,accountId,reason,region})});
      if(!response.ok)throw new Error();
      const result=await readJson<RefreshJobsResponse>(response);
      if(controller.signal.aborted||sessionRef.current?.access_token!==token||resolveRegion(paramsRef.current)!==region)return;
      const running=result.jobs?.some((job:{status:string})=>['queued','running'].includes(job.status))===true;
      if(running)setRefresh(previous=>({hotels:previous?.hotels??[],running:true}));
      const status=await fetch('/api/refresh'+(region==='khao-lak'?'?region=khao-lak':''),{signal:controller.signal,headers:{Authorization:`Bearer ${token}`}});
      if(!status.ok)throw new Error();
      const next=await readJson<RefreshState>(status);
      if(controller.signal.aborted||sessionRef.current?.access_token!==token||resolveRegion(paramsRef.current)!==region)return;
      setRefresh({...next,running:next.running||running});
      // Fast jobs may finish before the polling effect gets its first turn.
      reloadForRefresh(next,!next.running&&!running&&refresh?.running===true);
    } catch { if(!controller.signal.aborted&&sessionRef.current?.access_token===token&&resolveRegion(paramsRef.current)===region)setRefreshError('OPERA refresh is unavailable. Saved data is retained.'); }
    finally { if(!controller.signal.aborted&&sessionRef.current?.access_token===token&&resolveRegion(paramsRef.current)===region)setRequestingRefresh(false); }
  };
  useEffect(()=>{
    if(params.has('usersAccess')||!accessReady||!session||review||recovery||writeHold||openedOwner.current===session.user.id+':'+region)return;
    openedOwner.current=session.user.id+':'+region;void requestRefresh('open');
  },[session?.user.id,review,recovery,region,accessReady,params.has('usersAccess')]);
  useEffect(()=>{
    if(!accessReady||review||recovery||!session||!refresh?.running)return;
    const controller=new AbortController(),token=session.access_token;
    let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      try {
        const response=await fetch('/api/refresh'+(region==='khao-lak'?'?region=khao-lak':''),{signal:controller.signal,headers:{Authorization:`Bearer ${token}`}});
        if(!response.ok)throw new Error();
        const next=await readJson<RefreshState>(response);
        if(controller.signal.aborted||sessionRef.current?.access_token!==token||resolveRegion(paramsRef.current)!==region)return;
        setRefresh(next);setRefreshError('');
        // A completed hotel can be displayed while other hotels are still reading.
        // Keep a pending catalog request intact rather than restarting it every poll.
        reloadForRefresh(next,!next.running);
        if(!next.running)return;
      } catch { if(controller.signal.aborted||sessionRef.current?.access_token!==token||resolveRegion(paramsRef.current)!==region)return;setRefreshError('Refresh status is temporarily unavailable. Saved data is retained.'); }
      timer=setTimeout(poll,3000);
    };
    timer=setTimeout(poll,3000);
    return()=>{controller.abort();clearTimeout(timer);};
  },[session?.access_token,review,recovery,refresh?.running,region,accessReady]);
  const openAccount=(a:Account,invoiceId?:string)=>{savedPortfolio.current={search:location.search,scroll:window.scrollY};const next=new URLSearchParams(paramsRef.current);next.set('account',a.id);next.set('property',a.hotel);next.delete('focusInvoice');if(invoiceId)next.set('focusInvoice',invoiceId);history.pushState(null,'',`?${next}`);paramsRef.current=next;setParams(next);window.scrollTo(0,0);};
  const back=()=>{if(accountDirty.current&&!window.confirm('Discard unsaved account changes?'))return;const next=new URLSearchParams(paramsRef.current);next.delete('account');next.delete('property');next.delete('focusInvoice');next.delete('documentJob');next.delete('documents');next.delete('pdfCheck');next.delete('pdfHotel');history.pushState(null,'',`?${next}`);paramsRef.current=next;setParams(next);requestAnimationFrame(()=>window.scrollTo(0,savedPortfolio.current.scroll));};
  const updateDashboard=(fields:Record<string,string>)=>{const next=new URLSearchParams(paramsRef.current);next.set('dashboard','1');next.delete('portfolio');for(const [key,value] of Object.entries(fields)){if(!['dashboardDay','dashboardFrom','dashboardTo','dashboardDateMode','dashboardView','dashboardType','dashboardAccount','dashboardDetail','dashboardMetric','dashboardStage','dashboardPage','dashboardDetailHotel'].includes(key))continue;if(value||['dashboardDay','dashboardFrom','dashboardTo'].includes(key))next.set(key,value);else next.delete(key);}paramsRef.current=next;history.pushState(null,'',`?${next}`);setParams(next);};
  const navigateView=(view:string)=>{if((templateDirty.current||remittanceDirty.current||accountDirty.current||policyDirty.current||documentDirty.current)&&!window.confirm(documentDirty.current&&documentEditing.current==='pdf'?'Leave this preparation and discard tab-only PDF edits?':'Leave without saving or resolving the current changes?'))return;const next=new URLSearchParams(paramsRef.current);if(view==='dashboard'&&next.get('fromDashboard')==='1')next.set('hotel',next.get('dashboardHotel')??hotel);for(const k of ['portfolio','usersAccess','dashboard','fromDashboard','dashboardDetail','dashboardStage','dashboardMetric','dashboardPage','dashboardDetailHotel','dashboardHotel','account','property','documentJob','documents','pdfCheck','pdfHotel','collections','reports','templates','compose','storage','drive','remittances','remitHotel','remitAccount','accountSection','collectionPolicy','financial','externalBilling','observations','operations','acceptance','focusInvoice'])next.delete(k);if(view==='portfolio'&&!review){next.set('dashboard','1');next.set('dashboardView','aging');}else{next.set(view,'1');if(view==='dashboard')next.set('dashboardView','period');}paramsRef.current=next;history.pushState(null,'',`?${next}`);setParams(next);};
  const openRemittances=(a:Account)=>{if(accountDirty.current&&!window.confirm('Discard unsaved account changes?'))return;accountBeforeRemittance.current=location.search;const next=new URLSearchParams(paramsRef.current);for(const key of ['account','property','reports','collections','documents','documentJob'])next.delete(key);next.set('remittances','1');next.set('remitHotel',a.hotel);next.set('remitAccount',a.id);if(session)remittanceContext.current={owner:session.user.id,value:{hotel,view:'pending',type:'',account:JSON.stringify([a.hotel,a.id]),search:'',from:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).slice(0,8)+'01',to:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),includeVoided:false,page:0}};paramsRef.current=next;history.pushState(null,'',`?${next}`);setParams(next);};
  const backToRemittanceAccount=()=>{const target=accountBeforeRemittance.current;if(target){const next=new URLSearchParams(target);paramsRef.current=next;history.pushState(null,'',`?${next}`);setParams(next);}else{const a=accounts.find(a=>a.id===params.get('remitAccount')&&a.hotel===params.get('remitHotel'));if(a)openAccount(a);}};
  const google=async()=>{if(!client)return;setBusy(true);setError('');beginGoogleSignIn();try{const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin,queryParams:{prompt:'select_account'}}});if(error)throw error;}catch{setError('Google sign-in is unavailable. Please try again.');setBusy(false);}};
  if(!review&&(!authReady||!session||!accessReady))return <SignInScreen loading={!authReady||!!session&&!accessReady&&!accessError} busy={busy} signedIn={!!session} enabled={!!client&&googleEnabled} error={accessError||error||(authReady&&!googleEnabled?'Google sign-in is temporarily unavailable. Please try again.':'')} onGoogle={()=>void google()} onRetry={()=>location.reload()} onSignOut={signOut}/>;
  const panelResetKey=(session?.user.id??'anonymous')+':'+params.toString();
  return <WorkspaceAccessContext.Provider value={workspaceAccess}><CollectionPolicyProvider key={session?.user.id??'anonymous'} token={!review&&!recovery&&accessReady?session?.access_token??null:null}><div className="app-shell" data-region={region}><header className="app-header"><a className="brand" href="/"><span className="brand-mark">KATATHANI<small>COLLECTION</small></span><span><b>Katathani AR Collection System</b><small>{review?'Finance operations workspace · Synthetic data':'Finance operations workspace'}</small></span></a><nav className="main-nav" aria-label="Main navigation">{[{label:'Dashboard',key:'dashboard'},{label:review?'Portfolio':'Aging',key:'portfolio'},{label:'Collections',key:'collections'},{label:'Reports',key:'reports'},{label:'Remittances',key:'remittances'},{label:'Templates',key:'templates'},{label:'Storage',key:'storage'},{label:'Settings',key:'usersAccess'}].filter(n=>review||workspaceAccess?.administrator||!['templates','storage'].includes(n.key)).map(n=><button key={n.key} className={(n.key==='portfolio'?(params.has('dashboard')&&params.get('dashboardView')==='aging')||!['usersAccess','dashboard','collections','documents','documentJob','reports','templates','storage','drive','remittances','collectionPolicy','financial','externalBilling','observations','operations','acceptance'].some(k=>params.has(k)):n.key==='reports'?(params.has('reports')||params.has('financial')||params.has('externalBilling')||params.has('observations')):n.key==='collections'?(params.has('collections')||params.has('collectionPolicy')):n.key==='storage'?(params.has('storage')||params.has('drive')||params.has('operations')||params.has('acceptance')):n.key==='dashboard'?params.has('dashboard')&&params.get('dashboardView')!=='aging':params.has(n.key))?'active':''} disabled={review&&n.key!=='portfolio'} onClick={()=>navigateView(n.key)}>{n.label}</button>)}</nav><div className="header-right"><select className="region-select" aria-label="Region" value={region} onChange={e=>changeRegion(e.target.value)}>{(review?REGION_IDS:workspaceAccess?.regions??[]).map(r=><option key={r} value={r}>{regionLabel(r)}</option>)}</select>{!active&&<div className="hotel-switch">{['All',...hotels].map(h=><button key={h} className={hotel===h?'active':''} disabled={remittanceLocked} onClick={()=>update('hotel',h)}>{h==='All'?'All Hotels':h}</button>)}</div>}{session&&workspaceAccess?.displayName&&<span className="signed-in-staff">{workspaceAccess.displayName}</span>}{!review&&session&&<OperaStatusMenu key={region} status={(acceptanceSelected?'Synthetic source':connected?'OPERA connected':'No verified OPERA refresh yet')+' / '+refreshLabel(refresh,active?.hotel||hotel,Date.now(),region)} busy={requestingRefresh||!!refresh?.running} connected={connected}><button onClick={()=>requestRefresh('manual',active?.hotel||hotel,active?.id)} disabled={writeHold||requestingRefresh||refresh?.running}><RefreshCw size={13}/>{requestingRefresh||refresh?.running?'Refreshing OPERA...':'Refresh OPERA'}</button>{workspaceAccess?.administrator&&<button onClick={checkOpera} disabled={acceptanceSelected||writeHold||checkingOpera}>{checkingOpera?'Checking OPERA…':'Check OPERA connection'}</button>}<button onClick={load} disabled={state==='loading'}><RefreshCw size={13}/> Reload saved data</button></OperaStatusMenu>}{session&&<button className="icon-button" aria-label="Sign out" onClick={()=>void signOut()}><LogOut size={15}/></button>}</div></header>{!review&&session&&params.get('fromDashboard')==='1'&&<div className="dashboard-return"><a href={dashboardReturn(params)}>Back to Dashboard</a></div>}
    {review?<a className="review-exit" href="/">Synthetic review · Open live workspace</a>:null}
    {!review&&!workspaceAccess?.administrator&&['templates','storage','drive','operations','acceptance','collectionPolicy','rendererCheck','pdfCheck'].some(k=>params.has(k))?<section className="login-panel panel"><h1>Administrator access required</h1><button onClick={()=>navigateView('portfolio')}>Back to portfolio</button></section>:<>{!review&&acceptanceSelected&&<div role="status" className="page-error information-note"><strong>ISOLATED ACCEPTANCE · SYNTHETIC DATA</strong> · No live OPERA data is used here. Real email and Drive actions are restricted to the test scenario. <button onClick={()=>navigateView('acceptance')}>Test controls</button><button onClick={async()=>{await fetch('/api/acceptance/exit',{method:'POST',headers:{Authorization:'Bearer '+session?.access_token}});location.assign('/');}}>Exit test workspace</button></div>}{!review&&writeHold&&<p role="status" className="page-error information-note">Recovery write hold is active. New work is paused; saved data and SENT verification remain available.</p>}{!review&&refreshError&&<div className="page-error information-note" role="status">{refreshError}</div>}{!review&&probeResult!==null&&<details className="panel" style={{margin:24,padding:16}} open><summary>OPERA connection diagnostics · field types and counts only</summary><pre style={{whiteSpace:'pre-wrap',maxHeight:340,overflow:'auto'}}>{JSON.stringify(probeResult,null,2)}</pre></details>}{error&&<div className="error-message page-error" role="alert">{error}<button onClick={load}>Retry</button></div>}{!review&&session&&params.has('usersAccess')?<LazyPanel resetKey={panelResetKey} fallback={<p>Loading users…</p>}><UsersAccess token={session.access_token} onDirtyChange={setAccountDirty}/></LazyPanel>:!review&&session&&(params.has('reports')||params.has('externalBilling'))&&!active?<LazyPanel resetKey={panelResetKey} fallback={<p>Loading external billing…</p>}><ExternalBillingReports params={params} update={update} onOpen={openAccount} dataVersion={reloadVersion} region={region} key={session.user.id+region} token={session.access_token} hotel={hotel} accounts={visible} onDirtyChange={setAccountDirty} initialContext={params.get('fromDashboard')==='1'?dashboardScope(params,hotel):undefined} onBack={params.get('fromDashboard')==='1'?()=>navigateView('dashboard'):undefined}/></LazyPanel>:!review&&session&&params.has('collectionPolicy')?<LazyPanel resetKey={panelResetKey} fallback={<p>Loading collection rules…</p>}><CollectionPolicySettings token={session.access_token} onDirtyChange={setPolicyDirty} onBack={()=>navigateView('collections')}/></LazyPanel>:!review&&session&&params.has('rendererCheck')?<LazyPanel resetKey={panelResetKey} fallback={<p>Loading renderer proof...</p>}><StatementRendererProof token={session.access_token}/></LazyPanel>:!review&&session&&params.has('documentJob')?<LazyPanel resetKey={panelResetKey} fallback={<p>Loading documents…</p>}><DocumentRoute onReplaceJob={id=>{update('documentJob',id);update('compose','');}} onJobIdentity={synchronizeDocumentScope} onDirtyChange={setDocumentDirty} backLabel={active?'Back to account':params.has('collections')?'Back to Collections':'Back to portfolio'} key={session.user.id+':'+(params.get('documentJob')??'list')} token={session.access_token} maxBytes={documentEditorMaxBytes} jobId={params.get('documentJob')??undefined} onClose={()=>{update('documentJob','');update('documents','');update('compose','');setReloadVersion(n=>n+1);}}/></LazyPanel>:!review&&session&&params.has('acceptance')?<LazyPanel resetKey={panelResetKey} fallback={<p>Loading test controls…</p>}><AcceptancePanel token={session.access_token} setupId={params.get('acceptance')}/></LazyPanel>:!review&&session&&params.has('operations')?<LazyPanel resetKey={panelResetKey} fallback={<p>Loading operations…</p>}><Operations token={session.access_token} onBack={()=>navigateView('storage')}/></LazyPanel>:!review&&session&&(params.has('storage')||params.has('drive'))?<LazyPanel resetKey={panelResetKey} fallback={<p>Loading storage…</p>}><DriveStorage key={session.user.id} token={session.access_token}/></LazyPanel>:!review&&session&&params.has('templates')?<LazyPanel resetKey={panelResetKey} fallback={<p>Loading templates…</p>}><TemplateLibrary key={session.user.id} token={session.access_token} onDirtyChange={setTemplateDirty}/></LazyPanel>:!review&&session&&params.has('remittances')&&!active?<LazyPanel resetKey={panelResetKey} fallback={<p>Loading remittances…</p>}><Remittances region={region} key={session.user.id+region} token={session.access_token} hotel={hotel} accounts={visible} diagnostic={params.get('remittanceCheck')==='1'} scope={params.get('remitAccount')?JSON.stringify([params.get('remitHotel'),params.get('remitAccount')]):undefined} initialContext={remittanceContext.current?.owner===session.user.id?remittanceContext.current.value:dashboardRemittanceContext(params,hotel)} onContextChange={value=>{remittanceContext.current={owner:session.user.id,value};}} onBusyChange={setRemittanceDirty} onOpenAccount={openAccount} onBack={params.has('remitAccount')?backToRemittanceAccount:undefined}/></LazyPanel>:!review&&session&&params.has('dashboard')&&!active?<LazyPanel resetKey={panelResetKey} fallback={<p className="page" role="status">Loading Dashboard…</p>}><Dashboard cacheGrant={JSON.stringify([session.user.id,accessKey,acceptanceSelected])} key={session.user.id+region} token={session.access_token} hotel={hotel} params={params} update={updateDashboard} onReloadCatalog={load} refresh={accountsOwner===session.user.id?refresh:undefined} accounts={visible} onOpenInvoice={(h,id,invoice)=>{const a=visible.find(a=>a.hotel===h&&a.id===id);if(a)openAccount(a,invoice);}} initialAgingContext={agingContext.current?.owner===session.user.id?agingContext.current.value:undefined} onAgingContextChange={value=>{agingContext.current={owner:session.user.id,value};}}/></LazyPanel>:!review&&state==='loading'&&!active&&!params.has('collections')?<div className="loading-state" role="status">Loading your workspace…</div>:!review&&session&&params.has('pdfCheck')?<LazyPanel resetKey={panelResetKey} fallback={<p>Loading PDF viewer…</p>}><PdfValidation runId={params.get('pdfCheck')!} hotel={params.get('pdfHotel')??''} token={session.access_token}/></LazyPanel>:!review&&session&&params.has('collections')&&!active?<LazyPanel resetKey={panelResetKey} fallback={<p>Loading collection queue…</p>}><CollectionQueue key={session.user.id+region} onEditPolicy={workspaceAccess?.administrator?()=>navigateView('collectionPolicy'):undefined} token={session.access_token} hotel={hotel} accounts={visible} params={params} update={update} onOpen={openAccount} onPrepare={setDocumentSelection}/></LazyPanel>:active?<AccountDetail initialInvoiceId={params.get('focusInvoice')??undefined} onDirtyChange={setAccountDirty} initialTab={params.get('accountSection')??'Invoice / Folio'} onTabChange={value=>update('accountSection',value)} onOpenDocument={(id,compose)=>{const next=new URLSearchParams(paramsRef.current);next.set('documentJob',id);if(compose)next.set('compose','1');else next.delete('compose');paramsRef.current=next;history.pushState(null,'',`?${next}`);setParams(next);}} key={active.hotel+active.id} account={active} onRemittances={!review&&session?()=>openRemittances(active):undefined} backContext={params.has('dashboard')?(params.get('dashboardView')==='aging'?'Aging':'Dashboard'):params.has('remittances')?'Remittances':params.has('collections')?'Collections':(params.has('reports')||params.has('observations'))?'Reports':review?'Portfolio':'Aging'} token={session?.access_token} onWorkflowSaved={()=>setReloadVersion(n=>n+1)} invoices={review?demoInvoices(active):invoices.filter(i=>i.hotel===active.hotel&&i.accountId===active.id)} review={review} refresh={refresh} back={back} loading={invoiceState==='loading'} unavailable={invoiceState==='error'} onPrepare={ids=>{if(accountDirty.current&&!window.confirm('Discard unsaved account changes?'))return;setDocumentSelection({hotel:active.hotel,accountId:active.id,accountName:active.name,ids});}}/>:!review&&session?<LazyPanel resetKey={panelResetKey} fallback={<p>Loading Aging…</p>}><Dashboard cacheGrant={JSON.stringify([session?.user.id,accessKey,acceptanceSelected])} token={session.access_token} hotel={hotel} accounts={visible} params={new URLSearchParams({...Object.fromEntries(params),dashboardView:'aging'})} update={updateDashboard} refresh={refresh} onReloadCatalog={load} onOpenInvoice={(h,id,invoice)=>{const a=visible.find(a=>a.hotel===h&&a.id===id);if(a)openAccount(a,invoice);}} initialAgingContext={agingContext.current?.owner===session.user.id?agingContext.current.value:undefined} onAgingContextChange={value=>{agingContext.current={owner:session.user.id,value};}}/></LazyPanel>:<Portfolio token={review?undefined:session?.access_token} key={region} accounts={visible} hotel={hotel} review={review} refresh={refresh} params={params} update={update} openAccount={openAccount}/>}</>}
    {documentSelection&&session&&!review&&<LazyPanel resetKey={panelResetKey} onDismiss={()=>setDocumentSelection(null)} dismissLabel="Close document request" fallback={<p>Loading document options…</p>}><CreateDocumentDialog selection={documentSelection} token={session.access_token} onClose={()=>setDocumentSelection(null)} onCreated={id=>{setDocumentSelection(null);update('documentJob',id);}}/></LazyPanel>}
  </div></CollectionPolicyProvider></WorkspaceAccessContext.Provider>;
}
