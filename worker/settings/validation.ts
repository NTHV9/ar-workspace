export interface Recipients {to:string[];cc:string[];bcc:string[]}
export interface SettingsInput {revision:number;billingRequired:boolean|null;creditTerm:number|null;billingRecipients:Recipients;collectionRecipients:Recipients}
const invalid=():never=>{throw Error('settings_invalid');};
export function parseRecipients(value:unknown):Recipients {
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();const obj=value as Record<string,unknown>;
 if(Object.keys(obj).some(k=>!['to','cc','bcc'].includes(k)))return invalid();const seen=new Set<string>();
 const read=(key:string)=>{const a=obj[key];if(!Array.isArray(a)||a.length>200)return invalid();return a.map(v=>{if(typeof v!=='string'||/[\r\n]/.test(v))return invalid();const s=v.trim();if(s.length>254||!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(s)||seen.has(s.toLowerCase()))return invalid();seen.add(s.toLowerCase());return s;});};
 return {to:read('to'),cc:read('cc'),bcc:read('bcc')};
}
export function parseSettings(value:unknown):SettingsInput {
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();const v=value as Record<string,unknown>;
 if(!Number.isSafeInteger(v.revision)||(v.revision as number)<0||(v.billingRequired!==null&&typeof v.billingRequired!=='boolean')||(v.creditTerm!==null&&(!Number.isSafeInteger(v.creditTerm)||(v.creditTerm as number)<0||(v.creditTerm as number)>2147483647)))return invalid();
 return {revision:v.revision as number,billingRequired:v.billingRequired as boolean|null,creditTerm:v.creditTerm as number|null,billingRecipients:parseRecipients(v.billingRecipients),collectionRecipients:parseRecipients(v.collectionRecipients)};
}
