import {it,expect} from 'vitest';
import {OperaReader} from '../worker/opera/client';
const row={hotelId:'KAT',countryCode:'AU',name:'Australia',description:{defaultText:'Australia',translatedTexts:[{language:'EN',value:'Australia',unknown:'omit'}]},isoName:'Australia',isoCode:'AU',guestAddressFormat:'private-omit',managedBy:{secret:'omit'}};
function readerFor(raw:unknown){return new OperaReader({origin:'https://example.test',hotelId:'KAT',appKey:'test'},async()=> 'test',async()=>Response.json(raw));}
it('reads exact configured country names with a fixed hotel and bounded repeated selectors',async()=>{
 let request:Request|undefined;const reader=new OperaReader({origin:'https://example.test',hotelId:'KAT',appKey:'test'},async()=> 'test',async r=>{request=r;return Response.json({countries:[row],hasMore:false,totalPages:1,totalResults:1,count:1,limit:20,offset:0,links:[{href:'https://other.test'}]});});
 expect(await reader.invoiceCountryDisplayMetadata(['AU','AU','ES'])).toEqual({countries:[{hotelId:'KAT',countryCode:'AU',name:'Australia',description:{defaultText:'Australia',translatedTexts:[{language:'EN',value:'Australia'}]},isoName:'Australia',isoCode:'AU'}],missingCodes:['ES']});
 const url=new URL(request!.url);expect(request!.method).toBe('GET');expect(request!.redirect).toBe('manual');expect(url.pathname).toBe('/ent/config/v1/hotels/KAT/countries');expect([...url.searchParams]).toEqual([['countriesCodes','AU'],['countriesCodes','ES'],['limit','20']]);
});
it('keeps optional country fields absent and reports requested missing codes',async()=>{
 expect(await readerFor({countries:[{hotelId:'KAT',countryCode:'AU'}]}).invoiceCountryDisplayMetadata(['AU','ES'])).toEqual({countries:[{hotelId:'KAT',countryCode:'AU'}],missingCodes:['ES']});
 expect(await readerFor({countries:[]}).invoiceCountryDisplayMetadata(['AU'])).toEqual({countries:[],missingCodes:['AU']});
});
it.each([[],[''],['../AU'],['AU?x=y'],['A'.repeat(21)],Array.from({length:21},(_,n)=>String(n))].map(codes=>({codes})))('refuses unsafe or unbounded country selectors before auth',({codes})=>{
 const reader=new OperaReader({origin:'https://example.test',hotelId:'KAT',appKey:'test'},async()=>{throw Error('must not authenticate');});expect(()=>reader.invoiceCountryDisplayMetadata(codes)).toThrow('invalid_request');
});
it.each([{countries:[{...row,hotelId:'TSAN'}]},{countries:[{...row,countryCode:'ES'}]},{countries:[row,row]},{countries:[{...row,name:'a'.repeat(81)}]},{countries:[{...row,isoName:'a'.repeat(201)}]},{countries:[{...row,isoCode:3}]},{countries:[{...row,description:{translatedTexts:[{language:'EN',value:3}]}}]},{countries:[row],hasMore:true},{countries:[row],hasMore:'false'},{countries:[row],totalPages:2},{countries:[row],totalResults:2},{countries:[row],count:0},{}])('rejects foreign, duplicated, malformed or explicitly incomplete country evidence',async raw=>{
 await expect(readerFor(raw).invoiceCountryDisplayMetadata(['AU'])).rejects.toThrow('invalid_response');
});
it('treats HTTP204 as absent evidence and refuses credentialed redirects',async()=>{
 for(const status of [204,302]){let calls=0;const reader=new OperaReader({origin:'https://example.test',hotelId:'KAT',appKey:'test'},async()=> 'test',async()=>{calls++;return new Response(null,{status,headers:{Location:'https://other.test'}});});await expect(reader.invoiceCountryDisplayMetadata(['AU'])).rejects.toThrow(status===204?'invalid_response':'redirect_rejected');expect(calls).toBe(1);}
});
it('accepts documented empty-page counters without manufacturing a configured label',async()=>{
 expect(await readerFor({countries:[],totalPages:0,offset:0,limit:20,count:0,totalResults:0}).invoiceCountryDisplayMetadata(['AU'])).toEqual({countries:[],missingCodes:['AU']});
});
it.each([{totalPages:0},{totalPages:'1'},{count:'1'},{totalResults:'1'},{offset:-1},{offset:21},{offset:'0'},{limit:100},{limit:'20'}])('refuses contradictory or incorrectly typed page counters',async counters=>{
 await expect(readerFor({countries:[row],...counters}).invoiceCountryDisplayMetadata(['AU'])).rejects.toThrow('invalid_response');
});

