import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RefreshState } from './domain/portfolio';
export function SortHead({ label, active, direction, onClick }: { label: string; active: boolean; direction: 'asc'|'desc'; onClick: () => void }) {
  return <th aria-sort={active ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button className="sort-button" onClick={onClick}>{label}{active ? direction === 'asc' ? <ArrowUp size={10}/> : <ArrowDown size={10}/> : <ArrowUpDown size={10}/>}</button></th>;
}
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder: string }) {
  return <label className="search"><Search size={13}/><input aria-label={placeholder} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)}/></label>;
}
export function Metric({ label, value, note, accent = '' }: { label: string; value: ReactNode; note?: string; accent?: string }) {
  return <div className={`metric ${accent}`}><span className="metric-label">{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}
export function refreshLabel(refresh?: RefreshState, hotel='All', now=Date.now()) {
  if(!refresh)return 'Refresh status unavailable';
  return (hotel==='All'?['KAT','TSK']:[hotel]).map(h=>{
    const row=refresh.hotels.find(r=>r.hotel===h);
    if(!row)return `${h} · Never refreshed`;
    const date=row.last_success_at?new Date(row.last_success_at):null;
    const valid=date&&!Number.isNaN(date.getTime());
    const stamp=valid?`${new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(date)} ICT`:'Never refreshed';
    const status=['queued','running'].includes(row.status)?'Refreshing':row.error_code||['failed','error'].includes(row.status)?'Refresh failed':valid&&now-date.getTime()>30*60*1000?'Stale':valid?'Updated':'';
    return `${h} · ${status?`${status} · `:''}${stamp}`;
  }).join(' / ');
}
export function Freshness({ review, refresh, hotel='All' }: { review: boolean; refresh?: RefreshState; hotel?: string }) { return <span className={`freshness ${review ? 'review' : ''}`}><i/>{review ? 'Synthetic review' : refreshLabel(refresh,hotel)}</span>; }
