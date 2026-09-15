import {describe,expect,it} from 'vitest';
import {HOTEL_IDS,REGION_IDS,isHotelId,isRegionId,hotelRegion,regionHotels,regionLabel,hotelInRegion,resolveRegion,reportHotelScope} from '../src/domain/hotels';

describe('regional hotel scope',()=>{
 it('keeps the exact owner-approved property order in two disjoint regions',()=>{
  expect(REGION_IDS).toEqual(['phuket','khao-lak']);
  expect(regionHotels('phuket')).toEqual(['KAT','TSK']);
  expect(regionHotels('khao-lak')).toEqual(['TLKL','WAKL','TLFO','TSAN']);
  expect(HOTEL_IDS).toEqual([...regionHotels('phuket'),...regionHotels('khao-lak')]);
  expect(new Set(HOTEL_IDS).size).toBe(6);
  expect(regionLabel('phuket')).toBe('Phuket');expect(regionLabel('khao-lak')).toBe('Khao Lak');
 });
 it('does not accept arbitrary property IDs or report scopes as operational hotels',()=>{
  for(const value of [null,undefined,'','kat',' KAT','KAT ','All','Phuket','KhaoLak','UNKNOWN',3,{}])expect(isHotelId(value)).toBe(false);
  for(const hotel of HOTEL_IDS)expect(isHotelId(hotel)).toBe(true);
  expect(isRegionId('phuket')).toBe(true);expect(isRegionId('khao-lak')).toBe(true);expect(isRegionId('KhaoLak')).toBe(false);
 });
 it('keeps hotel identity separate even when Account and Invoice IDs will match',()=>{
  for(const hotel of ['KAT','TSK'] as const){expect(hotelRegion(hotel)).toBe('phuket');expect(hotelInRegion(hotel,'khao-lak')).toBe(false);}
  for(const hotel of ['TLKL','WAKL','TLFO','TSAN'] as const){expect(hotelRegion(hotel)).toBe('khao-lak');expect(hotelInRegion(hotel,'phuket')).toBe(false);}
 });
 it('preserves old Phuket URLs and resolves explicit Khao Lak properties',()=>{
  expect(resolveRegion(new URLSearchParams())).toBe('phuket');
  expect(resolveRegion(new URLSearchParams('property=KAT&account=example'))).toBe('phuket');
  expect(resolveRegion(new URLSearchParams('property=TLKL&account=example'))).toBe('khao-lak');
  expect(resolveRegion(new URLSearchParams('hotel=TSAN'))).toBe('khao-lak');
  expect(resolveRegion(new URLSearchParams('region=khao-lak&hotel=All'))).toBe('khao-lak');
 });
 it('uses an explicit valid region before incompatible stale browser filters',()=>{
  expect(resolveRegion(new URLSearchParams('region=phuket&property=TLKL'))).toBe('phuket');
  expect(resolveRegion(new URLSearchParams('region=bad&hotel=All'))).toBe('phuket');
 });
 it('retains Phuket default reports and maps only the explicit four-hotel scope',()=>{
  for(const value of [null,'','All']){expect(reportHotelScope('phuket',value)).toBe(null);expect(reportHotelScope('khao-lak',value)).toBe('KhaoLak');}
  expect(reportHotelScope('phuket','KAT')).toBe('KAT');expect(reportHotelScope('khao-lak','WAKL')).toBe('WAKL');
 });
 it('rejects incompatible or invented report hotel filters instead of widening them',()=>{
  expect(()=>reportHotelScope('phuket','TLKL')).toThrow('hotel_region_mismatch');
  expect(()=>reportHotelScope('khao-lak','KAT')).toThrow('hotel_region_mismatch');
  for(const value of ['KhaoLak','UNKNOWN',' kat ','TSK/other'])expect(()=>reportHotelScope('phuket',value)).toThrow('hotel_invalid');
 });
});
