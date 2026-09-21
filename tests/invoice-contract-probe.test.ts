import {it,expect,vi} from 'vitest';
import {readInvoiceFolioContract} from '../worker/documents/invoice-contract-probe';
const invoice={id:'101',hotel:'KAT',account_id:'account',invoice_no:'77',folio_no:'88',reservation_id:'1234',folio_date:'2026-09-01',open:100,collection_role:'standalone'};
it('validates the exact Folio and returns shapes and redacted links, never customer values',async()=>{
 const detail=vi.fn().mockResolvedValue({name:'PRIVATE CUSTOMER',amount:100,links:[{href:'https://oracle.example/med/config/v1/hotels/KAT/reservations/1234/folioReports?reservationIdType=Reservation&signature=PRIVATE_TOKEN',rel:'self',method:'GET'}]});
 const reader={reservationFolios:vi.fn().mockResolvedValue({reservationFolioInformation:{reservationInfo:{hotelId:'KAT',reservationIdList:[{id:'1234',type:'Reservation'}]},folioHistory:[{folioWindowNo:1,folios:[{invoiceNo:77,folioNo:88,folioTypeName:'Invoice'}]}]}}),financialTransactionDetail:detail};
 const result=await readInvoiceFolioContract(reader,invoice),serialized=JSON.stringify(result);
 expect(result).toMatchObject({matched:true,folioTypeName:'Invoice',windowVerified:true});
 expect(serialized).not.toContain('PRIVATE');expect(serialized).not.toContain('1234');
 expect(detail).toHaveBeenCalledWith({hotel:'KAT',accountId:'account',transactionId:'101'});
 expect(result.links).toEqual([{rel:'self',method:'GET',path:'/med/config/v1/hotels/KAT/reservations/{id}/folioReports',queryNames:['reservationIdType','signature'],typeSelectors:{reservationIdType:'Reservation'}}]);
});
it('stops before reading detail when the historical Folio belongs to a different reservation',async()=>{
 const reader={reservationFolios:vi.fn().mockResolvedValue({reservationFolioInformation:{reservationInfo:{hotelId:'KAT',reservationIdList:[{id:'different',type:'Reservation'}]},folioHistory:[]}}),financialTransactionDetail:vi.fn()};
 await expect(readInvoiceFolioContract(reader,invoice)).rejects.toThrow();
 expect(reader.financialTransactionDetail).not.toHaveBeenCalled();
});
