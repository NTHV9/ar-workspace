import type {InvoiceWorkflow} from './portfolio';
import {defaultCollectionPolicy,legacyStageSnapshot,parseStageSnapshot,policyStageLabel,type CollectionPolicy,type CollectionStageKey,type StageSnapshot} from './collection-policy';
export interface QueueInvoice {hotel:string;account_id:string;id:string;guest:string;invoice_no:string|null;folio_no:string|null;open:number;transaction_date:string;collection_role:string;collection_selectable:boolean;verification_state:string;workflow:(InvoiceWorkflow&{last_reminder_policy_version?:number|null;last_reminder_stage_snapshot?:StageSnapshot|null})|null;exceptions?:{held:boolean;needsReview:boolean;dispute:string;reopenedAt:string|null};exception_status?:'available'|'unavailable'}
export type ActionStage=CollectionStageKey|'Billing'|'Urgent'|'Setup needed'|'Needs review'|'On hold';
export const actionStages:ActionStage[]=['Billing','Friendly','Follow 1','Follow 2','Follow 3','Final','Urgent','Setup needed','Needs review','On hold'];
export const actionStagesForPolicy=(policy:CollectionPolicy):ActionStage[]=>['Billing',...policy.rounds.filter(r=>r.active).map(r=>r.key),'Urgent','Setup needed','Needs review','On hold'];
export const stageLabel=(stage:string,policy?:CollectionPolicy|null,snapshot?:StageSnapshot|null)=>policyStageLabel(stage,policy,snapshot);
export interface CollectionAction {stage:ActionStage;date:string|null;ready:boolean;reason?:string;latest:string;overdueDays:number|null;urgent:boolean}
export const thaiToday=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Bangkok'});
const validDate=(s:string|null|undefined):s is string=>!!s&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!s.startsWith('0000-')&&Number.isFinite(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
export function calendarAdd(date:string,days:number){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
/** Undefined policy preserves the legacy default; null means a failed active-policy read. */
export function nextCollectionAction(invoice:QueueInvoice,today:string,policy:CollectionPolicy|null=defaultCollectionPolicy,snapshot?:StageSnapshot|null):CollectionAction|null {
 if(invoice.open<=0||invoice.collection_role==='child')return null;
 const w=invoice.workflow,latest=w?.last_reminder_stage??(w?.first_billing_date?'Billed':'No reminders sent');let captured:StageSnapshot|null=null,snapshotInvalid=false;
 if(w?.last_reminder_stage){try{const raw=snapshot??w.last_reminder_stage_snapshot;captured=raw?parseStageSnapshot(raw):legacyStageSnapshot(w.last_reminder_stage);if(captured&&captured.key!==w.last_reminder_stage)snapshotInvalid=true;}catch{snapshotInvalid=true;}}
 const urgent=!snapshotInvalid&&!!captured?.terminal&&validDate(w?.last_reminder_date)&&w.last_reminder_date<=today;
 const overdueDays=validDate(w?.due_date)?Math.max(0,Math.round((Date.parse(today)-Date.parse(w.due_date))/86400000)):null;
 const result=(stage:ActionStage,date:string|null,reason?:string):CollectionAction=>({stage,date,ready:date===null||date<=today,reason,latest,overdueDays,urgent});
 if(!validDate(today))return result('Needs review',null,'Calendar date unavailable');
 if(invoice.verification_state!=='verified'||!invoice.collection_selectable||!['standalone','parent'].includes(invoice.collection_role))return result('Needs review',null,'OPERA invoice verification required');
 if(invoice.exception_status==='unavailable')return result('Needs review',null,'Invoice exception state unavailable');
 if(invoice.exceptions?.needsReview)return result('Needs review',null,'Reopened invoice requires explicit review');
 if(invoice.exceptions?.held)return result('On hold',null,'Manual hold requires explicit release');
 if(!w)return result('Setup needed',null,'Account billing rules have not been assigned');
 if(w.last_reminder_stage&&(!validDate(w.last_reminder_date)||w.last_reminder_date>today))return result('Needs review',null,'Actual reminder date needs review');
 if(snapshotInvalid||w.last_reminder_stage&&!captured)return result('Needs review',null,'Historical stage policy needs review');
 if(urgent)return result('Urgent',w.last_reminder_date!);
 if(!w.last_reminder_stage&&w.billing_required&&!w.first_billing_date)return result('Billing',validDate(invoice.transaction_date)?invoice.transaction_date:today,w.credit_term===null?'Credit term is required before sending':undefined);
 if(!policy)return result('Needs review',null,'Collection policy unavailable');
 let next=w.last_reminder_stage?policy.rounds.slice(policy.rounds.findIndex(r=>r.key===w.last_reminder_stage)+1).find(r=>r.active&&!captured?.earlierKeys.includes(r.key)):undefined;
 if(w.last_reminder_stage&&(!policy.rounds.some(r=>r.key===w.last_reminder_stage)||!next))return result('Needs review',null,'No active next round after the latest sent stage');
 if(next?.anchor==='previous_sent')return result(next.key,calendarAdd(w.last_reminder_date!,next.offsetDays));
 if(w.billing_required===null)return result('Setup needed',null,'Set Billing Required / Not Required');
 if(w.billing_required&&!w.first_billing_date)return result('Billing',validDate(invoice.transaction_date)?invoice.transaction_date:today,w.credit_term===null?'Credit term is required before sending':undefined);
 if(w.credit_term===null)return result('Setup needed',null,'Set the credit term to determine the due date');
 if(!validDate(w.due_date))return result('Needs review',null,'Due date unavailable');
 if(!next){const dueRounds=policy.rounds.filter(r=>r.active&&r.anchor==='due');next=dueRounds.filter(r=>calendarAdd(w.due_date!,r.offsetDays)<=today).at(-1)??dueRounds[0];}
 if(!next)return result('Needs review',null,'Collection policy has no initial due round');
 return result(next.key,calendarAdd(w.due_date,next.offsetDays));
}
