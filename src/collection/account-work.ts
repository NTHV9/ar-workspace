import type {Group} from '../CollectionQueue';
export interface AccountWork {key:string;hotel:string;accountId:string;name:string;type:string;groups:Group[];invoices:number;amount:number;ready:number;priority:number;date:string|null}
export function accountWork(groups:Group[],sort:string,direction:string):AccountWork[]{
 const accounts=new Map<string,AccountWork>();
 for(const group of groups){const key=JSON.stringify([group.hotel,group.accountId]);const entry=accounts.get(key)??{key,hotel:group.hotel,accountId:group.accountId,name:group.name,type:group.type,groups:[],invoices:0,amount:0,ready:0,priority:Infinity,date:null};
  entry.groups.push(group);entry.invoices+=group.rows.length;entry.amount+=Math.round(group.amount*100);entry.ready+=group.ready;entry.priority=Math.min(entry.priority,group.priority);if(group.date&&(!entry.date||group.date<entry.date))entry.date=group.date;accounts.set(key,entry);
 }
 const result=[...accounts.values()].map(a=>({...a,amount:a.amount/100,groups:[...a.groups].sort((x,y)=>x.priority-y.priority||x.key.localeCompare(y.key))}));
 const value=(a:AccountWork)=>sort==='count'?a.invoices:sort==='amount'?a.amount:sort==='date'?a.date:sort==='hotel'?a.hotel:sort==='name'?a.name:sort==='stage'?a.groups[0]?.stage:sort==='purpose'?a.groups[0]?.purpose:a.priority;
 return result.sort((a,b)=>{const x=value(a),y=value(b);if(x==null)return y==null?0:1;if(y==null)return -1;return (typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'en',{numeric:true}))*(direction==='desc'?-1:1)||b.amount-a.amount||a.key.localeCompare(b.key);});
}
