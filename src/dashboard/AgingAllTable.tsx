import {ChevronRight} from 'lucide-react';
import type {AgingBucket} from '../domain/portfolio';
import {agingBucketKey,agingPercentage,type AgingCell,type AgingComparisonRow,type AgingHotel} from './aging-model';
import './aging-all-table.css';
export interface AgingSort {key:string;hotel:AgingHotel;descending:boolean}
interface Props {rows:AgingComparisonRow[];columns:AgingBucket[];allColumns:AgingBucket[];showNet:boolean;percentages:boolean;hotel:string;type?:string;selectedKey:string;sort:AgingSort;onSort:(key:string)=>void;onDrill:(row:AgingComparisonRow,hotel:AgingHotel,bucket?:AgingBucket)=>void}
const amount=(n:number|null)=>n===null?'—':new Intl.NumberFormat('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const stateText:Record<AgingCell['state'],string>={verified:'',absent:'No account',outside:'Outside scope',unavailable:'Unverified'};
export default function AgingAllTable({rows,columns,allColumns,showNet,percentages,hotel,type,selectedKey,sort,onSort,onDrill}:Props){
 const hotels:AgingHotel[]=hotel==='KAT'||hotel==='TSK'?[hotel]:['TSK','KAT','Total'];
 const measures=[...(showNet?[{key:'net',label:'Net open',bucket:undefined as AgingBucket|undefined}]:[]),...columns.map(bucket=>({key:agingBucketKey(bucket),label:bucket.label,bucket}))];
 const cell=(row:AgingComparisonRow,h:AgingHotel,key:string):AgingCell=>key==='net'?row.net[h]:row.cells[allColumns.findIndex(b=>agingBucketKey(b)===key)]?.[h]??{amount:null,state:'unavailable',debit:null,credit:null};
 const name=(row:AgingComparisonRow)=><><button className="aging-group-name aging-row-link" aria-label={type===undefined?`Open accounts in ${row.name}`:`Open invoices for ${row.name}`} onClick={()=>onDrill(row,'Total',allColumns.find(b=>agingBucketKey(b)===selectedKey))}>{row.name}<ChevronRight size={14}/></button><small className="aging-group-meta">{type===undefined?`${row.members.length} hotel accounts`:row.members.map(a=>`${a.hotel} · ${a.account_no||a.id}`).join(' / ')}</small></>;
 const value=(row:AgingComparisonRow,h:AgingHotel,key:string,bucket?:AgingBucket)=>{
  const c=cell(row,h,key),p=agingPercentage(c.amount,row.net[h].amount),content=<><strong className={c.amount!==null&&c.amount<0?'is-credit':''}>{amount(c.amount)}</strong>{c.state!=='verified'?<small>{stateText[c.state]}</small>:percentages&&bucket&&<small>{p===null?'% unavailable':`${p.toFixed(1)}%`}</small>}</>;
  return bucket?<button className="aging-value-button" aria-label={`${row.name} · ${h} · ${bucket.label}`} disabled={c.state==='absent'||c.state==='outside'} onClick={()=>onDrill(row,h,bucket)}>{content}</button>:<div className="aging-net-value">{content}</div>;
 };
 const sortLabel=(m:typeof measures[number])=>`Sort ${m.key==='net'?'net open':m.label} ${sort.hotel}`;
 const arrow=(key:string)=>sort.key===key?(sort.descending?' ↓':' ↑'):'';
 return <div className={'aging-comparison-frame'+(measures.length>8?' many-ranges':'')}>
  <table className="aging-all-table aging-desktop-table" aria-label="Current source aging comparison"><colgroup><col className="aging-name-col"/><col className="aging-hotel-col"/>{measures.map(m=><col key={m.key}/>)}</colgroup><thead><tr><th scope="col" aria-sort={sort.key==='name'?(sort.descending?'descending':'ascending'):'none'}><button onClick={()=>onSort('name')}>{type===undefined?'Account Type':'Matched Account'}{arrow('name')}</button></th><th scope="col">Hotel</th>{measures.map((m,index)=><th key={m.key} scope="col" data-band={m.bucket?allColumns.findIndex(b=>agingBucketKey(b)===m.key)%6:undefined} className={m.key===selectedKey?'is-selected':''} aria-sort={sort.key===m.key?(sort.descending?'descending':'ascending'):'none'}><button aria-label={sortLabel(m)} onClick={()=>onSort(m.key)}>{m.label}{arrow(m.key)}</button>{index===0&&<small>THB</small>}</th>)}</tr></thead>
   {rows.map(row=><tbody key={row.key} data-aging-group={row.key}>{hotels.map((h,index)=><tr key={h} className={'aging-hotel-row hotel-'+h.toLowerCase()}>{index===0&&<th rowSpan={hotels.length} scope="rowgroup" className="aging-group-identity">{name(row)}</th>}<th scope="row" className="aging-row-hotel"><span className={'aging-property-label '+h.toLowerCase()}>{h}</span></th>{measures.map(m=><td key={m.key} className={(m.key===selectedKey?'is-selected ':'')+(m.key==='net'?'is-net':'')}>{value(row,h,m.key,m.bucket)}</td>)}</tr>)}</tbody>)}
  </table>
  <table className="aging-all-table aging-mobile-table" aria-label="Current source aging comparison"><colgroup><col className="aging-mobile-range-col"/>{hotels.map(h=><col key={h}/>)}</colgroup><thead><tr><th scope="col">Range · THB</th>{hotels.map(h=><th key={h} scope="col"><span className={'aging-property-label '+h.toLowerCase()}>{h}</span></th>)}</tr></thead>{rows.map(row=><tbody key={row.key} data-aging-group={row.key}><tr><th className="aging-mobile-group-name" scope="rowgroup" colSpan={hotels.length+1}>{name(row)}</th></tr>{measures.map(m=><tr key={m.key} className={m.key===selectedKey?'is-selected':m.key==='net'?'is-net':''}><th scope="row" data-band={m.bucket?allColumns.findIndex(b=>agingBucketKey(b)===m.key)%6:undefined}>{m.label}</th>{hotels.map(h=><td key={h}>{value(row,h,m.key,m.bucket)}</td>)}</tr>)}</tbody>)}</table>
  {!rows.length&&<p className="aging-empty">No current accounts match these filters.</p>}
 </div>;
}
