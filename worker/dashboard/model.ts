import type {HotelId} from '../../src/domain/hotels';

export const dashboardMetricKeys=['open','billed','unbilled','not_required','setup','past_due','over60','over60_unbilled'] as const;
export type DashboardMetricKey=typeof dashboardMetricKeys[number];
export interface DashboardBalanceMetric {key:DashboardMetricKey;count:number|null;amount:string|null}
export interface DashboardBalanceStage {key:string;label:string;count:number|null;amount:string|null}
export interface DashboardBalanceRow {
 hotel:HotelId;accountId:string;accountNo:string|null;accountName:string;accountType:string;
 invoiceId:string;invoiceNo:string|null;folioNo:string|null;guest:string|null;transactionDate:string;
 open:string;original:string|null;age:number|null;billingRequired:boolean|null;
 firstBillingDate:string|null;dueDate:string|null;latestStage:string|null;latestStageLabel:string|null;latestSentAt:string|null;verified:boolean;
}
export interface DashboardBalancesResponse {
 asOfDate:string;mode:'current'|'snapshot'|'unavailable';capturedAt:string|null;sourceAt:string|null;
 freshness?:{refreshingHotels:HotelId[];failedHotels:HotelId[]};
 openBalanceBreakdown?:{positive:{count:number|null;amount:string|null};credit:{count:number|null;amount:string|null};creditCoverageComplete:boolean};
 complete:boolean;missingHotels:HotelId[];reason?:string;metrics:DashboardBalanceMetric[];stages:DashboardBalanceStage[];
 rows:DashboardBalanceRow[];total:number;unverified:number;
}
export interface DashboardPaymentInvoiceRow {
 hotel:HotelId;accountId:string;accountName:string;accountType:string;invoiceId:string;invoiceNo:string|null;folioNo:string|null;
 amount:string|null;paymentCount:number;verified:boolean;
}
export interface DashboardPaymentInvoicesResponse {
 rows:DashboardPaymentInvoiceRow[];total:number;summary:{count:number|null;amount:string|null;signedCorrections:string|null};
 complete:boolean;reason?:string;sourceAt:string|null;unknownMappings:number;amountBasis:'current_allocation_for_payment_date_cohort';
}
