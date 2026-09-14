import type {DashboardBalancesResponse} from '../../worker/dashboard/model';
import {number} from './period-data';

const categories=[
 {key:'billed',label:'Billed'},
 {key:'unbilled',label:'Not billed'},
 {key:'not_required',label:'Billing not required'},
 {key:'setup',label:'Billing setup needed'},
] as const;

/** Independent status indicators. Setup can overlap other billing states;
 * never sum them or infer the positive population from signed open counts. */
export function billingStatusIndicators(metrics:readonly {key:string;count:number|null}[],expected:number|null|undefined,known:boolean){
 const counts=categories.map(c=>metrics.find(m=>m.key===c.key)?.count);
 const complete=known&&Number.isSafeInteger(expected)&&expected!>=0&&counts.every(v=>Number.isSafeInteger(v)&&v!>=0&&v!<=expected!);
 return {complete,total:complete?expected!:null,segments:categories.map((c,i)=>({...c,count:complete?counts[i]!:null,share:complete&&expected!>0?counts[i]!/expected!*100:null}))};
}

export function BillingStatusOverview({data,canDrill,onOpen}:{data?:DashboardBalancesResponse;canDrill:boolean;onOpen:(metric:string)=>void}){
 const expected=data?.openBalanceBreakdown?.positive.count;
 const model=billingStatusIndicators(data?.metrics??[],expected,!!data?.complete);
 return <div className="period-billing-status" role="group" aria-label={model.complete?`Billing status for ${number(model.total)} positive invoices`:'Billing status percentages unavailable'}>
  <header><h3>Billing status</h3><span><strong>{number(model.total)}</strong> positive invoices</span></header>
  <div className="period-billing-categories">{model.segments.map(s=><button key={s.key} type="button" data-billing={s.key} aria-label={`View ${s.label.toLowerCase()} invoices in billing status · ${number(s.count)} invoices${s.share===null?'':' · '+s.share.toLocaleString('en-GB',{maximumFractionDigits:1})+'%'}`} disabled={!canDrill} onClick={()=>onOpen(s.key)}>
   <span className="period-billing-category-name"><i aria-hidden="true"/>{s.label}</span>
   <strong>{number(s.count)} <small>invoices</small></strong><span className="period-billing-category-share">{s.share===null?'—':s.share.toLocaleString('en-GB',{maximumFractionDigits:1})+'%'}</span>
   <span className="period-billing-category-track" aria-hidden="true">{s.share!==null&&<i style={{width:s.share+'%'}}/>}</span>
  </button>)}</div>
  <p>Share of positive invoices. Billing setup can overlap other statuses.</p>
 </div>;
}
