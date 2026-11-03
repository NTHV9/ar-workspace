import {isHotelId,type HotelId} from '../../src/domain/hotels';
// Exact Guest report names observed from each property's OPERA configuration.
// Admission still requires fresh native controls to match the entire invoice.
// TSUN's Guest report is not yet source-qualified. Current AR-only rendering
// uses its separately verified AR report; legacy Guest evidence stays closed.
const REPORTS:Partial<Record<HotelId,string>>={KAT:'kat_folio',TSK:'tsk_folio_vat',TLKL:'tlkl_folio_vat',WAKL:'wakl_folio_vat',TLFO:'tlfo_folio_vat',TSAN:'tsan_folio'};
export const nativeTaxReport=(hotel:string)=>isHotelId(hotel)?REPORTS[hotel]:undefined;
