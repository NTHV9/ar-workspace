import type {Account,AgingBucket} from '../../../src/domain/portfolio';
const ranges=[[0,30],[31,60],[61,90],[91,120],[121,150],[151,null]] as const;
const buckets=(values:number[]):AgingBucket[]=>ranges.map(([start,end],sequence)=>({label:end===null?'151+':`${start}–${end}`,start,end,sequence,amount:values[sequence]??0,debit:Math.max(0,values[sequence]??0),credit:Math.min(0,values[sequence]??0)}));
const account=(hotel:string,id:string,account_no:string,name:string,type:string,values:number[]):Account=>({hotel,id,account_no,name,type,open:values.reduce((s,n)=>s+n,0),over90:0,items:2,verification_state:'verified',agingBuckets:buckets(values)});
export const currentAgingAccounts:Account[]=[
 account('KAT','kat-azure','SYN-A','Azure Travel · Synthetic','Agent',[100,-20,0,0,0,200]),
 account('TSK','tsk-azure','SYN-A','Azure TSK · Synthetic','Agent',[50,0,0,0,0,100]),
 account('KAT','kat-birch','SYN-B','Birch · Synthetic','Agent',[0,0,0,0,0,0]),
 account('TSK','tsk-birch','SYN-B','Birch TSK · Synthetic','Agent',[0,0,0,0,0,0]),
 account('KAT','kat-cedar','SYN-C','Cedar · Synthetic','Corporate',[300,0,0,0,0,0]),
];
export const currentAgingManyAccounts=[...currentAgingAccounts,...Array.from({length:63},(_,i)=>account('KAT',`extra-${i+1}`,`EXTRA-${i+1}`,`Extra ${String(i+1).padStart(2,'0')} · Synthetic`,'Agent',[1000+i,0,0,0,0,0]))];
const invoice=(hotel:string,account_id:string,id:string,open:number,age:number|null,extra={})=>({hotel,account_id,id,invoice_no:`INV-${id}`,folio_no:`FOL-${id}`,guest:'Synthetic guest',transaction_date:'2026-09-01',open,original:Math.abs(open),age,collection_role:'standalone',verification_state:'verified',...extra});
export const currentAgingInvoices:Record<string,unknown[]>={
 'kat-azure':[invoice('KAT','kat-azure','kat-parent',100,10,{collection_role:'parent'}),invoice('KAT','kat-azure','kat-child',40,10,{collection_role:'child',parent_invoice_id:'kat-parent'}),invoice('KAT','kat-azure','kat-credit',-20,40),invoice('KAT','kat-azure','kat-old',180,160),invoice('KAT','kat-azure','kat-unknown',20,null)],
 'tsk-azure':[invoice('TSK','tsk-azure','tsk-young',50,10),invoice('TSK','tsk-azure','tsk-old',100,160)],
 'kat-birch':[],'tsk-birch':[],'kat-cedar':[invoice('KAT','kat-cedar','kat-corporate',300,10)],
};
