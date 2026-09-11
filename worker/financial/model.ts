import type {AppliedPaymentLink,FinancialHotel,FinancialInvoice,FinancialPayment} from '../opera/financial-history';
export type FinancialView='invoice_entries'|'payments'|'applications'|'coverage'|'options';
export type FinancialRunStatus='queued'|'running'|'succeeded'|'failed';
export interface FinancialHistoryRequest {commandId:string;hotel:FinancialHotel;reason:'manual'|'scheduled'|'backfill'|'open';from?:string;to?:string}
export interface FinancialRunReceipt {stepsVersion?:1|2;id?:string;status:FinancialRunStatus|'not_enabled';created:boolean;hotel?:FinancialHotel;from?:string;to?:string}
export interface FinancialRun {stepsVersion?:1|2;id:string;owner:string;hotel:FinancialHotel;from:string;to:string;status:FinancialRunStatus;proof:string;discovered:boolean;accounts:number;startedAt:string|null;initialImport:boolean;counts:FinancialCounts}
export interface FinancialAccountContext {name:string;type:string;accountNo:string|null}
export interface FinancialCounts {invoices:number;payments:number;applications:number}
export interface FinancialWorkflowResult extends FinancialCounts {status:'succeeded'|'failed'|'not_enabled';accounts:number;error?:string}
export interface FinancialObservation {
 accountName:string;accountType:string;accountNo:string|null;sourceStatus:'observed'|'not_observed';
 firstObservedAt:string;lastObservedAt:string;lastCheckedAt:string;
}
export type FinancialInvoiceReportRow=FinancialInvoice&FinancialObservation&{mappingVerified?:boolean;mappingError?:string|null};
export type FinancialPaymentReportRow=FinancialPayment&FinancialObservation;
export type FinancialApplicationReportRow=AppliedPaymentLink&FinancialObservation&{paymentTransactionDate:string|null;paymentSourceStatus:'observed'|'not_observed'|null};
export interface FinancialCoverageRow {id:string;hotel:FinancialHotel;from:string;to:string;publishedAt:string;accounts:number;invoices:number;payments:number;applications:number;initialImport:boolean;periodComplete:boolean;proof:string}
export interface FinancialAccountOption {hotel:FinancialHotel;accountId:string;name:string;type:string;accountNo:string|null}
export interface FinancialReportSummary {
 mappingUnverified?:number;mappingVerified?:number;
 paymentTotals?:{creditPostings:string|null;debitPostings:string|null;currentlyApplied:string|null;currentlyUnallocated:string|null;transferRows:number;unknownTransferRows:number};
 rows:number;measuredRows:number;knownAmount:string;amount:string|null;unknownAmounts:number;notObserved:number;unknownSourceDates:number;
 compressedChildren:number;openingBalances:number;credits:number;invoiceCount:number;paymentCount:number;
 amountBasis:'original_invoice_amount'|'signed_payment_posting'|'current_observed_application'|'none';
 dateBasis:'invoice_transaction_date'|'payment_transaction_date'|'linked_payment_transaction_date'|'publication_date'|'none';
 receiptClassification:'unknown';applicationDatesVerified:false;coverageComplete:boolean;
}
export interface FinancialReport {
 view:FinancialView;rows:(FinancialInvoiceReportRow|FinancialPaymentReportRow|FinancialApplicationReportRow|FinancialCoverageRow|FinancialAccountOption)[];
 total:number;summary:FinancialReportSummary;coverage:{complete:boolean;from:string|null;to:string|null;lastSuccessAt:string|null;lastAttemptStatus:FinancialRunStatus|null;lastError:string|null};
}
