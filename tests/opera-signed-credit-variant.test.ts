import {expect,it} from 'vitest';
import {normalizeAccount} from '../worker/opera/normalize';

const money=(amount:number,currencyCode='THB')=>({amount,currencyCode});
const triple=(debit:number,credit:number,total:number)=>({debit:money(debit),credit:money(credit),total:money(total)});
function fixture(){
 const buckets=[
  {agingBucketRange:'0-30',agingStartDay:0,agingEndDay:30,sequence:1,balanceInfo:triple(100,20,80)},
  ...[31,61,91,121,151].map((start,index)=>({agingBucketRange:`Synthetic ${index}`,agingStartDay:start,agingEndDay:index===4?undefined:start+29,sequence:index+2,balanceInfo:triple(0,0,0)})),
 ];
 return {accountDetails:{hotelId:'TLFO',accountId:{id:'SYNTHETIC-A'},accountName:'Synthetic account',type:'Agent',balance:money(80),summary:triple(100,-20,80),agingInfo:{totalOutstanding:triple(100,20,80),aging:buckets},
  invoices:[
   {hotelId:'TLFO',transactionNo:1,transactionDate:'2026-09-01',originalAmount:money(110),amount:money(110),payments:money(10),balance:money(100),age:10},
   {hotelId:'TLFO',transactionNo:2,transactionDate:'2026-09-02',originalAmount:money(-30),amount:money(-30),payments:money(0),balance:money(-30),age:11},
  ],payments:[],
 }};
}
const normalize=(raw:ReturnType<typeof fixture>)=>normalizeAccount(raw,'TLFO','2026-09-15');

it('accepts signed Summary credit only with an explicit Account balance and fully reconciled conventional Aging proof',()=>{
 const result=normalize(fixture());
 expect(result.account.open).toBe(80);
 expect(result.invoices.map(invoice=>invoice.open)).toEqual([100,-30]);
 expect(result.account.items).toBe(2);
});

it('inherits THB from explicit Summary total when all Aging component currency codes are omitted',()=>{
 const raw=fixture();
 for(const balance of [raw.accountDetails.agingInfo.totalOutstanding,...raw.accountDetails.agingInfo.aging.map(bucket=>bucket.balanceInfo)]){
  for(const component of [balance.debit,balance.credit,balance.total])Object.assign(component,{currencyCode:undefined});
 }
 const result=normalize(raw);
 expect(result.account.open).toBe(80);
 expect(result.account.agingBuckets.map(bucket=>bucket.amount)).toEqual([80,0,0,0,0,0]);
 expect(result.invoices.map(invoice=>invoice.open)).toEqual([100,-30]);
});

it('retains the ordinary debit-minus-credit contract without requiring Aging totalOutstanding',()=>{
 const raw=fixture();raw.accountDetails.summary=triple(100,20,80);Object.assign(raw.accountDetails.agingInfo,{totalOutstanding:undefined});
 expect(normalize(raw).account.open).toBe(80);
});

it.each([
 {name:'missing explicit Account balance',change:(raw:ReturnType<typeof fixture>)=>{Object.assign(raw.accountDetails,{balance:null});}},
 {name:'Account balance different from Summary total',change:(raw:ReturnType<typeof fixture>)=>{raw.accountDetails.balance=money(70);}},
 {name:'missing Aging totalOutstanding',change:(raw:ReturnType<typeof fixture>)=>{Object.assign(raw.accountDetails.agingInfo,{totalOutstanding:undefined});}},
 {name:'Aging totalOutstanding debit differs',change:(raw:ReturnType<typeof fixture>)=>{raw.accountDetails.agingInfo.totalOutstanding.debit=money(90);}},
 {name:'Aging totalOutstanding credit differs',change:(raw:ReturnType<typeof fixture>)=>{raw.accountDetails.agingInfo.totalOutstanding.credit=money(30);}},
 {name:'Aging totalOutstanding total differs',change:(raw:ReturnType<typeof fixture>)=>{raw.accountDetails.agingInfo.totalOutstanding.total=money(70);}},
 {name:'Aging totalOutstanding has foreign currency',change:(raw:ReturnType<typeof fixture>)=>{raw.accountDetails.agingInfo.totalOutstanding.credit=money(20,'USD');}},
 {name:'Aging totalOutstanding has an empty currency code',change:(raw:ReturnType<typeof fixture>)=>{Object.assign(raw.accountDetails.agingInfo.totalOutstanding.credit,{currencyCode:''});}},
 {name:'missing Summary total currency proof',change:(raw:ReturnType<typeof fixture>)=>{Object.assign(raw.accountDetails.summary.total,{currencyCode:undefined});}},
 {name:'foreign Summary total currency proof',change:(raw:ReturnType<typeof fixture>)=>{raw.accountDetails.summary.total=money(80,'USD');}},
 {name:'one Aging bucket fails its debit-minus-credit equation',change:(raw:ReturnType<typeof fixture>)=>{raw.accountDetails.agingInfo.aging[1].balanceInfo=triple(5,1,5);}},
 {name:'Aging bucket debit aggregate differs',change:(raw:ReturnType<typeof fixture>)=>{raw.accountDetails.agingInfo.aging[1].balanceInfo=triple(5,0,5);}},
 {name:'Aging bucket credit aggregate differs',change:(raw:ReturnType<typeof fixture>)=>{raw.accountDetails.agingInfo.aging[1].balanceInfo=triple(0,5,-5);}},
 {name:'Aging bucket total aggregate differs',change:(raw:ReturnType<typeof fixture>)=>{raw.accountDetails.agingInfo.aging[1].balanceInfo=triple(5,0,5);}},
 {name:'Summary credit has the conventional positive sign',change:(raw:ReturnType<typeof fixture>)=>{raw.accountDetails.summary=triple(100,20,120);raw.accountDetails.balance=money(120);}},
 {name:'Summary signed credit does not reconcile by addition',change:(raw:ReturnType<typeof fixture>)=>{raw.accountDetails.summary.total=money(70);raw.accountDetails.balance=money(70);}},
 ])('rejects the signed-credit variant without $name',({change})=>{
 const raw=fixture();change(raw);
 expect(()=>normalize(raw)).toThrow('invalid_response');
});
