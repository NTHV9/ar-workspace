import {isHotelId,regionHotels,type RegionId} from '../domain/hotels';
import {amountToSatang} from '../remittance/money';
import {count,decimal,validDay} from './model';
import type {ManagementDashboardData,ManagementAccount} from '../../worker/dashboard/management-model';
import {compareValues} from '../table-sort';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const nullableCount=(v:unknown)=>v===null||count(v)!==null;
const measure=(v:unknown)=>object(v)&&nullableCount(v.count)&&(v.amount===null||decimal(v.amount)!==null);
export function managementResult(value:unknown,region:RegionId,hotel:string,from:string,to:string):ManagementDashboardData{
 const fail=():never=>{throw Error('dashboard_management_invalid');};
 if(!object(value)||value.from!==from||value.to!==to||value.asOfDate!==to||!validDay(to)||!['current','snapshot','unavailable'].includes(String(value.mode))||!['complete','agesComplete','cohortComplete'].every(k=>typeof value[k]==='boolean'))fail();
 const v=value as unknown as ManagementDashboardData,hotels=hotel==='All'?regionHotels(region):[hotel];
 if(!Array.isArray(v.hotels)||v.hotels.length!==hotels.length||v.hotels.some((h,i)=>!measure(h)||h.hotel!==hotels[i]||!isHotelId(h.hotel)||!Array.isArray(h.bands)||h.bands.length!==6||h.bands.some((b,i)=>!measure(b)||b.key!==i||typeof b.label!=='string')||![h.credits,h.over60,h.over90,h.unbilled61].every(nullableCount)||h.creditAmount!==null&&decimal(h.creditAmount)===null))fail();
 if(!Array.isArray(v.metrics)||v.metrics.some(m=>!measure(m)||typeof m.key!=='string')||!Array.isArray(v.types)||v.types.some(t=>!measure(t)||typeof t.type!=='string'||!nullableCount(t.over60)))fail();
 const keys=['issued','billed','unbilled','not_required','setup','credit'];
 if(!Array.isArray(v.cohort)||v.cohort.length!==6||new Set(v.cohort.map(c=>c.key)).size!==6||v.cohort.some(c=>!measure(c)||!keys.includes(c.key)||typeof c.label!=='string'||!Array.isArray(c.hotels)||c.hotels.length!==hotels.length||c.hotels.some((h,i)=>!measure(h)||h.hotel!==hotels[i])))fail();
 if(!Array.isArray(v.missingHotels)||v.missingHotels.some(h=>!hotels.includes(h)))fail();
 if(v.agesComplete){
  const aged=v.accountsOver60??fail();if(!Array.isArray(aged))fail();const seen=new Set<string>();
  for(const a of aged){const id=JSON.stringify([a.hotel,a.accountId]);if(!measure(a)||!hotels.includes(a.hotel)||!a.accountId||typeof a.accountName!=='string'||typeof a.accountType!=='string'||count(a.oldest)===null||a.oldest<=60||count(a.unbilled)===null||a.count===null||a.count<1||a.unbilled>a.count||decimal(a.unbilledAmount)===null||a.amount===null||Number(a.amount)<=0||seen.has(id))fail();seen.add(id);}
  for(const h of v.hotels){if(h.amount===null||h.count===null||h.bands.some(b=>b.count===null||b.amount===null)||h.bands.reduce((n,b)=>n+b.count!,0)!==h.count||h.bands.reduce((n,b)=>n+amountToSatang(b.amount!),0n)!==amountToSatang(h.amount))fail();if(aged.filter(a=>a.hotel===h.hotel).reduce((n,a)=>n+a.count!,0)!==h.over60)fail();}
 }else if(v.accountsOver60!==null)fail();
 if(v.cohortComplete){const issued=v.cohort.find(c=>c.key==='issued')!,parts=v.cohort.filter(c=>c.key!=='issued');if(v.cohort.some(c=>c.count===null||c.amount===null)||parts.reduce((n,c)=>n+c.count!,0)!==issued.count||parts.reduce((n,c)=>n+amountToSatang(c.amount!),0n)!==amountToSatang(issued.amount!))fail();}
 return v;
}
export type ManagementSort='account'|'hotel'|'type'|'count'|'amount'|'unbilled'|'oldest';
export function managementAccounts(rows:ManagementAccount[],search:string,sort:ManagementSort,descending:boolean){
 const words=search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 const value=(r:ManagementAccount)=>sort==='account'?r.accountName:sort==='type'?r.accountType:sort==='amount'?Number(r.amount):r[sort];
 return rows.filter(r=>words.every(w=>[r.accountName,r.accountNo,r.accountId,r.hotel,r.accountType].join(' ').toLocaleLowerCase().includes(w))).sort((a,b)=>compareValues(value(a),value(b),descending)||compareValues(a.hotel,b.hotel)||compareValues(a.accountId,b.accountId));
}
