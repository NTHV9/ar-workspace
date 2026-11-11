import {expect, it} from 'vitest';
import {accountWithAddressee} from '../worker/documents/addressee';
import {HOTEL_IDS} from '../src/domain/hotels';

const row=(id:string,type:string,primaryInd=false)=>({id,type:'Address',address:{type,primaryInd,addressLine:[id+' street'],country:{code:'IT'}}});
const input=(hotel:string,attached?:string)=>({hotelId:hotel,accountId:{id:'account'},profileId:{id:'profile'},address:attached?{id:attached}:{}});
const profile=(rows:ReturnType<typeof row>[])=>({profileIdList:[{type:'Profile',id:'profile'}],profileDetails:{addresses:{addressInfo:rows,totalResults:rows.length}}});
const read=(rows:ReturnType<typeof row>[])=>({profile:async()=>profile(rows)});

it.each(HOTEL_IDS)('uses AR ADDRESS over linked BUSINESS primary for %s',async hotel=>{
 const business=row('business','BUSINESS',true),ar=row('ar','AR ADDRESS');
 const source={...input(hotel,'business'),address:{id:'business',address:business.address}};
 const result=await accountWithAddressee(read([business,ar]),hotel,'account',source);
 expect(result.address).toEqual(ar);
 expect(result.hotelId).toBe(hotel);
 expect(result.accountId).toEqual(source.accountId);
});
it('uses the only AR address even when another address is primary and no reference exists',async()=>{
 const business=row('business','BUSINESS',true),ar=row('ar','AR ADDRESS');
 expect((await accountWithAddressee(read([business,ar]),'KAT','account',input('KAT'))).address).toEqual(ar);
});
it('selects the linked AR address when one profile has several AR accounts',async()=>{
 const rows=[row('business','BUSINESS',true),row('ar-one','AR ADDRESS'),row('ar-two','AR ADDRESS')];
 expect((await accountWithAddressee(read(rows),'KAT','account',input('KAT','ar-two'))).address).toEqual(rows[2]);
});
it.each([undefined,'business'])('rejects multiple AR addresses without a linked AR reference (%s)',async attached=>{
 await expect(accountWithAddressee(read([row('business','BUSINESS',true),row('one','AR ADDRESS'),row('two','AR ADDRESS')]),'KAT','account',input('KAT',attached))).rejects.toThrow('document_addressee_ambiguous');
});
it('does not fall back to a business address when AR ADDRESS is missing',async()=>{
 await expect(accountWithAddressee(read([row('business','BUSINESS',true)]),'KAT','account',input('KAT','business'))).rejects.toThrow('document_addressee_ar_missing');
});
it('ignores the translated label when selecting a verified address type code',async()=>{
 const ar={...row('ar','AR ADDRESS'),address:{...row('ar','AR ADDRESS').address,typeDescription:'AR translated'}};
 expect((await accountWithAddressee(read([ar]),'KAT','account',input('KAT'))).address).toEqual(ar);
});
it('does not accept explicit BUSINESS stationery on an account without a linked profile',async()=>{
 const account={...input('KAT'),profileId:undefined,address:row('business','BUSINESS',true)};
 await expect(accountWithAddressee({},'KAT','account',account)).rejects.toThrow('document_addressee_ar_missing');
});
it('does not treat a business address labelled AR Address as an AR type',async()=>{
 const business={...row('business','BUSINESS',true),address:{...row('business','BUSINESS',true).address,typeDescription:'AR Address'}};
 await expect(accountWithAddressee(read([business]),'KAT','account',input('KAT'))).rejects.toThrow('document_addressee_ar_missing');
});
