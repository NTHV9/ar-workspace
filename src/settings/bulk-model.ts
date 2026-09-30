import {isHotelId,type HotelId} from '../domain/hotels';
import {parseRecipients,parseBillingPortal,type SettingsInput} from '../../worker/settings/validation';
export const bulkFields=['billingRequired','creditTerm','billingMethod','billingPortal','billingInstructions','collectionInstructions','billingRecipients','collectionRecipients'] as const;
export type BulkField=typeof bulkFields[number];
export type SettingsPatch=Partial<Pick<SettingsInput,BulkField>>;
export interface BulkTarget {hotel:HotelId;accountId:string;revision:number}
export interface TypeTarget {hotel:HotelId;type:string;revision:number}
export interface BulkSelection {mode:'accounts'|'types';accounts:BulkTarget[];types:TypeTarget[];patch:SettingsPatch}
export interface SettingsAccount extends BulkTarget {source?:'account'|'type'|'none';name:string;accountNo?:string|null;type:string;invoices:number;billingRequired:boolean|null;creditTerm:number|null;billingMethod:'email'|'system'|null}
export interface TypeDefault extends TypeTarget {patch:SettingsPatch}
export interface SettingsCatalog {rows:SettingsAccount[];defaults:TypeDefault[];total:number}
export interface BulkPreview extends BulkSelection {rows:(SettingsAccount&{changed:boolean})[];accountCount:number;invoiceCount:number;changedCount:number;defaultsCount:number}
const invalid=():never=>{throw Error('bulk_settings_invalid');};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function parseSettingsPatch(input:unknown):SettingsPatch{
 if(!object(input)||!Object.keys(input).length||Object.keys(input).some(k=>!bulkFields.includes(k as BulkField)))return invalid();
 const patch:SettingsPatch={};
 for(const key of bulkFields){if(!(key in input))continue;const value=input[key];
  if(key==='billingRequired'){if(value!==null&&typeof value!=='boolean')return invalid();patch[key]=value;}
  else if(key==='creditTerm'){if(value!==null&&(!Number.isSafeInteger(value)||Number(value)<0||Number(value)>3650))return invalid();patch[key]=value as number|null;}
  else if(key==='billingMethod'){if(value!==null&&value!=='email'&&value!=='system')return invalid();patch[key]=value;}
  else if(key==='billingPortal')patch[key]=parseBillingPortal(value);
  else if(key==='billingRecipients'||key==='collectionRecipients')patch[key]=parseRecipients(value);
  else {if(typeof value!=='string'||value.length>4000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))return invalid();patch[key]=value.trim();}
 }
 return patch;
}
export function parseBulkSelection(input:unknown):BulkSelection{
 if(!object(input)||!['accounts','types'].includes(String(input.mode))||!Array.isArray(input.accounts)||!Array.isArray(input.types)||input.accounts.length>500||input.types.length>120)return invalid();
 const seen=new Set<string>();
 const accounts=input.accounts.map(v=>{if(!object(v)||!isHotelId(v.hotel)||typeof v.accountId!=='string'||!v.accountId||v.accountId.length>200||!Number.isSafeInteger(v.revision)||Number(v.revision)<0)return invalid();const key=JSON.stringify([v.hotel,v.accountId]);if(seen.has(key))return invalid();seen.add(key);return {hotel:v.hotel,accountId:v.accountId,revision:Number(v.revision)};});
 seen.clear();const types=input.types.map(v=>{if(!object(v)||!isHotelId(v.hotel)||typeof v.type!=='string'||!v.type.trim()||v.type.length>200||!Number.isSafeInteger(v.revision)||Number(v.revision)<0)return invalid();const key=JSON.stringify([v.hotel,v.type]);if(seen.has(key))return invalid();seen.add(key);return {hotel:v.hotel,type:v.type,revision:Number(v.revision)};});
 if(input.mode==='accounts'&&(!accounts.length||types.length)||input.mode==='types'&&!types.length)return invalid();
 return {mode:input.mode as BulkSelection['mode'],accounts,types,patch:parseSettingsPatch(input.patch)};
}
