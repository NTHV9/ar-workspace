import {parseSettings,parseRecipients,validMailbox,type SettingsInput} from './validation';
export interface AgentSheetRow {row:number;number:unknown;agent:unknown;term:unknown;type:unknown;billing:unknown;collection:unknown}
export interface ParsedAgentRow extends Omit<SettingsInput,'revision'> {row:number;accountNo:string;sourceName:string;warnings:string[];billingMethod:'email'|'system';billingPortal:string|null;billingInstructions:string;collectionInstructions:string}
export interface ImportAccount {hotel:string;id:string;account_no:string|null;name:string;revision:number}
function emails(value:unknown){
 if(value!==null&&value!==undefined&&typeof value!=='string')throw Error('import_email_invalid');const raw=String(value??'').trim();if(raw.length>12000)throw Error('import_email_too_large');
 const pattern=/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
 const matches=[...raw.matchAll(pattern)];
 for(const match of matches){const before=raw[match.index-1],after=raw[match.index+match[0].length];if(before&&!/[\s,;'"(<]/.test(before)||after&&!/[\s,;'")>]/.test(after))throw Error('import_email_invalid');}
 const addresses=matches.map(m=>m[0]);if(addresses.some(s=>!validMailbox(s)))throw Error('import_email_invalid');
 const remainder=raw.replace(pattern,'').trim().replace(/^[\s,;'"<>]+|[\s,;'"<>]+$/g,'').trim();if(remainder.includes('@')||/[<>]/.test(remainder))throw Error('import_email_invalid');
 const normalized=[...new Map(addresses.map(s=>[s.toLowerCase(),s])).values()];
 return {recipients:parseRecipients({to:normalized,cc:[],bcc:[]}),notes:remainder,cleaned:raw.endsWith("'")||addresses.length!==normalized.length};
}
export function parseAgentRow(r:AgentSheetRow):ParsedAgentRow{
 if(!Number.isSafeInteger(r.row)||r.row<1||typeof r.number!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(r.number.trim())||typeof r.agent!=='string'||!r.agent.trim()||r.agent.length>300||!Number.isSafeInteger(r.term)||Number(r.term)<0||Number(r.term)>2147483647||!['By Email','By System'].includes(String(r.type)))throw Error('import_row_invalid');
 const method=r.type==='By System'?'system':'email';let portal:string|null=null,billing;
 const raw=String(r.billing??'').trim();
 if(method==='system'&&!raw.includes('@')){if(/^https:\/\//i.test(raw)||/^(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,63}(?:\/[^\s]*)?$/.test(raw))portal=/^https:\/\//i.test(raw)?raw:'https://'+raw;billing={recipients:{to:[],cc:[],bcc:[]},notes:portal?'':raw,cleaned:false};}else billing=emails(r.billing);
 const collection=emails(r.collection),warnings=[];if(method==='email'&&!billing.recipients.to.length)warnings.push('billing_email_missing');if(!collection.recipients.to.length)warnings.push('collection_email_missing');if(billing.cleaned||collection.cleaned)warnings.push('email_delimiter_normalized');
 const checked=parseSettings({revision:0,billingRequired:true,creditTerm:r.term,billingMethod:method,billingPortal:portal,billingInstructions:billing.notes,collectionInstructions:collection.notes,billingRecipients:billing.recipients,collectionRecipients:collection.recipients});
 const {revision:_,...settings}=checked;
 return {...settings,row:r.row,accountNo:r.number.trim().toUpperCase(),sourceName:r.agent.trim(),billingMethod:method,billingPortal:checked.billingPortal??null,billingInstructions:checked.billingInstructions??'',collectionInstructions:checked.collectionInstructions??'',warnings};
}
export function matchAgentRows(rows:ParsedAgentRow[],accounts:ImportAccount[],hotels:string[]){
 if(!hotels.length||new Set(hotels).size!==hotels.length||hotels.some(h=>!['KAT','TSK'].includes(h)))throw Error('import_scope_invalid');
 const seen=new Set<string>(),matched:{row:ParsedAgentRow;account:ImportAccount}[]=[],missing:{row:number;accountNo:string;hotel:string}[]=[];
 for(const row of rows){if(seen.has(row.accountNo))throw Error('import_duplicate_account_number');seen.add(row.accountNo);
  for(const hotel of hotels){const list=accounts.filter(a=>a.hotel===hotel&&a.account_no?.trim().toUpperCase()===row.accountNo);if(list.length>1)throw Error('import_ambiguous_account');if(!list.length){missing.push({row:row.row,accountNo:row.accountNo,hotel});continue;}matched.push({row,account:list[0]});}
 }return {matched,missing};
}
