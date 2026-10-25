import {it,expect} from 'vitest';
import {OperaReader} from '../worker/opera/client';

const plan={hotelId:'TSAN',ratePlanCode:'PROMO',transactionDetails:{folioText:{defaultText:'Family accommodation',translatedTexts:[{language:'EN',value:'Family accommodation',extra:'omit'}]},transactionCode:'1000',packageTransactionCode:'7500',roomTransactionCodes:[{roomType:'FAM',roomClass:'SUITE',transactionCode:'1001',extra:'omit'}],currencyCode:'THB',rateIncludesTax:true},primaryDetails:{price:123},credential:'omit'};
it('reads only the documented rate-plan identity and display posting fields',async()=>{
 let request:Request|undefined;
 const reader=new OperaReader({origin:'https://example.test',hotelId:'TSAN',appKey:'test'},async()=> 'test',async r=>{request=r;return Response.json({ratePlans:[plan],links:[{href:'https://other.test'}]});});
 const result=await reader.invoiceRatePlanFolioText('PROMO');
 const url=new URL(request!.url);
 expect(request!.method).toBe('GET');expect(request!.redirect).toBe('manual');
 expect(url.pathname).toBe('/rtp/v1/hotels/TSAN/ratePlans/PROMO');expect(url.searchParams.getAll('fetchInstructions')).toEqual(['PrimaryDetails','TransactionDetails']);
 expect(result).toEqual({ratePlans:[{hotelId:'TSAN',ratePlanCode:'PROMO',transactionDetails:{folioText:{defaultText:'Family accommodation',translatedTexts:[{language:'EN',value:'Family accommodation'}]},transactionCode:'1000',packageTransactionCode:'7500',roomTransactionCodes:[{roomType:'FAM',roomClass:'SUITE',transactionCode:'1001'}]}}]});
});
it.each(['','../x','a/b','x?x=y','x'.repeat(21)])('rejects an invalid rate code before credentials or fetch: %s',code=>{
 const reader=new OperaReader({origin:'https://example.test',hotelId:'TSAN',appKey:'test'},async()=>{throw Error('must not authenticate');});
 expect(()=>reader.invoiceRatePlanFolioText(code)).toThrow('invalid_request');
});
it('projects only the documented bounded primary description for diagnostic comparison',async()=>{
 const reader=new OperaReader({origin:'https://example.test',hotelId:'TSAN',appKey:'test'},async()=> 'test',async()=>Response.json({ratePlans:[{...plan,primaryDetails:{description:{defaultText:'Family offer',translatedTexts:[{language:'EN',value:'Family offer',extra:'omit'}],extra:'omit'},price:999,extra:'omit'}}]}));
 const result=await reader.invoiceRatePlanFolioText('PROMO');
 expect(result.ratePlans[0].primaryDetails).toEqual({description:{defaultText:'Family offer',translatedTexts:[{language:'EN',value:'Family offer'}]}});
});
it.each([{defaultText:3},{defaultText:'x'.repeat(2001)},{translatedTexts:[{language:'x'.repeat(21),value:'text'}]},'not a translation object'])('rejects malformed or oversized primary description evidence',async description=>{
 const reader=new OperaReader({origin:'https://example.test',hotelId:'TSAN',appKey:'test'},async()=> 'test',async()=>Response.json({ratePlans:[{...plan,primaryDetails:{description}}]}));
 await expect(reader.invoiceRatePlanFolioText('PROMO')).rejects.toThrow('invalid_response');
});
it.each([{ratePlans:[]},{ratePlans:[plan,plan]},{ratePlans:[{...plan,hotelId:'KAT'}]},{ratePlans:[{...plan,ratePlanCode:'OTHER'}]},{ratePlans:[{...plan,transactionDetails:{folioText:{defaultText:3}}}]}])('rejects absent, ambiguous, mismatched or malformed display evidence',async raw=>{
 const reader=new OperaReader({origin:'https://example.test',hotelId:'TSAN',appKey:'test'},async()=> 'test',async()=>Response.json(raw));
 await expect(reader.invoiceRatePlanFolioText('PROMO')).rejects.toThrow('invalid_response');
});
