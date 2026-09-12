import type {DashboardHotelOverviewResponse,DashboardOverviewScope} from '../../worker/dashboard/hotel-model';
import {activityResult,externalResult,financialResult,type Source} from './data';
import {balancesResult,paidInvoicesResult} from './period-data';
import {validDay} from './model';

export interface HotelOverview extends DashboardHotelOverviewResponse {retained?:Array<keyof DashboardOverviewScope>}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function scopeResult(value:unknown):DashboardOverviewScope {
 if(!object(value))throw Error('dashboard_overview_invalid');
 const required=['balances','activity','external','entries','payments','paid'];
 if(required.some(key=>!(key in value)))throw Error('dashboard_overview_invalid');
 const financial=(v:unknown)=>{if(!object(v))throw Error('dashboard_overview_invalid');financialResult({...v,rows:[],total:0});return v;};
 return {
  balances:value.balances===null?null:balancesResult(value.balances),
  activity:value.activity===null?null:activityResult(value.activity),
  external:value.external===null?null:externalResult(value.external),
  entries:value.entries===null?null:financial(value.entries),
  payments:value.payments===null?null:financial(value.payments),
  paid:value.paid===null?null:paidInvoicesResult(value.paid),
 } as DashboardOverviewScope;
}
export function hotelOverviewResult(value:unknown,from:string,to:string):HotelOverview {
 if(!object(value)||value.from!==from||value.to!==to||!validDay(from)||!validDay(to)||!Array.isArray(value.hotels)||value.hotels.length!==2)throw Error('dashboard_overview_invalid');
 const hotels=value.hotels.map(h=>{if(!object(h)||h.hotel!=='KAT'&&h.hotel!=='TSK')throw Error('dashboard_overview_invalid');return {...scopeResult(h),hotel:h.hotel};});
 if(new Set(hotels.map(h=>h.hotel)).size!==2)throw Error('dashboard_overview_invalid');
 return {from,to,total:scopeResult(value.total),hotels} as DashboardHotelOverviewResponse;
}
export function overviewSource<K extends keyof DashboardOverviewScope>(source:Source<HotelOverview>,key:K):Source<NonNullable<DashboardOverviewScope[K]>> {
 const data=source.data?.total[key];
 return {state:source.state==='ready'&&(data===null||source.data?.retained?.includes(key))?'error':source.state,data:data??undefined} as Source<NonNullable<DashboardOverviewScope[K]>>;
}

/** Retain a complete hotel comparison group together; never splice new totals with old hotel parts. */
export function mergeHotelOverview(next:HotelOverview,previous:HotelOverview|undefined):HotelOverview {
 if(!previous||previous.from!==next.from||previous.to!==next.to)return next;
 const merged:HotelOverview={...next,total:{...next.total},hotels:next.hotels.map(h=>({...h})),retained:[]};
 for(const key of ['balances','activity','external','entries','payments','paid'] as const){
  if(next.total[key]!==null&&next.hotels.every(h=>h[key]!==null))continue;
  if(previous.total[key]===null||previous.hotels.some(h=>h[key]===null))continue;
  // All entries of each field share the corresponding reader contract.
  Object.assign(merged.total,{[key]:previous.total[key]});
  for(const h of merged.hotels)Object.assign(h,{[key]:previous.hotels.find(p=>p.hotel===h.hotel)![key]});
  merged.retained!.push(key);
 }
 return merged;
}
