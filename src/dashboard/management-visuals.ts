import type {ManagementDashboardData} from '../../worker/dashboard/management-model';

/** Ratios are presentation-only; exact source amounts remain visible alongside. */
export function billingCompletion(data:ManagementDashboardData|undefined){
 const billed=data?.metrics.find(c=>c.key==='billed'),unbilled=data?.metrics.find(c=>c.key==='unbilled');
 if(!data?.complete||billed?.amount==null||unbilled?.amount==null)return null;
 const done=Number(billed.amount),remaining=Number(unbilled.amount);
 if(!Number.isFinite(done+remaining)||done<0||remaining<0)return null;
 return {done,remaining,total:done+remaining,percent:done+remaining>0?done/(done+remaining)*100:null};
}

export function attentionAccounts(data:ManagementDashboardData|undefined){
 if(!data?.agesComplete)return [];
 return [...data.accountsOver60??[]].sort((a,b)=>Number(b.unbilledAmount)-Number(a.unbilledAmount)||Number(b.amount)-Number(a.amount)||b.oldest-a.oldest||a.hotel.localeCompare(b.hotel)||a.accountId.localeCompare(b.accountId));
}

/** Signed bars use a shared absolute scale: credits never become positive debt. */
export function agingPlot(data:ManagementDashboardData|undefined){
 if(!data?.agesComplete)return null;
 if(data.hotels.some(h=>h.bands.some(b=>b.amount===null)))return null;
 const rows=data.hotels.map(h=>({...h,positive:h.bands.reduce((n,b)=>n+Math.max(0,Number(b.amount)),0),negative:h.bands.reduce((n,b)=>n+Math.max(0,-Number(b.amount)),0)}));
 const positive=Math.max(0,...rows.map(h=>h.positive)),negative=Math.max(0,...rows.map(h=>h.negative));
 return {rows,scale:positive+negative,negativeShare:positive+negative?negative/(positive+negative)*100:0};
}
