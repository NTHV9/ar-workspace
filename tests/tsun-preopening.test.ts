import {expect,it} from 'vitest';
import {HOTEL_IDS,PREOPENING_HOTELS,isHotelId,regionHotels} from '../src/domain/hotels';
import {hotelMailbox} from '../src/domain/mailboxes';
import {signatureWorkplace} from '../src/email/signature';
import {settingsAccountParams} from '../src/navigation';
import {syntheticManagement} from './fixtures/management-dashboard';
import {managementResult} from '../src/dashboard/management-data';
it('admits Sun Club as the seventh operational hotel in its existing Khao Lak scope',()=>{
 expect(PREOPENING_HOTELS).toEqual([]);expect(HOTEL_IDS).toEqual(['KAT','TSK','TLKL','WAKL','TLFO','TSAN','TSUN']);expect(regionHotels('khao-lak')).toEqual(['TLKL','WAKL','TLFO','TSAN','TSUN']);expect(isHotelId('TSUN')).toBe(true);expect(hotelMailbox('TSUN')).toBe('khao-lak');expect(signatureWorkplace('TSUN')).toBe('The Sun Club Khaolak by Katathani');expect(settingsAccountParams(new URLSearchParams(),{hotel:'TSUN',accountId:'same'},['khao-lak'])?.get('property')).toBe('TSUN');expect(settingsAccountParams(new URLSearchParams(),{hotel:'TSUN',accountId:'same'},['phuket'])).toBeNull();
});
it('includes five independent Khao Lak hotels in report contracts and signed totals',()=>{
 const data=syntheticManagement('khao-lak');expect(managementResult(data,'khao-lak','All',data.from,data.to)).toBe(data);expect(data.hotels).toHaveLength(5);expect(data.metrics.find(m=>m.key==='open')?.amount).toBe('5000.00');expect(data.hotels.map(h=>h.hotel)).toEqual(['TLKL','WAKL','TLFO','TSAN','TSUN']);
});
