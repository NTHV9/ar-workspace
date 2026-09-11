import {dashboardMetricKeys,type DashboardBalancesResponse,type DashboardPaymentInvoicesResponse} from '../../worker/dashboard/model';
import {count,decimal,validDay} from './model';
import {formatAmount} from '../remittance/money';
export const amount=(value:unknown)=>{const d=decimal(value);return d===null?'—':formatAmount(d);};
export const number=(value:unknown)=>count(value)===null?'—':Number(value).toLocaleString('en-GB');
export const stamp=(value:string|null|undefined)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+' ICT':'Not captured';
export const percent=(value:string|null|undefined,total:string|null|undefined)=>value!=null&&total!=null&&Number(total)>0?(Number(value)/Number(total)*100).toLocaleString('en-GB',{maximumFractionDigits:1})+'%':'—';
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const metric=(v:unknown)=>object(v)&&(v.count===null||count(v.count)!==null)&&(v.amount===null||decimal(v.amount)!==null);
export function balancesResult(value:unknown):DashboardBalancesResponse{
 if(!object(value)||!validDay(String(value.asOfDate))||!['current','snapshot','unavailable'].includes(String(value.mode))||typeof value.complete!=='boolean'||!Array.isArray(value.rows)||!Array.isArray(value.metrics)||!Array.isArray(value.stages)||!Array.isArray(value.missingHotels)||count(value.total)===null||count(value.unverified)===null)throw Error('dashboard_balances_invalid');
 if(value.metrics.some(m=>!metric(m)||!dashboardMetricKeys.includes(m.key as never))||value.stages.some(m=>!metric(m)||typeof m.key!=='string'||typeof m.label!=='string'))throw Error('dashboard_balances_invalid');
 if(value.rows.some(r=>!object(r)||!['KAT','TSK'].includes(String(r.hotel))||typeof r.accountId!=='string'||typeof r.invoiceId!=='string'||decimal(r.open)===null||typeof r.verified!=='boolean'))throw Error('dashboard_balances_invalid');
 const freshness=value.freshness;
 if(freshness!==undefined&&(!object(freshness)||!['refreshingHotels','failedHotels'].every(key=>Array.isArray(freshness[key])&&(freshness[key] as unknown[]).every(h=>h==='KAT'||h==='TSK'))))throw Error('dashboard_balances_invalid');
 return value as unknown as DashboardBalancesResponse;
}
export function paidInvoicesResult(value:unknown):DashboardPaymentInvoicesResponse{
 if(!object(value)||!Array.isArray(value.rows)||!object(value.summary)||typeof value.complete!=='boolean'||count(value.total)===null||count(value.unknownMappings)===null||!metric(value.summary)||value.rows.some(r=>!object(r)||typeof r.hotel!=='string'||typeof r.invoiceId!=='string'||typeof r.accountId!=='string'||count(r.paymentCount)===null||r.amount!==null&&decimal(r.amount)===null))throw Error('dashboard_payments_invalid');
 return value as unknown as DashboardPaymentInvoicesResponse;
}
export const balanceLabels:Record<string,string>={open:'All outstanding invoices',billed:'Billing required · billed',unbilled:'Billing required · not billed',not_required:'Billing not required',setup:'Billing setup needed',past_due:'Past Due date',over60:'Invoice age over 60 days',over60_unbilled:'Over 60 days · not billed'};
export const rangeLabel=(from:string,to:string)=>from===to?from:from+' → '+to;

export function financialMembershipKnown(summary:{unknownAmounts?:number;notObserved?:number;unknownSourceDates?:number}){return [summary.unknownAmounts,summary.notObserved,summary.unknownSourceDates].every(v=>v===0);}
