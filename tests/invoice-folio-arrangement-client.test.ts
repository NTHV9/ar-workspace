import {it,expect} from 'vitest';
import {OperaReader} from '../worker/opera/client';

const row={hotelId:'TSAN',code:'7',description:{defaultText:'Example venue',translatedTexts:[{language:'EN',value:'Example venue',extra:'omit'}]},transactionCodes:['3000','3010'],arrangementId:9,taxTypeCode:'VAT',revenue:true,managedBy:{credential:'omit'}};
it('reads deduplicated exact observed arrangement codes and projects only display fields',async()=>{
 let request:Request|undefined;
 const reader=new OperaReader({origin:'https://example.test',hotelId:'TSAN',appKey:'test'},async()=> 'test',async r=>{request=r;return Response.json({folioArrangementCodes:[row],links:[{href:'https://other.test'}]});});
 expect(await reader.invoiceFolioArrangementCodes(['7','7','8'])).toEqual({folioArrangementCodes:[{hotelId:'TSAN',code:'7',description:{defaultText:'Example venue',translatedTexts:[{language:'EN',value:'Example venue'}]},transactionCodes:['3000','3010']}],missingCodes:['8']});
 const url=new URL(request!.url);expect(request!.method).toBe('GET');expect(request!.redirect).toBe('manual');expect(url.pathname).toBe('/fof/config/v1/folioArrangementCodes');expect([...url.searchParams]).toEqual([['hotelIds','TSAN'],['arrangementCodes','7'],['arrangementCodes','8']]);
});
it('reports an unknown arrangement as missing instead of creating valid empty evidence',async()=>{
 const reader=new OperaReader({origin:'https://example.test',hotelId:'TSAN',appKey:'test'},async()=> 'test',async()=>Response.json({folioArrangementCodes:[]}));
 expect(await reader.invoiceFolioArrangementCodes(['7'])).toEqual({folioArrangementCodes:[],missingCodes:['7']});
});
it.each([[],[''],['../x'],['a/b'],['x?x=y'],['x'.repeat(21)],Array.from({length:21},(_,n)=>String(n))].map(codes=>({codes})))('rejects invalid or excessive observed scopes before authentication',({codes})=>{
 const reader=new OperaReader({origin:'https://example.test',hotelId:'TSAN',appKey:'test'},async()=>{throw Error('must not authenticate');});
 expect(()=>reader.invoiceFolioArrangementCodes(codes)).toThrow('invalid_request');
});
it.each([{folioArrangementCodes:[{...row,hotelId:'KAT'}]},{folioArrangementCodes:[{...row,code:'8'}]},{folioArrangementCodes:[row,row]},{folioArrangementCodes:[{...row,description:{defaultText:'x'.repeat(2001)}}]},{folioArrangementCodes:[{...row,transactionCodes:[3]}]},{folioArrangementCodes:[{...row,description:{translatedTexts:[{language:'EN',value:3}]}}]},{}])('rejects foreign, duplicate, unexpected or malformed display metadata',async raw=>{
 const reader=new OperaReader({origin:'https://example.test',hotelId:'TSAN',appKey:'test'},async()=> 'test',async()=>Response.json(raw));
 await expect(reader.invoiceFolioArrangementCodes(['7'])).rejects.toThrow('invalid_response');
});
it('treats HTTP 204 as absent provider evidence and never follows a credentialed redirect',async()=>{
 for(const status of [204,302]){
  let calls=0;const reader=new OperaReader({origin:'https://example.test',hotelId:'TSAN',appKey:'test'},async()=> 'test',async()=>{calls++;return new Response(null,{status,headers:{Location:'https://other.test'}});});
  await expect(reader.invoiceFolioArrangementCodes(['7'])).rejects.toThrow(status===204?'invalid_response':'redirect_rejected');expect(calls).toBe(1);
 }
});
