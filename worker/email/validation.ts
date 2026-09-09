import {parseRecipients,type Recipients} from '../settings/validation';
import {parseRichMessage,richText,type RichMessage} from '../../src/email/rich-message';
import type {TemplateReference} from '../../src/email/templates';
export interface EmailInput {revision:number;purpose:'billing'|'collection';recipients:Recipients;subject:string;body:string;richBody?:RichMessage|null;templateRef?:TemplateReference|null}
export function parseEmailDraft(value:unknown):EmailInput{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('email_invalid');const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['revision','purpose','recipients','subject','body','richBody','templateRef'].includes(k))||!Number.isSafeInteger(v.revision)||(v.revision as number)<0||!['billing','collection'].includes(String(v.purpose))||typeof v.subject!=='string'||v.subject.length>998||/[\x00-\x1f\x7f]/.test(v.subject)||typeof v.body!=='string'||v.body.length>100000)throw Error('email_invalid');
 let richBody:RichMessage|null=null;try{if(v.richBody!=null){richBody=parseRichMessage(v.richBody);if(richText(richBody)!==v.body)throw Error();}}catch{throw Error('email_invalid');}
 let templateRef:TemplateReference|null=null;
 if(v.templateRef!=null){const t=v.templateRef as Record<string,unknown>;if(typeof t!=='object'||Array.isArray(t)||Object.keys(t).some(k=>!['id','revision','name'].includes(k))||typeof t.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(t.id)||!Number.isSafeInteger(t.revision)||Number(t.revision)<1||typeof t.name!=='string'||!t.name||t.name.length>80)throw Error('email_invalid');templateRef=t as unknown as TemplateReference;}
 return {revision:v.revision as number,purpose:v.purpose as EmailInput['purpose'],recipients:parseRecipients(v.recipients),subject:v.subject,body:v.body,...(v.richBody!==undefined?{richBody}:{}),...(v.templateRef!==undefined?{templateRef}:{})};
}
