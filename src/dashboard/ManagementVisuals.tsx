import {useState,type CSSProperties} from 'react';
import {ArrowUpRight,ChevronDown} from 'lucide-react';
import type {ManagementDashboardData} from '../../worker/dashboard/management-model';
import type {DashboardScope} from './model';
import type {PeriodDetail} from './PeriodBalances';
import {amount,number} from './period-data';
import {agingPlot,attentionAccounts,billingCompletion} from './management-visuals';

const bands=['Up to 30','31–60','61–90','91–120','121–150','151+'];
const colors=['#298f91','#629ed1','#6574ce','#9473b8','#c28d27','#c56573'];
type Props={data:ManagementDashboardData|undefined;scope:DashboardScope;onDetail:(detail:PeriodDetail)=>void};
export function BillingAndAttention({data,scope,onDetail}:Props){
 const progress=billingCompletion(data),ranked=attentionAccounts(data),[expanded,setExpanded]=useState(false),[billingFocus,setBillingFocus]=useState<'billed'|'unbilled'>('billed');
 const metric=(key:string)=>data?.metrics.find(m=>m.key===key);
 const cohort=(key:string)=>data?.cohort.find(c=>c.key===key);
 const percentage=progress?.percent??null;
 const focusPercent=percentage===null?null:billingFocus==='billed'?percentage:100-percentage;
 return <div className="management-story-grid">
  <section className="management-period-glance management-billing-visual" aria-label="Period billing at a glance">
   <header><div><h3>Billing progress</h3><span>{scope.from} → {scope.to} · Original value</span></div><span className="management-chart-unit">THB</span></header>
   {data&&!data.cohortComplete&&<p role="status" className="management-notice">Period coverage is incomplete.</p>}
   <div className="management-billing-body">
    <div className="management-ring-group"><div className={'management-donut focus-'+billingFocus} role="img" aria-label={progress===null?'Billing progress unavailable':percentage===null?'No billing-required value in this period':`${focusPercent!.toFixed(1)}% of billing-required invoice value ${billingFocus==='billed'?'billed':'not billed'}`}>
     <svg viewBox="0 0 200 200" aria-hidden="true"><circle className="billing-ring-base" cx="100" cy="100" r="80"/>{percentage!=null&&<>{percentage<100&&<circle className="billing-ring-unbilled" cx="100" cy="100" r="80" pathLength="100" strokeDasharray={`${100-percentage} 100`} transform={`rotate(${-90+percentage*3.6} 100 100)`}/>}{percentage>0&&<circle className="billing-ring-done" cx="100" cy="100" r="80" pathLength="100" strokeDasharray={`${percentage} 100`} transform="rotate(-90 100 100)"/>}</>}</svg>
     <div><strong>{percentage==null?'—':`${Math.round(focusPercent!)}%`}</strong><span>{percentage==null?progress?'No billing due':'Unavailable':billingFocus==='billed'?'Billed':'Not billed'}</span></div>
    </div><small>Billing-required value</small></div>
    <dl><div className="billing-legend-issued"><dt>New invoices</dt><dd>{amount(cohort('issued')?.amount)}<small>{number(cohort('issued')?.count)} invoices</small></dd></div>{(['billed','unbilled'] as const).map(key=><div key={key} className={'billing-legend-'+key}><dt><button className="management-billing-focus" aria-label={key==='billed'?'Show billed share':'Show not billed share'} aria-pressed={billingFocus===key} onClick={()=>setBillingFocus(key)} onFocus={()=>setBillingFocus(key)} onMouseEnter={()=>setBillingFocus(key)}><i/>{key==='billed'?'Billed':'Not billed'}</button></dt><dd>{amount(cohort(key)?.amount)}<small>{number(cohort(key)?.count)} invoices</small></dd></div>)}</dl>
   </div>
   <footer>{(['not_required','setup','credit'] as const).map(key=>{const row=cohort(key);return key==='credit'&&!row?.count?null:<span key={key}>{key==='setup'?'Setup needed':key==='credit'?'Credits':'Billing not required'} <b>{number(row?.count)}</b><small>{amount(row?.amount)}</small></span>;})}</footer>
  </section>
  <section className="management-priority" aria-label="Priority accounts">
   <header><div><h3>Needs attention</h3><span>Invoice age over 60 days</span></div><button aria-label="View all accounts over 60 days" disabled={!data?.agesComplete} onClick={()=>document.querySelector('.management-accounts')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'})}><ArrowUpRight size={18}/></button></header>
   <div className="management-priority-actions"><button disabled={!data?.agesComplete} onClick={()=>onDetail({kind:'balance',metric:'over60_unbilled'})}><span>Over 60 · not billed</span><strong>{number(data?.agesComplete?metric('over60_unbilled')?.count:null)}</strong></button><button disabled={!data?.complete} onClick={()=>onDetail({kind:'balance',metric:'past_due'})}><span>Past due date</span><strong>{number(data?.complete?metric('past_due')?.count:null)}</strong></button></div>
   {!data?.agesComplete?<p className="management-chart-empty">Account verification pending</p>:!ranked.length?<p className="management-chart-empty">No open invoices over 60 days</p>:<ol>{ranked.slice(0,expanded?ranked.length:3).map(a=><li key={a.hotel+':'+a.accountId}><button onClick={()=>onDetail({kind:'balance',metric:'over60',hotel:a.hotel,accountId:a.accountId})}><span><b>{a.accountName}</b><small><em className="management-hotel-tag">{a.hotel}</em> {a.oldest} days{a.unbilled?` · ${a.unbilled} not billed`:''}</small></span><strong>{amount(a.amount)}<ArrowUpRight size={13}/></strong></button></li>)}</ol>}
   {ranked.length>3&&<button className="management-priority-more" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'Show less':`Show all ${ranked.length} accounts`}<ChevronDown size={14}/></button>}
  </section>
 </div>;
}

export function HotelAgingChart({data,onDetail}:Pick<Props,'data'|'onDetail'>){
 const plot=agingPlot(data),[selection,setSelection]=useState<{hotel:string;band:number}|null>(null);
 const selected=data?.hotels.find(h=>h.hotel===selection?.hotel),active=selected?.bands.find(b=>b.key===selection?.band);
 return <section className="management-aging-chart" aria-label="Hotel aging chart">
  <header><div><h3>Where the balance sits</h3><span>Invoice age by hotel · THB</span></div><div className="management-chart-legend">{bands.map((label,i)=><span key={label}><i style={{background:colors[i]}}/>{label}</span>)}</div></header>
  {!plot?<p className="management-chart-empty">Aging verification pending</p>:plot.scale===0?<p className="management-chart-empty">No open balance in this scope</p>:<div className="management-chart-rows">{plot.rows.map(h=><div className="management-chart-row" key={h.hotel}><div><b>{h.hotel}</b><small>{number(h.count)} items</small></div><div className="management-signed-plot" style={{'--credit-width':plot.negativeShare+'%'} as CSSProperties}>
   <div className="management-negative-bars">{h.bands.filter(b=>Number(b.amount)<0).map(b=><button key={b.key} className={selection?.hotel===h.hotel&&selection.band===b.key?'is-active':''} aria-label={`${h.hotel} · ${bands[b.key]} days · ${amount(b.amount)} THB credit`} aria-pressed={selection?.hotel===h.hotel&&selection.band===b.key} title={`${bands[b.key]}: ${amount(b.amount)} THB`} style={{width:(-Number(b.amount)/plot.scale*100)+'%',background:colors[b.key]}} onFocus={()=>setSelection({hotel:h.hotel,band:b.key})} onMouseEnter={()=>setSelection({hotel:h.hotel,band:b.key})} onClick={()=>setSelection({hotel:h.hotel,band:b.key})}/>)}</div>
   <div className="management-positive-bars">{h.bands.filter(b=>Number(b.amount)>0).map(b=><button key={b.key} className={selection?.hotel===h.hotel&&selection.band===b.key?'is-active':''} aria-label={`${h.hotel} · ${bands[b.key]} days · ${amount(b.amount)} THB`} aria-pressed={selection?.hotel===h.hotel&&selection.band===b.key} title={`${bands[b.key]}: ${amount(b.amount)} THB`} style={{width:(Number(b.amount)/plot.scale*100)+'%',background:colors[b.key]}} onFocus={()=>setSelection({hotel:h.hotel,band:b.key})} onMouseEnter={()=>setSelection({hotel:h.hotel,band:b.key})} onClick={()=>setSelection({hotel:h.hotel,band:b.key})}/>)}</div>
  </div><button className="management-hotel-total" onClick={()=>onDetail({kind:'balance',metric:'open',hotel:h.hotel})}>{amount(h.amount)}<ArrowUpRight size={14}/></button></div>)}</div>}
  <footer className="management-chart-selection" aria-live="polite">{active&&selected?<><span><b>{selected.hotel} · {bands[active.key]} days</b> {amount(active.amount)} THB · {number(active.count)} items</span><button onClick={()=>onDetail({kind:'balance',metric:'open',hotel:selected.hotel})}>View hotel invoices<ArrowUpRight size={14}/></button></>:<span>{plot?.negativeShare?'Credits extend left of zero. ':''}Select a range to see its figures</span>}</footer>
 </section>;
}
