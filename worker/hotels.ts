import {
 HOTEL_IDS,
 hotelInRegion,
 isHotelId,
 isRegionId,
 regionHotels,
 reportHotelScope,
 resolveRegion,
 type HotelId,
 type RegionId,
} from '../src/domain/hotels';

export type ReportHotelScope=HotelId|'KhaoLak'|null;
export interface RegionalHotelScope {region:RegionId;explicitRegion:boolean;hotel:HotelId|null;reportHotel:ReportHotelScope}

/** Browser regions are public input; the reserved KhaoLak value is produced only here for report RPCs. */
export function regionalHotelScope(params:URLSearchParams,account:unknown=null,allowLegacyAll=false):RegionalHotelScope {
 if(params.getAll('region').length>1)throw Error('hotel_scope_invalid');
 const rawRegion=params.get('region');
 if(rawRegion!==null&&!isRegionId(rawRegion))throw Error('hotel_scope_invalid');
 const rawHotel=params.get('hotel');
 if(rawHotel==='All'&&rawRegion===null&&!allowLegacyAll)throw Error('hotel_scope_invalid');
 const region=rawRegion??resolveRegion(params);
 let reportHotel:ReportHotelScope;
 try{reportHotel=reportHotelScope(region,rawHotel);}catch{throw Error('hotel_scope_invalid');}
 const hotel=isHotelId(rawHotel)?rawHotel:null;
 if(account!==null&&account!==undefined&&account!==''&&!hotel)throw Error('hotel_scope_invalid');
 return {region,explicitRegion:rawRegion!==null,hotel,reportHotel};
}

export function operationalHotel(value:unknown):HotelId {
 if(!isHotelId(value))throw Error('hotel_scope_invalid');
 return value;
}

/** Fail closed on unknown/duplicate configured values and preserve registry order for bounded dispatch. */
export function configuredOperaHotels(value:string|undefined):readonly HotelId[] {
 if(!value)return [];
 const requested=value.split(',').map(hotel=>hotel.trim());
 if(!requested.length||requested.some(hotel=>!isHotelId(hotel))||new Set(requested).size!==requested.length)return [];
 const selected=new Set(requested);
 return HOTEL_IDS.filter(hotel=>selected.has(hotel));
}

/** Recursively fences every operational hotel identity returned by a regional read. */
export function resultMatchesHotelScope(value:unknown,region:RegionId,exactHotel:HotelId|null=null):boolean {
 const allowed=new Set<HotelId>(exactHotel?[exactHotel]:regionHotels(region));
 const visit=(current:unknown,key:string|null=null):boolean=>{
  if(Array.isArray(current)){
   if(key==='hotels'&&current.length>0&&current.every(item=>typeof item==='string'))return current.length===allowed.size&&current.every((item,index)=>isHotelId(item)&&allowed.has(item)&&item===[...allowed][index]);
   if((key==='missingHotels'||key==='refreshingHotels'||key==='failedHotels')&&current.some(item=>!isHotelId(item)||!allowed.has(item)))return false;
   return current.every(item=>visit(item));
  }
  if(!current||typeof current!=='object')return true;
  const object=current as Record<string,unknown>;
  if(Object.hasOwn(object,'hotel')&&object.hotel!==null&&object.hotel!==undefined&&(!isHotelId(object.hotel)||!allowed.has(object.hotel)))return false;
  return Object.entries(object).every(([childKey,child])=>visit(child,childKey));
 };
 return visit(value);
}

export function hotelBelongsToRegion(value:unknown,region:RegionId):value is HotelId {return hotelInRegion(value,region);}
