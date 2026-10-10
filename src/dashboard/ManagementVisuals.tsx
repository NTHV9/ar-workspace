import {useState,type CSSProperties} from 'react';
import {ArrowUpRight,ChevronDown} from 'lucide-react';
import type {ManagementDashboardData} from '../../worker/dashboard/management-model';
import {addAmounts,type DashboardScope} from './model';
import type {PeriodDetail} from './PeriodBalances';
import {amount,number} from './period-data';
import {agingPlot,attentionAccounts,billingCompletion} from './management-visuals';

const bands=['Up to 30','31–60','61–90','91–120','121–150','151+'];
const colors=['#298f91','#629ed1','#6574ce','#9473b8','#c28d27','#c56573'];
type Props={data:ManagementDashboardData|undefined;scope:DashboardScope;onDetail:(detail:PeriodDetail)=>void};
export function BillingProgress({data,scope,onDetail}:Props){
 const progress=billingCompletion(data),metric=(key:string)=>data?.complete?(key==='credit'?(data.openBalanceBreakdown?.creditCoverageComplete?data.openBalanceBreakdown.credit:undefined):data.metrics.find(c=>c.key===key)):undefined;
 const percentage=progress?.percent??null;
 const emptyMessage=progress?Number(metric('setup')?.count)>0?'Billing rules need setup':'No outstanding billing-required value':'Billing progress unavailable';
 return <section className="management-period-glance management-billing-visual" aria-label="Outstanding billing progress">
  <header><div><h3>Billing progress</h3><span>Outstanding as of {scope.to} · THB</span></div></header>
  <div className="management-billing-body">
   {percentage!==null?<div className="management-ring-group"><div className="management-donut focus-billed" role="img" aria-label={`${percentage.toFixed(1)}% of outstanding billing-required value billed`}><svg viewBox="0 0 200 200" aria-hidden="true"><circle className="billing-ring-base" cx="100" cy="100" r="80"/>{percentage<100&&<circle className="billing-ring-unbilled" cx="100" cy="100" r="80" pathLength="100" strokeDasharray={`${100-percentage} 100`} transform={`rotate(${-90+percentage*3.6} 100 100)`}/>}<circle className="billing-ring-done" cx="100" cy="100" r="80" pathLength="100" strokeDasharray={`${percentage} 100`} transform="rotate(-90 100 100)"/></svg><div><strong>{Math.round(percentage)}%</strong><span>Billed</span></div></div><small>Billing-required open value</small></div>:<p className="management-chart-empty">{emptyMessage}</p>}
   <dl>{(['billed','unbilled'] as const).map(key=><div key={key} className={'billing-legend-'+key}><dt><button className="management-billing-focus" disabled={!metric(key)} onClick={()=>onDetail({kind:'balance',metric:key})}><i/>{key==='billed'?'Billed':'Not billed'}<ArrowUpRight size={13}/></button></dt><dd>{amount(metric(key)?.amount)}<small>{number(metric(key)?.count)} invoices</small></dd></div>)}</dl>
  </div>
  <footer className="management-billing-other">{(['not_required','credit'] as const).map(key=><div className="billing-other-row" key={key}><span>{key==='credit'?<button className="dashboard-text-link" disabled={!metric(key)} aria-label="View credit items" onClick={()=>onDetail({kind:'balance',metric:key})}>Credits</button>:<button className="dashboard-text-link" disabled={!metric(key)} onClick={()=>onDetail({kind:'balance',metric:key})}>Billing not required</button>}<small>{number(metric(key)?.count)} {key==='credit'?'items':'invoices'}</small></span><strong>{key==='credit'?<button className="dashboard-text-link" disabled={!metric(key)} aria-label="View credit amount" onClick={()=>onDetail({kind:'balance',metric:key})}>{amount(metric(key)?.amount)}</button>:amount(metric(key)?.amount)}</strong></div>)}<div className="management-setup-notice"><span>Setup needed <small>Included in outstanding; may overlap billing categories.</small></span><button className="dashboard-text-link" disabled={!metric('setup')} onClick={()=>onDetail({kind:'balance',metric:'setup'})}>{number(metric('setup')?.count)} invoices · {amount(metric('setup')?.amount)}</button></div></footer>
 </section>;
}
export function PriorityAccounts({data,onDetail}:Pick<Props,'data'|'onDetail'>){
 const ranked=attentionAccounts(data),[expanded,setExpanded]=useState(false);
 return <section className="management-priority" aria-label="Priority accounts"><header><div><h3>Needs attention</h3><span>Invoice age 61+ days · grouped by hotel</span></div><button disabled={!data?.agesComplete} onClick={()=>onDetail({kind:'balance',metric:'over60'})}>View all accounts<ArrowUpRight size={14}/></button></header>
  {!data?.agesComplete?<p className="management-chart-empty">Account verification pending</p>:!ranked.length?<p className="management-chart-empty">No open invoices 61+ days old</p>:(data?.hotels??[]).map(h=>{const accounts=ranked.filter(a=>a.hotel===h.hotel);return !accounts.length?null:<section className="management-priority-hotel" key={h.hotel} aria-label={h.hotel+' accounts needing attention'}><h4>{h.hotel}<small>{accounts.length} accounts</small></h4><ol>{accounts.slice(0,expanded?accounts.length:3).map(a=><li key={JSON.stringify([a.hotel,a.accountId])}><button onClick={()=>onDetail({kind:'balance',metric:'over60',hotel:a.hotel,accountId:a.accountId})}><span><b>{a.accountName}</b><small>{a.accountNo??a.accountId} · {a.accountType}</small><small>{number(a.count)} invoices · Oldest {number(a.oldest)} days</small></span><strong>{amount(a.amount)}<ArrowUpRight size={13}/></strong></button></li>)}</ol></section>;})}
  {(data?.hotels??[]).some(h=>ranked.filter(a=>a.hotel===h.hotel).length>3)&&<button className="management-priority-more" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'Show fewer accounts':'Show all priority accounts'}<ChevronDown size={14}/></button>}
 </section>;
}

export function HotelAgingChart({data,onDetail}:Pick<Props,'data'|'onDetail'>){
 const plot=agingPlot(data),[hotel,setHotel]=useState('All'),[selection,setSelection]=useState<number|null>(null);
 const activeHotel=data?.hotels.find(h=>h.hotel===hotel)?.hotel??'All';
 const rows=(data?.hotels??[]).filter(h=>activeHotel==='All'||h.hotel===activeHotel);
 const ranges=bands.map((label,key)=>({key,label,amount:plot?addAmounts(rows.map(h=>h.bands.find(b=>b.key===key)?.amount??null)):null,count:plot&&rows.every(h=>h.bands.find(b=>b.key===key)?.count!=null)?rows.reduce((n,h)=>n+h.bands.find(b=>b.key===key)!.count!,0):null}));
 const positive=Math.max(0,...ranges.map(b=>Math.max(0,Number(b.amount)))),negative=Math.max(0,...ranges.map(b=>Math.max(0,-Number(b.amount)))),scale=positive+negative,zero=scale?negative/scale*100:0;
 const active=selection===null?null:ranges[selection];
 return <section className="management-aging-chart" aria-label="Hotel aging chart">
  <header><div><h3>Invoice Aging</h3><span>Open balance by invoice age · THB</span></div></header>
  <div className="management-aging-hotels" role="group" aria-label="Aging hotel">{['All',...(data?.hotels??[]).map(h=>h.hotel)].map(id=><button key={id} aria-pressed={activeHotel===id} onClick={()=>{setHotel(id);setSelection(null);}}>{id==='All'?'All hotels':id}</button>)}</div>
  {!plot?<p className="management-chart-empty">Aging verification pending</p>:<div className="management-range-list">{ranges.map(b=><button key={b.key} className={'management-age-range'+(selection===b.key?' is-active':'')} aria-label={`${activeHotel==='All'?'All hotels':activeHotel} · ${b.label} days · ${amount(b.amount)} THB${Number(b.amount)<0?' credit':''}`} aria-pressed={selection===b.key} onFocus={()=>setSelection(b.key)} onMouseEnter={()=>setSelection(b.key)} onClick={()=>setSelection(b.key)}>
   <span className="management-age-label"><i style={{background:colors[b.key]}}/>{b.label}<small>days</small></span><strong>{amount(b.amount)}</strong>
   <span className="management-range-track" style={{'--zero':zero+'%'} as CSSProperties}><i className={Number(b.amount)<0?'is-credit':''} style={{left:(Number(b.amount)<0?zero-Math.abs(Number(b.amount))/scale*100:zero)+'%',width:(scale?Math.abs(Number(b.amount))/scale*100:0)+'%',background:colors[b.key]}}/></span>
  </button>)}</div>}
  <footer className="management-chart-selection" aria-live="polite">{active?<><span><b>{activeHotel==='All'?'All hotels':activeHotel} · {active.label} days</b> {amount(active.amount)} THB · {number(active.count)} items</span><button onClick={()=>onDetail({kind:'balance',metric:'open',...(active.key>0?{ageMin:[0,31,61,91,121,151][active.key]}:{}),...(active.key<5?{ageMax:[30,60,90,120,150][active.key]}:{}),...(activeHotel==='All'?{}:{hotel:activeHotel})})}>{activeHotel==='All'?'View accounts':'View hotel accounts'}<ArrowUpRight size={14}/></button></>:<span>{plot?'Select an age range for details':'Amounts are unavailable until verified'}</span>}</footer>
 </section>;
}
