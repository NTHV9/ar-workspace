import {quotaMetricSeverity,type ProviderUsageResponse} from './provider-usage';
import './provider-quota.css';
export function ProviderQuotaNotice({data,onOpenStorage}:{data:ProviderUsageResponse|null;onOpenStorage:()=>void}){
 if(!data)return null;
 const notices=data.providers.flatMap(provider=>{const name=provider.provider==='cloudflare'?'Cloudflare':'Supabase';const known=provider.metrics.filter(m=>m.state==='available');const exceeded=known.some(m=>quotaMetricSeverity(m,provider.warningPercent)==='exceeded');const warning=known.some(m=>quotaMetricSeverity(m,provider.warningPercent)==='warning');const incomplete=!provider.metrics.length||provider.metrics.some(m=>m.state!=='available'||quotaMetricSeverity(m,provider.warningPercent)==='unknown');return exceeded?[`${name}: Included quota exceeded. Usage continues to be counted; the app has not paused work.`]:warning?[`${name} usage has reached the ${provider.warningPercent}% warning level. Work continues.`]:incomplete?[`${name}: Current provider usage is unavailable or incomplete. Review last-known evidence in Storage. Work continues.`]:[];});
 if(!notices.length)return null;
 return <aside className="provider-quota-notice" role="status" aria-live="polite" aria-label="Provider usage notices"><div>{notices.map(text=><p key={text}>{text}</p>)}</div><button onClick={onOpenStorage}>View provider usage</button></aside>;
}
