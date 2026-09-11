import {useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {useCollectionPolicy} from '../collection/PolicyContext';
import {thaiToday} from '../domain/collection';
import type {Account,RefreshState} from '../domain/portfolio';
import CurrentAging,{type AgingContext} from './CurrentAging';
import {dashboardScope,accountIdentity,periodPreset,validPeriod,type AccountOption} from './model';
import {readDashboardOptions} from './data';
import {PeriodBalances,type PeriodDetail} from './PeriodBalances';
import {PeriodActivity} from './PeriodActivity';
import {PeriodDetailPanel} from './PeriodDetailPanel';
import './dashboard.css';
import './period-dashboard.css';
export default function Dashboard({token,hotel,accounts,params,update,refresh,onOpenInvoice,onReloadCatalog,initialAgingContext,onAgingContextChange}:{token:string;hotel:string;accounts:Account[];params:URLSearchParams;update:(fields:Record<string,string>)=>void;refresh:RefreshState|null|undefined;onOpenInvoice:(hotel:string,accountId:string,invoiceId?:string)=>void;onReloadCatalog?:()=>void;initialAgingContext?:AgingContext;onAgingContextChange?:(context:AgingContext)=>void}){
 const {error:rulesError,refresh:refreshRules}=useCollectionPolicy();
 const [today,setToday]=useState(thaiToday),[revision,setRevision]=useState(0),[options,setOptions]=useState<AccountOption[]>([]),[optionsError,setOptionsError]=useState(false);
 const scope=dashboardScope(params,hotel,today),view=params.get('dashboardView')==='aging'?'aging':'period',dateMode=params.get('dashboardDateMode')??(scope.from===scope.to?'day':'range');
 const detailKind=params.get('dashboardDetail')??'',detail:PeriodDetail|null=['balance','sent','invoice_entries','payments','payment_invoices'].includes(detailKind)?{kind:detailKind as PeriodDetail['kind'],metric:params.get('dashboardMetric')??undefined,stage:params.get('dashboardStage')??undefined}:null;
 const detailPage=Math.max(0,Math.min(100000,Number(params.get('dashboardPage'))||0)),priorDetail=useRef(''),detailScroll=useRef(0);
 const publication=(refresh?.hotels??[]).filter(r=>r.last_success_at).map(r=>r.hotel+':'+r.last_success_at).sort().join('|'),seenPublication=useRef<string|null>(null);
 useEffect(()=>{if(!publication||refresh?.running)return;if(seenPublication.current===null){seenPublication.current=publication;return;}if(seenPublication.current!==publication){seenPublication.current=publication;setRevision(n=>n+1);}},[publication,refresh?.running]);
 useEffect(()=>{const timer=setInterval(()=>setToday(thaiToday()),60000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{const controller=new AbortController();setOptionsError(false);void readDashboardOptions(token,controller.signal).then(setOptions).catch(()=>{if(!controller.signal.aborted)setOptionsError(true);});return()=>controller.abort();},[token,revision]);
 useEffect(()=>{if(priorDetail.current&&!detailKind)window.scrollTo(0,detailScroll.current);priorDetail.current=detailKind;},[detailKind]);
 const reload=()=>{setRevision(n=>n+1);if(view==='aging')onReloadCatalog?.();if(rulesError)void refreshRules();};
 const change=(fields:Record<string,string>)=>update({...fields,dashboardDetail:'',dashboardStage:'',dashboardMetric:'',dashboardPage:''});
 const openDetail=(d:PeriodDetail)=>{detailScroll.current=window.scrollY;update({dashboardDetail:d.kind,dashboardMetric:d.metric??'',dashboardStage:d.stage??'',dashboardPage:'0'});};
 const choices=options.filter(o=>hotel==='All'||o.hotel===hotel),types=[...new Set(choices.map(o=>o.account_type))].sort(),accountChoices=choices.filter(o=>!scope.type||o.account_type===scope.type).sort((a,b)=>a.account_name.localeCompare(b.account_name)||a.hotel.localeCompare(b.hotel));
 const datesValid=validPeriod(scope,today),identity=accountIdentity(scope.account);
 return <main className="page dashboard-page"><header className="dashboard-title"><div><h1>Dashboard</h1><p>Period results, outstanding invoices and current Aging.</p></div><button onClick={reload}><RefreshCw size={14}/> Reload dashboard</button></header>
  <nav className="dashboard-view-tabs" aria-label="Dashboard views"><button aria-pressed={view==='period'} onClick={()=>update({dashboardView:'period'})}>Period analysis</button><button aria-pressed={view==='aging'} onClick={()=>update({dashboardView:'aging'})}>Current Aging · KAT / TSK</button></nav>
  {view==='aging'?<CurrentAging revision={revision} token={token} hotel={hotel} accounts={accounts} refresh={refresh} onOpenInvoice={onOpenInvoice} initialContext={initialAgingContext} onContextChange={onAgingContextChange}/>:<>
   <section className="dashboard-period-filters" aria-label="Period filters"><div className="dashboard-date-controls"><label>View<select aria-label="Date selection mode" value={dateMode} onChange={e=>change({dashboardDateMode:e.target.value,...(e.target.value==='day'?{dashboardFrom:scope.to}: {})})}><option value="day">Single day</option><option value="range">Date range</option></select></label><label>{dateMode==='day'?'Date':'From'}<input type="date" aria-label={dateMode==='day'?'Date':'From'} value={scope.from} max={today} onChange={e=>change({dashboardFrom:e.target.value,...(dateMode==='day'?{dashboardTo:e.target.value}:{})})}/></label>{dateMode==='range'&&<label>Through<input type="date" aria-label="Through" value={scope.to} max={today} onChange={e=>change({dashboardTo:e.target.value})}/></label>}<div className="dashboard-presets">{([['today','Today'],['yesterday','Yesterday'],['month','This month'],['previous-month','Last month']] as const).map(([key,label])=><button key={key} onClick={()=>{const range=periodPreset(key,today);change({dashboardFrom:range.from,dashboardTo:range.to,dashboardDateMode:key==='today'||key==='yesterday'?'day':'range'});}}>{label}</button>)}</div></div>
    <div className="dashboard-scope-controls"><label>Account type<select aria-label="Period account type" value={scope.type} onChange={e=>change({dashboardType:e.target.value,dashboardAccount:''})}><option value="">All account types</option>{scope.type&&!types.includes(scope.type)&&<option>{scope.type}</option>}{types.map(type=><option key={type}>{type}</option>)}</select></label><label>Account<select aria-label="Period account" value={scope.account} onChange={e=>change({dashboardAccount:e.target.value})}><option value="">All accounts</option>{identity&&!accountChoices.some(o=>o.hotel===identity[0]&&o.account_id===identity[1])&&<option value={scope.account}>{identity[0]} · Selected account</option>}{accountChoices.map(a=><option key={a.hotel+':'+a.account_id} value={JSON.stringify([a.hotel,a.account_id])}>{a.hotel} · {a.account_name}</option>)}</select></label><p>Activity uses the full period. Outstanding invoices use the end date. Aging always uses current source balances.</p></div>
   </section>
   {optionsError&&<p className="dashboard-notice" role="status">Account filter choices could not be loaded. Your selection is retained; reload to retry.</p>}
   {!datesValid?<p className="dashboard-notice" role="alert">Choose valid dates, with From on or before Through and no future dates (maximum 10 years).</p>:<div key={JSON.stringify(scope)}><PeriodBalances scope={scope} token={token} revision={revision} onDetail={openDetail}/><PeriodActivity scope={scope} token={token} revision={revision} onReload={reload} onDetail={openDetail}/>{detail&&<PeriodDetailPanel scope={scope} detail={detail} page={detailPage} token={token} revision={revision} onPage={page=>update({dashboardPage:String(page)})} onClose={()=>change({})} onOpenInvoice={onOpenInvoice}/>}</div>}
  </>}
 </main>;
}
