import {it,expect,vi} from 'vitest';
import {accountWithAddressee} from '../worker/documents/addressee';
import {OperaError} from '../worker/opera/client';
import {statementModel} from '../worker/statement/model';
const lines=['Synthetic Legal Name','1 Example Street','Sample Town 10000','Exampleland VAT ID: SYN-123'];
const account=(hotel='KAT')=>({hotelId:hotel,accountId:{id:'account'},accountName:'Synthetic Travel',profileId:{id:'profile',type:'Profile'},address:{address:{country:{}}}});
const address=(id:string,primaryInd:boolean)=>({id,type:'Address',address:{addressLine:lines,primaryInd,country:{}}});
const profile=(addresses=[address('primary',true)])=>({profileIdList:[{id:'profile',type:'Profile'},{id:'external',type:'IATA'}],profileDetails:{addresses:{addressInfo:addresses,totalResults:addresses.length}}});
it.each(['KAT','TSK','TLKL','WAKL','TLFO','TSAN'])('resolves the linked primary profile address in %s',async hotel=>{
 const read=vi.fn().mockResolvedValue(profile([address('secondary',false),address('primary',true)]));
 const result=await accountWithAddressee({profile:read},hotel,'account',account(hotel));expect(result.accountName).toBe('Synthetic Travel');expect(result.address).toEqual(address('primary',true));expect(read).toHaveBeenCalledWith('profile');
});
it('uses the AR-attached address rather than a different primary profile address',async()=>{
 const a={...account(),address:{id:'attached',type:'Address'}};
 const result=await accountWithAddressee({profile:async()=>profile([address('primary',true),address('attached',false)])},'KAT','account',a);expect(result.address).toEqual(address('attached',false));
});
it('resolves the exact attached full profile address even when AR supplies three nonblank lines',async()=>{
 const a={...account(),address:{id:'attached',address:{addressLine:lines.slice(0,3),country:{}}}},read=vi.fn().mockResolvedValue(profile([address('primary',true),address('attached',false)]));
 expect((await accountWithAddressee({profile:read},'KAT','account',a)).address).toEqual(address('attached',false));expect(read).toHaveBeenCalledOnce();
});
it('retains legitimate inline stationery when the account has no linked profile',async()=>{
 const a={...account(),profileId:undefined,address:address('attached',false)},read=vi.fn();expect(await accountWithAddressee({profile:read},'KAT','account',a)).toBe(a);expect(read).not.toHaveBeenCalled();
});
it('rejects a wrong attached ID even when inline lines are nonblank and a primary address exists',async()=>{
 const a={...account(),address:{id:'unknown',address:{addressLine:lines.slice(0,3)}}};
 await expect(accountWithAddressee({profile:async()=>profile()},'KAT','account',a)).rejects.toThrow('document_addressee_ambiguous');
});
it('accepts compatible primary full stationery without an attached ID',async()=>{
 const a={...account(),address:{address:{addressLine:lines.slice(0,3)}}};
 expect((await accountWithAddressee({profile:async()=>profile()},'KAT','account',a)).address).toEqual(address('primary',true));
});
it('rejects multiple compatible profile addresses without an exact attached ID',async()=>{
 const a={...account(),address:{address:{addressLine:lines.slice(0,3)}}};
 await expect(accountWithAddressee({profile:async()=>profile([address('primary',true),address('secondary',false)])},'KAT','account',a)).rejects.toThrow('document_addressee_ambiguous');
});
it.each(['lines','city','postal','country'])('rejects a conflicting primary address when no exact attached ID exists (%s)',async field=>{
 const inline={addressLine:lines.slice(0,3),cityName:'Sample Town',postalCode:'10000',country:{code:'TH'}},chosen={...address('primary',true),address:{...address('primary',true).address,cityName:'Sample Town',postalCode:'10000',country:{code:'TH'}}};
 if(field==='lines')chosen.address.addressLine=['Unrelated Legal Name',...lines.slice(1)];
 if(field==='city')chosen.address.cityName='Another Town';
 if(field==='postal')chosen.address.postalCode='20000';
 if(field==='country')chosen.address.country={code:'SG'};
 await expect(accountWithAddressee({profile:async()=>profile([chosen])},'KAT','account',{...account(),address:{address:inline}})).rejects.toThrow('document_addressee_ambiguous');
});
it.each(['foreign-profile','foreign-account','two-primary','missing-primary','truncated','wrong-address-id'])('rejects unsafe address selection: %s',async reason=>{
 const a:Record<string,unknown>=account(),p=profile();
 if(reason==='foreign-profile')p.profileIdList[0].id='another';
 if(reason==='foreign-account')a.hotelId='TSK';
 if(reason==='two-primary')p.profileDetails.addresses.addressInfo.push(address('second-primary',true));
 if(reason==='missing-primary')p.profileDetails.addresses.addressInfo[0].address.primaryInd=false;
 if(reason==='truncated')p.profileDetails.addresses.totalResults=2;
 if(reason==='wrong-address-id')a.address={id:'unknown'};
 if(reason==='two-primary')p.profileDetails.addresses.totalResults=2;
 await expect(accountWithAddressee({profile:async()=>p},'KAT','account',a)).rejects.toThrow(/document_addressee_/);
});
it('does not turn profile failure into a successful name-only PDF',async()=>{
 await expect(accountWithAddressee({profile:async()=>{throw new OperaError('provider_rejected',403);}},'KAT','account',account())).rejects.toMatchObject({stage:'addressee_profile',upstreamStatus:403});
 await expect(accountWithAddressee({},'KAT','account',account())).rejects.toThrow('document_addressee_unavailable');
});
it('does not bypass profile errors or wrong profile identity with nonblank inline lines',async()=>{
 const a={...account(),address:address('primary',true)},wrong=profile();wrong.profileIdList[0].id='another';
 await expect(accountWithAddressee({profile:async()=>{throw new OperaError('provider_rejected',403);}},'KAT','account',a)).rejects.toMatchObject({stage:'addressee_profile'});
 await expect(accountWithAddressee({profile:async()=>wrong},'KAT','account',a)).rejects.toThrow('document_addressee_scope_invalid');
});
it('permits a verified empty address list without inventing address or tax text',async()=>{
 const a=account();expect(await accountWithAddressee({profile:async()=>profile([])},'KAT','account',a)).toBe(a);
});
it.each([true,false])('retains a verified selected profile address with four blank lines (country present: %s)',async countryPresent=>{
 const a={...account('TSAN'),address:{id:'attached',type:'Address'}},chosen={id:'attached',type:'Address',address:{addressLine:['','','',''],primaryInd:true,country:countryPresent?{code:'TH'}:{}}};
 const p={profileIdList:[{id:'profile',type:'Profile'}],profileDetails:{addresses:{addressInfo:[chosen],totalResults:1}}};
 const result=await accountWithAddressee({profile:async()=>p},'TSAN','account',a);
 expect(result).toEqual({...a,address:chosen});expect(result.accountName).toBe(a.accountName);
});
it.each([undefined,null,'',{},[null],[123],['',{}]])('rejects malformed or unconfirmed profile address lines (%j)',async addressLine=>{
 const p={profileIdList:[{id:'profile',type:'Profile'}],profileDetails:{addresses:{addressInfo:[{id:'primary',address:{addressLine,primaryInd:true,country:{code:'TH'}}}],totalResults:1}}};
 await expect(accountWithAddressee({profile:async()=>p},'KAT','account',account())).rejects.toThrow('document_addressee_unavailable');
});
it.each([false,true])('feeds verified profile stationery into Statement without changing money or aging (blank lines: %s)',async blank=>{
 const source=profile();if(blank){source.profileDetails.addresses.addressInfo[0].address.addressLine=['','','',''];source.profileDetails.addresses.addressInfo[0].address.country={code:'TH'};}
 const input=blank?account():{...account(),address:{id:'primary',address:{addressLine:lines.slice(0,3),country:{}}}};
 const money=(amount:number)=>({amount,currencyCode:'THB'}),a=await accountWithAddressee({profile:async()=>source},'KAT','account',input);
 const raw={accountDetails:{...a,accountNo:'SYN-AR',summary:{total:money(80)},agingInfo:{aging:Array.from({length:6},(_,i)=>({sequence:i+1,agingBucketRange:'Range '+i,balanceInfo:{total:money(i?0:80)}}))},invoices:[{transactionNo:1,invoiceNo:101,folioNo:201,guestName:'Synthetic Guest',transactionDate:'2026-09-01',amount:money(100),payments:money(-20),balance:money(80)}]}};
 const manifest=[{id:'1',hotel:'KAT',account_id:'account',invoice_no:'101',folio_no:'201',reservation_id:null,folio_date:null,open:80,collection_role:'standalone'}];
 const model=statementModel(raw,manifest,'2026-10-01');expect(model.address).toEqual(blank?['Synthetic Travel','TH']:['Synthetic Travel',...lines]);expect(model.total).toBe(8000);expect(model.aging[0].cents).toBe(8000);
});
