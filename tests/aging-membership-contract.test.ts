import {it,expect} from 'vitest';
import {invoiceAgingBucket,reconcileAgingInventory,agingBucketKey} from '../src/dashboard/aging-model';
import {agingDetailsResult} from '../src/dashboard/aging-invoice-data';
import type {Account,AgingMembership} from '../src/domain/portfolio';
const buckets=[{label:'0–30',start:0,end:30,sequence:0,amount:0,debit:0,credit:0},{label:'31–60',start:31,end:60,sequence:1,amount:0,debit:0,credit:0},{label:'61+',start:61,end:null,sequence:2,amount:0,debit:0,credit:0}];
const at='2026-10-08T00:00:00Z';
const membership:AgingMembership={contract:'opera_reconciled_v1',state:'resolved',offsetDays:-1};
const account:Account={hotel:'KAT',id:'synthetic',name:'Synthetic',type:'OTA',open:200,over90:0,items:2,synced_at:at,agingBuckets:buckets.map((b,i)=>({...b,amount:i<2?100:0,debit:i<2?100:0})),membership};
const raw=(id:string,age:number|null)=>({id,synced_at:at,hotel:'KAT',account_id:'synthetic',open:100,age,collection_role:'standalone',verification_state:'verified'});
it('uses only server-resolved offset and preserves raw 31/61 ages',()=>{
 const rows=reconcileAgingInventory({synced_at:at,invoices:[raw('31',31),raw('61',61)]},account,{count:2,amount:'200.00',creditAmount:'0.00'});
 expect(rows.map(r=>r.age)).toEqual([31,61]);expect(rows.map(r=>r.bucketKey)).toEqual(buckets.slice(0,2).map(agingBucketKey));
 expect(invoiceAgingBucket(31,buckets,{...membership,offsetDays:0})).toBe(buckets[1]);
 expect(invoiceAgingBucket(61,buckets,{...membership,offsetDays:0})).toBe(buckets[2]);
 expect(invoiceAgingBucket(0,buckets,membership)).toBe(buckets[0]);expect(invoiceAgingBucket(null,buckets,membership)).toBeNull();expect(invoiceAgingBucket(31,buckets,undefined)).toBeNull();
});
it('rejects missing/stale publication, partial count, credit mismatch and duplicate identities',()=>{
 const response={synced_at:at,invoices:[raw('31',31),raw('61',61)]},net={count:2,amount:'200.00',creditAmount:'0.00'};
 for(const bad of [{...response,synced_at:undefined},{...response,synced_at:'2026-10-07T00:00:00Z'},{...response,invoices:[raw('31',31)]},{...response,invoices:[raw('31',31),raw('31',61)]}])expect(()=>reconcileAgingInventory(bad,account,net)).toThrow();
 expect(()=>reconcileAgingInventory(response,account,{...net,creditAmount:'1.00'})).toThrow();
});

it('rejects equal-count equal-net rows refreshed after the account header',()=>{
 const response={synced_at:at,invoices:[raw('31',31),{...raw('61',61),synced_at:'2026-10-08T00:01:00Z'}]};
 expect(()=>reconcileAgingInventory(response,account,{count:2,amount:'200.00',creditAmount:'0.00'})).toThrow('Invoice row publication does not match');
});
