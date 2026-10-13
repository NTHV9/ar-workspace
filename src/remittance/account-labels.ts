import type {RemittanceAccount} from './model';

/** Distinguish catalog choices without changing their hotel-specific ledger identity. */
export function remittanceAccountLabels(accounts:readonly RemittanceAccount[]):Map<string,string>{
 const normalize=(value:string)=>value.trim().replace(/\s+/g,' ').toLowerCase();
 const displayKey=(a:RemittanceAccount)=>JSON.stringify([a.hotel,normalize(a.name),normalize(a.accountNo??'')]);
 const counts=new Map<string,number>();
 for(const account of accounts){const key=displayKey(account);counts.set(key,(counts.get(key)??0)+1);}
 return new Map(accounts.map(a=>{
  const number=a.accountNo?.trim();
  const identity=!number?`ID ${a.accountId}`:number+(counts.get(displayKey(a))!>1?` · ID ${a.accountId}`:'');
  return [JSON.stringify([a.hotel,a.accountId]),`${a.hotel} · ${a.name} · ${identity}`];
 }));
}
