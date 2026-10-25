import {it,expect} from 'vitest';
import {OperaReader} from '../worker/opera/client';

function response(){return {reservationFolioInformation:{reservationInfo:{hotelId:'KAT',reservationIdList:[{type:'Reservation',id:'777'}],reservationGuest:{name:'omit'}},folioWindows:[{folioWindowNo:1,folios:[]},{folioWindowNo:2,internalFolioWindowID:'123',offset:200,limit:200,totalResults:1,totalPages:1,revenue:{amount:999},folios:[{folioNo:88,folioAmount:{amount:999},postings:[{transactionNo:11,transactionDate:'2026-01-02',transactionCode:'3000',transactionDescription:'Example venue',reference:'Room# 2 : CHECK# 10',checkNo:'opaque',arrangementCode:'7',debitAmount:{amount:999},groupTypeInfo:{groupId:'g1',groupCount:3,groupDescription:'Example venue'},financialTransactionIdList:[{id:'11',type:'Posting',idContext:'OPERA',extra:'omit'}],originalReservationInformation:{originalRoomNumber:'2',originalReservationId:'777',originalGuestFirstName:'omit'}}]}]}],folioHistory:[]},links:[{href:'https://other.test'}]};}
it('requests fixed CheckNo grouping and projects only scoped display identity and membership',async()=>{
 let request:Request|undefined;const reader=new OperaReader({origin:'https://example.test',hotelId:'KAT',appKey:'test'},async()=> 'test',async r=>{request=r;return Response.json(response());});
 const result=await reader.invoicePosDisplayFolios('777',2);const url=new URL(request!.url);
 expect(request!.method).toBe('GET');expect(request!.redirect).toBe('manual');expect(url.pathname).toBe('/csh/v1/hotels/KAT/reservations/777/folios');
 expect(url.searchParams.get('groupType')).toBe('CheckNo');expect(url.searchParams.get('folioWindowNo')).toBe('2');expect(url.searchParams.getAll('fetchInstructions')).toEqual(['Reservation','Foliohistory','Postings','Transactioncodes']);expect(url.searchParams.has('summaryOnly')).toBe(false);
 expect(result).toEqual({hotelId:'KAT',reservationId:'777',folioWindowNo:2,missingWindow:false,omittedWindows:1,windows:[{section:'current',folioWindowNo:2,internalFolioWindowID:'123',offset:200,limit:200,totalResults:1,totalPages:1,folios:[{folioNo:88,postings:[{transactionNo:11,transactionDate:'2026-01-02',transactionCode:'3000',transactionDescription:'Example venue',reference:'Room# 2 : CHECK# 10',checkNo:'opaque',arrangementCode:'7',groupTypeInfo:{groupId:'g1',groupCount:3,groupDescription:'Example venue'},financialTransactionIdList:[{id:'11',type:'Posting',idContext:'OPERA'}],originalReservationInformation:{originalRoomNumber:'2',originalReservationId:'777'}}]}]}]});
});
it.each([{reservationId:'../x',window:2},{reservationId:'777',window:0},{reservationId:'777',window:2,offset:-1},{reservationId:'777',window:2,limit:201}])('rejects invalid diagnostic scope before authentication',scope=>{
 const reader=new OperaReader({origin:'https://example.test',hotelId:'KAT',appKey:'test'},async()=>{throw Error('must not authenticate');});
 expect(()=>reader.invoicePosDisplayFolios(scope.reservationId,scope.window,scope.offset,scope.limit)).toThrow('invalid_request');
});
it.each(['hotel','reservation','duplicate-window','bad-group-count','bad-membership'] as const)('rejects malformed scoped grouping metadata: %s',async kind=>{
 const raw=response();if(kind==='hotel')raw.reservationFolioInformation.reservationInfo.hotelId='TSAN';if(kind==='reservation')raw.reservationFolioInformation.reservationInfo.reservationIdList[0].id='999';
 if(kind==='duplicate-window')raw.reservationFolioInformation.folioWindows.push(structuredClone(raw.reservationFolioInformation.folioWindows[1]));
 if(kind==='bad-group-count')Reflect.set(raw.reservationFolioInformation.folioWindows[1].folios![0].postings[0].groupTypeInfo,'groupCount',-1);
 if(kind==='bad-membership')Reflect.set(raw.reservationFolioInformation.folioWindows[1].folios![0].postings[0],'financialTransactionIdList',[{id:3}]);
 const reader=new OperaReader({origin:'https://example.test',hotelId:'KAT',appKey:'test'},async()=> 'test',async()=>Response.json(raw));await expect(reader.invoicePosDisplayFolios('777',2)).rejects.toThrow('invalid_response');
});
it('returns bounded grouping field shapes without raw identity, financial or contact values',async()=>{
 const reader=new OperaReader({origin:'https://example.test',hotelId:'KAT',appKey:'test'},async()=> 'test',async()=>Response.json(response()));
 const shape=await reader.invoicePosDisplayFoliosShape('777',2),serialized=JSON.stringify(shape);
 expect(shape.identity.hotelMatches).toBe(true);expect(shape.identity.reservationMatches).toBe(true);
 expect(shape.current.windows[0].folios[0].postings[0].groupTextLengths).toEqual({groupId:2,groupDescription:13});
 expect(serialized).toContain('groupTypeInfo');expect(serialized).toContain('financialTransactionIdList');
 expect(serialized).not.toContain('Example venue');expect(serialized).not.toContain('777');expect(serialized).not.toContain('999');expect(serialized).not.toContain('guest');expect(serialized).not.toContain('postedAmount');
});
it('preserves actual CheckNo grouping keys beyond the documented twenty characters only when exactly bound to checkNo',async()=>{
 const raw=response(),check='123456789012345678901',post=raw.reservationFolioInformation.folioWindows[1].folios![0].postings[0];
 post.checkNo=check;post.groupTypeInfo.groupId=check;
 const member=structuredClone(post);Reflect.set(member,'groupTypeInfo',{subGroupId:check});member.transactionNo=12;
 raw.reservationFolioInformation.folioWindows[1].folios![0].postings.push(member);
 const reader=new OperaReader({origin:'https://example.test',hotelId:'KAT',appKey:'test'},async()=> 'test',async()=>Response.json(raw));
 const result=await reader.invoicePosDisplayFolios('777',2),postings=result.windows[0].folios as Array<{postings:Array<{groupTypeInfo:unknown}>}>;
 expect(postings[0].postings[0].groupTypeInfo).toEqual({groupId:check,groupCount:3,groupDescription:'Example venue'});expect(postings[0].postings[1].groupTypeInfo).toEqual({subGroupId:check});
});
it('refuses a long grouping identifier unrelated to its exact typed check key',async()=>{
 const raw=response();raw.reservationFolioInformation.folioWindows[1].folios![0].postings[0].groupTypeInfo.groupId='123456789012345678901';
 const reader=new OperaReader({origin:'https://example.test',hotelId:'KAT',appKey:'test'},async()=> 'test',async()=>Response.json(raw));await expect(reader.invoicePosDisplayFolios('777',2)).rejects.toThrow('invalid_response');
});

it('preserves the optional original posting rateCode as bounded display metadata only',async()=>{const raw=response();Reflect.set(raw.reservationFolioInformation.folioWindows[1].folios![0].postings[0],'rateCode','ORIGINAL-RATE');const reader=new OperaReader({origin:'https://example.test',hotelId:'KAT',appKey:'test'},async()=> 'test',async()=>Response.json(raw)),result=await reader.invoicePosDisplayFolios('777',2);expect(result).toMatchObject({windows:[{folios:[{postings:[{rateCode:'ORIGINAL-RATE'}]}]}]});expect(JSON.stringify(result)).not.toContain('debitAmount');});
it.each([123,'A'.repeat(21),'BAD\nCODE'])('rejects malformed or unbounded posting rateCode (%j)',async rate=>{const raw=response();Reflect.set(raw.reservationFolioInformation.folioWindows[1].folios![0].postings[0],'rateCode',rate);const reader=new OperaReader({origin:'https://example.test',hotelId:'KAT',appKey:'test'},async()=> 'test',async()=>Response.json(raw));await expect(reader.invoicePosDisplayFolios('777',2)).rejects.toThrow('invalid_response');});
