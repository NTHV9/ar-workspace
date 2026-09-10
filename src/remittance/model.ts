export type Hotel = 'KAT' | 'TSK';
/** Decimal THB strings preserve satang exactly across the API/database boundary. */
export type Amount = string;
export interface RemittanceLineInput {invoiceId:string;reportedAmount:Amount|null}
export interface RemittanceInput {
 commandId:string;revision:number;confirmed:true;hotel:Hotel;accountId:string;
 receivedDate:string;reference:string;sourceNote:string;notes:string;
 reportedAmount:Amount|null;lines:RemittanceLineInput[];changeReason:string;
}
export interface RemittanceLine extends RemittanceLineInput {
 invoiceNo:string;folioNo:string;guest:string;currentOpen:Amount|null;
 currentStatus:'open'|'zero'|'unverified'|'missing';sourceVerifiedAt:string|null;
}
export interface RemittanceFile {
 id:string;name:string;mime:string;byteCount:number;sha256:string;
 state:'pending'|'ready'|'removed';error:string|null;createdAt:string;
}
export interface RemittanceRecord {
 id:string;revision:number;state:'active'|'voided';hotel:Hotel;accountId:string;
 accountName:string;accountType:string;accountNo:string|null;
 receivedDate:string;reference:string;sourceNote:string;notes:string;
 reportedAmount:Amount|null;allocatedAmount:Amount;unallocatedAmount:Amount|null;
 invoiceCount:number;fileCount:number;pendingFiles:number;lines:RemittanceLine[];files:RemittanceFile[];linkedOpen:Amount|null;knownLinkedOpen:Amount;
 unverifiedLines:number;resolution:'awaiting_opera'|'linked_zero'|'needs_review'|'voided';
 createdAt:string;updatedAt:string;voidReason:string|null;
}
export interface RemittanceSummary {
 documents:number;invoices:number;reportedAmount:Amount|null;knownReportedAmount:Amount;
 unspecifiedAmounts:number;linkedOpen:Amount|null;knownLinkedOpen:Amount;unverifiedInvoices:number;
}
export type RemittanceRow = Omit<RemittanceRecord,'lines'|'files'>;
export interface RemittanceList {rows:RemittanceRow[];total:number;summary:RemittanceSummary}
export interface RemittanceAccount {hotel:Hotel;accountId:string;name:string;type:string;accountNo:string|null;verified:boolean}
export interface RemittanceConfig {maxFileBytes:number;maxFiles:number;maxTotalFileBytes:number}
export interface RemittanceOptions {accounts:RemittanceAccount[];accountTypes?:string[];config:RemittanceConfig}
export interface RemittanceInvoiceOption {
 invoiceId:string;invoiceNo:string;folioNo:string;guest:string;transactionDate:string;
 currentOpen:Amount|null;verified:boolean;eligible:boolean;reason:string|null;
}
export interface RemittanceInvoiceList {rows:RemittanceInvoiceOption[];total:number}
export interface RemittanceHistory {rows:{revision:number;action:string;reason:string;recordedAt:string;snapshot:unknown}[];total:number}
export interface RemittanceDiagnostic {database:{passed:boolean;rolledBack:boolean;checks:number};storage:{passed:boolean;byteCount:number;sha256:string;retained:boolean};businessRecordsChanged:boolean}
