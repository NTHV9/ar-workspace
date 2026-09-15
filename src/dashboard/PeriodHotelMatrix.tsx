import type {CSSProperties} from 'react';
import type {HotelId} from '../domain/hotels';
import {HotelSplit,type HotelMeasure} from './HotelSplit';
import {amount,number} from './period-data';
import './period-hotel-matrix.css';

export interface MatrixColumn {
 key:string;
 label:string;
 id:string;
 unit?:string;
 measures:HotelMeasure[];
 total?:{count?:number|null;amount?:string|number|null;onOpen?:()=>void;disabled?:boolean;countId?:string;amountId?:string;note?:string};
}

export function PeriodHotelMatrix({title,description,hotels,columns,showTotals=false,className=''}:{title:string;description?:string;hotels:readonly HotelId[];columns:MatrixColumn[];showTotals?:boolean;className?:string}){
 return <section className={'period-hotel-matrix '+className}>
  <header className="period-hotel-matrix-heading"><h3>{title}</h3>{description&&<p>{description}</p>}</header>
  <div className="period-hotel-matrix-scroll" tabIndex={0} role="region" aria-label={title+' comparison'}>
   <table aria-label={title} style={{'--matrix-min-width':96+columns.length*160+'px'} as CSSProperties}>
    <thead><tr><th scope="col">Hotel</th>{columns.map(column=><th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
    <tbody>
     {showTotals&&<tr className="period-hotel-matrix-total"><th scope="row">All hotels</th>{columns.map(column=>{
      const total=column.total,unit=column.unit??'invoices';
      const contents=<>{total?.count!==undefined&&<strong className="period-hotel-matrix-count" data-testid={total.countId}>{number(total.count)} <small>{unit}</small></strong>}<b data-testid={total?.amountId}>{amount(total?.amount)}</b>{total?.note&&<small className="period-hotel-matrix-note">{total.note}</small>}</>;
      return <td key={column.key} data-label={column.label}>{total?.onOpen?<button className="period-hotel-matrix-value" type="button" disabled={total.disabled} onClick={total.onOpen} aria-label={column.label+' · All hotels'+(total.count!==undefined?' · '+number(total.count)+' '+unit:'')+' · '+amount(total.amount)+(total.note?' · '+total.note:'')}>{contents}</button>:<div className="period-hotel-matrix-value">{contents}</div>}</td>;
     })}</tr>}
     {hotels.map(hotel=><tr key={hotel} data-hotel={hotel}>
      <th scope="row"><span className={'period-hotel-matrix-hotel '+hotel.toLowerCase()}><i aria-hidden="true"/>{hotel}</span></th>
      {columns.map(column=>{
       const measure=column.measures.find(row=>row.hotel===hotel)??{hotel,count:column.measures.some(row=>row.count!==undefined)?null:undefined,amount:null,disabled:true};
       return <td key={column.key} data-label={column.label}><HotelSplit rows={[measure]} id={column.id} label={column.label} unit={column.unit}/></td>;
      })}
     </tr>)}
    </tbody>
   </table>
  </div>
 </section>;
}
