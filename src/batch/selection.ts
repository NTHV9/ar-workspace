import type {DocumentSelection} from '../DocumentRoute';
export interface SelectionWork {
 hotel:string;account_id:string;account_name:string;id:string;open:number;
 collection_selectable:boolean;verification_state:string;
 workflow:{billing_required:boolean|null}|null;action:{stage:string};
}
export type SelectionBasket=Readonly<Record<string,readonly string[]>>;
export interface BatchSelection extends DocumentSelection {key:string;stage:string;amount:number}
export const selectionKey=(row:Pick<SelectionWork,'hotel'|'account_id'|'action'>)=>JSON.stringify([row.hotel,row.account_id,row.action.stage]);
const eligible=(row:SelectionWork)=>row.collection_selectable&&row.verification_state==='verified'&&row.open>0&&!['On hold','Needs review'].includes(row.action.stage);
export function changeBasket(basket:SelectionBasket,key:string,ids:readonly string[],mode:'add'|'remove'|'toggle'):SelectionBasket{
 const next=new Set(basket[key]??[]);
 for(const id of ids){if(mode==='remove'||mode==='toggle'&&next.has(id))next.delete(id);else next.add(id);}
 const result={...basket};if(next.size)result[key]=[...next];else delete result[key];return result;
}
export function reconcileBasket(basket:SelectionBasket,rows:readonly SelectionWork[]):SelectionBasket{
 const valid=new Map<string,Set<string>>();
 for(const row of rows){if(!eligible(row))continue;const key=selectionKey(row);if(!valid.has(key))valid.set(key,new Set());valid.get(key)!.add(row.id);}
 const result:Record<string,string[]>={};let changed=false;
 for(const [key,ids]of Object.entries(basket)){const remaining=ids.filter(id=>valid.get(key)?.has(id));if(remaining.length)result[key]=remaining;if(remaining.length!==ids.length)changed=true;}
 return changed?result:basket;
}
export function selectedGroups(basket:SelectionBasket,rows:readonly SelectionWork[]):BatchSelection[]{
 return Object.entries(basket).flatMap(([key,ids])=>{
  const requested=new Set(ids),selected=rows.filter(r=>eligible(r)&&selectionKey(r)===key&&requested.has(r.id));if(!selected.length)return [];
  const first=selected[0],stage=first.action.stage;
  return [{key,hotel:first.hotel,accountId:first.account_id,accountName:first.account_name,stage,ids:selected.map(r=>r.id),
   purpose:stage==='Billing'||stage==='Setup needed'&&!selected.every(r=>r.workflow?.billing_required===false)?'billing' as const:'collection' as const,
   amount:selected.reduce((n,r)=>n+Math.round(r.open*100),0)/100}];
 });
}
export const basketCount=(basket:SelectionBasket)=>Object.values(basket).reduce((n,ids)=>n+ids.length,0);
