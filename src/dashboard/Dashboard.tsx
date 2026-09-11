import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowUpRight,CalendarDays,RefreshCw} from 'lucide-react';
import {useCollectionPolicy} from '../collection/PolicyContext';
import {stageLabel,thaiToday} from '../domain/collection';
import type {RefreshState} from '../domain/portfolio';
import {formatAmount} from '../remittance/money';
import {accountIdentity,activityTotals,addAmounts,count,dashboardScope,decimal,queueTotals,scopeQuery,validDay,type AccountOption,type DashboardScope,type WorkKind} from './model';
import {dashboardLink} from './links';
import {activityResult,currentResult,externalResult,financialResult,queueResult,readDashboardOptions,remittanceResult,useSource,type Source,type DashboardFinancial} from './data';
import './dashboard.css';

const dayLabel=(day:string)=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(day+'T00:00:00+07:00'));
const stamp=(value:string|null|undefined)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'})+' ICT':'Time unavailable';
const number=(value:number|null)=>value===null?'—':value.toLocaleString('en-GB');
const amount=(value:unknown)=>{const d=decimal(value);return d===null?'—':formatAmount(d);};
function sourceNote(source:Source<unknown>,ready:string){return source.state==='error'?'Unavailable · reload to retry':source.state==='loading'?'Loading saved data…':source.state==='idle'?'Choose a valid date':ready;}
function financialNote(source:Source<DashboardFinancial>){return sourceNote(source,source.data?.coverage.complete?`${source.data.coverage.lastAttemptStatus==='failed'?'Last refresh failed · ':''}Published ${stamp(source.data.coverage.lastSuccessAt)}`:'Coverage incomplete · open financial history');}
function financialKnown(source:Source<DashboardFinancial>){return source.state==='ready'&&source.data?.coverage.complete===true;}
const workLabels:Record<WorkKind,string>={urgent:'Urgent after Final',billing:'Awaiting billing',collection:'Follow-up due',review:'Needs review',held:'On hold',setup:'Setup needed'};

export default function Dashboard({token,hotel,params,update,refresh}:{token:string;hotel:string;params:URLSearchParams;update:(fields:Record<string,string>)=>void;refresh:RefreshState|null|undefined}){
 const {error:rulesError,refresh:refreshRules}=useCollectionPolicy();
 const [today,setToday]=useState(thaiToday),[revision,setRevision]=useState(0),[options,setOptions]=useState<AccountOption[]>([]),[optionsError,setOptionsError]=useState(false);
 const [compact,setCompact]=useState(()=>typeof matchMedia!=='undefined'&&matchMedia('(max-width:600px)').matches),[filtersOpen,setFiltersOpen]=useState(false);
 useEffect(()=>{const media=matchMedia('(max-width:600px)'),changed=()=>setCompact(media.matches);media.addEventListener('change',changed);return()=>media.removeEventListener('change',changed);},[]);
 const scope=dashboardScope(params,hotel,today),identity=accountIdentity(scope.account);
 const publication=(refresh?.hotels??[]).filter(r=>r.last_success_at).map(r=>r.hotel+':'+r.last_success_at).sort().join('|'),seenPublication=useRef<string|null>(null);
 useEffect(()=>{if(!publication||refresh?.running)return;if(seenPublication.current===null){seenPublication.current=publication;return;}if(seenPublication.current!==publication){seenPublication.current=publication;setRevision(n=>n+1);}},[publication,refresh?.running]);
 const reload=()=>{setRevision(n=>n+1);if(rulesError)refreshRules();};
 useEffect(()=>{const timer=setInterval(()=>setToday(thaiToday()),60000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{const controller=new AbortController();setOptions([]);setOptionsError(false);void readDashboardOptions(token,controller.signal).then(rows=>{if(!controller.signal.aborted)setOptions(rows);}).catch(()=>{if(!controller.signal.aborted)setOptionsError(true);});return()=>controller.abort();},[token,revision]);
 const choices=options.filter(o=>hotel==='All'||o.hotel===hotel),types=[...new Set(choices.map(o=>o.account_type))].sort(),accounts=choices.filter(o=>!scope.type||o.account_type===scope.type).sort((a,b)=>a.account_name.localeCompare(b.account_name)||a.hotel.localeCompare(b.hotel));
 return <main className="page dashboard-page">
  <header className="dashboard-title"><div><h1>Dashboard</h1><p>Your day in AR, and the work that still needs attention.</p></div><button className="dashboard-desktop-reload" onClick={reload}><RefreshCw size={14}/> Reload dashboard</button></header>
  <div className="dashboard-filters">
   <label><span><CalendarDays size={14}/> Activity date · Thailand</span><input type="date" value={scope.day} max={today} onChange={e=>update({dashboardDay:e.target.value})}/></label>
   <details className="dashboard-account-filters" open={!compact||filtersOpen} onToggle={e=>{if(compact)setFiltersOpen(e.currentTarget.open);}}><summary><span>Account filters</span><small>{[scope.type,scope.account].filter(Boolean).length} active</small></summary><div className="dashboard-account-fields">
   <label>Account type<select aria-label="Account type" value={scope.type} onChange={e=>update({dashboardType:e.target.value,dashboardAccount:''})}><option value="">All account types</option>{scope.type&&!types.includes(scope.type)&&<option value={scope.type}>{scope.type}</option>}{types.map(t=><option key={t}>{t}</option>)}</select></label>
   <label>Account<select aria-label="Account" value={scope.account} onChange={e=>update({dashboardAccount:e.target.value})}><option value="">All accounts</option>{identity&&!accounts.some(a=>a.hotel===identity[0]&&a.account_id===identity[1])&&<option value={scope.account}>{identity[0]} · Selected account</option>}{accounts.map(a=><option key={a.hotel+':'+a.account_id} value={JSON.stringify([a.hotel,a.account_id])}>{a.hotel} · {a.account_name}</option>)}</select></label>
   <button onClick={()=>update({dashboardDay:today,dashboardType:'',dashboardAccount:''})}>Today · clear filters</button><button className="dashboard-mobile-reload" onClick={reload}><RefreshCw size={14}/> Reload dashboard</button>
   </div></details>
  </div>
  {optionsError&&<p className="dashboard-notice" role="status">Account choices are unavailable. Saved selections are retained; reload to try again.</p>}
  <DashboardContent key={JSON.stringify(scope)} scope={scope} token={token} revision={revision} today={today} refresh={refresh}/>
 </main>;
}

function DashboardContent({scope,token,revision,today,refresh}:{scope:DashboardScope;token:string;revision:number;today:string;refresh:RefreshState|null|undefined}){
 const {policy,error:policyError}=useCollectionPolicy();
 const dateValid=validDay(scope.day)&&scope.day<=today,q=scopeQuery(scope),daily=scopeQuery(scope,true),dated=(path:string)=>dateValid?path+'?'+daily.toString()+(path.includes('/reports/')||path.includes('/financial/')?'&limit=1':''):null;
 const current=useSource('/api/reports/current?'+q+'&limit=1',token,revision,currentResult);
 const activity=useSource(dated('/api/reports/activity'),token,revision,activityResult),external=useSource(dated('/api/external-billing'),token,revision,externalResult);
 const entries=useSource(dated('/api/financial/invoice_entries'),token,revision,financialResult),payments=useSource(dated('/api/financial/payments'),token,revision,financialResult);
 const queue=useSource('/api/collection-queue',token,revision,queueResult),remittance=useSource('/api/remittances?'+q+'&view=pending',token,revision,remittanceResult);
 const totals=activityTotals(activity.data?.summary,external.data?.summary),work=useMemo(()=>queueTotals(queue.data,scope,policy,today),[queue.data,scope.hotel,scope.type,scope.account,policy,today]);
 const identity=accountIdentity(scope.account),hotels=identity?[identity[0]]:scope.hotel==='All'?['KAT','TSK']:[scope.hotel];
 const propertyRows=hotels.map(h=>{const row=current.data?.summary.hotels.find(r=>r.hotel===h),at=row?.oldest_sync??refresh?.hotels.find(r=>r.hotel===h)?.last_success_at;const known=current.state==='ready'&&!!at&&(row?.unverified_accounts??0)===0;return {hotel:h,known,at,open:known?decimal(row?.open??0):null,over90:known?decimal(row?.over90??0):null,accounts:known?count(row?.accounts??0):null};});
 const net=addAmounts(propertyRows.map(r=>r.open)),over90=addAmounts(propertyRows.map(r=>r.over90));
 const payment=financialKnown(payments)?payments.data?.summary.paymentTotals:undefined;
 const max=Math.max(...propertyRows.map(r=>Math.max(0,Number(r.open??0))),1);
 const billingReady=activity.state==='ready'&&external.state==='ready';
 return <>
  {!dateValid&&<p className="dashboard-notice" role="alert">Choose a valid activity date on or before today. Current work remains the latest saved state.</p>}
  <section aria-labelledby="dashboard-day-title" className="dashboard-day">
   <div className="dashboard-section-heading"><h2 id="dashboard-day-title">Activity · {dateValid?dayLabel(scope.day):'Choose a date'}</h2><span>Calendar day in Thailand</span></div>
   <div className="dashboard-day-grid">
    <article className="dashboard-day-cell"><h3>Invoice entries</h3><strong data-testid="dashboard-entries">{number(financialKnown(entries)?count(entries.data?.summary.invoiceCount):null)}</strong><p>{amount(financialKnown(entries)?entries.data?.summary.amount:null)} <span>original value</span></p><small>{financialNote(entries)}</small><a href={dashboardLink(scope,'invoice_entries')}>View source invoices <ArrowUpRight size={13}/></a></article>
    <article className="dashboard-day-cell"><h3>First billed</h3><strong data-testid="dashboard-billed">{number(totals.firstBilled)}</strong><p>Email {number(totals.emailFirst)} <span>·</span> External {number(totals.externalFirst)}</p><small>{billingReady?(totals.firstBillingUnclassified?'Some billing activity needs classification':'First billing only · rebilling excluded'):activity.state==='error'||external.state==='error'?'A billing channel is unavailable':dateValid?'Loading billing evidence…':'Choose a valid date'}</small><a href="#dashboard-billing">Review billing channels <ArrowUpRight size={13}/></a></article>
    <article className="dashboard-day-cell"><h3>Follow-up sends</h3><strong data-testid="dashboard-followups">{number(totals.reminderCount)}</strong><p>{amount(totals.reminderAmount)} <span>at time of send</span></p><small>{sourceNote(activity,'Invoice send occurrences · confirmed SENT')}</small><a href="#dashboard-followup-stages">View sent stages <ArrowUpRight size={13}/></a></article>
    <article className="dashboard-day-cell dashboard-receipts"><h3>OPERA payment credits</h3><strong className="dashboard-cash" data-testid="dashboard-payments">{amount(payment?.creditPostings)}</strong><p>{number(financialKnown(payments)?count(payments.data?.summary.paymentCount):null)} <span>payment records</span></p><small>{financialNote(payments)}</small><a href={dashboardLink(scope,'payments')}>View payment evidence <ArrowUpRight size={13}/></a></article>
   </div>
  </section>
  <div className="dashboard-current-grid">
   <section className="dashboard-surface dashboard-balances" aria-labelledby="dashboard-current-title">
    <header className="dashboard-section-heading"><div><h2 id="dashboard-current-title">Receivables now</h2><p>Latest saved balances · includes invoices from every date</p></div><a href={dashboardLink(scope,'portfolio')}>Open Portfolio <ArrowUpRight size={13}/></a></header>
    <div className="dashboard-balance-total"><div><span>Net open AR</span><strong data-testid="dashboard-net-open">{amount(net)}</strong></div><div><span>Over 90 days</span><b>{amount(over90)}</b></div></div>
    <div className="dashboard-table-scroll" tabIndex={0} role="region" aria-label="Dashboard hotel balances"><table><thead><tr><th>Hotel</th><th>Net open</th><th>Over 90 days</th><th>Accounts</th></tr></thead><tbody>{propertyRows.map(r=><tr key={r.hotel}><th><span className={'dashboard-hotel-dot '+r.hotel.toLowerCase()}/>{r.hotel}<small>{r.known?stamp(r.at):'Source not verified'}</small></th><td><a href={dashboardLink({...scope,hotel:r.hotel},'portfolio')}>{amount(r.open)}</a><div className="dashboard-property-track"><i className={r.hotel.toLowerCase()} style={{width:Math.max(0,Number(r.open??0))/max*100+'%'}}/></div></td><td>{amount(r.over90)}</td><td>{number(r.accounts)}</td></tr>)}</tbody></table></div>
    <p className="dashboard-footnote">Account balances include credits. Collection work uses eligible positive invoices, so these totals can differ.</p>
    {current.state==='error'&&<p className="dashboard-notice" role="status">Current balances are unavailable. Daily activity from other sources can still be reviewed.</p>}
    {identity&&<a className="dashboard-account-link" href={dashboardLink(scope,'account')}>Open selected Account Detail <ArrowUpRight size={13}/></a>}
   </section>
   <section className="dashboard-surface dashboard-priorities" aria-labelledby="dashboard-priorities-title">
    <header><h2 id="dashboard-priorities-title">Work to act on</h2><p>Current queue · {dayLabel(today)}</p></header>
    {policyError&&<p className="dashboard-notice">Collection rules need verification. Review affected invoices before a new handoff.</p>}
    <div className="dashboard-work-list">{(['urgent','billing','collection','review','held','setup'] as WorkKind[]).map(k=><a key={k} className={'dashboard-work-row '+k} href={dashboardLink(scope,k)}><span>{workLabels[k]}<small>{work?amount(work[k].amount):sourceNote(queue,'Verification required')}</small></span><strong data-testid={'dashboard-work-'+k}>{number(work?.[k].count??null)}</strong><ArrowUpRight size={14}/></a>)}</div><small>Views can overlap: a held invoice after Final remains urgent. Do not add these counts together.</small>
   </section>
  </div>
  <div className="dashboard-evidence-grid">
   <section id="dashboard-billing" className="dashboard-surface dashboard-activity-detail"><h2>Billing activity</h2><p>Amounts presented on the selected day; repeat presentations are activity, not new debt.</p><div className="dashboard-table-scroll" tabIndex={0} role="region" aria-label="Dashboard billing activity"><table><thead><tr><th>Channel</th><th>Invoice activity</th><th>Amount presented</th><th><span className="sr-only">Open evidence</span></th></tr></thead><tbody><tr><th>First billing · email</th><td>{number(totals.emailFirst)}</td><td>{amount(totals.emailFirstAmount)}</td><td><a aria-label="Open first email billing evidence" href={dashboardLink(scope,'email_billing')}>Activity <ArrowUpRight size={13}/></a></td></tr><tr><th>Rebilling · email</th><td>{number(totals.emailRepeat)}</td><td>{amount(totals.emailRepeatAmount)}</td><td><a aria-label="Open rebilling evidence" href={dashboardLink(scope,'sent','Rebilling')}>Activity <ArrowUpRight size={13}/></a></td></tr><tr><th>External billing<small>By System / recorded external email</small></th><td>{number(count(external.data?.summary.invoices))}</td><td>{amount(external.data?.summary.amount)}</td><td><a aria-label="Open external billing evidence" href={dashboardLink(scope,'external')}>Records <ArrowUpRight size={13}/></a></td></tr></tbody></table></div><small>{sourceNote(external,'Staff-recorded dates · voided records excluded')}</small></section>
   <section className="dashboard-surface dashboard-payment-detail"><h2>Payment allocation</h2><p>Current allocation of payments dated {dateValid?dayLabel(scope.day):'on the selected day'}.</p><dl><div><dt>Applied to invoices</dt><dd>{amount(payment?.currentlyApplied)}</dd></div><div><dt>Unallocated credit</dt><dd>{amount(payment?.currentlyUnallocated)}</dd></div><div><dt>Debit payment postings</dt><dd>{amount(payment?.debitPostings)}</dd></div></dl><small>Allocation amounts retain the debit/credit signs supplied by OPERA. No allocation event date is supplied; debit postings are not labelled as cancellations without evidence.{payment&&payment.transferRows>0?` ${payment.transferRows} transfer-marked records are included; inspect their source details.`:''}</small></section>
  </div>
  <div className="dashboard-evidence-grid">
   <section id="dashboard-followup-stages" className="dashboard-surface dashboard-stage-detail"><h2>Follow-up activity</h2><p>Confirmed sends on the selected day. One invoice can have more than one send occurrence.</p>{activity.state==='ready'&&totals.reminders?.length?<div className="dashboard-table-scroll" tabIndex={0} role="region" aria-label="Dashboard follow-up activity"><table><thead><tr><th>Sent stage</th><th>Invoice sends</th><th>Amount at send</th></tr></thead><tbody>{totals.reminders.map(r=><tr key={r.kind}><th><a href={dashboardLink(scope,'sent',r.kind)}>{r.stage_label??stageLabel(r.kind,policy)} <ArrowUpRight size={13}/></a></th><td>{number(r.invoices)}</td><td>{amount(r.amount)}</td></tr>)}</tbody></table></div>:<p className="dashboard-empty">{sourceNote(activity,'No confirmed follow-up sends on this date.')}</p>}</section>
   <section className="dashboard-surface dashboard-remittance"><h2>Remittances awaiting clearance</h2><p>Current notices with open or unverified invoice balances.</p><div className="dashboard-remittance-total"><strong data-testid="dashboard-remittances">{number(count(remittance.data?.summary.documents))}</strong><span>notices · {number(count(remittance.data?.summary.invoices))} unique invoices</span></div><dl><div><dt>Reported notice amount</dt><dd>{amount(remittance.data?.summary.reportedAmount)}</dd></div><div><dt>Linked OPERA open</dt><dd>{amount(remittance.data?.summary.linkedOpen)}</dd></div></dl><small>{sourceNote(remittance,'Each notice is counted once. A notice does not confirm receipt of cash.')}</small><a href={dashboardLink(scope,'remittance')}>Review pending remittances <ArrowUpRight size={13}/></a></section>
  </div>
 </>;
}
