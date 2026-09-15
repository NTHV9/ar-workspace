import {useState,type CSSProperties} from 'react';
import {ArrowUpRight,Check,Clock3,RefreshCw,Table2,TriangleAlert} from 'lucide-react';
import {regionLabel,type HotelId,type RegionId} from './domain/hotels';
import {money,type Account,type AgingBucket,type RefreshState} from './domain/portfolio';
import {buildPortfolioOverview,type OverviewHotel} from './domain/portfolio-overview';
import {agingBucketKey,agingPercentage} from './dashboard/aging-model';
import {refreshLabel} from './ui';
import './portfolio-overview.css';

const hotelStyle:Record<HotelId,{color:string;tint:string}>={KAT:{color:'#4169ff',tint:'#eff3ff'},TSK:{color:'#168c83',tint:'#eaf8f5'},TLKL:{color:'#397ba8',tint:'#eef6fc'},WAKL:{color:'#8b60ad',tint:'#f5f0fa'},TLFO:{color:'#9b6d17',tint:'#fcf6e8'},TSAN:{color:'#ae5365',tint:'#fbf0f2'}};
const ageColors=['#91b7f5','#6897ed','#8a80d5','#b497d3','#e1a459','#dc7d96'];
const displayAmount=(amount:number|null,exact=false)=>amount===null?'—':money(amount,!exact).replace(/^THB /,'');
const share=(value:number|null)=>value===null?'—':value.toFixed(1)+'%';
const boundedWidth=(value:number|null)=>Math.max(0,Math.min(100,value??0))+'%';

export function PortfolioFreshness({hotels,refresh,region,review}:{hotels:readonly HotelId[];refresh?:RefreshState;region:RegionId;review:boolean}){
 if(review)return <span className="portfolio-preview-label">Synthetic review</span>;
 return <div className="portfolio-freshness" aria-label="Hotel refresh status">{hotels.map(h=>{
  const text=refreshLabel(refresh,h,Date.now(),region),record=refresh?.hotels.find(r=>r.hotel===h);
  const valid=record?.last_success_at&&Number.isFinite(Date.parse(record.last_success_at));
  const kind=text.includes('Refreshing')?'running':text.includes('failed')?'failed':text.includes('Stale')?'stale':text.includes('Updated')?'updated':'unknown';
  const Icon=kind==='running'?RefreshCw:kind==='failed'||kind==='unknown'?TriangleAlert:kind==='stale'?Clock3:Check;
  return <span key={h} className={'portfolio-freshness-item '+kind} title={text} aria-label={text}><i style={{background:hotelStyle[h].color}}/><b>{h}</b><Icon size={12} aria-hidden="true"/>{kind==='failed'&&<span>Failed</span>}{valid?<time dateTime={record!.last_success_at!}>{new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'}).format(new Date(record!.last_success_at!))}</time>:<span>{kind==='running'?'Refreshing':'No data'}</span>}</span>;
 })}</div>;
}

interface Props {accounts:Account[];region:RegionId;hotel:string;review:boolean;refresh?:RefreshState;onSelectHotel:(hotel:string)=>void;onSelectAging?:(hotel:HotelId,bucket:AgingBucket|null)=>void}
export default function PortfolioOverview({accounts,region,hotel,review,refresh,onSelectHotel,onSelectAging}:Props){
 const [exact,setExact]=useState(false),[details,setDetails]=useState(false);
 const overview=buildPortfolioOverview(accounts,region,hotel,refresh,review);
 const cellContent=(row:OverviewHotel,bucket:AgingBucket)=>{
  const found=row.buckets?.find(b=>agingBucketKey(b)===agingBucketKey(bucket));
  if(!found)return <span className="portfolio-aging-unknown">—<small>{row.buckets?'Not in source':'Unavailable'}</small></span>;
  const content=<><strong>{displayAmount(found.amount,exact)}</strong><small>{share(agingPercentage(found.amount,row.amount))}</small>{details&&<span className="portfolio-aging-components"><span>Debit {displayAmount(found.debit,exact)}</span><span>Credit {displayAmount(found.credit,exact)}</span></span>}</>;
  return onSelectAging&&!review&&row.members.length?<button aria-label={`View ${row.hotel} invoices · ${bucket.label}`} title={money(found.amount,false)} onClick={()=>onSelectAging(row.hotel,found)}>{content}</button>:<span className="portfolio-aging-value" title={money(found.amount,false)}>{content}</span>;
 };
 return <section className="portfolio-summary-layout" aria-label="Portfolio overview">
  <section className="portfolio-total" aria-label="Total open AR"><div className="portfolio-total-amount"><div><span className="metric-label">{overview.partial?(overview.hasPublishedScope?'Partial open AR':'Open AR unavailable'):'Total open AR'}</span><small>THB</small></div><strong aria-label={overview.hasPublishedScope?money(overview.total,false):'Open AR unavailable'}>{overview.hasPublishedScope?displayAmount(overview.total):'—'}</strong></div><div className="portfolio-total-stats"><div><b>{overview.hasPublishedScope?overview.accountCount:'—'}</b><span>Accounts</span></div><div><b>{overview.hasPublishedScope?overview.itemCount:'—'}</b><span>Invoice / Folio items</span></div></div><div className="portfolio-total-scope"><span>{regionLabel(region)}</span><b>{hotel==='All'?`All ${overview.hotels.length} hotels`:hotel}</b>{overview.partial&&<small>Saved data only</small>}</div></section>
  <div className="portfolio-hotel-cards" aria-label="Hotel contribution" style={{'--hotel-count':overview.cards.length} as CSSProperties}>{overview.cards.map(row=><button key={row.hotel} className="portfolio-hotel-card" data-hotel={row.hotel} aria-label={`View ${row.hotel} portfolio`} aria-pressed={hotel===row.hotel} style={{'--hotel-color':hotelStyle[row.hotel].color,'--hotel-tint':hotelStyle[row.hotel].tint} as CSSProperties} onClick={()=>onSelectHotel(hotel===row.hotel?'All':row.hotel)}><div className="portfolio-hotel-head"><span className="portfolio-hotel-mark">{row.hotel}</span><span className="portfolio-hotel-share" title={`Share of ${regionLabel(region)} net open`}>{share(row.share)}<ArrowUpRight size={15}/></span></div><div className="portfolio-hotel-value"><small>THB</small><strong>{displayAmount(row.amount)}</strong></div><div className="portfolio-hotel-foot"><span>{row.accountCount===null?'Unavailable':`${row.accountCount} accounts`}</span><span>{row.itemCount===null?'—':`${row.itemCount} invoices`}</span></div><div className="portfolio-hotel-track" aria-hidden="true"><i style={{width:boundedWidth(row.share)}}/></div></button>)}</div>
  <section className="portfolio-aging"><header><div><h2>Aging by hotel</h2><p>{hotel==='All'?'Compare every source range side by side.':`${hotel} · Source aging ranges`}{review?' · Illustrative distribution':''}</p></div><button className="portfolio-amount-mode" onClick={()=>setExact(v=>!v)} aria-pressed={exact}><Table2 size={14}/>{exact?'Compact amounts':'Exact amounts'}</button></header>
   <div className={'portfolio-aging-scroll '+(exact?'portfolio-aging-exact':'')} tabIndex={0} role="region" aria-label="Hotel aging comparison"><table aria-label="Portfolio aging by hotel" style={{'--aging-column-count':overview.columns.length} as CSSProperties}><thead><tr><th scope="col">Hotel <small>THB</small></th>{overview.columns.map((b,i)=><th scope="col" key={agingBucketKey(b)} title={`${b.start??'Unknown'}–${b.end??'over'} days`}><i style={{background:ageColors[overview.columns.findIndex(column=>agingBucketKey(column)===agingBucketKey(b))%6]}}/>{b.label}<small>days</small></th>)}<th scope="col">Net open</th></tr></thead><tbody>{overview.rows.map(row=><tr key={row.hotel} data-hotel={row.hotel}><th scope="row"><span style={{color:hotelStyle[row.hotel].color}}>{row.hotel}</span>{row.buckets&&<div className="portfolio-age-mini" aria-hidden="true">{row.buckets.map((b,i)=>{const positive=row.buckets!.reduce((sum,b)=>sum+Math.max(0,b.amount),0);return <i key={agingBucketKey(b)} style={{width:boundedWidth(positive?Math.max(0,b.amount)/positive*100:0),background:ageColors[overview.columns.findIndex(column=>agingBucketKey(column)===agingBucketKey(b))%6]}}/>;})}</div>}</th>{overview.columns.map(b=>{const amount=row.buckets?.find(s=>agingBucketKey(s)===agingBucketKey(b))?.amount;return <td key={agingBucketKey(b)} className={b.start!==null&&b.start>90&&amount!==undefined&&amount>0?'portfolio-aged-amount':''}>{cellContent(row,b)}</td>;})}<td className="portfolio-net-amount">{onSelectAging&&!review&&row.members.length?<button aria-label={`View ${row.hotel} invoices · All ages`} onClick={()=>onSelectAging(row.hotel,null)} title={row.amount===null?'Unavailable':money(row.amount,false)}><strong>{displayAmount(row.amount,exact)}</strong><small>{row.itemCount===null?'Unavailable':`${row.itemCount} invoices`}</small></button>:<span className="portfolio-aging-value"><strong>{displayAmount(row.amount,exact)}</strong><small>{row.itemCount===null?'Unavailable':`${row.itemCount} invoices`}</small></span>}</td></tr>)}</tbody></table></div>
   <footer><button onClick={()=>setDetails(v=>!v)} aria-expanded={details}>{details?'Hide':'Show'} debit / credit</button><span>{overview.columns.length} source ranges · THB</span><span><i/>Balances over 90 days</span></footer>
  </section>
 </section>;
}
