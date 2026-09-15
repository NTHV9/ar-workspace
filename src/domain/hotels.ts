/** Operational hotel IDs are deliberately distinct from reporting regions. */
export const HOTEL_IDS = ['KAT','TSK','TLKL','WAKL','TLFO','TSAN'] as const;
export type HotelId = typeof HOTEL_IDS[number];
export const REGION_IDS = ['phuket','khao-lak'] as const;
export type RegionId = typeof REGION_IDS[number];

const hotelsByRegion:Record<RegionId,readonly HotelId[]> = {
 phuket:Object.freeze(['KAT','TSK'] as HotelId[]),
 'khao-lak':Object.freeze(['TLKL','WAKL','TLFO','TSAN'] as HotelId[]),
};
const hotelRegions:Record<HotelId,RegionId> = {KAT:'phuket',TSK:'phuket',TLKL:'khao-lak',WAKL:'khao-lak',TLFO:'khao-lak',TSAN:'khao-lak'};

export const isHotelId=(value:unknown):value is HotelId=>typeof value==='string'&&(HOTEL_IDS as readonly string[]).includes(value);
export const isRegionId=(value:unknown):value is RegionId=>typeof value==='string'&&(REGION_IDS as readonly string[]).includes(value);
export const hotelRegion=(hotel:HotelId):RegionId=>hotelRegions[hotel];
export const regionHotels=(region:RegionId):readonly HotelId[]=>hotelsByRegion[region];
export const regionLabel=(region:RegionId)=>region==='phuket'?'Phuket':'Khao Lak';
export const hotelInRegion=(hotel:unknown,region:RegionId):hotel is HotelId=>isHotelId(hotel)&&hotelRegion(hotel)===region;

/** URL compatibility only; backend requests must separately validate all inputs. */
export function resolveRegion(params:URLSearchParams):RegionId {
 const region=params.get('region');if(isRegionId(region))return region;
 for(const key of ['property','hotel','dashboardHotel']){const hotel=params.get(key);if(isHotelId(hotel))return hotelRegion(hotel);}
 return 'phuket';
}

/** Legacy null means Phuket. KhaoLak is a report scope, never an operational ID. */
export function reportHotelScope(region:RegionId,hotel:string|null):HotelId|'KhaoLak'|null {
 if(!hotel||hotel==='All')return region==='phuket'?null:'KhaoLak';
 if(!isHotelId(hotel))throw Error('hotel_invalid');
 if(!hotelInRegion(hotel,region))throw Error('hotel_region_mismatch');
 return hotel;
}
