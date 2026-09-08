import {expect,it} from 'vitest';
import {probeSelectedStatement} from '../worker/opera/selected-statement';
const money=(amount:number)=>({amount,currencyCode:'THB'});
const invoices=[1,2,3].map(transactionNo=>({transactionNo,balance:money(100)}));
it('requests A/C and rejects an included middle invoice even with matching balance',async()=>{
 let selected:string[]=[];
 const reader={account:async()=>({accountDetails:{hotelId:'KAT',accountId:{id:'sample'},invoices}}),statementSelection:async(_id:string,ids:string[])=>{selected=ids;return {aRStatements:[{hotelId:'KAT',accountId:{id:'sample'},balance:money(200),invoices:[invoices[0],invoices[1]]}]};}};
 expect(await probeSelectedStatement(reader,'KAT','sample')).toMatchObject({status:'selection_rejected',excludedMiddleAbsent:false});expect(selected).toEqual(['1','3']);
});
it('accepts only exact A/C identity and selected balance',async()=>{
 const reader={account:async()=>({accountDetails:{hotelId:'KAT',accountId:{id:'sample'},invoices}}),statementSelection:async()=>({aRStatements:[{hotelId:'KAT',accountId:{id:'sample'},balance:money(200),invoices:[invoices[0],invoices[2]]}]})};
 expect(await probeSelectedStatement(reader,'KAT','sample')).toMatchObject({status:'selection_verified',nativeStatementPdfVerified:false});
});
