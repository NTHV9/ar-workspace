import {afterEach,expect,it,vi} from 'vitest';
import {OperaReader} from '../worker/opera/client';
import {probeOpera} from '../worker/opera/probe';
const env={OPERA_BASE_URL:'https://synthetic.invalid',OPERA_ENTERPRISE_ID:'synthetic',OPERA_HOTEL_IDS:'KAT',OPERA_CLIENT_ID:'synthetic',OPERA_CLIENT_SECRET:'synthetic',OPERA_APP_KEY:'synthetic'};
afterEach(()=>vi.restoreAllMocks());
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
