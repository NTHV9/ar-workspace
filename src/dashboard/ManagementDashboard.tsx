import {hotelName,regionHotels} from '../domain/hotels';
import {useState} from 'react';
import {ArrowUpRight,Search} from 'lucide-react';
import {AccountComparison} from './AccountComparison';
import {comparisonRows,type ComparisonSort} from './account-comparison';
import {amount,number,stamp} from './period-data';
import {addAmounts,type DashboardScope} from './model';
import type {Source} from './data';
import type {ManagementDashboardData,ManagementMeasure} from '../../worker/dashboard/management-model';
import type {PeriodDetail} from './PeriodBalances';
import './management-dashboard.css';
import './management-visuals.css';
import './management-layered.css';
import {BillingProgress,PriorityAccounts,HotelAgingChart} from './ManagementVisuals';
const bands=['Up to 30','31 – 60','61 – 90','91 – 120','121 – 150','151+'];
export function ManagementDashboard({source,scope,onDetail,onReload}:{source:Source<ManagementDashboardData>;scope:DashboardScope;onDetail:(d:PeriodDetail)=>void;onReload:()=>void}){
 const [search,setSearch]=useState(''),[sort,setSort]=useState<ComparisonSort>({key:'account',hotel:regionHotels(scope.region??'phuket')[0],descending:false});
 const data=source.data,known=!!data?.complete,ages=!!data?.agesComplete;
 const metric=(key:string)=>data?.metrics.find(m=>m.key===key);
 const hotels=data?.hotels.map(h=>h.hotel)??regionHotels(scope.region??'phuket');
 const actualSort={...sort,hotel:hotels.includes(sort.hotel)?sort.hotel:hotels[0]};
 const accounts=comparisonRows(data?.accountsOver60??[],hotels,search,actualSort);
 const total=(field:'count'|'over60')=>!data||data.hotels.some(h=>h[field]===null)?null:data.hotels.reduce((n,h)=>n+h[field]!,0);
 const agedUnbilledCount=(hotel?:string)=>ages?(data?.accountsOver60??[]).filter(a=>!hotel||a.hotel===hotel).reduce((n,a)=>n+a.unbilled,0):null;
 const cell=(value:ManagementMeasure|undefined)=><><strong>{amount(value?.amount)}</strong><small>{number(value?.count)} invoices</small></>;
 const reportMetric=(key:string,label:string)=>{const row=metric(key),available=known&&(!['over60','over60_unbilled'].includes(key)||ages);return <button key={key} className={'management-total '+key} disabled={!available||!row||data?.mode==='unavailable'} onClick={()=>onDetail({kind:'balance',metric:key})} aria-label={'View '+label.toLowerCase()}><span>{label}<ArrowUpRight size={15} aria-hidden="true"/></span><strong>{amount(available?row?.amount:null)}</strong><small>{number(available?row?.count:null)} {key==='open'?'items':'invoices'}{key==='open'&&known&&data?.openBalanceBreakdown?.credit?.count?` · ${number(data.openBalanceBreakdown.credit.count)} credits`:''}</small></button>;};
 return <section className="management-dashboard management-layered" aria-label="Management summary">
  <header className="management-report-heading"><div><h2>Receivables &amp; billing</h2><span>As of {scope.to} · THB</span></div><span className="management-publication">{data?.mode==='snapshot'?'Daily snapshot':'Saved OPERA data'}<small>{stamp(data?.sourceAt)}</small></span></header>
  {source.state==='loading'&&!data&&<p role="status" className="management-notice">Loading saved report…</p>}
  {source.state==='error'&&<p role="alert" className="management-notice">The management summary could not be refreshed.{data?' Showing the last loaded report.':' The detailed Dashboard remains available below.'} <button onClick={onReload}>Retry summary</button></p>}
  {data&&!known&&<p role="status" className="management-notice">{data.mode==='unavailable'?'No snapshot is available for this date.':'Some balances still need verification.'} <button onClick={onReload}>Reload</button></p>}
  {data?.freshness?.failedHotels.length? <p role="status" className="management-notice">{data.freshness.failedHotels.join(' / ')} refresh failed. Last saved results are shown.</p>:null}
  <div className="management-summary-grid">{reportMetric('open','Outstanding')}{reportMetric('over60','Invoices 61+ days old')}{reportMetric('over60_unbilled','Unbilled invoices 61+ days old')}{reportMetric('billed','Billed · still open')}</div>
  <div className="management-primary-panels"><BillingProgress data={data??undefined} scope={scope} onDetail={onDetail}/><HotelAgingChart data={data??undefined} onDetail={onDetail}/></div>
  <div className="management-secondary-panels">
   <PriorityAccounts data={data??undefined} onDetail={onDetail}/>
  <section className="management-block management-types"><header><h3>By Account type</h3><span>Outstanding · THB</span></header><div className="management-type-list">{data?.types.map(t=><div key={t.type}><strong>{t.type}</strong><b>{amount(t.amount)}</b><div className="management-type-track"><i style={{width: t.amount===null||Number(t.amount)<0?'0%':(Math.abs(Number(t.amount))/Math.max(1,...(data?.types??[]).map(x=>Math.abs(Number(x.amount))))*100)+'%'}}/></div><span>{number(t.count)} items · {number(t.over60)} 61+ days old</span></div>)}</div></section>
  </div>
  <details className="management-exact-figures"><summary>Hotel &amp; billing figures</summary>
  <div className="management-report-grid">
   <section className="management-block management-aging"><header><h3>Aging by hotel</h3><span>Open balance · THB</span></header><div className="management-scroll" role="region" aria-label="Hotel aging summary" tabIndex={0}><table><thead><tr><th scope="col">Hotel</th><th scope="col">Outstanding</th>{bands.map(b=><th key={b} scope="col">{b}</th>)}<th scope="col">61+ days<small>invoices</small></th><th scope="col">61+ days not billed<small>invoices</small></th></tr></thead><tbody>{data?.hotels.map(h=><tr key={h.hotel}><th scope="row">{h.hotel}<small className="dashboard-hotel-full-name">{hotelName(h.hotel)}</small><small>{number(h.count)} items</small></th><td className="management-net">{amount(h.amount)}</td>{h.bands.map(b=><td key={b.key} className={b.amount!==null&&Number(b.amount)<0?'management-credit':''}>{amount(b.amount)}</td>)}<td>{number(h.over60)}</td><td className={agedUnbilledCount(h.hotel)?'management-attention':''}>{number(agedUnbilledCount(h.hotel))}</td></tr>)}</tbody><tfoot><tr><th scope="row">Total<small>{number(total('count'))} items</small></th><td>{amount(data?addAmounts(data.hotels.map(h=>h.amount)):null)}</td>{bands.map((_,i)=><td key={i}>{amount(data?addAmounts(data.hotels.map(h=>h.bands[i].amount)):null)}</td>)}<td>{number(total('over60'))}</td><td>{number(agedUnbilledCount())}</td></tr></tfoot></table></div></section>
   <section className="management-block management-cohort"><header><div><h3>New invoices · period activity</h3><span>{scope.from} → {scope.to} · Original value</span></div></header><div className="management-scroll" role="region" aria-label="Period invoice billing summary" tabIndex={0}><table><thead><tr><th scope="col">Status</th><th scope="col">Total · THB</th>{data?.hotels.map(h=><th key={h.hotel} scope="col">{h.hotel}<small className="dashboard-hotel-full-name">{hotelName(h.hotel)}</small></th>)}</tr></thead><tbody>{data?.cohort.map(c=><tr key={c.key} className={'management-cohort-'+c.key}><th scope="row">{c.label}</th><td>{cell(c)}</td>{c.hotels.map(h=><td key={h.hotel}>{cell(h)}</td>)}</tr>)}</tbody></table></div>{data&&!data.cohortComplete&&<p role="status" className="management-notice">Invoice-entry coverage is incomplete. <button onClick={onReload}>Retry summary</button></p>}</section>
  </div>
  </details>
  <details className="management-account-disclosure"><summary>Search &amp; sort all accounts with invoices 61+ days old</summary><section className="management-block management-accounts"><header><div><h3>Accounts with invoices 61+ days old <span className="management-count">{ages?number(data?.accountsOver60?.length):'—'}</span></h3><span>{ages?number((data?.accountsOver60??[]).reduce((n,a)=>n+a.count!,0)):'—'} invoices · {amount(ages?addAmounts((data?.accountsOver60??[]).map(a=>a.amount)):null)} open</span></div><button disabled={!ages} onClick={()=>onDetail({kind:'balance',metric:'over60'})}>View all accounts<ArrowUpRight size={15}/></button></header>
   <label className="management-search"><Search size={17} aria-hidden="true"/><input type="search" aria-label="Search accounts with invoices 61+ days old" placeholder="Find Account, Hotel or type" value={search} onChange={e=>setSearch(e.target.value)}/></label>
   {!ages&&source.state!=='loading'&&<p role="status" className="management-notice">The full aged Account list could not be verified. <button onClick={onReload}>Reload</button></p>}
   {ages&&<AccountComparison rows={accounts} hotels={hotels} sort={actualSort} onSort={setSort} aged label="Accounts with invoices 61+ days old" onOpen={account=>onDetail({kind:'balance',metric:'over60',hotel:account.hotel,accountId:account.accountId})}/>}

   {ages&&!accounts.length&&<p className="management-empty">{search?'No Accounts match this search.':'No open invoices are 61+ days old.'}</p>}
  </section></details>
 </section>;
}
