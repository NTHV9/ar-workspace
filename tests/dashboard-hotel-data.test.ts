import {describe,expect,it} from 'vitest';
import {hotelOverviewResult} from '../src/dashboard/hotel-data';
import {regionHotels,type HotelId} from '../src/domain/hotels';
function scope(hotels:readonly HotelId[]){
 const financial={summary:{amount:'0.00',unknownAmounts:0,unknownSourceDates:0,notObserved:0},coverage:{complete:false,lastSuccessAt:null,lastAttemptStatus:null,hotels}};
 return {balances:{asOfDate:'2026-09-15',mode:'current',complete:true,capturedAt:null,sourceAt:null,missingHotels:[],metrics:[{key:'open',count:0,amount:'0.00'}],stages:[],rows:[],total:0,unverified:0},activity:{rows:[],total:0,summary:{kinds:[]}},external:{rows:[],total:0,summary:{records:0,firstBillingInvoices:0}},entries:financial,payments:financial,paid:{rows:[],total:0,summary:{count:null,amount:null},complete:false,unknownMappings:0}};
}
describe('regional overview financial coverage metadata',()=>{
 it.each(['phuket','khao-lak'] as const)('accepts aggregate %s coverage with separate per-hotel subsets',region=>{
  const hotels=regionHotels(region),payload={region,from:'2026-09-15',to:'2026-09-15',total:scope(hotels),hotels:hotels.map(hotel=>({hotel,...scope([hotel])}))};
  const parsed=hotelOverviewResult(payload,payload.from,payload.to,region);
  expect(parsed.hotels).toHaveLength(hotels.length);expect(parsed).toMatchObject({total:{entries:{coverage:{hotels}}},hotels:hotels.map(hotel=>({hotel,payments:{coverage:{hotels:[hotel]}}}))});
 });
});
