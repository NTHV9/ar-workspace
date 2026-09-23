import type {AgingInvoice} from './aging-model';
import {legacyStageSnapshot,parseStageSnapshot,policyStageLabel,type CollectionPolicy} from '../domain/collection-policy';
const validDate=(value:string|null|undefined):value is string=>!!value&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
/** Recorded activity only: a planned round or saved draft never advances this status. */
export function invoiceProgress(invoice:AgingInvoice,today:string,policy?:CollectionPolicy|null):string{
 if(invoice.open!==null&&invoice.open<0)return 'Credit';
 if(!invoice.verified||invoice.open===null||invoice.needsReview||invoice.exceptionsAvailable===false)return 'Needs review';
 if(invoice.open===0)return 'Cleared';
 if(invoice.held)return 'On hold';
 if(invoice.statusAvailable===false)return 'Status unavailable';
 const w=invoice.workflow;if(!w)return 'Setup needed';
 if(!validDate(today))return 'Status unavailable';
 if(w.first_billing_date&&(!validDate(w.first_billing_date)||w.first_billing_date>today))return 'Needs review';
 let label:string;
 if(w.last_reminder_stage){
  if(!validDate(w.last_reminder_date)||w.last_reminder_date>today)return 'Needs review';
  try{
   const captured=w.last_reminder_stage_snapshot?parseStageSnapshot(w.last_reminder_stage_snapshot):legacyStageSnapshot(w.last_reminder_stage);
   if(captured&&captured.key!==w.last_reminder_stage)return 'Needs review';
   if(!captured&&!policy?.rounds.some(r=>r.key===w.last_reminder_stage))return 'Status unavailable';
   label=policyStageLabel(w.last_reminder_stage,policy,captured);
   if(captured?.terminal)return label+' · Urgent';
  }catch{return 'Needs review';}
 }else if(w.billing_required===true&&!w.first_billing_date)return 'Not billed';
 else if(w.first_billing_date)label='Billed';
 else if(w.billing_required===false)label='No follow-up sent';
 else return 'Setup needed';
 if(validDate(w.due_date)){
  if(w.due_date<today)return w.last_reminder_stage?label+' · Past due':'Past due · No follow-up sent';
  if(w.due_date===today)return label+' · Due today';
 }
 return label;
}
