import {hotelRegion,type HotelId,type RegionId} from '../../src/domain/hotels';

export const trackerFields=['R','S','T','U','V','W','X','Y','Z','AA','AB','AC'] as const;
export type TrackerField=typeof trackerFields[number];
export type TrackerValues=Partial<Record<TrackerField,string|null>>;
export interface TrackerIdentity {hotel:HotelId;invoiceNo:string;accountNo:string;folioNo?:string|null;transactionDate?:string|null}
export interface TrackerCandidate extends TrackerIdentity {accountId:string;invoiceId:string}
const aliases:Record<string,HotelId>={KT:'KAT',KAT:'KAT',TS:'TSK',TSK:'TSK',SAN:'TSAN',TSAN:'TSAN',WAT:'WAKL',WAKL:'WAKL',LFO:'TLFO',TLFO:'TLFO',TLKL:'TLKL'};
export function trackerHotel(value:string,region:RegionId):HotelId|null {
 const hotel=aliases[value.trim().toUpperCase()];return hotel&&hotelRegion(hotel)===region?hotel:null;
}
/** Invoice and account numbers remain strings: leading zeroes are identity. */
export function matchTrackerInvoice(row:TrackerIdentity,candidates:readonly TrackerCandidate[]):TrackerCandidate|null {
 const matches=candidates.filter(c=>c.hotel===row.hotel&&c.invoiceNo===row.invoiceNo&&c.accountNo===row.accountNo&&(!row.folioNo||c.folioNo===row.folioNo)&&(!row.transactionDate||c.transactionDate===row.transactionDate));
 return matches.length===1?matches[0]:null;
}
export function trackerRowKey(row:TrackerIdentity):string {return JSON.stringify([row.hotel,row.accountNo,row.invoiceNo,row.folioNo??null]);}
export type MergeDecision='unchanged'|'import'|'echo'|'conflict';
export function trackerMerge(baseline:string|null|undefined,sheet:string|null,web:string|null):MergeDecision {
 if(sheet===web)return baseline===sheet?'unchanged':'echo';
 if(baseline===undefined)return web===null&&sheet!==null?'import':'conflict';
 if(sheet===baseline)return 'unchanged';
 return web===baseline?'import':'conflict';
}
export function confirmedSentFields(purpose:string,stage:string|null):('R'|'U'|'V'|'W')[] {
 if(purpose==='billing')return ['R'];
 if(purpose!=='collection')return [];
 return stage==='Follow 1'?['U']:stage==='Follow 2'?['V']:stage==='Follow 3'?['W']:[];
}
