import {ArrowDown,ArrowUp,ArrowUpDown} from 'lucide-react';
import './table-sort.css';

export type SortValue=string|number|null|undefined;
const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
/** Missing values stay last in either direction; callers supply a stable identity tie-break. */
export function compareValues(a:SortValue,b:SortValue,descending=false){
 const missing=(v:SortValue)=>v==null||v===''||typeof v==='number'&&!Number.isFinite(v);
 if(missing(a)||missing(b))return missing(a)===missing(b)?0:missing(a)?1:-1;
 return (typeof a==='number'&&typeof b==='number'?a-b:collator.compare(String(a),String(b)))*(descending?-1:1);
}
export function SortButton({label,active,descending,onClick}:{label:string;active:boolean;descending:boolean;onClick:()=>void}){
 const Icon=active?(descending?ArrowDown:ArrowUp):ArrowUpDown;
 return <button type="button" className="table-sort-button" aria-label={`Sort by ${label}`} onClick={onClick}>{label}<Icon size={12} aria-hidden="true"/></button>;
}
