import type {InvoiceWorkflow} from './portfolio';
export interface QueueInvoice {hotel:string;account_id:string;id:string;guest:string;invoice_no:string|null;folio_no:string|null;open:number;transaction_date:string;collection_role:string;collection_selectable:boolean;verification_state:string;workflow:InvoiceWorkflow|null}
export type ActionStage='Billing'|'Friendly'|'Follow 1'|'Follow 2'|'Follow 3'|'Final'|'Urgent'|'Setup needed'|'Needs review';
export const actionStages:ActionStage[]=['Billing','Friendly','Follow 1','Follow 2','Follow 3','Final','Urgent','Setup needed','Needs review'];
export const stageLabel=(stage:string)=>stage.replace(/^Follow ([123])$/,'Follow-up $1');
export interface CollectionAction {stage:ActionStage;date:string|null;ready:boolean;reason?:string;latest:string;overdueDays:number|null}
export const thaiToday=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Bangkok'});
const validDate=(s:string|null|undefined):s is string=>!!s&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
export function calendarAdd(date:string,days:number){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function nextCollectionAction(invoice:QueueInvoice,today:string):CollectionAction|null{
 if(invoice.open<=0||invoice.collection_role==='child')return null;
 const w=invoice.workflow,latest=w?.last_reminder_stage??(w?.first_billing_date?'Billed':'No reminders sent');
 const overdueDays=validDate(w?.due_date)?Math.max(0,Math.round((Date.parse(today)-Date.parse(w.due_date))/86400000)):null;
 const result=(stage:ActionStage,date:string|null,reason?:string):CollectionAction=>({stage,date,ready:date===null||date<=today,reason,latest,overdueDays});
 if(!validDate(today))return result('Needs review',null,'Calendar date unavailable');
 if(invoice.verification_state!=='verified'||!invoice.collection_selectable||!['standalone','parent'].includes(invoice.collection_role))return result('Needs review',null,'OPERA invoice verification required');
 if(!w)return result('Setup needed',null,'Account billing rules have not been assigned');
 if(w.last_reminder_stage&&(!validDate(w.last_reminder_date)||w.last_reminder_date>today))return result('Needs review',null,'Actual reminder date needs review');
 if(w.last_reminder_stage==='Final')return result('Urgent',w.last_reminder_date!);
 const next:Record<string,ActionStage>={'Follow 1':'Follow 2','Follow 2':'Follow 3','Follow 3':'Final'};
 if(w.last_reminder_stage&&next[w.last_reminder_stage])return result(next[w.last_reminder_stage],calendarAdd(w.last_reminder_date!,7));
 if(w.last_reminder_stage&&w.last_reminder_stage!=='Friendly')return result('Needs review',null,'Unknown reminder stage');
 if(w.billing_required===null)return result('Setup needed',null,'Set Billing Required / Not Required');
 if(w.billing_required&&!w.first_billing_date)return result('Billing',validDate(invoice.transaction_date)?invoice.transaction_date:today,w.credit_term===null?'Credit term is required before sending':undefined);
 if(w.credit_term===null)return result('Setup needed',null,'Set the credit term to determine the due date');
 if(!validDate(w.due_date))return result('Needs review',null,'Due date unavailable');
 if(w.last_reminder_stage==='Friendly'||today>w.due_date)return result('Follow 1',calendarAdd(w.due_date,1));
 return result('Friendly',calendarAdd(w.due_date,-7));
}
