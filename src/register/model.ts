import type {HotelId} from '../domain/hotels';
import type {InvoiceWorkflow} from '../domain/portfolio';
export const trackingStatuses=['','Contacted','Awaiting reply','Promised payment','Remittance received','Disputed','Other'] as const;
export interface RegisterValues {
 billingRequired:boolean|null;creditTerm:number|null;firstBillingDate:string|null;
 lastReminderStage:string|null;lastReminderDate:string|null;promisedDate:string|null;
 trackingStatus:string;ownerName:string;reportedReceived:string|null;note:string;
}
export interface RegisterRow {
 hotel:HotelId;account_id:string;id:string;account_name:string;account_no:string|null;account_type:string;
 guest:string|null;invoice_no:string|null;folio_no:string|null;transaction_date:string;original:number;open:number;
 age:number|null;aging:string|null;verification_state:string;collection_role:string;collection_selectable:boolean;
 workflow:InvoiceWorkflow|null;workflow_revision:number;tracking_revision:number;exception_revision:number;
 billing_required:boolean|null;credit_term:number|null;first_billing_date:string|null;due_date:string|null;
 last_reminder_stage:string|null;last_reminder_date:string|null;promised_date:string|null;tracking_status:string;
 owner_name:string;reported_received:string|null;note:string;edited_at:string|null;hidden:boolean;
}
export interface RegisterResult {rows:RegisterRow[];total:number;hiddenTotal:number;summary:{invoices:number;open:number;unverified:number}}
export interface RegisterCommand {commandId:string;revision:number;workflowRevision:number;exceptionRevision:number;values:RegisterValues}
export const rowKey=(row:Pick<RegisterRow,'hotel'|'account_id'|'id'>)=>JSON.stringify([row.hotel,row.account_id,row.id]);
export const registerValues=(r:RegisterRow):RegisterValues=>({billingRequired:r.billing_required,creditTerm:r.credit_term,firstBillingDate:r.first_billing_date,lastReminderStage:r.last_reminder_stage,lastReminderDate:r.last_reminder_date,promisedDate:r.promised_date,trackingStatus:r.tracking_status,ownerName:r.owner_name,reportedReceived:r.reported_received,note:r.note});
export const registerSortKeys=['hotel','account_name','guest','invoice_no','folio_no','transaction_date','original','open','age','aging','billing_required','credit_term','first_billing_date','due_date','last_reminder_stage','last_reminder_date','promised_date','tracking_status','owner_name','reported_received','note','edited_at'] as const;
export type RegisterSort=typeof registerSortKeys[number];
export const registerError=(code:string)=>code.includes('revision_conflict')?'This invoice changed elsewhere. Your edits are retained; reload the saved row before editing again.':code.includes('source_changed')?'OPERA verification changed. Reload the saved row before changing billing or reminder history.':code.includes('invalid')?'Check the dates, credit term and received amount. Actual billing and reminder dates cannot be in the future.':code.includes('forbidden')?'You do not have access to this hotel.':'The change could not be confirmed. Your edits are retained; retry to check the same save.';
export function notifyRegisterChanged(){window.dispatchEvent(new Event('ar-invoice-changed'));try{const channel=new BroadcastChannel('ar-invoice-changes');channel.postMessage('changed');channel.close();}catch{/* Same-page refresh remains available. */}}
