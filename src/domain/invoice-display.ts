import {sortRows,type AgingBucket,type Invoice,type InvoiceWorkflow} from './portfolio';

/** Display the latest recorded action; never turn missing setup into an unsent reminder. */
export function latestInvoiceActivity(workflow:InvoiceWorkflow|null|undefined):string {
 if(!workflow)return 'Not available';
 if(workflow.last_reminder_stage)return workflow.last_reminder_stage;
 if(workflow.first_billing_date)return 'Billed';
 if(workflow.billing_required===true)return 'No billing sent';
 return workflow.billing_required===false?'No reminders sent':'Billing setup needed';
}
export function invoiceBillingStatus(workflow:InvoiceWorkflow|null|undefined):string {
 if(!workflow)return 'Not available';
 if(workflow.first_billing_date)return 'Billed';
 return workflow.billing_required===true?'Not billed':workflow.billing_required===false?'Not required':'Setup needed';
}
export function sortInvoiceRows(rows:Invoice[],key:keyof Invoice,direction:'asc'|'desc',buckets:Pick<AgingBucket,'label'|'start'>[]):Invoice[]{
 if(key!=='aging')return sortRows(rows,key,direction);
 const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
 const days=(row:Invoice)=>{if(valid(row.age))return row.age;const start=buckets.find(b=>b.label===row.aging)?.start;return valid(start)?start:null;};
 return [...rows].sort((a,b)=>{const left=days(a),right=days(b);if(left===null)return right===null?0:1;if(right===null)return -1;return (left-right)*(direction==='asc'?1:-1);});
}
