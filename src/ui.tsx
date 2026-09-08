import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import type { ReactNode } from 'react';
export function SortHead({ label, active, direction, onClick }: { label: string; active: boolean; direction: 'asc'|'desc'; onClick: () => void }) {
  return <th aria-sort={active ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button className="sort-button" onClick={onClick}>{label}{active ? direction === 'asc' ? <ArrowUp size={10}/> : <ArrowDown size={10}/> : <ArrowUpDown size={10}/>}</button></th>;
}
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder: string }) {
  return <label className="search"><Search size={13}/><input aria-label={placeholder} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)}/></label>;
}
export function Metric({ label, value, note, accent = '' }: { label: string; value: ReactNode; note?: string; accent?: string }) {
  return <div className={`metric ${accent}`}><span className="metric-label">{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}
export function Freshness({ review }: { review: boolean }) { return <span className={`freshness ${review ? 'review' : ''}`}><i/>{review ? 'Synthetic review' : 'OPERA not connected'}</span>; }
