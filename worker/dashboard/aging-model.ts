import type {HotelId} from '../../src/domain/hotels';

export interface AgingInvoiceMetric {key:string;label:string;count:number|null;amount:string|null}
export interface AgingInvoiceBucket {key:string|null;count:number|null;amount:string|null;creditAmount:string|null;complete:boolean}
export interface AgingInvoiceAccount {hotel:HotelId;accountId:string;accountType:string;syncedAt:string|null;complete:boolean;unverified:number;buckets:AgingInvoiceBucket[]}
export interface AgingInvoiceDetail {hotel:HotelId;accountId:string;accountName:string;accountType:string;invoiceId:string;invoiceNo:string|null;folioNo:string|null;guest:string|null;open:string;age:number|null;billingStatus:string;latestStage:string;latestStageLabel:string;dueStatus:string;dueDate:string|null;held:boolean;needsReview:boolean}
export interface AgingInvoicesResponse {asOfDate:string;publications:{hotel:HotelId;sourceAt:string|null}[];accounts:AgingInvoiceAccount[];summary:{complete:boolean;count:number|null;amount:string|null;creditAmount:string|null;billing:AgingInvoiceMetric[];followup:AgingInvoiceMetric[];due:AgingInvoiceMetric[];flags:AgingInvoiceMetric[]};rows:AgingInvoiceDetail[];total:number;complete:boolean}
export const agingStatusKeys={billing:['unbilled','billed','not_required','setup','credit'],due:['not_due','due_today','past_due','awaiting_billing','unknown','credit'],flags:['held','needs_review']} as const;
