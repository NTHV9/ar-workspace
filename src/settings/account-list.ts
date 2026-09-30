import type {SettingsAccount} from './bulk-model';
import {compareValues,type SortValue} from '../table-sort';
export type AccountSortKey='selected'|'name'|'hotel'|'type'|'billingRequired'|'creditTerm'|'invoices'|'result';
export interface AccountListFilters {query:string;billing:string;status:string;term:string;invoices:string}
export const accountRuleSource=(a:SettingsAccount)=>a.source??(a.revision>0?'account':'none');
export const accountNeedsSetup=(a:SettingsAccount)=>accountRuleSource(a)!=='account'||a.billingRequired===null||a.creditTerm===null;
export const billingLabel=(value:boolean|null)=>value===null?'Not configured':value?'Required':'Not required';
export function filterSettingsAccounts(rows:SettingsAccount[],f:AccountListFilters){
 const words=f.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 return rows.filter(a=>{
  const source=accountRuleSource(a),haystack=`${a.name} ${a.accountId} ${a.accountNo??''} ${a.hotel} ${a.type} ${billingLabel(a.billingRequired)} ${source} ${accountNeedsSetup(a)?'Setup needed':''}`.toLocaleLowerCase();
  return words.every(word=>haystack.includes(word))
   &&(f.billing==='all'||f.billing==='required'&&a.billingRequired===true||f.billing==='not_required'&&a.billingRequired===false||f.billing==='unset'&&a.billingRequired===null)
   &&(f.status==='all'||f.status==='setup'&&accountNeedsSetup(a)||f.status===source)
   &&(f.term==='all'||f.term==='unset'&&a.creditTerm===null||f.term==='short'&&a.creditTerm!==null&&a.creditTerm<7||f.term==='standard'&&a.creditTerm!==null&&a.creditTerm>=7&&a.creditTerm<=30||f.term==='long'&&a.creditTerm!==null&&a.creditTerm>30)
   &&(f.invoices==='all'||f.invoices==='with'&&a.invoices>0||f.invoices==='without'&&a.invoices===0);
 });
}
export function sortSettingsAccounts<T extends SettingsAccount&{protected?:boolean;changed?:boolean;after?:Pick<SettingsAccount,'billingRequired'|'creditTerm'>}>(rows:T[],key:AccountSortKey,descending:boolean,selected:ReadonlySet<string>=new Set(),review=false):T[]{
 const value=(a:T):SortValue=>key==='selected'?Number(selected.has(JSON.stringify([a.hotel,a.accountId]))):key==='result'?a.protected?'Keeps Account settings':a.changed?'Will update':'Unchanged':key==='billingRequired'?billingLabel(review&&a.after?a.after.billingRequired:a.billingRequired):key==='creditTerm'?review&&a.after?a.after.creditTerm:a.creditTerm:a[key];
 return [...rows].sort((a,b)=>compareValues(value(a),value(b),descending)||compareValues(a.name,b.name)||compareValues(a.hotel,b.hotel)||compareValues(a.accountId,b.accountId));
}
