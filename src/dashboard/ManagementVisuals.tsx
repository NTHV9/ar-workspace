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
export function BillingProgress({data,scope}:Pick<Props,'data'|'scope'>){
 const progress=billingCompletion(data),[billingFocus,setBillingFocus]=useState<'billed'|'unbilled'>('billed');
 const cohort=(key:string)=>data?.cohort.find(c=>c.key===key);
 const percentage=progress?.percent??null;
 const focusPercent=percentage===null?null:billingFocus==='billed'?percentage:100-percentage;
 return <section className="management-period-glance management-billing-visual" aria-label="Period billing at a glance">
   <header><div><h3>Billing progress</h3><span>{scope.from} → {scope.to} · Original value</span></div><span className="management-chart-unit">THB</span></header>
   {data&&!data.cohortComplete&&<p role="status" className="management-notice">Period coverage is incomplete.</p>}
   <div className="management-billing-body">
    <div className="management-ring-group"><div className={'management-donut focus-'+billingFocus} role="img" aria-label={progress===null?'Billing progress unavailable':percentage===null?'No billing-required value in this period':`${focusPercent!.toFixed(1)}% of billing-required invoice value ${billingFocus==='billed'?'billed':'not billed'}`}>
     <svg viewBox="0 0 200 200" aria-hidden="true"><circle className="billing-ring-base" cx="100" cy="100" r="80"/>{percentage!=null&&<>{percentage<100&&<circle className="billing-ring-unbilled" cx="100" cy="100" r="80" pathLength="100" strokeDasharray={`${100-percentage} 100`} transform={`rotate(${-90+percentage*3.6} 100 100)`}/>}{percentage>0&&<circle className="billing-ring-done" cx="100" cy="100" r="80" pathLength="100" strokeDasharray={`${percentage} 100`} transform="rotate(-90 100 100)"/>}</>}</svg>
     <div><strong>{percentage==null?'—':`${Math.round(focusPercent!)}%`}</strong><span>{percentage==null?progress?'No billing due':'Unavailable':billingFocus==='billed'?'Billed':'Not billed'}</span></div>
    </div><small>Billing-required value</small></div>
    <dl>{(['billed','unbilled'] as const).map(key=><div key={key} className={'billing-legend-'+key}><dt><button className="management-billing-focus" aria-label={key==='billed'?'Show billed share':'Show not billed share'} aria-pressed={billingFocus===key} onClick={()=>setBillingFocus(key)} onFocus={()=>setBillingFocus(key)} onMouseEnter={()=>setBillingFocus(key)}><i/>{key==='billed'?'Billed':'Not billed'}</button></dt><dd>{amount(cohort(key)?.amount)}<small>{number(cohort(key)?.count)} invoices</small></dd></div>)}</dl>
   </div>
   <footer className="management-billing-other">
    <div className="billing-other-row"><span>New invoices<small>{number(cohort('issued')?.count)} invoices</small></span><strong>{amount(cohort('issued')?.amount)}</strong></div>
    <details><summary>Other invoice totals<ChevronDown size={14}/></summary>{(['not_required','setup','credit'] as const).map(key=>{const row=cohort(key);return key==='credit'&&!row?.count?null:<div className="billing-other-row" key={key}><span>{key==='setup'?'Setup needed':key==='credit'?'Credits':'Billing not required'}<small>{number(row?.count)} invoices</small></span><strong>{amount(row?.amount)}</strong></div>;})}</details>
   </footer>
  </section>;
}
export function PriorityAccounts({data,onDetail}:Pick<Props,'data'|'onDetail'>){
 const ranked=attentionAccounts(data),[expanded,setExpanded]=useState(false);
 return <section className="management-priority" aria-label="Priority accounts">
   <header><div><h3>Needs attention</h3><span>Invoice age over 60 days</span></div><button aria-label="View all accounts over 60 days" disabled={!data?.agesComplete} onClick={()=>document.querySelector('.management-accounts')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'})}><ArrowUpRight size={18}/></button></header>
   {!data?.agesComplete?<p className="management-chart-empty">Account verification pending</p>:!ranked.length?<p className="management-chart-empty">No open invoices over 60 days</p>:<ol>{ranked.slice(0,expanded?ranked.length:3).map(a=><li key={a.hotel+':'+a.accountId}><button onClick={()=>onDetail({kind:'balance',metric:'over60',hotel:a.hotel,accountId:a.accountId})}><span><b>{a.accountName}</b><small><em className="management-hotel-tag">{a.hotel}</em> {a.oldest} days · {number(a.count)} invoices</small></span><strong>{amount(a.amount)}<ArrowUpRight size={13}/></strong></button></li>)}</ol>}
   {ranked.length>3&&<button className="management-priority-more" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'Show less':`Show all ${ranked.length} accounts`}<ChevronDown size={14}/></button>}
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
  <footer className="management-chart-selection" aria-live="polite">{active?<><span><b>{activeHotel==='All'?'All hotels':activeHotel} · {active.label} days</b> {amount(active.amount)} THB · {number(active.count)} items</span><button onClick={()=>onDetail({kind:'balance',metric:'open',...(activeHotel==='All'?{}:{hotel:activeHotel})})}>{activeHotel==='All'?'View invoices':'View hotel invoices'}<ArrowUpRight size={14}/></button></>:<span>{plot?'Select an age range for details':'Amounts are unavailable until verified'}</span>}</footer>
 </section>;
}
