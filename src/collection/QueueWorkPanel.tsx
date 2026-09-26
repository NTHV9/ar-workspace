import {useState} from 'react';
import {ChevronRight,FileText,Search} from 'lucide-react';
import type {Group} from '../CollectionQueue';
import {stageLabel} from '../domain/collection';
import {legacyStageSnapshot} from '../domain/collection-policy';
import {money} from '../domain/portfolio';
export function QueueWorkPanel({group,label,selected,onToggle,onSelect,onClear,onPrepare,onAccount}:{group:Group;label:string;selected:ReadonlySet<string>;onToggle:(id:string)=>void;onSelect:(ids:string[])=>void;onClear:()=>void;onPrepare:()=>void;onAccount:()=>void}){
 const [query,setQuery]=useState('');
 const canPrepare=!['Needs review','On hold'].includes(group.stage);
 const eligible=group.rows.filter(r=>r.collection_selectable&&r.verification_state==='verified');
 const picked=eligible.filter(r=>selected.has(r.id));
 const shown=group.rows.filter(r=>`${r.invoice_no??''} ${r.folio_no??''} ${r.guest}`.toLowerCase().includes(query.trim().toLowerCase()));
 const shownEligible=shown.filter(r=>r.collection_selectable&&r.verification_state==='verified');
 const selectedAmount=picked.reduce((n,r)=>n+Math.round(r.open*100),0)/100;
 return <>
  <header className="queue-detail-heading"><div className="queue-detail-context"><span className={'queue-hotel '+group.hotel.toLowerCase()}>{group.hotel}</span><span>{group.type}</span><strong title="Open amount">{money(group.amount)}</strong></div><h2>{group.name}</h2><span className="queue-action-badge">{label}</span>
   <dl className="queue-detail-facts"><div><dt>Invoices</dt><dd>{group.rows.length}</dd></div><div><dt>{canPrepare?'Ready / upcoming':'Availability'}</dt><dd>{canPrepare?`${group.ready} / ${group.rows.length-group.ready}`:label}</dd></div></dl>
  </header>
  <div className="queue-invoice-tools"><label className="queue-find"><Search size={15} aria-hidden="true"/><input type="search" aria-label="Search selected account invoices" placeholder="Invoice, folio or guest" value={query} onChange={e=>setQuery(e.target.value)}/></label><div><span>{shown.length} shown</span><button disabled={!canPrepare||!shownEligible.length||shownEligible.every(r=>selected.has(r.id))} onClick={()=>onSelect(shownEligible.map(r=>r.id))}>Select all shown</button><button disabled={!picked.length} onClick={onClear}>Clear selection</button></div></div>
  <div className="queue-invoice-list" role="group" aria-label="Invoices in selected work">{shown.map(r=><label key={r.id} className={selected.has(r.id)?'selected':''}><input type="checkbox" aria-label={`Queue select ${r.invoice_no??r.id}`} checked={selected.has(r.id)} disabled={!canPrepare||!r.collection_selectable||r.verification_state!=='verified'} onChange={()=>onToggle(r.id)}/><span className="queue-invoice-copy"><span className="queue-invoice-top"><b>{r.invoice_no??'Invoice unavailable'}</b><strong>{money(r.open)}</strong></span><small>{r.guest}{r.folio_no?' · Folio '+r.folio_no:''}</small><small>Latest sent: {stageLabel(r.action.latest,undefined,r.workflow?.last_reminder_stage_snapshot??legacyStageSnapshot(r.action.latest))}</small><span className={'queue-invoice-timing '+(group.purpose==='Review'?'attention':r.action.ready?'ready':'upcoming')}>{group.purpose==='Review'?label:r.action.ready?'Ready':'Upcoming'}{r.action.date?' · '+r.action.date:''}</span>{r.action.reason&&<small className="queue-warning">{r.action.reason}</small>}</span></label>)}{!shown.length&&<div className="queue-invoice-empty">No invoices match this search.</div>}</div>
  <footer className="queue-selection-footer"><div aria-live="polite" aria-atomic="true"><span>{picked.length} selected</span><strong>THB {selectedAmount.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div>{canPrepare&&<button className="primary-button" disabled={!picked.length} onClick={onPrepare}><FileText size={16}/>Prepare documents<ChevronRight size={16}/></button>}<button className="queue-account-open" onClick={onAccount}>Open account details<ChevronRight size={15}/></button></footer>
 </>;
}
