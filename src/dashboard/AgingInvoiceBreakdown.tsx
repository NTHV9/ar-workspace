import type {HotelId} from '../domain/hotels';
import {useEffect,useId,useRef,useState} from 'react';
import {ArrowUpRight,RefreshCw,X} from 'lucide-react';
import type {RefreshState} from '../domain/portfolio';
import {thaiToday} from '../domain/collection';
import {useSource} from './data';
import {agingDetailsResult,agingTargetPublicationMatches,agingSourceRevision,type AgingStatusDimension,type AgingStatusFilters,type AgingStatusTarget} from './aging-invoice-data';
import {amount,number,percent} from './period-data';
import './aging-invoice-breakdown.css';

interface Props {initialFilters?:AgingStatusFilters;onFiltersChange?:(filters:AgingStatusFilters)=>void;target:AgingStatusTarget;token:string;revision:number;refresh?:RefreshState;onClose:()=>void;onOpenInvoice:(hotel:HotelId,accountId:string,invoiceId:string)=>void}
const tabs:{key:AgingStatusDimension;label:string}[]=[{key:'billing',label:'Billing'},{key:'followup',label:'Latest Follow-Up'},{key:'due',label:'Due date'}];
const billingLabels:Record<string,string>={unbilled:'Not billed',billed:'Billed',not_required:'Billing not required',setup:'Billing setup needed',credit:'Credit'};
const dueLabels:Record<string,string>={not_due:'Not yet due',due_today:'Due today',past_due:'Past Due date',awaiting_billing:'Awaiting billing',unknown:'Due date unavailable',credit:'Credit'};
export function AgingInvoiceBreakdown({target,token,revision,refresh,onClose,onOpenInvoice,initialFilters,onFiltersChange}:Props){
 const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView({block:'start'});},[]);
 const id=useId(),[dimension,setDimension]=useState<AgingStatusDimension>(initialFilters?.dimension??'billing'),[status,setStatus]=useState(initialFilters?.status??''),[flag,setFlag]=useState(initialFilters?.flag??''),[page,setPage]=useState(initialFilters?.page??0),[reload,setReload]=useState(0);
 const filtersCallback=useRef(onFiltersChange);filtersCallback.current=onFiltersChange;
 useEffect(()=>{filtersCallback.current?.({dimension,status,flag,page});},[dimension,status,flag,page]);
 const query=new URLSearchParams(target.query);query.set('details','1');query.set('page',String(page));query.set('limit','25');
 if(status){query.set('dimension',dimension);query.set('status',status);}if(flag)query.set('flag',flag);
 const source=useSource('/api/dashboard/aging-invoices?'+query,token,agingSourceRevision(revision,refresh)+reload,agingDetailsResult(query),true),data=source.data;
 const matching=!!data&&data.asOfDate===thaiToday()&&agingTargetPublicationMatches(data,target,refresh),known=matching&&data.complete&&data.summary.complete;
 const summary=known?data.summary:undefined,facets=matching?data.summary[dimension]:[],selected=facets.find(f=>f.key===status),pages=matching?Math.max(1,Math.ceil(data.total/25)):1;
 useEffect(()=>{if(matching&&page>=pages)setPage(pages-1);},[matching,page,pages]);
 const choose=(key:string)=>{setStatus(key);setPage(0);};
 return <section className="aging-invoice-breakdown" aria-labelledby={id+'-title'}>
  <header className="aging-breakdown-heading"><div><h3 ref={heading} tabIndex={-1} id={id+'-title'}>{target.title} · Invoice details</h3><p>{target.hotels.join(' + ')} · {target.bucketLabel}</p></div><div className="aging-breakdown-actions"><button type="button" onClick={()=>setReload(v=>v+1)} disabled={source.state==='loading'}><RefreshCw size={14}/>Reload invoices</button><button type="button" aria-label="Close invoice details" onClick={onClose}><X size={18}/></button></div></header>
  {!known&&<p className="dashboard-notice" role="status">{source.state==='loading'?'Loading invoice details…':source.state==='error'?'Invoice details could not be loaded. Reload to try again.':data&&!matching?'These invoice details do not match the current date or saved OPERA publication. Reload invoices and saved data to view matching results.':'Invoice verification or aging membership is incomplete. Observed invoice rows remain visible; confirmed counts and amounts are unavailable.'}</p>}
  {matching&&source.state!=='ready'&&<p className="dashboard-refresh-note" role="status">{source.state==='loading'?'Refreshing invoice details. Showing the last loaded results for this publication.':'Reload failed. Showing the last loaded results for this publication; reload to try again.'}</p>}
  <div className="aging-breakdown-total"><strong>{number(summary?.count)} <span>open invoices</span></strong><b>{amount(summary?.amount)} <span>THB net outstanding</span></b><small>Invoices including credits · selected aging scope</small></div>
  {known&&target.sourceAmount!==null&&summary?.amount!=null&&Math.round(target.sourceAmount*100)!==Math.round(Number(summary.amount)*100)&&<p className="aging-breakdown-caption">OPERA Aging: {amount(target.sourceAmount)} THB · Invoice net: {amount(summary.amount)} THB · Credits: {amount(summary.creditAmount)} THB. Compared with the selected invoice net balance.</p>}
  <div className="aging-breakdown-controls"><div className="aging-breakdown-tabs" aria-label="Invoice status views">{tabs.map(tab=><button type="button" key={tab.key} aria-pressed={dimension===tab.key} onClick={()=>{setDimension(tab.key);setStatus('');setPage(0);}}>{tab.label}</button>)}</div><label>Needs attention<select value={flag} onChange={e=>{setFlag(e.target.value);setPage(0);}}><option value="">All invoices</option><option value="held">On hold</option><option value="needs_review">Needs review</option></select></label></div>
  <div className="aging-breakdown-facets" aria-label={tabs.find(t=>t.key===dimension)?.label+' summary'} aria-busy={source.state==='loading'}>
   <button type="button" className="aging-breakdown-facet" aria-pressed={!status} disabled={!matching} onClick={()=>choose('')}><span>All statuses</span><strong>{number(summary?.count)} <small>invoices</small></strong><b>{amount(summary?.amount)} <small>THB</small></b><em>{percent(summary?.amount,summary?.amount)}</em></button>
   {facets.map(f=><button type="button" className="aging-breakdown-facet" key={f.key} aria-pressed={status===f.key} onClick={()=>choose(f.key)}><span>{f.label}</span><strong>{number(known?f.count:null)} <small>invoices</small></strong><b>{amount(known?f.amount:null)} <small>THB</small></b><em>{percent(known?f.amount:null,summary?.amount)}</em></button>)}
  </div>
  <div className="aging-breakdown-list-heading"><h4>{status?(selected?.label??status):'All statuses'}{flag?' · '+(flag==='held'?'On hold':'Needs review'):''}</h4><span>{matching?number(data.total):'—'} {known?'matching invoices':'observed matching rows'}</span></div>
  <p className="aging-breakdown-caption">Each view groups the same invoices. Percentages use the full selected net outstanding amount; attention filters apply to the list below.</p>
  {matching&&<><div className="aging-breakdown-table-scroll"><table className="aging-breakdown-table" aria-label="Aging invoice details"><thead><tr><th>Account / Guest</th><th>Invoice / Folio</th><th>Hotel</th><th>Open · THB</th><th>Billing</th><th>Latest Follow-Up</th><th>Due date</th><th>Attention</th></tr></thead><tbody>{data.rows.map(row=><tr key={JSON.stringify([row.hotel,row.accountId,row.invoiceId])}><td><strong>{row.accountName}</strong><small>{row.guest??'Guest not available'}</small></td><td><button type="button" className="aging-breakdown-invoice-link" onClick={()=>onOpenInvoice(row.hotel,row.accountId,row.invoiceId)} aria-label={'Open invoice '+(row.invoiceNo??row.invoiceId)+' · '+row.hotel}>{row.invoiceNo??'Invoice '+row.invoiceId}<ArrowUpRight size={13}/></button><small>Folio {row.folioNo??'—'}</small></td><td><span className={'aging-property-label '+row.hotel.toLowerCase()}>{row.hotel}</span></td><td className="aging-breakdown-money">{amount(row.open)}</td><td>{billingLabels[row.billingStatus]??row.billingStatus}</td><td>{row.latestStageLabel}</td><td><span>{row.dueDate??'—'}</span><small className={row.dueStatus==='past_due'?'aging-breakdown-past-due':''}>{dueLabels[row.dueStatus]??row.dueStatus}</small></td><td>{row.held&&<span className="aging-breakdown-flag">On hold</span>}{row.needsReview&&<span className="aging-breakdown-flag review">Needs review</span>}{!row.held&&!row.needsReview&&'—'}</td></tr>)}</tbody></table></div>
   {!data.rows.length&&<p className="aging-breakdown-empty">{known?'No invoices match this selection. Try another status or attention filter.':'No observed rows match this selection. Coverage is incomplete; this does not confirm there are no outstanding invoices.'}</p>}
   <nav className="aging-breakdown-pagination" aria-label="Invoice details pages"><span>{data.total?`${page*25+1}–${Math.min((page+1)*25,data.total)} of ${number(data.total)}`:known?'0 matching invoices':'0 observed matching rows'}</span><div><button type="button" disabled={page===0} onClick={()=>setPage(v=>Math.max(0,v-1))}>Previous</button><span>Page {page+1} of {pages}</span><button type="button" disabled={page+1>=pages} onClick={()=>setPage(v=>v+1)}>Next</button></div></nav></>}
  <p className="aging-breakdown-basis">Counts include credit items and exclude zero balances and child invoices.</p>
 </section>;
}
