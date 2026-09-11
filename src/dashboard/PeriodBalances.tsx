import {useId} from 'react';
import {ArrowUpRight,CheckCircle2,Clock3,FileText,Send,TriangleAlert} from 'lucide-react';
import {useSource} from './data';
import {accountIdentity,scopeQuery,type DashboardScope,validPeriod} from './model';
import {balancesResult,balanceLabels,amount,number,percent,stamp} from './period-data';
import {useCollectionPolicy} from '../collection/PolicyContext';
export interface PeriodDetail {kind:'balance'|'sent'|'invoice_entries'|'payments'|'payment_invoices';metric?:string;stage?:string}
export function PeriodBalances({scope,token,revision,onDetail}:{scope:DashboardScope;token:string;revision:number;onDetail:(detail:PeriodDetail)=>void}){
 const id=useId(),scopeHotel=accountIdentity(scope.account)?.[0]??scope.hotel;
 const q=scopeQuery(scope);q.set('asOf',scope.to);q.set('limit','1');
 const source=useSource(validPeriod(scope)?'/api/dashboard/balances?'+q:null,token,revision,balancesResult,true),data=source.data;
 const {policy}=useCollectionPolicy(),known=!!data?.complete,base=data?.metrics.find(m=>m.key==='open');
 const stages=[...new Map([...(policy?.rounds.filter(r=>r.active).map(r=>({key:r.key,label:r.label,count:0,amount:'0.00'}))??[]),...(data?.stages??[])].map(s=>[s.key,s])).values()];
 const metric=(key:string)=>data?.metrics.find(m=>m.key===key),canDrill=!!data&&data.mode!=='unavailable';
 const billed=metric('billed'),unbilled=metric('unbilled');
 const requiredKnown=known&&billed?.count!=null&&unbilled?.count!=null,required=requiredKnown?billed.count!+unbilled.count!:0;
 const billingProgress=requiredKnown&&required>0?billed!.count!/required:null;
 const openAmount=known&&base?.amount!=null?Number(base.amount):0;
 const width=(value:string|null|undefined)=>known&&value!=null&&openAmount>0?Math.max(0,Math.min(100,Number(value)/openAmount*100)):0;
 const freshness=data?.freshness;
 const heroMetrics=[{key:'open',label:'All outstanding invoices',Icon:FileText,tone:'primary'},{key:'unbilled',label:'Not yet billed',Icon:Send,tone:'blue'},{key:'past_due',label:'Past Due date',Icon:Clock3,tone:'rose'},{key:'over60',label:'Invoice age over 60 days',Icon:TriangleAlert,tone:'amber'}];
 return <section className="dashboard-period-balances" aria-label="Outstanding at period end">
  <header className="dashboard-section-heading"><div><h2>Outstanding at period end <span className="dashboard-heading-date">{scope.to}</span></h2><p>Open invoices from all entry dates · balances at the recorded time</p></div><span className="dashboard-source-stamp">{data?.mode==='current'?'Current saved state':data?.mode==='snapshot'?'Captured daily state':'Snapshot unavailable'}<small>{stamp(data?.capturedAt)} · Source {stamp(data?.sourceAt)}</small></span></header>
  {!known&&<p className="dashboard-notice" role="status">{source.state==='error'?'The closing-date balances could not be loaded. Reload to try again.':source.state==='loading'?'Loading closing-date balances…':data?.mode==='unavailable'?'No invoice snapshot was captured for this date. Current balances have not been substituted.':'Some source records are not verified. Confirmed totals remain unavailable.'}{data?.missingHotels.length?' · '+data.missingHotels.join(' / '):''}</p>}
  {known&&source.state!=='ready'&&<p className="dashboard-refresh-note" role="status">{source.state==='loading'?'Updating dashboard. Showing the last loaded balances.':'Reload failed. Showing the last loaded balances; try again.'}</p>}
  {known&&source.state==='ready'&&!!freshness?.refreshingHotels.length&&<p className="dashboard-refresh-note" role="status">{freshness.refreshingHotels.join(' / ')} refresh in progress. Showing the last verified publication.</p>}
  {known&&source.state==='ready'&&!!freshness?.failedHotels.length&&<p className="dashboard-notice" role="status">{freshness.failedHotels.join(' / ')} refresh did not finish. Showing the last verified publication; retry the OPERA refresh.</p>}
  <div className="dashboard-kpis">{heroMetrics.map(({key,label,Icon,tone})=>{const row=metric(key),count=known?row?.count:null,value=known?row?.amount:null;return <button key={key} className={'dashboard-kpi '+tone} aria-label={key==='open'?'View invoices':'View '+label.toLowerCase()} aria-describedby={`${id}-${key}-count ${id}-${key}-amount ${id}-${key}-hint`} disabled={!canDrill} onClick={()=>onDetail({kind:'balance',metric:key})}>
   <span className="dashboard-kpi-label"><Icon size={17}/>{label}<ArrowUpRight size={16}/></span>
   <strong id={`${id}-${key}-count`} data-testid={key==='open'?'dashboard-closing-count':undefined}>{number(count)} <span>invoices</span></strong>
   <b id={`${id}-${key}-amount`} data-testid={key==='open'?'dashboard-closing-amount':undefined}>{amount(value)}</b>
   <small id={`${id}-${key}-hint`}>{key==='open'?'Open balance · '+(scopeHotel==='All'?'Both hotels':scopeHotel):key==='unbilled'?'Billing-required invoices':key==='past_due'?(count==null&&known?'Due dates need verification':'Based on the recorded Due date'):'OPERA invoice age · all billing statuses'}</small>
  </button>;})}</div>
  <div className="dashboard-insights">
   <section className="dashboard-surface dashboard-billing-insight" aria-label="Closing-date billing status"><header><div><h3>Billing progress</h3><p>Billing-required invoices at period end</p></div><CheckCircle2 size={20}/></header>
    <div className="dashboard-billing-visual"><div className="dashboard-billing-ring" role="img" aria-label={billingProgress===null?'Billing completion percentage unavailable':Math.round(billingProgress*100)+'% of billing-required invoices billed'}><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" className="ring-track"/><circle cx="60" cy="60" r="50" className="ring-progress" pathLength="100" strokeDasharray={`${(billingProgress??0)*100} 100`} transform="rotate(-90 60 60)"/></svg><div><strong>{billingProgress===null?'—':Math.round(billingProgress*100)+'%'}</strong><span>billed</span></div></div>
     <div className="dashboard-billing-legend">{[['billed','Billed'],['unbilled','Not billed']].map(([key,label])=>{const row=metric(key);return <button key={key} className={'dashboard-billing-legend-row '+key} disabled={!canDrill} onClick={()=>onDetail({kind:'balance',metric:key})}><span><i/>{label}</span><strong>{number(known?row?.count:null)} <small>invoices</small></strong><b>{amount(known?row?.amount:null)}</b></button>;})}</div>
    </div>
    <div className="dashboard-billing-other">{['not_required','setup','over60_unbilled'].map(key=>{const row=metric(key);return <button key={key} disabled={!canDrill} onClick={()=>onDetail({kind:'balance',metric:key})}><span>{balanceLabels[key]}</span><strong>{number(known?row?.count:null)} <small>invoices</small></strong><b>{amount(known?row?.amount:null)}</b></button>;})}</div>
   </section>
   <section className="dashboard-surface dashboard-stage-insight" aria-label="Closing-date follow-up stages"><header><div><h3>Latest Follow-Up stage</h3><p>Each open invoice counts once, in its latest stage.</p></div><Send size={20}/></header><div className="dashboard-stage-list">{stages.map((row,index)=><button key={row.key} className={'dashboard-stage-row stage-'+Math.min(index,4)} disabled={!canDrill} onClick={()=>onDetail({kind:'balance',stage:row.key})}><span className="dashboard-stage-name">{row.label}<small>{number(known?row.count:null)} invoices</small></span><span className="dashboard-stage-track" aria-hidden="true"><i style={{width:width(row.amount)+'%'}}/></span><span className="dashboard-stage-value"><b>{amount(known?row.amount:null)}</b><small>{known?percent(row.amount,base?.amount):'—'} of open</small></span></button>)}</div>{!stages.length&&<p>Stage information is unavailable.</p>}<p className="dashboard-footnote">Bar lengths and percentages show each stage’s share of the open amount.</p></section>
  </div>
  <details className="dashboard-balance-breakdown"><summary>All status counts, amounts & percentages</summary><div className="dashboard-table-scroll" tabIndex={0} role="region" aria-label="Closing-date status breakdown"><table><thead><tr><th>Status</th><th>Invoices</th><th>Open amount</th><th>% of open</th></tr></thead><tbody>{Object.entries(balanceLabels).map(([key,label])=>{const row=metric(key);return <tr key={key}><th><button className="dashboard-text-link" disabled={!canDrill} onClick={()=>onDetail({kind:'balance',metric:key})}>{label}</button></th><td>{number(known?row?.count:null)}</td><td>{amount(known?row?.amount:null)}</td><td>{known?percent(row?.amount,base?.amount):'—'}</td></tr>;})}</tbody></table></div><p className="dashboard-footnote">Percentages use the closing-date open amount. Due date and age groups overlap; they are not added together. Required and Not Required billing are kept separate.</p></details>
 </section>;
}
