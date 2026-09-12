import type {CSSProperties} from 'react';
import {Check,ChevronRight} from 'lucide-react';
import type {AgingBucket} from '../domain/portfolio';
import {agingBucketKey,agingPercentage,type AgingCell,type agingOverview} from './aging-model';
import './aging-overview.css';

/* Aging overview: a light mint balance field meets one chronological distribution.
   All six source ranges retain exact THB values; selection highlights without hiding data.
   The chart is a part-to-whole only when source evidence supports that claim. */
interface Props {data:ReturnType<typeof agingOverview>;columns:AgingBucket[];label:string;selectedKey:string;onSelect:(key:string)=>void}
const formatter=new Intl.NumberFormat('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
const amount=(value:number|null)=>value===null?'—':formatter.format(value);
const stateLabel:Record<AgingCell['state'],string>={verified:'',absent:'No matching account',outside:'Outside scope',unavailable:'Source unverified'};
const rangeColors=['#269d94','#68a8d3','#666bce','#ae91cd','#d5a03e','#d57571'];
const known=(cell:AgingCell|undefined):cell is AgingCell&{amount:number}=>cell?.state==='verified'&&cell.amount!==null&&Number.isFinite(cell.amount);
const cents=(value:number)=>Math.round(value*100);

export default function AgingOverview({data,columns,label,selectedKey,onSelect}:Props){
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
 const hotels=(['KAT','TSK'] as const).filter(hotel=>data.net[hotel].state!=='outside');
 const note=mode==='distribution'?'Share of net open · all source ranges'
  :mode==='zero'?'Verified source balances are zero.'
  :mode==='unavailable'?'Source verification required · only verified values are shown.'
  :!reconciles?'Range total differs from net open. Bars use one signed THB scale.'
  :'Credits extend left of zero. Percentages use signed net open.';

 return <section className="aging-v4-overview" aria-label="Current aging overview" data-chart-mode={mode}>
  <div className="aging-v4-balance">
   <div className="aging-v4-balance-heading"><h3>Net open · all ages</h3><span>THB</span></div>
   <strong className="aging-v4-net">{amount(known(total)?total.amount:null)}</strong>
   {!known(total)&&<p className="aging-v4-source-state">{stateLabel[total.state]||'Source unverified'}</p>}
   <div className="aging-v4-hotels">{hotels.map(hotel=>{
    const cell=data.net[hotel];
    return <div className="aging-v4-hotel" key={hotel}>
     <span className={'aging-v4-property aging-v4-property-'+hotel.toLowerCase()}><i aria-hidden="true"/>{hotel}</span>
     <strong>{amount(known(cell)?cell.amount:null)}</strong>
     {!known(cell)&&<small>{stateLabel[cell.state]||'Source unverified'}</small>}
    </div>;
   })}</div>
   <p className="aging-v4-scope"><span>{label}</span><span>{data.members.length.toLocaleString()} hotel accounts</span></p>
  </div>
  <div className="aging-v4-profile">
   <div className="aging-v4-profile-heading"><h3>Age of open balances</h3><span>THB · % of net</span></div>
   <div className="aging-v4-distribution">
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
     </>:mode==='zero'?<div className="aging-v4-chart-message"><strong>0.00</strong><span>No open balance</span></div>
      :mode==='unavailable'?<div className="aging-v4-chart-message"><strong>—</strong><span>Distribution unavailable</span></div>
      :<SignedProfile values={values} colors={ranges.map(range=>range.color)} selectedIndex={ranges.findIndex(range=>range.key===selectedKey)}/>}
    </div>
    {distribution&&<div className="aging-v4-mobile-track" aria-hidden="true">{ranges.map((range,index)=><span key={range.key} style={{width:`${values[index]!/total.amount!*100}%`,backgroundColor:range.color}}/>)}</div>}
    <div className="aging-v4-ranges" aria-label="Select aging range">{ranges.map(range=>{
     const active=range.key===selectedKey;
     const percentage=known(range.cell)&&known(total)?agingPercentage(range.cell.amount,total.amount):null;
     return <button type="button" className={'aging-v4-range'+(active?' is-selected':'')} style={{'--aging-v4-range-color':range.color} as CSSProperties} key={range.key} aria-label={`Compare ${range.bucket.label} days`} aria-pressed={active} onClick={()=>onSelect(range.key)}>
      <span className="aging-v4-range-label"><i aria-hidden="true"/><span>{range.bucket.label} <small>days</small></span>{active?<Check size={13} aria-hidden="true"/>:<ChevronRight size={13} aria-hidden="true"/>}</span>
      <strong>{amount(known(range.cell)?range.cell.amount:null)}</strong>
      <span className="aging-v4-range-share">{!known(range.cell)?stateLabel[range.cell?.state??'unavailable']:percentage===null?'% unavailable':`${percentage.toFixed(1)}%`}</span>
     </button>;
    })}</div>
   </div>
   <p className="aging-v4-chart-note">{note}</p>
  </div>
 </section>;
}

function SignedProfile({values,colors,selectedIndex}:{values:(number|null)[];colors:string[];selectedIndex:number}){
 const minimum=Math.min(0,...values.map(value=>value??0)),maximum=Math.max(0,...values.map(value=>value??0));
 const span=maximum-minimum||1;
 const x=(value:number)=>12+(value-minimum)/span*156;
 const rowHeight=130/Math.max(values.length,1);
 return <svg className="aging-v4-signed-profile" viewBox="0 0 180 174" role="img" aria-label={`Signed range balances in THB on one scale from ${amount(minimum)} to ${amount(maximum)}. Credits extend left of zero.`}>
  <line x1={x(0)} x2={x(0)} y1="10" y2="148" stroke="#9aa9bd" strokeWidth="1"/>
  <text x={x(0)} y="164" textAnchor="middle">0</text>
  {values.map((value,index)=>value===null?null:<rect key={index} x={Math.min(x(0),x(value))} y={14+index*rowHeight} width={Math.abs(x(value)-x(0))} height={Math.min(12,rowHeight-5)} rx="2" fill={colors[index]} opacity={selectedIndex===index?1:.78}/>)}
 </svg>;
}
