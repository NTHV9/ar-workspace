import {hotelInRegion,regionHotels,resolveRegion} from '../domain/hotels';
import {useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {useCollectionPolicy} from '../collection/PolicyContext';
import {thaiToday} from '../domain/collection';
import type {Account,RefreshState} from '../domain/portfolio';
import CurrentAging,{type AgingContext} from './CurrentAging';
import {dashboardScope,dashboardDetailScope,accountIdentity,periodPreset,validPeriod,type AccountOption} from './model';
import {ManagementDashboard} from './ManagementDashboard';
import {managementResult} from './management-data';
import {useSource} from './data';
import {scopeQuery} from './model';
import {readDashboardOptions} from './data';
import {useProgressiveOverview} from './progressive-overview';
import {PeriodBalances,type PeriodDetail} from './PeriodBalances';
import {PeriodActivity} from './PeriodActivity';
import {PeriodDetailPanel} from './PeriodDetailPanel';
import './dashboard.css';
import './period-dashboard.css';
import './modern-dashboard.css';
import './comparison-dashboard.css';
import './period-layout.css';
import './period-roomier.css';
export default function Dashboard({dataVersion=0,token,cacheGrant,hotel,accounts,params,update,refresh,onOpenInvoice,onReloadCatalog,initialAgingContext,onAgingContextChange}: {dataVersion?:number;token:string;cacheGrant:string;hotel:string;accounts:Account[];params:URLSearchParams;update:(fields:Record<string,string>)=>void;refresh:RefreshState|null|undefined;onOpenInvoice:(hotel:string,accountId:string,invoiceId?:string)=>void;onReloadCatalog?:()=>void;initialAgingContext?:AgingContext;onAgingContextChange?:(context:AgingContext)=>void}){
 const {error:rulesError,refresh:refreshRules}=useCollectionPolicy();
 const [today,setToday]=useState(thaiToday),[localRevision,setRevision]=useState(0),[options,setOptions]=useState<AccountOption[]>([]),[optionsError,setOptionsError]=useState(false);
 const revision=localRevision+dataVersion;
 const [moreOpen,setMoreOpen]=useState(false),[filtersOpen,setFiltersOpen]=useState(false);
 const scope=dashboardScope(params,hotel,today),view=params.get('dashboardView')==='aging'?'aging':'period',dateMode=params.get('dashboardDateMode')??(scope.from===scope.to?'day':'range');
 const region=resolveRegion(params),hotels=regionHotels(region);
 const managementQuery=scopeQuery(scope,true),reportHotel=accountIdentity(scope.account)?.[0]??scope.hotel;
 const management=useSource(view==='period'&&validPeriod(scope,today)?'/api/dashboard/management?'+managementQuery:null,token,revision,value=>managementResult(value,region,reportHotel,scope.from,scope.to),true);
 const legacyOpen=moreOpen||(management.state==='error'&&!management.data);
 const overviewQuery=new URLSearchParams({...region==='khao-lak'?{region}:{},from:scope.from,to:scope.to});if(scope.type)overviewQuery.set('type',scope.type);
 const comparing=hotel==='All'&&!accountIdentity(scope.account);
 const overview=useProgressiveOverview(legacyOpen&&comparing&&view==='period'&&validPeriod(scope,today)?'/api/dashboard/hotel-overview?'+overviewQuery:null,token,revision,scope.from,scope.to,region,cacheGrant);
 const requestedDetailHotel=params.get('dashboardDetailHotel');
 const detailHotel=hotelInRegion(requestedDetailHotel,region)&&(scope.hotel==='All'||scope.hotel===requestedDetailHotel||accountIdentity(scope.account)?.[0]===requestedDetailHotel)?requestedDetailHotel:null;
 const detailAccount=detailHotel?params.get('dashboardDetailAccount'):null;
 const detailScope=dashboardDetailScope(scope,detailHotel,detailAccount);
 const detailKind=params.get('dashboardDetail')??'',detail:PeriodDetail|null=['balance','sent','invoice_entries','payments','payment_invoices'].includes(detailKind)?{kind:detailKind as PeriodDetail['kind'],metric:params.get('dashboardMetric')??undefined,stage:params.get('dashboardStage')??undefined,...(params.get('dashboardAgeMin')!==null?{ageMin:Number(params.get('dashboardAgeMin'))}:{}),...(params.get('dashboardAgeMax')!==null?{ageMax:Number(params.get('dashboardAgeMax'))}:{})}:null;
 const priorDetail=useRef(''),detailScroll=useRef(0);
 const publication=(refresh?.hotels??[]).filter(r=>r.last_success_at).map(r=>r.hotel+':'+r.last_success_at).sort().join('|'),publicationKnown=!!refresh,seenPublication=useRef<string|null>(null);
 useEffect(()=>{if(!publicationKnown)return;if(seenPublication.current===null){seenPublication.current=publication;return;}if(seenPublication.current!==publication){seenPublication.current=publication;setRevision(n=>n+1);}},[publication,publicationKnown]);
 useEffect(()=>{const timer=setInterval(()=>setToday(thaiToday()),60000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{const controller=new AbortController();setOptionsError(false);void readDashboardOptions(token,controller.signal,region).then(setOptions).catch(()=>{if(!controller.signal.aborted)setOptionsError(true);});return()=>controller.abort();},[token,revision,region]);
 useEffect(()=>{if(priorDetail.current&&!detailKind)window.scrollTo(0,detailScroll.current);priorDetail.current=detailKind;},[detailKind]);
 const reload=()=>{setRevision(n=>n+1);if(view==='aging')onReloadCatalog?.();if(rulesError)void refreshRules();};
 const change=(fields:Record<string,string>)=>update({...fields,dashboardDetail:'',dashboardStage:'',dashboardMetric:'',dashboardPage:'',dashboardDetailHotel:'',dashboardDetailAccount:'',dashboardAgeMin:'',dashboardAgeMax:''});
 const openDetail=(d:PeriodDetail)=>{detailScroll.current=window.scrollY;update({dashboardDetail:d.kind,dashboardMetric:d.metric??'',dashboardStage:d.stage??'',dashboardPage:'0',dashboardDetailHotel:d.hotel??'',dashboardDetailAccount:d.accountId??'',dashboardAgeMin:d.ageMin===undefined?'':String(d.ageMin),dashboardAgeMax:d.ageMax===undefined?'':String(d.ageMax)});};
 const choices=options.filter(o=>hotelInRegion(o.hotel,region)&&(hotel==='All'||o.hotel===hotel)),types=[...new Set(choices.map(o=>o.account_type))].sort(),accountChoices=choices.filter(o=>!scope.type||o.account_type===scope.type).sort((a,b)=>a.account_name.localeCompare(b.account_name)||a.hotel.localeCompare(b.hotel));
 const agingInitial=initialAgingContext??(!params.has('dashboard')?{hotel,allAccounts:true,over90:params.get('aging')==='over90',type:params.get('type')&&params.get('type')!=='All'?params.get('type')!:undefined,search:params.get('search')||params.get('accountFilter')||'',page:1,sort:{key:params.get('sort')==='name'?'name':'net',hotel:'Total' as const,descending:params.get('dir')!=='asc'},bucketKey:'',invoiceHotel:'Total' as const,invoiceView:'bucket' as const,invoicePage:1,invoiceDescending:true}:undefined);
 const datesValid=validPeriod(scope,today),identity=accountIdentity(scope.account);
 return <main className={'page dashboard-page'+(view==='period'?' period-analysis'+(comparing?' period-comparison':'')+(management.data?' management-report-mode':''):'')}><header className="dashboard-title"><div><h1>{view==='aging'?'Aging':'Dashboard'}</h1></div>{view==='period'&&management.data&&<button className="management-filter-toggle" aria-expanded={filtersOpen} aria-controls="dashboard-report-filters" onClick={()=>setFiltersOpen(v=>!v)}><span>Report filters{(Number(!!scope.type)+Number(!!identity))>0?' · '+(Number(!!scope.type)+Number(!!identity)):''}</span><small>{scope.from} → {scope.to}<br/>{scope.type||'All types'} · {identity?accountChoices.find(a=>a.hotel===identity[0]&&a.account_id===identity[1])?.account_name??'Selected Account':'All accounts'}</small></button>}<button onClick={reload}><RefreshCw size={14}/> {view==='aging'?'Reload Aging':'Reload dashboard'}</button></header>

  {view==='aging'?<CurrentAging region={region} revision={revision+Date.parse(today)} token={token} hotel={hotel} accounts={accounts} refresh={refresh} onOpenInvoice={onOpenInvoice} initialContext={agingInitial} onContextChange={onAgingContextChange}/>:<>
   <section id="dashboard-report-filters" className={'dashboard-period-filters'+(filtersOpen?' is-open':'')} aria-label="Period filters"><div className="dashboard-date-controls"><label>View<select aria-label="Date selection mode" value={dateMode} onChange={e=>change({dashboardDateMode:e.target.value,...(e.target.value==='day'?{dashboardFrom:scope.to}: {})})}><option value="day">Single day</option><option value="range">Date range</option></select></label><label>{dateMode==='day'?'Date':'From'}<input type="date" aria-label={dateMode==='day'?'Date':'From'} value={scope.from} max={today} onChange={e=>change({dashboardFrom:e.target.value,...(dateMode==='day'?{dashboardTo:e.target.value}:{})})}/></label>{dateMode==='range'&&<label>Through<input type="date" aria-label="Through" value={scope.to} max={today} onChange={e=>change({dashboardTo:e.target.value})}/></label>}<div className="dashboard-presets">{([['today','Today'],['yesterday','Yesterday'],['month','This month'],['previous-month','Last month']] as const).map(([key,label])=><button key={key} aria-pressed={scope.from===periodPreset(key,today).from&&scope.to===periodPreset(key,today).to&&dateMode===(key==='today'||key==='yesterday'?'day':'range')} onClick={()=>{const range=periodPreset(key,today);change({dashboardFrom:range.from,dashboardTo:range.to,dashboardDateMode:key==='today'||key==='yesterday'?'day':'range'});}}>{label}</button>)}</div></div>
    <div className="dashboard-scope-controls"><label>Account type<select aria-label="Period account type" value={scope.type} onChange={e=>change({dashboardType:e.target.value,dashboardAccount:''})}><option value="">All account types</option>{scope.type&&!types.includes(scope.type)&&<option>{scope.type}</option>}{types.map(type=><option key={type}>{type}</option>)}</select></label><label>Account<select aria-label="Period account" value={scope.account} onChange={e=>change({dashboardAccount:e.target.value})}><option value="">All accounts</option>{identity&&!accountChoices.some(o=>o.hotel===identity[0]&&o.account_id===identity[1])&&<option value={scope.account}>{identity[0]} · Selected account</option>}{accountChoices.map(a=><option key={a.hotel+':'+a.account_id} value={JSON.stringify([a.hotel,a.account_id])}>{a.hotel} · {a.account_name}</option>)}</select></label></div>
   </section>
   {optionsError&&<p className="dashboard-notice" role="status">Account filter choices could not be loaded. Your selection is retained; reload to retry.</p>}
   {!datesValid?<p className="dashboard-notice" role="alert">Choose valid dates, with From on or before Through and no future dates (maximum 10 years).</p>:<div key={JSON.stringify(scope)}><ManagementDashboard source={management} scope={scope} onDetail={openDetail} onReload={reload}/><details className="management-more" open={legacyOpen} onToggle={event=>setMoreOpen(event.currentTarget.open)}><summary>Billing, Follow-Up &amp; period activity details</summary>{legacyOpen&&<PeriodBalances overview={comparing?overview:undefined} scope={scope} token={token} revision={revision} onDetail={openDetail}><PeriodActivity overview={comparing?overview:undefined} scope={scope} token={token} revision={revision} onReload={reload} onDetail={openDetail}/></PeriodBalances>}</details>{detail&&<PeriodDetailPanel scope={detailScope} detail={detail} token={token} revision={revision} onClose={()=>change({})} onOpenInvoice={onOpenInvoice}/>}</div>}
  </>}
 </main>;
}
