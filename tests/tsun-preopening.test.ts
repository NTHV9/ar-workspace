import {expect,it} from 'vitest';
import {HOTEL_IDS,PREOPENING_HOTELS,isHotelId,regionHotels} from '../src/domain/hotels';
import {hotelMailbox} from '../src/domain/mailboxes';
import {signatureWorkplace} from '../src/email/signature';
import {settingsAccountParams} from '../src/navigation';
import {syntheticManagement} from './fixtures/management-dashboard';
import {managementResult} from '../src/dashboard/management-data';
it('shows the approved Sun Club catalog entry without expanding operational scopes',()=>{
 expect(PREOPENING_HOTELS).toEqual([{id:'TSUN',name:'The Sun Club Khaolak by Katathani',region:'khao-lak'}]);expect(HOTEL_IDS).toEqual(['KAT','TSK','TLKL','WAKL','TLFO','TSAN']);expect(regionHotels('khao-lak')).toEqual(['TLKL','WAKL','TLFO','TSAN']);expect(isHotelId('TSUN')).toBe(false);expect(()=>hotelMailbox('TSUN')).toThrow('email_invalid');expect(()=>signatureWorkplace('TSUN')).toThrow('signature_hotel_unavailable');expect(settingsAccountParams(new URLSearchParams(),{hotel:'TSUN',accountId:'same'},['khao-lak'])).toBeNull();
});
it('retains the current four-Hotel Khao Lak report contract and totals',()=>{
 const data=syntheticManagement('khao-lak');expect(managementResult(data,'khao-lak','All',data.from,data.to)).toBe(data);expect(data.hotels).toHaveLength(4);expect(data.metrics.find(m=>m.key==='open')?.amount).toBe('4000.00');expect(data.hotels.some(h=>String(h.hotel)==='TSUN')).toBe(false);
});
