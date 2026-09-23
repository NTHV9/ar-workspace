import {it,expect} from 'vitest';
import {invoiceAgingAccounts} from '../src/dashboard/invoice-aging';
import {agingBucketKey,agingComparison} from '../src/dashboard/aging-model';
import type {Account,RefreshState} from '../src/domain/portfolio';
import type {AgingInvoicesResponse} from '../worker/dashboard/aging-model';
const at='2026-09-23T04:00:00Z',today='2026-09-23';
const buckets=[{label:'0–30',start:0,end:30,sequence:0,amount:100,debit:100,credit:0},{label:'31+',start:31,end:null,sequence:1,amount:0,debit:0,credit:0}];
const account:Account={hotel:'KAT',id:'synthetic',name:'Synthetic',type:'OTA',open:100,over90:0,items:1,verification_state:'verified',synced_at:at,agingBuckets:buckets};
const refresh:RefreshState={running:false,hotels:[{hotel:'KAT',status:'succeeded',last_success_at:at}]};
function data():AgingInvoicesResponse{return {asOfDate:today,publications:[{hotel:'KAT',sourceAt:at}],accounts:[{hotel:'KAT',accountId:account.id,accountType:'OTA',syncedAt:at,complete:true,unverified:0,buckets:[{key:null,count:1,amount:'100.00',creditAmount:'0.00',complete:true},...buckets.map((b,i)=>({key:agingBucketKey(b),count:i,amount:i?'100.00':'0.00',creditAmount:'0.00',complete:true}))]}],summary:{complete:true,count:1,amount:'100.00',creditAmount:'0.00',billing:[],followup:[],due:[],flags:[]},rows:[],total:1,complete:true};}
it('uses the same current invoice membership for all ranges without changing source data or net',()=>{
 const snapshot=data(),result=invoiceAgingAccounts([account],{state:'ready',data:snapshot},refresh,today);
 expect(result[0].agingBuckets?.map(b=>b.amount)).toEqual([0,100]);expect(result[0].open).toBe(100);
 expect(account.agingBuckets?.map(b=>b.amount)).toEqual([100,0]);
 expect(agingComparison(result,'All')[0].cells[1].KAT.amount).toBe(100);
});
it('preserves signed credits and exact cents instead of distributing a difference',()=>{
 const snapshot=data(),a=snapshot.accounts[0];a.buckets[0]={...a.buckets[0],count:2,creditAmount:'20.00'};
 a.buckets[1]={...a.buckets[1],count:1,amount:'-20.00',creditAmount:'20.00'};
 a.buckets[2]={...a.buckets[2],count:1,amount:'120.00'};
 const result=invoiceAgingAccounts([account],{state:'ready',data:snapshot},refresh,today)[0];
 expect(result.agingBuckets?.map(b=>[b.amount,b.debit,b.credit])).toEqual([[-20,0,20],[120,120,0]]);
});
it('includes explicit account credits separately when source debits match the complete invoice inventory',()=>{
 const sourceAccount={...account,open:80,agingBuckets:[{...buckets[0],amount:80,debit:100,credit:20},buckets[1]]};
 const result=invoiceAgingAccounts([sourceAccount],{state:'ready',data:data()},refresh,today)[0];
 expect(result.agingBasis).toBe('invoices');expect(result.open).toBe(80);
 expect(result.agingBuckets?.map(b=>b.amount)).toEqual([-20,100]);
 expect(result.agingAccountCredits).toEqual([{bucketKey:agingBucketKey(buckets[0]),amount:20}]);
 const overlapping=data();overlapping.accounts[0].buckets[0].creditAmount='5.00';
 expect(invoiceAgingAccounts([sourceAccount],{state:'ready',data:overlapping},refresh,today)[0].agingBasis).toBe('unavailable');
});
it.each(['date','publication','account publication','type','membership','count','credit','net','missing','duplicate'] as const)('does not confirm %s inconsistencies',kind=>{
 const snapshot=data(),a=snapshot.accounts[0];
 if(kind==='date')snapshot.asOfDate='2026-09-22';
 if(kind==='publication')snapshot.publications[0].sourceAt='2026-09-22T04:00:00Z';
 if(kind==='account publication')a.syncedAt='2026-09-22T04:00:00Z';
 if(kind==='type')a.accountType='CCR';
 if(kind==='membership')a.buckets[2].complete=false;
 if(kind==='count')a.buckets[2].count=2;
 if(kind==='credit')a.buckets[2].creditAmount='-1.00';
 if(kind==='net')a.buckets[0].amount='101.00';
 if(kind==='missing')a.buckets.pop();
 if(kind==='duplicate')a.buckets.push(a.buckets[1]);
 expect(invoiceAgingAccounts([account],{state:'ready',data:snapshot},refresh,today)[0].agingBasis).toBe('unavailable');
});
it('keeps a matching saved publication during a failed refresh but never substitutes a missing response',()=>{
 expect(invoiceAgingAccounts([account],{state:'error',data:data()},refresh,today)[0].agingBasis).toBe('invoices');
 expect(invoiceAgingAccounts([account],{state:'error'},refresh,today)[0].agingBasis).toBe('unavailable');
});
