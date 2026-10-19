import {it,expect} from 'vitest';
import {OperaReader} from '../worker/opera/client';
it('reads the selected reservation with posted AR generates and a bounded date window',async()=>{
 let request:Request|undefined;
 const reader=new OperaReader({origin:'https://example.test',hotelId:'TSAN',appKey:'test'},async()=> 'test',async r=>{request=r;return Response.json({});});
 await reader.invoiceGuestTransactions('123','2026-10-14','2026-10-19');
 const u=new URL(request!.url);
 expect(request!.method).toBe('GET');expect(request!.redirect).toBe('manual');
 expect(u.pathname).toBe('/csh/v1/hotels/TSAN/transactions');
 expect(Object.fromEntries(u.searchParams)).toEqual({reservationList:'123',includeGenerates:'true',includeTransactionsWithARInvoiceNo:'true',includeTransactionsWithFolioNo:'true',startDate:'2026-10-14',endDate:'2026-10-19'});
});
it.each([['0','2026-10-14','2026-10-19'],['123','2026-02-30','2026-03-01'],['123','2026-10-19','2026-10-14'],['123','2026-09-01','2026-10-19']])('rejects an invalid or excessive diagnostic scope %s %s %s',(id,start,end)=>{
 const reader=new OperaReader({origin:'https://example.test',hotelId:'TSAN',appKey:'test'},async()=> 'test',async()=>{throw Error('must not fetch');});
 expect(()=>reader.invoiceGuestTransactions(id,start,end)).toThrow('invalid_request');
});
it('requests only exact invoice tax fields through the fixed read-only Data API query',async()=>{
 let request:Request|undefined;
 const reader=new OperaReader({origin:'https://example.test',hotelId:'TSAN',appKey:'test'},async()=> 'test',async r=>{request=r;return Response.json({});});
 await reader.invoiceTaxData('500');
 expect(new URL(request!.url).pathname).toBe('/rna/v1/graphql/');expect(request!.method).toBe('POST');expect(request!.redirect).toBe('manual');
 const body=await request!.json() as {query:string;variables:unknown};
 expect(body.query).not.toContain('mutation');expect(body.query).toContain('totalNonTaxableAmount');
 expect(body.variables).toEqual({input:{financialunifiedDetailsResort:{_eq:'TSAN'},financialunifiedDetailsFtTrxNo:{_eq:500}}});
 expect(()=>reader.invoiceTaxData('500\"}')).toThrow('invalid_request');
});
