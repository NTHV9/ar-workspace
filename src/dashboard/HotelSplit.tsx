import {amount,number} from './period-data';

export interface HotelMeasure {hotel:'KAT'|'TSK';count?:number|null;amount?:string|number|null;onOpen?:()=>void;disabled?:boolean}
export function HotelSplit({rows,id,label,unit='invoices',visual=false}:{visual?:boolean;rows:HotelMeasure[];id:string;label:string;unit?:string}){
 if(!rows.length)return null;
 const totals=rows.map(r=>r.amount==null?null:Number(r.amount)),sum=totals.every(n=>n!==null&&Number.isFinite(n)&&n>=0)?totals.reduce<number>((n,v)=>n+(v??0),0):0;
 return <div className="hotel-split" aria-label={label+' by hotel'}>{visual&&sum>0&&<div className="hotel-comparison-track" aria-hidden="true">{rows.map((r,i)=><i key={r.hotel} className={r.hotel.toLowerCase()} style={{width:(totals[i]??0)/sum*100+'%'}}/>)}</div>}{rows.map(row=>{
  const contents=<><span className={'hotel-split-name '+row.hotel.toLowerCase()}><i/>{row.hotel}</span>{row.count!==undefined&&<span className="hotel-split-count">{number(row.count)} <small>{unit}</small></span>}<b>{amount(row.amount)}</b></>;
  return row.onOpen?<button key={row.hotel} data-testid={id+'-'+row.hotel} aria-label={label+' · '+row.hotel+(row.count!==undefined?' · '+number(row.count)+' '+unit:'')+' · '+amount(row.amount)} disabled={row.disabled} onClick={row.onOpen}>{contents}</button>:<div key={row.hotel} data-testid={id+'-'+row.hotel}>{contents}</div>;
 })}</div>;
}
