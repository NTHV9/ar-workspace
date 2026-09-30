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
it('retains a complete inline AR address without an extra profile read',async()=>{
 const a={...account(),address:address('attached',false)},read=vi.fn();expect(await accountWithAddressee({profile:read},'KAT','account',a)).toBe(a);expect(read).not.toHaveBeenCalled();
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
it('permits a verified empty address list without inventing address or tax text',async()=>{
 const a=account();expect(await accountWithAddressee({profile:async()=>profile([])},'KAT','account',a)).toBe(a);
});
it('feeds the same complete profile lines into Statement without changing money or aging',async()=>{
 const money=(amount:number)=>({amount,currencyCode:'THB'}),a=await accountWithAddressee({profile:async()=>profile()},'KAT','account',account());
 const raw={accountDetails:{...a,accountNo:'SYN-AR',summary:{total:money(80)},agingInfo:{aging:Array.from({length:6},(_,i)=>({sequence:i+1,agingBucketRange:'Range '+i,balanceInfo:{total:money(i?0:80)}}))},invoices:[{transactionNo:1,invoiceNo:101,folioNo:201,guestName:'Synthetic Guest',transactionDate:'2026-09-01',amount:money(100),payments:money(-20),balance:money(80)}]}};
 const manifest=[{id:'1',hotel:'KAT',account_id:'account',invoice_no:'101',folio_no:'201',reservation_id:null,folio_date:null,open:80,collection_role:'standalone'}];
 const model=statementModel(raw,manifest,'2026-10-01');expect(model.address).toEqual(['Synthetic Travel',...lines]);expect(model.total).toBe(8000);expect(model.aging[0].cents).toBe(8000);
});
