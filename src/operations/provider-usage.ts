/** Provider billing evidence is separate from application diagnostics and operation admission. */
export type ProviderId='cloudflare'|'supabase';
export type UsageUnit='count'|'ms'|'bytes'|'GB'|'GB-month';
export type UsageState='available'|'stale'|'unavailable';
export type QuotaSeverity='normal'|'warning'|'exceeded'|'unknown';
export interface ProviderQuotaMetric {
 id:string;label:string;product:string;unit:UsageUnit;used:number|null;included:number|null;
 scope:'account'|'organization'|'project';scopeLabel:string;
 periodStart:string|null;periodEnd:string|null;periodLabel:string;periodBasis:'billing-cycle'|'instantaneous'|'unknown';
 observedAt:string|null;verifiedAt:string;staleAfter:string;
 source:'provider_api'|'provider_snapshot';sourceLabel:string;precision:'exact'|'rounded';state:UsageState;
}
export interface ProviderUsage {provider:ProviderId;planLabel:string|null;warningPercent:number;settingsRevision:number;metrics:ProviderQuotaMetric[]}
export interface ProviderUsageResponse {providers:ProviderUsage[]}
const record=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const text=(v:unknown,max=160):v is string=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
const instant=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
const quantity=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
function parseMetric(value:unknown,now:number):ProviderQuotaMetric|null {
 const m=record(value);
 if(!text(m.id,80)||! /^[a-z][a-z0-9_-]*$/.test(m.id)||!text(m.label)||!text(m.product)||!text(m.scopeLabel)||!text(m.periodLabel))return null;
 if(!['count','ms','bytes','GB','GB-month'].includes(String(m.unit))||!['account','organization','project'].includes(String(m.scope))||!['billing-cycle','instantaneous','unknown'].includes(String(m.periodBasis))||!['exact','rounded'].includes(String(m.precision))||!['provider_api','provider_snapshot'].includes(String(m.source))||!['available','stale','unavailable'].includes(String(m.state)))return null;
 if(!instant(m.verifiedAt)||!instant(m.staleAfter)||Date.parse(m.staleAfter)<=Date.parse(m.verifiedAt)||!(m.observedAt===null||instant(m.observedAt)))return null;
 if(!((m.periodStart===null&&m.periodEnd===null)||(instant(m.periodStart)&&instant(m.periodEnd)&&Date.parse(m.periodStart)<Date.parse(m.periodEnd))))return null;
 if(m.periodBasis==='instantaneous'&&(m.periodStart!==null||m.periodEnd!==null))return null;
 const state=m.state==='unavailable'?'unavailable':m.state==='stale'||Date.parse(m.staleAfter)<=now||(typeof m.periodEnd==='string'&&Date.parse(m.periodEnd)<=now)?'stale':'available';
 return {id:m.id,label:m.label,product:m.product,unit:m.unit as UsageUnit,used:quantity(m.used),included:quantity(m.included),scope:m.scope as ProviderQuotaMetric['scope'],scopeLabel:m.scopeLabel,periodStart:m.periodStart as string|null,periodEnd:m.periodEnd as string|null,periodLabel:m.periodLabel,periodBasis:m.periodBasis as ProviderQuotaMetric['periodBasis'],observedAt:m.observedAt as string|null,verifiedAt:m.verifiedAt,staleAfter:m.staleAfter,source:m.source as ProviderQuotaMetric['source'],sourceLabel:m.source==='provider_snapshot'?'Last verified':'Provider API',precision:m.precision as ProviderQuotaMetric['precision'],state};
}
export function parseProviderUsage(value:unknown,now=Date.now()):ProviderUsageResponse {
 const input=record(value).providers;
 return {providers:(['cloudflare','supabase'] as const).map(provider=>{
  const p=record(Array.isArray(input)?input.find(v=>record(v).provider===provider):null);
  const metrics:ProviderQuotaMetric[]=[];
  if(Array.isArray(p.metrics)&&p.metrics.length<=64)for(const value of p.metrics){const m=parseMetric(value,now);if(m&&!metrics.some(existing=>existing.id===m.id))metrics.push(m);}
  return {provider,planLabel:text(p.planLabel)?p.planLabel:null,warningPercent:Number.isInteger(p.warningPercent)&&Number(p.warningPercent)>=1&&Number(p.warningPercent)<=100?Number(p.warningPercent):provider==='cloudflare'?80:50,settingsRevision:Number.isSafeInteger(p.settingsRevision)&&Number(p.settingsRevision)>=0?Number(p.settingsRevision):0,metrics};
 })};
}
export function quotaMetricSeverity(metric:ProviderQuotaMetric,warningPercent:number):QuotaSeverity {
 if(metric.state==='unavailable'||quantity(metric.used)===null||quantity(metric.included)===null||metric.included!<=0||!Number.isInteger(warningPercent)||warningPercent<1||warningPercent>100)return 'unknown';
 const percent=metric.used!/metric.included!*100;
 return percent>=100?'exceeded':percent>=warningPercent?'warning':'normal';
}
