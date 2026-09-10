import {isCollectionStageKey,type CollectionStageKey} from '../domain/collection-policy';
import {parseRichMessage,plainMessage,richText,type RichMessage} from './rich-message';
export type TemplateStage=CollectionStageKey;
export interface TemplateInput {name:string;purpose:'billing'|'collection';stage:TemplateStage|null;subject:string;richBody:RichMessage;archived:boolean}
export interface EmailTemplate extends TemplateInput {id:string;revision:number;updated_at:string}
export interface TemplateReference {id:string;revision:number;name:string}
const keys=['name','purpose','stage','subject','richBody','archived'];
const stages=['Friendly','Follow 1','Follow 2','Follow 3','Final'];
const tokens=new Set(['account_name','hotel','invoice_count']);
function checkTokens(text:string){for(const match of text.matchAll(/\{\{([^{}]*)\}\}/g))if(!tokens.has(match[1]))throw Error('template_token_invalid');if(text.replace(/\{\{[^{}]*\}\}/g,'').includes('{{')||text.replace(/\{\{[^{}]*\}\}/g,'').includes('}}'))throw Error('template_token_invalid');}
export function parseTemplate(input:unknown):TemplateInput{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('template_invalid');const v=input as Record<string,unknown>;
 if(Object.keys(v).some(k=>!keys.includes(k))||typeof v.name!=='string'||!v.name.trim()||v.name.length>80||/[\x00-\x1f]/.test(v.name)||!['billing','collection'].includes(String(v.purpose))||typeof v.subject!=='string'||v.subject.length>998||/[\x00-\x1f\x7f]/.test(v.subject)||typeof v.archived!=='boolean'||(v.purpose==='billing'?v.stage!==null:!isCollectionStageKey(v.stage)))throw Error('template_invalid');
 const richBody=parseRichMessage(v.richBody);checkTokens(v.subject);for(const b of richBody.blocks)for(const r of b.runs){checkTokens(r.text);if(r.href&&/[{}]/.test(r.href))throw Error('template_token_invalid');}
 return {name:v.name.trim(),purpose:v.purpose as TemplateInput['purpose'],stage:v.stage as TemplateStage|null,subject:v.subject,richBody,archived:v.archived};
}
export function applyTemplate(template:TemplateInput,context:{accountName:string;hotel:string;invoiceCount:number}){
 if(/[\x00-\x1f\x7f]/.test(context.accountName)||!['KAT','TSK'].includes(context.hotel)||!Number.isSafeInteger(context.invoiceCount)||context.invoiceCount<1)throw Error('template_context_invalid');
 const values:Record<string,string>={account_name:context.accountName,hotel:context.hotel,invoice_count:String(context.invoiceCount)};
 const replace=(s:string)=>s.replace(/\{\{(account_name|hotel|invoice_count)\}\}/g,(_,key:string)=>values[key]);
 const subject=replace(template.subject);if(subject.length>998)throw Error('template_context_invalid');
 const richBody=parseRichMessage({...template.richBody,blocks:template.richBody.blocks.map(b=>({...b,runs:b.runs.map(r=>({...r,text:replace(r.text)}))}))});
 return {subject,richBody,body:richText(richBody)};
}
const closing='\n\nPlease contact our Accounts Receivable team if you need assistance.\n\nKind regards,\nAccounts Receivable';
export const starterTemplates:TemplateInput[]=[
 {name:'Billing',purpose:'billing',stage:null,subject:'Billing documents — {{account_name}} — {{hotel}}',richBody:plainMessage('Dear customer,\n\nPlease find the reviewed billing documents for {{invoice_count}} invoices attached.'+closing),archived:false},
 ...(['Friendly','Follow 1','Follow 2','Follow 3','Final'] as TemplateStage[]).map((stage,i)=>({name:stage.replace('Follow ','Follow-up '),purpose:'collection' as const,stage,subject:`${['Friendly payment reminder','Payment follow-up','Second payment follow-up','Third payment follow-up','Final payment reminder'][i]} — {{account_name}} — {{hotel}}`,richBody:plainMessage('Dear customer,\n\n'+['Please find the documents for the invoices approaching their payment due date attached. Kindly confirm your planned payment date.','We are following up on the outstanding invoices detailed in the attached documents. Kindly advise your expected payment date.','We would appreciate an update on payment for the outstanding invoices in the attached documents.','We are following up again on the outstanding invoices. Please provide your payment status and expected settlement date.','Please review the outstanding invoices in the attached documents and contact us promptly to confirm your payment arrangements.'][i]+closing),archived:false}))
];
