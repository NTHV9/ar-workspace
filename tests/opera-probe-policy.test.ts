import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {OperaReader} from '../worker/opera/client';
import {probeOpera} from '../worker/opera/probe';
const env={OPERA_BASE_URL:'https://synthetic.invalid',OPERA_ENTERPRISE_ID:'synthetic',OPERA_HOTEL_IDS:'KAT',OPERA_CLIENT_ID:'synthetic',OPERA_CLIENT_SECRET:'synthetic',OPERA_APP_KEY:'synthetic'};
afterEach(()=>vi.restoreAllMocks());
beforeEach(()=>{vi.spyOn(OperaReader.prototype,'agingBasisSettings').mockRejectedValue(new Error('PRIVATE-PROVIDER-ERROR'));});
it('retires generic Statement API probes while preserving native Invoice selector reads',async()=>{
 const invoice={transactionNo:1,balance:{amount:100},reservationId:{id:'reservation'},folioDate:'2026-09-01',invoiceNo:'100',folioNo:'200'};
 vi.spyOn(OperaReader.prototype,'accounts').mockResolvedValue({accountsDetails:[{hotelId:'KAT',accountId:{id:'account'},balance:{amount:100}}],totalResults:1,hasMore:false});
 vi.spyOn(OperaReader.prototype,'account').mockResolvedValue({accountDetails:{hotelId:'KAT',accountId:{id:'account'},invoices:[invoice],summary:{}}});
 vi.spyOn(OperaReader.prototype,'history').mockResolvedValue({details:[],totalResults:0,hasMore:false});
 vi.spyOn(OperaReader.prototype,'businessDate').mockResolvedValue({hotels:[{hotelId:'KAT',businessDate:'2026-09-10'}]});
 const statement=vi.spyOn(OperaReader.prototype,'statementSelection').mockResolvedValue({aRStatements:[]});
 const folio=vi.spyOn(OperaReader.prototype,'folioHistory').mockResolvedValue({folioHistory:[],hasMore:false});
 const reservation=vi.spyOn(OperaReader.prototype,'reservationFolios').mockResolvedValue({reservationFolioInformation:{reservationInfo:{hotelId:'KAT',reservationIdList:[{id:'reservation',type:'Reservation'}]},folioHistory:[]}});
 const result=await probeOpera(env,'KAT');expect(statement).not.toHaveBeenCalled();expect(result.statementSelection).toEqual({status:'retired',source:'workspace'});expect(folio).toHaveBeenCalledOnce();expect(reservation).toHaveBeenCalledOnce();
});
function scopedMocks(currentId='target',currentHotel='KAT',historyId='target'){
 vi.spyOn(OperaReader.prototype,'accounts').mockResolvedValue({accountsDetails:[{hotelId:'KAT',accountId:{id:'first'}}],totalResults:1});
 vi.spyOn(OperaReader.prototype,'account').mockImplementation(async id=>({accountDetails:{hotelId:currentHotel,accountId:{id:id==='target'?currentId:id},invoices:[],summary:{}}}));
 vi.spyOn(OperaReader.prototype,'history').mockResolvedValue({details:[{hotelId:'KAT',accountId:{id:historyId},invoices:[{age:30,transactionDate:'2026-08-11',transferDate:'2026-08-12',guestName:'PRIVATE',balance:{amount:900},transactionNo:'PRIVATE-ID'}]}],hasMore:true});
 vi.spyOn(OperaReader.prototype,'businessDate').mockResolvedValue({hotels:[{hotelId:'KAT',businessDate:'2026-09-10'}]});
}
it('reads the targeted current account and existing scoped history date patterns',async()=>{
 scopedMocks();const result=await probeOpera(env,'KAT','target');
 expect(OperaReader.prototype.account).toHaveBeenCalledWith('target');
 expect(result.historyInvoiceDatePatterns?.groups).toEqual([{age:30,compressed:null,parentReferencePresent:false,dateDeltas:{transactionDate:30,transferDate:29,postingDate:null,revenueDate:null,folioDate:null,closeDate:null},count:1}]);
 expect(result.historyPaging?.hasMore).toBe(true);
 expect(result.agingBasisSettings).toEqual({status:'unavailable',reason:'provider_unavailable'});
 expect(JSON.stringify(result.agingBasisSettings)).not.toContain('PRIVATE');
 expect(JSON.stringify(result.historyInvoiceDatePatterns)).not.toMatch(/PRIVATE|amount|2026-/);
});
it.each([['other','KAT','target','account_scope'],['target','TSK','target','account_scope'],['target','KAT','other','history_scope']])('rejects mismatched account/hotel history before diagnostic output',async(currentId,currentHotel,historyId,stage)=>{
 scopedMocks(currentId,currentHotel,historyId);
 await expect(probeOpera(env,'KAT','target')).rejects.toMatchObject({code:'invalid_response',stage});
});
