import {ChevronRight,FileText,X} from 'lucide-react';
import type {BatchSelection} from './selection';
export function SelectionSummary({groups,onRemove,onClear,onPrepare,disabled=false}:{groups:BatchSelection[];onRemove:(key:string)=>void;onClear:()=>void;onPrepare:()=>void;disabled?:boolean}){
 const accounts=new Set(groups.map(g=>JSON.stringify([g.hotel,g.accountId]))).size;
 const count=groups.reduce((n,g)=>n+g.ids.length,0),amount=groups.reduce((n,g)=>n+Math.round(g.amount*100),0)/100;
 return <footer className="queue-selection-footer batch-selection-footer"><details className="batch-basket">
  <summary><span>{accounts} {accounts===1?'account':'accounts'} · {count} invoices selected</span><strong>THB {amount.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></summary>
  <section aria-label="Selected account work"><header><strong>Selected work</strong><button onClick={onClear}>Clear all</button></header>{groups.map(g=><div key={g.key}><span><b>{g.accountName}</b><small>{g.hotel} · {g.stage} · {g.ids.length} invoices</small></span><button aria-label={`Remove selected ${g.accountName} ${g.hotel} ${g.stage}`} onClick={()=>onRemove(g.key)}><X size={15}/></button></div>)}</section>
 </details><button className="primary-button" disabled={disabled||!count} onClick={onPrepare}><FileText size={17}/>Prepare documents<ChevronRight size={17}/></button></footer>;
}
