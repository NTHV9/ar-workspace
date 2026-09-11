export interface Recipients {to:string[];cc:string[];bcc:string[]}
export interface SettingsInput {revision:number;billingRequired:boolean|null;creditTerm:number|null;billingRecipients:Recipients;collectionRecipients:Recipients;billingMethod?:'email'|'system'|null;billingPortal?:string|null;billingInstructions?:string;collectionInstructions?:string}
const invalid=():never=>{throw Error('settings_invalid');};
export function validMailbox(s:string){const parts=s.split('@');if(parts.length!==2||parts[0].length<1||parts[0].length>64||parts[0].startsWith('.')||parts[0].endsWith('.')||parts[0].includes('..'))return false;return /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0])&&/^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(parts[1])&&s.length<=254;}
export function parseRecipients(value:unknown):Recipients {
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();const obj=value as Record<string,unknown>;
 if(Object.keys(obj).some(k=>!['to','cc','bcc'].includes(k)))return invalid();const seen=new Set<string>();
 const read=(key:string)=>{const a=obj[key];if(!Array.isArray(a)||a.length>200)return invalid();return a.map(v=>{if(typeof v!=='string'||/[\r\n]/.test(v))return invalid();const s=v.trim();if(!validMailbox(s)||seen.has(s.toLowerCase()))return invalid();seen.add(s.toLowerCase());return s;});};
 return {to:read('to'),cc:read('cc'),bcc:read('bcc')};
}
export function parseSettings(value:unknown):SettingsInput {
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();const v=value as Record<string,unknown>;
 if(!Number.isSafeInteger(v.revision)||(v.revision as number)<0||(v.billingRequired!==null&&typeof v.billingRequired!=='boolean')||(v.creditTerm!==null&&(!Number.isSafeInteger(v.creditTerm)||(v.creditTerm as number)<0||(v.creditTerm as number)>2147483647)))return invalid();
 const extra:Pick<SettingsInput,'billingMethod'|'billingPortal'|'billingInstructions'|'collectionInstructions'>={};
 if('billingMethod' in v){if(v.billingMethod!==null&&!['email','system'].includes(String(v.billingMethod)))return invalid();if(v.billingRequired===true&&v.billingMethod===null)return invalid();extra.billingMethod=v.billingMethod as SettingsInput['billingMethod'];}
 if('billingPortal' in v)extra.billingPortal=parseBillingPortal(v.billingPortal);
 for(const field of ['billingInstructions','collectionInstructions'] as const)if(field in v){if(typeof v[field]!=='string'||v[field].length>4000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v[field]))return invalid();extra[field]=v[field].trim();}
 return {revision:v.revision as number,billingRequired:v.billingRequired as boolean|null,creditTerm:v.creditTerm as number|null,billingRecipients:parseRecipients(v.billingRecipients),collectionRecipients:parseRecipients(v.collectionRecipients),...extra};
}

export function parseBillingPortal(input:unknown):string|null{if(input!==null&&typeof input!=='string')return invalid();const value=(input as string|null)?.trim()||null;if(!value)return null;if(value.length>2048||/[\s\x00-\x1f\\]/.test(value))return invalid();let u:URL;try{u=new URL(value);}catch{return invalid();}if(u.protocol!=='https:'||!u.hostname||u.username||u.password)return invalid();return u.href;}
