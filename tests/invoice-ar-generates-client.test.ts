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
 expect(new URL(request!.url).pathname).toBe('/rna/v1/graphql');expect(request!.method).toBe('POST');expect(request!.redirect).toBe('manual');
 const body=await request!.json() as {query:string;variables:unknown};
 expect(body.query).not.toContain('mutation');expect(body.query).toContain('totalNonTaxableAmount');
 expect(body.variables).toEqual({input:{financialunifiedDetailsResort:{_eq:'TSAN'},financialunifiedDetailsFtTrxNo:{_eq:500}}});
 expect(()=>reader.invoiceTaxData('500\"}')).toThrow('invalid_request');
});
it('returns a bounded redacted Data API rejection reason without conflating it with missing permissions',async()=>{
 const reader=new OperaReader({origin:'https://example.test',hotelId:'TSAN',appKey:'private-key'},async()=> 'private-token',async()=>Response.json({title:'Route rejected',detail:'Bad request private-token private-key','o:errorCode':'ROUTE-001'},{status:403}));
 await expect(reader.invoiceTaxData('500')).rejects.toMatchObject({upstreamStatus:403,providerMessage:'Route rejected · Bad request [redacted] [redacted] · ROUTE-001'});
});
it('uses Oracle Data API accept headers and preserves HTTP-200 GraphQL rejection details',async()=>{
 const reader=new OperaReader({origin:'https://example.test',hotelId:'TSAN',appKey:'private-key'},async()=> 'private-token',async r=>{
 expect(r.headers.get('accept')).toBe('multipart/mixed; deferSpec=20220824, application/json');
 expect(r.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
 return Response.json({data:{partial:true},errors:[{message:'Unknown field private-token private-key'}]});});
 await expect(reader.invoiceTaxData('500')).rejects.toMatchObject({upstreamStatus:200,stage:'data_query_failed',providerMessage:'Unknown field [redacted] [redacted]',diagnostics:{partialData:true}});
});
it('reads a complete bounded multipart Data API response',async()=>{
 const body='--test-boundary\r\nContent-Type: application/json\r\n\r\n{"data":{"financialTransactionDetailsExtended":[]},"hasNext":false}\r\n--test-boundary--\r\n';
 const reader=new OperaReader({origin:'https://example.test',hotelId:'TSAN',appKey:'test'},async()=> 'test',async()=>new Response(body,{headers:{'Content-Type':'multipart/mixed; boundary="test-boundary"'}}));
 await expect(reader.invoiceTaxData('500')).resolves.toMatchObject({data:{financialTransactionDetailsExtended:[]}});
});
it('refuses incomplete or incremental multipart data instead of silently dropping tax evidence',async()=>{
 for(const payload of ['{"data":{},"hasNext":true}','{"incremental":[{"data":{}}],"hasNext":false}']){
 const reader=new OperaReader({origin:'https://example.test',hotelId:'TSAN',appKey:'test'},async()=> 'test',async()=>new Response('--b\r\nContent-Type: application/json\r\n\r\n'+payload+'\r\n--b--',{headers:{'Content-Type':'multipart/mixed; boundary=b'}}));
 await expect(reader.invoiceTaxData('500')).rejects.toThrow('invalid_response');
 }
});
it('captures a short HTML gateway rejection title without returning the response body',async()=>{
 const reader=new OperaReader({origin:'https://example.test',hotelId:'TSAN',appKey:'private-key'},async()=> 'private-token',async()=>new Response('<html><title>Gateway route unavailable</title><body>Other response content</body></html>',{status:403,headers:{'Content-Type':'text/html'}}));
 await expect(reader.invoiceTaxData('500')).rejects.toMatchObject({providerMessage:'Gateway route unavailable'});
});
