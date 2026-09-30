import {regionHotels,type RegionId} from '../domain/hotels';
import type {CSSProperties} from 'react';
import {Check,ChevronRight} from 'lucide-react';
import type {AgingBucket} from '../domain/portfolio';
import {agingBucketKey,agingPercentage,agingRegion,type AgingHotel,type AgingCell,type agingOverview} from './aging-model';
import './aging-overview.css';
import type {AgingCount} from './aging-invoice-data';

/* Aging overview: a light mint balance field meets one chronological distribution.
   All six source ranges retain exact THB values; selection highlights without hiding data.
   The chart is a part-to-whole only when source evidence supports that claim. */
interface Props {region?:RegionId;data:ReturnType<typeof agingOverview>;columns:AgingBucket[];label:string;selectedKey:string;onSelect:(key:string)=>void;counts?:Partial<Record<AgingHotel,AgingCount>>}
const formatter=new Intl.NumberFormat('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
const amount=(value:number|null)=>value===null?'—':formatter.format(value);
const stateLabel:Record<AgingCell['state'],string>={verified:'',absent:'No matching account',outside:'Outside scope',unavailable:'Source unverified'};
const rangeColors=['#269d94','#68a8d3','#666bce','#ae91cd','#d5a03e','#d57571'];
const known=(cell:AgingCell|undefined):cell is AgingCell&{amount:number}=>cell?.state==='verified'&&cell.amount!==null&&Number.isFinite(cell.amount);
const cents=(value:number)=>Math.round(value*100);
const share=(value:number|null)=>value===null?'% unavailable':value!==0&&Math.abs(value)<.05?`${value<0?'−':''}<0.1%`:`${value.toFixed(1)}%`;

export default function AgingOverview({region,data,columns,label,selectedKey,onSelect,counts}:Props){
 const countText=(hotel:AgingHotel)=>counts?.[hotel]?.count==null?'—':counts![hotel]!.count!.toLocaleString('en-GB');
 const total=data.net.Total;
 const ranges=columns.map((bucket,index)=>({bucket,key:agingBucketKey(bucket),cell:data.cells[index]?.Total,color:rangeColors[index%rangeColors.length]}));
 const complete=ranges.length>0&&ranges.every(({cell})=>known(cell));
 const values=ranges.map(({cell})=>known(cell)?cell.amount:null);
 const sum=complete?values.reduce<number>((running,value)=>running+cents(value!),0):null;
 const reconciles=complete&&known(total)&&Number.isSafeInteger(sum)&&sum===cents(total.amount);
 const distribution=reconciles&&total.amount!>0&&values.every(value=>value!==null&&value>=0);
 const zero=reconciles&&values.every(value=>value===0);
 const mode=distribution?'distribution':zero?'zero':complete&&known(total)?'signed':'unavailable';
 const selected=ranges.find(range=>range.key===selectedKey);
 const selectedPercent=selected&&known(selected.cell)&&known(total)?agingPercentage(selected.cell.amount,total.amount):null;
 const hotels=regionHotels(region??agingRegion(data.members)).filter(hotel=>data.net[hotel].state!=='outside');
 const note=mode==='distribution'?'Share of net open · all source ranges'
  :mode==='zero'?'Verified net balances are zero.'
  :mode==='unavailable'?'Source verification required · only verified values are shown.'
  :!reconciles?'Range total differs from net open. Bars use one signed THB scale.'
  :'Credits extend left of zero. Percentages use signed net open.';

 return <section className="aging-v4-overview" aria-label="Current aging overview" data-chart-mode={mode}>
  <div className="aging-v4-balance">
   <div className="aging-v4-balance-heading"><h3>Net open · all ages</h3><span>THB</span></div>
   <strong className="aging-v4-net">{amount(known(total)?total.amount:null)}</strong>
   <p className="aging-v4-invoice-total" aria-label="Total open invoice count"><strong>{countText('Total')}</strong> open invoices</p>
   {!known(total)&&<p className="aging-v4-source-state">{stateLabel[total.state]||'Source unverified'}</p>}
   <div className="aging-v4-hotels">{hotels.map(hotel=>{
    const cell=data.net[hotel];
    return <div className="aging-v4-hotel" key={hotel}>
     <span className={'aging-v4-property aging-v4-property-'+hotel.toLowerCase()}><i aria-hidden="true"/>{hotel}</span>
     <strong>{amount(known(cell)?cell.amount:null)}</strong>
     <small className="aging-v4-invoice-count"><span aria-label={`${hotel} open invoice count`}>{countText(hotel)} invoices</span> · {data.members.filter(a=>a.hotel===hotel).length} accounts{known(cell)&&known(total)&&agingPercentage(cell.amount,total.amount)!==null?` · ${agingPercentage(cell.amount,total.amount)!.toFixed(1)}%`:''}</small>
     {!known(cell)&&<small>{stateLabel[cell.state]||'Source unverified'}</small>}
    </div>;
   })}</div>
   <p className="aging-v4-scope"><span>{label}</span><span>{data.members.length.toLocaleString()} hotel accounts</span></p>
  </div>
  <div className="aging-v4-profile">
   <div className="aging-v4-profile-heading"><h3>Age of open balances</h3><span>THB · % of net</span></div>
   {mode==='signed'?<div className="aging-v4-signed" aria-label="Signed aging balances">
    <p className="aging-v4-signed-caption">Credits extend left of zero · THB</p>
    <div className="aging-v4-signed-axis" aria-hidden="true"><span className="aging-v4-signed-scale"><span>Credits</span><span>0</span><span>Open balances</span></span></div>
    {ranges.map((range,index)=>{
     const value=values[index]!,active=range.key===selectedKey,max=Math.max(...values.map(v=>Math.abs(v??0)),1),end=300+value/max*290;
     return <button type="button" className="aging-v4-signed-range" key={range.key} aria-label={`Compare ${range.bucket.label} days`} aria-pressed={active} onClick={()=>onSelect(range.key)}>
      <span className="aging-v4-signed-label">{range.bucket.label}<small>days</small></span>
      <svg viewBox="0 0 600 20" preserveAspectRatio="none" aria-hidden="true"><line x1="300" x2="300" y1="0" y2="20" stroke="currentColor"/><rect x={Math.min(300,end)} y="5" width={Math.abs(end-300)} height="10" rx="2" fill={range.color}/>{value!==0&&<circle cx={end} cy="10" r="2.5" fill={range.color}/>}</svg>
      <strong>{amount(value)}</strong><span className="aging-v4-signed-share">{share(known(total)?agingPercentage(value,total.amount):null)}</span>
     </button>;
    })}
   </div>:<div className="aging-v4-distribution">
    <div className="aging-v4-chart">
     {distribution?<>
      <svg className="aging-v4-ring" viewBox="0 0 180 180" role="img" aria-label="Aging distribution: verified nonnegative ranges as shares of net open">
       <circle cx="90" cy="90" r="67" fill="none" stroke="#edf0f5" strokeWidth="20"/>
       {ranges.map((range,index)=>{
        const percentage=values[index]!/total.amount!*100;
        const previous=values.slice(0,index).reduce<number>((running,value)=>running+value!,0)/total.amount!*100;
        return percentage>0?<circle key={range.key} cx="90" cy="90" r="67" fill="none" stroke={range.color} strokeWidth={range.key===selectedKey?25:20} pathLength="100" strokeDasharray={`${percentage} ${100-percentage}`} strokeDashoffset={-previous} transform="rotate(-90 90 90)" className={range.key===selectedKey?'is-selected':''}/>:null;
       })}
      </svg>
      <div className="aging-v4-ring-label" aria-hidden="true"><strong>{selectedPercent===null?'All ages':`${selectedPercent.toFixed(1)}%`}</strong><span>{selected?`${selected.bucket.label} days`:'of net open'}</span></div>
     </>:mode==='zero'?<div className="aging-v4-chart-message"><strong>0.00</strong><span>Net balance is zero</span></div>
      :mode==='unavailable'?<div className="aging-v4-chart-message"><strong>—</strong><span>Distribution unavailable</span></div>
      :null}
    </div>
    {distribution&&<div className="aging-v4-mobile-track" aria-hidden="true">{ranges.map((range,index)=><span key={range.key} style={{width:`${values[index]!/total.amount!*100}%`,backgroundColor:range.color}}/>)}</div>}
    <div className="aging-v4-ranges" aria-label="Select aging range">{ranges.map(range=>{
     const active=range.key===selectedKey;
     const percentage=known(range.cell)&&known(total)?agingPercentage(range.cell.amount,total.amount):null;
     return <button type="button" className={'aging-v4-range'+(active?' is-selected':'')} style={{'--aging-v4-range-color':range.color} as CSSProperties} key={range.key} aria-label={`Compare ${range.bucket.label} days`} aria-pressed={active} onClick={()=>onSelect(range.key)}>
      <span className="aging-v4-range-label"><i aria-hidden="true"/><span>{range.bucket.label} <small>days</small></span>{active?<Check size={13} aria-hidden="true"/>:<ChevronRight size={13} aria-hidden="true"/>}</span>
      <strong>{amount(known(range.cell)?range.cell.amount:null)}</strong>
      <span className="aging-v4-range-share">{!known(range.cell)?stateLabel[range.cell?.state??'unavailable']:share(percentage)}</span>
     </button>;
    })}</div>
   </div>}
   {(mode==='unavailable'||!reconciles)&&<p className="aging-v4-chart-note">{note}</p>}
  </div>
 </section>;
}
