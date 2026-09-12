import {useEffect,useRef,useState} from 'react';
import {useCollectionPolicy} from '../collection/PolicyContext';
import {activityResult,externalResult,financialResult,useSource,type Source,type DashboardFinancial} from './data';
import {activityTotals,accountIdentity,historyChunks,scopeQuery,type DashboardScope,validPeriod} from './model';
import {amount,number,paidInvoicesResult,rangeLabel,stamp,financialMembershipKnown} from './period-data';
import type {PeriodDetail} from './PeriodBalances';
import {dashboardLink} from './links';
import type {DashboardHotelOverviewResponse} from '../../worker/dashboard/hotel-model';
import {overviewSource} from './hotel-data';
import {HotelSplit,type HotelMeasure} from './HotelSplit';
type Run={hotel:string;from:string;to:string;status:string;finishedAt:string|null};
type Status={enabled:boolean;running:boolean;runs:Run[]};
const financialReady=(source:Source<DashboardFinancial>)=>source.data?.coverage.complete&&financialMembershipKnown(source.data.summary);
export function PeriodActivity({scope,token,revision,onReload,onDetail,overview}:{overview?:Source<DashboardHotelOverviewResponse>;scope:DashboardScope;token:string;revision:number;onReload:()=>void;onDetail:(detail:PeriodDetail)=>void}){
 const q=scopeQuery(scope,true),valid=validPeriod(scope),path=(base:string)=>!overview&&valid?base+'?'+q+'&limit=1':null;
 const localActivity=useSource(path('/api/reports/activity'),token,revision,activityResult,true),localExternal=useSource(path('/api/external-billing'),token,revision,externalResult,true);
 const localEntries=useSource(path('/api/financial/invoice_entries'),token,revision,financialResult,true),localPayments=useSource(path('/api/financial/payments'),token,revision,financialResult,true),localPaid=useSource(path('/api/dashboard/payment-invoices'),token,revision,paidInvoicesResult,true);
 const activity=overview?overviewSource(overview,'activity'):localActivity,external=overview?overviewSource(overview,'external'):localExternal,entries=overview?overviewSource(overview,'entries'):localEntries,payments=overview?overviewSource(overview,'payments'):localPayments,paid=overview?overviewSource(overview,'paid'):localPaid;
 const totals=activityTotals(activity.data?.summary,external.data?.summary),{policy}=useCollectionPolicy();
 const hotelRounds=(overview?.data?.hotels??[]).flatMap(h=>activityTotals(h.activity?.summary,h.external?.summary).reminders??[]).map(r=>({...r,invoices:0,amount:null}));
 const rounds=[...new Map([...(policy?.rounds.filter(r=>r.active).map(r=>({kind:r.key,stage_label:r.label,invoices:0,amount:0}))??[]),...hotelRounds,...(totals.reminders??[])].map(r=>[r.kind,r])).values()];
 const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[waitingForRefresh,setWaitingForRefresh]=useState(false);
 const latest=useRef({token,onReload});latest.current={token,onReload};const pending=useRef<Record<string,{commandId:string;confirmed:boolean}>>({}),alive=useRef(true),lastCompletion=useRef<string|null>(null),lastRunning=useRef<boolean|null>(null),polling=useRef(true),postController=useRef<AbortController|null>(null);
 const identity=accountIdentity(scope.account),hotels=identity?[identity[0]]:scope.hotel==='All'?['KAT','TSK']:[scope.hotel];
 const tasks=hotels.flatMap(hotel=>historyChunks(scope.from,scope.to).map(period=>({hotel,...period})));
 const matches=(r:Run)=>tasks.some(t=>r.hotel===t.hotel&&r.from===t.from&&r.to===t.to);
 const active=(status?.runs??[]).filter(r=>matches(r)&&['queued','running'].includes(r.status));
 const selectedRuns=tasks.map(t=>(status?.runs??[]).find(r=>r.hotel===t.hotel&&r.from===t.from&&r.to===t.to));
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;postController.current?.abort();};},[]);
 useEffect(()=>()=>postController.current?.abort(),[token]);
 useEffect(()=>{
  const controller=new AbortController();let current=true;
  const read=async()=>{if(document.visibilityState==='hidden')return;try{const r=await fetch('/api/financial/status',{headers:{Authorization:'Bearer '+latest.current.token},signal:controller.signal});if(!r.ok)throw Error();const v=await r.json() as Status;if(typeof v.enabled!=='boolean'||typeof v.running!=='boolean'||!Array.isArray(v.runs))throw Error();if(current){setStatus(v);const key=v.runs.filter(r=>matches(r)&&r.finishedAt).map(r=>r.hotel+':'+r.finishedAt).join('|');const stopped=lastRunning.current===true&&!v.running;lastRunning.current=v.running;polling.current=v.running;if(!v.running)setWaitingForRefresh(false);if(stopped||lastCompletion.current!==null&&lastCompletion.current!==key)latest.current.onReload();lastCompletion.current=key;}}catch{if(current)setStatus(null);}};
  void read();const timer=setInterval(()=>{if(polling.current)void read();},15000);const visible=()=>void read();document.addEventListener('visibilitychange',visible);return()=>{current=false;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[revision,scope.hotel,scope.account,scope.from,scope.to]);
 async function refresh(){
  if(busy||!valid||!status?.enabled)return;polling.current=true;setBusy(true);setNotice('');let confirmed=0;const controller=new AbortController(),startToken=latest.current.token;postController.current=controller;
  try{for(const task of tasks){
   if(!alive.current||controller.signal.aborted||latest.current.token!==startToken)throw Error('cancelled');
   const key=[task.hotel,task.from,task.to].join('|');let entry=pending.current[key];
   if(entry?.confirmed){confirmed++;continue;}
   if(active.some(r=>r.hotel===task.hotel&&r.from===task.from&&r.to===task.to)){pending.current[key]={commandId:entry?.commandId??crypto.randomUUID(),confirmed:true};confirmed++;continue;}
   if(!entry){entry={commandId:crypto.randomUUID(),confirmed:false};pending.current[key]=entry;}
   const response=await fetch('/api/financial/refresh',{method:'POST',signal:controller.signal,headers:{Authorization:'Bearer '+latest.current.token,'Content-Type':'application/json'},body:JSON.stringify({...task,commandId:entry.commandId,reason:'backfill'})});if(!response.ok)throw Error();
   const receipt=await response.json() as {status?:string;hotel?:string};if(!['queued','running','succeeded'].includes(receipt.status??'')||receipt.hotel&&receipt.hotel!==task.hotel){if(['failed','not_enabled'].includes(receipt.status??''))delete pending.current[key];throw Error();}
   entry.confirmed=true;confirmed++;if(alive.current)setWaitingForRefresh(true);
   if(alive.current)setStatus(previous=>previous?{...previous,runs:[{...task,status:receipt.status!,finishedAt:null},...previous.runs.filter(r=>r.hotel!==task.hotel||r.from!==task.from||r.to!==task.to)]}:previous);
  }
  if(alive.current&&!controller.signal.aborted&&latest.current.token===startToken){pending.current={};setNotice('OPERA history requested for this period. Totals update after the source checks finish.');latest.current.onReload();}
  }catch{if(alive.current)setNotice('The refresh request could not be confirmed. '+confirmed+' of '+tasks.length+' requests confirmed. Retry continues the remaining requests.');}finally{if(postController.current===controller)postController.current=null;if(alive.current)setBusy(false);}
 }
 const knownPayments=financialReady(payments)?payments.data?.summary.paymentTotals:undefined;
 const hotelUnclassified=(overview?.data?.hotels??[]).some(h=>h.activity?.summary.kinds.some(r=>r.kind==='Billing classification unavailable'));
 const unclassified=activity.data?.summary.kinds.find(r=>r.kind==='Billing classification unavailable');
 const rows=[{key:'invoice_entries',label:'New invoices',count:financialReady(entries)?entries.data?.summary.invoiceCount:null,amount:financialReady(entries)?entries.data?.summary.amount:null,basis:'Original invoice value · OPERA invoice date',detail:{kind:'invoice_entries'} as PeriodDetail},
 {key:'first',label:'First billing · email',count:totals.firstBillingUnclassified?null:totals.emailFirst,amount:totals.firstBillingUnclassified?null:totals.emailFirstAmount,basis:'Amount at first actual send',detail:{kind:'sent',stage:'First billing'} as PeriodDetail},
 {key:'repeat',label:'Rebilling · email',count:totals.firstBillingUnclassified?null:totals.emailRepeat,amount:totals.firstBillingUnclassified?null:totals.emailRepeatAmount,basis:'Send occurrences · amount presented again',detail:{kind:'sent',stage:'Rebilling'} as PeriodDetail},
 ...(unclassified||hotelUnclassified?[{key:'billing-unclassified',label:'Billing classification unavailable',count:unclassified?.invoices??null,amount:unclassified?.amount??null,basis:'Actual sends awaiting first/rebilling classification',detail:{kind:'sent',stage:'Billing classification unavailable'} as PeriodDetail}]:[]),
 {key:'paid',label:'Invoices with OPERA payments',count:paid.data?.complete?paid.data.summary.count:null,amount:paid.data?.complete?paid.data.summary.amount:null,basis:'Distinct invoices · allocation of payments dated in this period',detail:{kind:'payment_invoices'} as PeriodDetail}];
 const hotelMeasures=(key:string,detail?:PeriodDetail):HotelMeasure[]=>overview?(['KAT','TSK'] as const).map(hotel=>{
  const h=overview.data?.hotels.find(h=>h.hotel===hotel),t=activityTotals(h?.activity?.summary,h?.external?.summary);let count:number|null=null,value:string|number|null=null;
  if(key==='invoice_entries'&&h?.entries?.coverage.complete&&financialMembershipKnown(h.entries.summary)){count=h.entries.summary.invoiceCount;value=h.entries.summary.amount;}
  else if(key==='paid'&&h?.paid?.complete){count=h.paid.summary.count;value=h.paid.summary.amount;}
  else if(key==='first'&&!t.firstBillingUnclassified){count=t.emailFirst;value=t.emailFirstAmount;}
  else if(key==='repeat'&&!t.firstBillingUnclassified){count=t.emailRepeat;value=t.emailRepeatAmount;}
  else if(key==='external'&&h?.external){count=h.external.summary.invoices;value=h.external.summary.amount;}
  else if(key==='billing-unclassified'&&h?.activity){const r=h.activity.summary.kinds.find(r=>r.kind==='Billing classification unavailable');count=r?.invoices??0;value=r?r.amount:0;}
  else if(key.startsWith('stage:')&&h?.activity){const r=h.activity.summary.kinds.find(r=>r.kind===key.slice(6));count=r?.invoices??0;value=r?r.amount:0;}
  return {hotel,count,amount:value,onOpen:detail?()=>onDetail({...detail,hotel}):undefined};
 }):[];
 const paymentMeasures=(key:'creditPostings'|'currentlyApplied'|'currentlyUnallocated'|'debitPostings'):HotelMeasure[]=>overview?(['KAT','TSK'] as const).map(hotel=>{const p=overview.data?.hotels.find(h=>h.hotel===hotel)?.payments;return {hotel,amount:p?.coverage.complete&&financialMembershipKnown(p.summary)?p.summary.paymentTotals?.[key]??null:null,onOpen:()=>onDetail({kind:'payments',hotel})};}):[];
 return <section className="dashboard-period-activity" aria-label="Activity in selected period"><header className="dashboard-section-heading"><div><h2>Activity in selected period</h2><p>{rangeLabel(scope.from,scope.to)} · Calendar dates in Thailand</p></div><button disabled={busy||!valid||!status?.enabled||active.length>0||waitingForRefresh&&!!status?.running} onClick={()=>void refresh()}>{busy?'Requesting…':active.length===hotels.length?'OPERA refresh in progress':'Refresh OPERA for this period'}</button></header>
  {(notice||active.length>0)&&<p className="dashboard-notice" role="status">{notice}{active.length?' '+active.map(r=>r.hotel+': '+r.status).join(' · '):''}</p>}
  {status?.running&&!active.length&&<p className="dashboard-footnote">OPERA is still reading source history. This page keeps checking until the pending work finishes.</p>}
  {selectedRuns.some(r=>r?.status==='failed')&&<p className="dashboard-notice">An OPERA history request failed for this period. Retry the refresh to complete the source checks.</p>}
  {(totals.firstBillingUnclassified||hotelUnclassified)&&<p className="dashboard-notice">Some actual billing sends cannot yet be classified as first billing or rebilling. Their records remain available below.</p>}
  {(!financialReady(entries)||!financialReady(payments)||!paid.data?.complete)&&<p className="dashboard-footnote">Some OPERA totals are not verified for this period. Available detail rows remain inspectable; missing totals display —.{paid.data?.unknownMappings?' '+paid.data.unknownMappings+' payment mappings need verification.':''}</p>}
  {overview?.data?.hotels.some(h=>[h.activity,h.external,h.entries,h.payments,h.paid].some(p=>p===null))&&<p className="dashboard-notice" role="status">Some hotel activity breakdowns are unavailable. Other verified results remain visible; reload to retry.</p>}
  {[activity,external,entries,payments,paid].some(s=>s.data&&s.state!=='ready')&&<p className="dashboard-refresh-note" role="status">{[activity,external,entries,payments,paid].some(s=>s.state==='error')?'A source reload failed. Previously loaded activity remains visible; reload to retry.':'Updating activity. Previously loaded results remain visible.'}</p>}
  <div className="dashboard-activity-highlights">{rows.filter(r=>['invoice_entries','first','paid'].includes(r.key)).map(r=><article key={r.key}><button onClick={()=>onDetail(r.detail)}><span>{r.label}</span><div><strong data-testid={'dashboard-'+r.key+'-count'}>{number(r.count)}</strong><span>invoices</span><b>{amount(r.amount)}</b></div><small>{r.basis}</small></button><HotelSplit visual rows={hotelMeasures(r.key,r.detail)} id={'activity-'+r.key} label={r.label}/></article>)}</div>
  <div className="dashboard-surface dashboard-activity-table"><div className="dashboard-table-scroll" tabIndex={0} role="region" aria-label="Period invoice and billing activity"><table><thead><tr><th>Activity</th><th>Invoices / occurrences</th><th>Amount</th>{overview&&<th>KAT / TSK</th>}<th>Measurement</th></tr></thead><tbody>{rows.filter(r=>!['invoice_entries','first','paid'].includes(r.key)).map(r=><tr key={r.key}><th><button className="dashboard-text-link" onClick={()=>onDetail(r.detail)}>{r.label}</button></th><td data-testid={'dashboard-'+r.key+'-count'}>{number(r.count)}</td><td>{amount(r.amount)}</td>{overview&&<td><HotelSplit rows={hotelMeasures(r.key,r.detail)} id={'activity-'+r.key} label={r.label} unit="occurrences"/></td>}<td>{r.basis}</td></tr>)}<tr><th><a href={dashboardLink(scope,'external')}>External billing</a></th><td>{number(external.data?.summary.invoices)}</td><td>{amount(external.data?.summary.amount)}</td>{overview&&<td><HotelSplit rows={hotelMeasures('external')} id="activity-external" label="External billing"/></td>}<td>Staff-recorded billing dates · {number(external.data?.summary.firstBillingInvoices)} first billed</td></tr>{rounds.map(r=><tr key={r.kind}><th><button className="dashboard-text-link" onClick={()=>onDetail({kind:'sent',stage:r.kind})}>{r.stage_label??r.kind} · sent</button></th><td>{number(activity.data?r.invoices:null)}</td><td>{amount(activity.data?r.amount:null)}</td>{overview&&<td><HotelSplit rows={hotelMeasures('stage:'+r.kind,{kind:'sent',stage:r.kind})} id={'sent-'+r.kind} label={r.stage_label??r.kind} unit="occurrences"/></td>}<td>Actual send occurrences · amount at send</td></tr>)}</tbody></table></div></div>
  <div className="dashboard-surface dashboard-payment-summary"><header><h3>OPERA payments dated in this period</h3><button className="dashboard-text-link" onClick={()=>onDetail({kind:'payments'})}>View payment records</button></header><dl><div><dt>Recorded payment credits</dt><dd data-testid="dashboard-payment-credits">{amount(knownPayments?.creditPostings)}</dd><HotelSplit rows={paymentMeasures('creditPostings')} id="payment-creditPostings" label="Payment creditPostings"/></div><div><dt>Currently allocated</dt><dd>{amount(knownPayments?.currentlyApplied)}</dd><HotelSplit rows={paymentMeasures('currentlyApplied')} id="payment-currentlyApplied" label="Payment currentlyApplied"/></div><div><dt>Unallocated credit</dt><dd>{amount(knownPayments?.currentlyUnallocated)}</dd><HotelSplit rows={paymentMeasures('currentlyUnallocated')} id="payment-currentlyUnallocated" label="Payment currentlyUnallocated"/></div><div><dt>Debit postings / corrections</dt><dd>{amount(knownPayments?.debitPostings)}</dd><HotelSplit rows={paymentMeasures('debitPostings')} id="payment-debitPostings" label="Payment debitPostings"/></div></dl><p className="dashboard-footnote">Partial payments count when their invoice links are verified. These are current allocations of payments dated in the period; OPERA does not supply the allocation event date. Source {stamp(payments.data?.coverage.lastSuccessAt)}.</p></div>
  {(activity.state==='error'||external.state==='error')&&<p className="dashboard-notice">A billing or send-history source could not be loaded. Reload the Dashboard to retry.</p>}
 </section>;
}
