import {REGION_IDS,isRegionId,type RegionId} from '../domain/hotels';
export const administratorEmail='ar@katathani.com';
export interface UserAccess {email:string;administrator:boolean;regions:RegionId[];revision:number}
export interface AccessMember extends UserAccess {active:boolean;registered:boolean}
export interface AccessList {rows:AccessMember[];total:number}
export function parseAccess(value:unknown):UserAccess {
 if(!value||typeof value!=='object')throw Error('access_unavailable');
 const v=value as Record<string,unknown>;
 if(typeof v.email!=='string'||typeof v.administrator!=='boolean'||!Array.isArray(v.regions)||!v.regions.length||v.regions.some(r=>!isRegionId(r))||new Set(v.regions).size!==v.regions.length||!Number.isSafeInteger(v.revision)||Number(v.revision)<1)throw Error('access_unavailable');
 if(v.administrator&&(v.email!==administratorEmail||v.regions.length!==2))throw Error('access_unavailable');
 return {email:v.email,administrator:v.administrator,regions:REGION_IDS.filter(r=>(v.regions as unknown[]).includes(r)),revision:Number(v.revision)};
}
export const phuketEmailEnabled=(hotel:string)=>hotel==='KAT'||hotel==='TSK';
