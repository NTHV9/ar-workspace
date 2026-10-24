import {canonical} from './ar-tax';
import type {InvoicePacket} from './model';
type Row=Record<string,unknown>;
type Packet=Pick<InvoicePacket,'manifest'|'account'>;
export interface CountryDisplayAccountSource {hotel:string;accountId:string;value:{present:boolean;raw?:unknown};code:{present:boolean;raw?:unknown}}
export interface ArCountryDisplayProof {version:1;kind:'ar-property-country-name-display';hotel:string;countryCode:string;sourceBefore:CountryDisplayAccountSource;sourceAfter:CountryDisplayAccountSource;metadataBefore:unknown;metadataAfter:unknown}
const fail=():never=>{throw Error('document_invoice_country_display_unverified');};
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:fail();
const optional=(v:unknown):Row=>v==null?{}:object(v);
const text=(v:unknown,max=2000)=>{if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v))return fail();return v.trim();};
const only=(v:Row,allowed:string[])=>{if(Object.keys(v).some(k=>!allowed.includes(k)))return fail();};
const codeShape=/^[A-Z]{2,3}$/;
/** Addresses intentionally sit outside the financial fingerprint. Bind both
 * raw country fields and their presence separately, including null values. */
export function countryDisplayAccountSource(packet:Packet):CountryDisplayAccountSource{
 const account=object(packet.account),hotel=text(account.hotelId,20),rawId=object(account.accountId).id,accountId=typeof rawId==='number'&&Number.isSafeInteger(rawId)?String(rawId):text(rawId,80);
 if(hotel!==packet.manifest.hotel||accountId!==packet.manifest.account_id)return fail();const country=optional(optional(optional(account.address).address).country),field=(key:string)=>({present:Object.prototype.hasOwnProperty.call(country,key),...Object.prototype.hasOwnProperty.call(country,key)?{raw:structuredClone(country[key])}:{}});
 return {hotel,accountId,value:field('value'),code:field('code')};
}
export function countryDisplayCode(source:CountryDisplayAccountSource):string|undefined{
 const value=source.value.present?source.value.raw:undefined,code=source.code.present?source.code.raw:undefined,selected=value??code;if(typeof selected!=='string'||!codeShape.test(selected.trim()))return undefined;const requested=selected.trim();
 for(const field of [value,code])if(field!=null&&field!==''){if(typeof field!=='string'||!codeShape.test(field.trim())||field.trim()!==requested)return undefined;}
 return requested;
}
export function verifyArCountryDisplayProof(packet:Packet,raw:ArCountryDisplayProof):string{
 const proof=object(raw);only(proof,['version','kind','hotel','countryCode','sourceBefore','sourceAfter','metadataBefore','metadataAfter']);if(proof.version!==1||proof.kind!=='ar-property-country-name-display'||proof.hotel!==packet.manifest.hotel)return fail();const source=countryDisplayAccountSource(packet),code=countryDisplayCode(source);if(!code||proof.countryCode!==code||canonical(proof.sourceBefore)!==canonical(source)||canonical(proof.sourceAfter)!==canonical(source)||canonical(proof.metadataBefore)!==canonical(proof.metadataAfter))return fail();
 const metadata=object(proof.metadataBefore);only(metadata,['countries','missingCodes']);if(!Array.isArray(metadata.countries)||metadata.countries.length>20||!Array.isArray(metadata.missingCodes)||metadata.missingCodes.length>20)return fail();const seen=new Set<string>(),records=metadata.countries.map(object);
 for(const row of records){const key=text(row.countryCode,20);if(!key||row.hotelId!==source.hotel||seen.has(key))return fail();seen.add(key);}
 const missing=metadata.missingCodes.map(v=>text(v,20));if(new Set(missing).size!==missing.length||missing.some(k=>seen.has(k))||missing.includes(code))return fail();const matching=records.filter(row=>row.countryCode===code);if(matching.length!==1)return fail();const selected=matching[0],name=text(selected.name,80);if(!name)return fail();
 if(selected.description!==undefined){const description=object(selected.description),defaultText=description.defaultText===undefined?'':text(description.defaultText);if(defaultText&&defaultText!==name)return fail();if(description.translatedTexts!==undefined){if(!Array.isArray(description.translatedTexts)||description.translatedTexts.length>4000)return fail();for(const raw of description.translatedTexts){const entry=object(raw);if(entry.language!==undefined)text(entry.language,20);if(entry.value!==undefined&&text(entry.value))return fail();}}}
 return name;
}
