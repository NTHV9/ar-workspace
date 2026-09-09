import {parseRecipients,type Recipients} from '../settings/validation';
export interface EmailInput {revision:number;purpose:'billing'|'collection';recipients:Recipients;subject:string;body:string}
export function parseEmailDraft(value:unknown):EmailInput{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('email_invalid');const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['revision','purpose','recipients','subject','body'].includes(k))||!Number.isSafeInteger(v.revision)||(v.revision as number)<0||!['billing','collection'].includes(String(v.purpose))||typeof v.subject!=='string'||v.subject.length>998||/[\r\n]/.test(v.subject)||typeof v.body!=='string'||v.body.length>100000)throw Error('email_invalid');
 return {revision:v.revision as number,purpose:v.purpose as EmailInput['purpose'],recipients:parseRecipients(v.recipients),subject:v.subject,body:v.body};
}
