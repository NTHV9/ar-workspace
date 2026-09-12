import type {ActivitySummary,ExternalSummary} from '../../src/dashboard/model';
import type {FinancialReport} from '../financial/model';
import type {DashboardBalancesResponse,DashboardPaymentInvoicesResponse} from './model';

export interface DashboardOverviewSummary<T> {rows:[];total:number;summary:T}
export interface DashboardOverviewFinancial {summary:FinancialReport['summary'];coverage:FinancialReport['coverage']}
/** Null means the source reader failed; reader-specific gaps stay in its metadata. */
export interface DashboardOverviewScope {
 balances:DashboardBalancesResponse|null;
 activity:DashboardOverviewSummary<ActivitySummary>|null;
 external:DashboardOverviewSummary<ExternalSummary>|null;
 entries:DashboardOverviewFinancial|null;
 payments:DashboardOverviewFinancial|null;
 paid:DashboardPaymentInvoicesResponse|null;
}
export interface DashboardHotelOverview extends DashboardOverviewScope {hotel:'KAT'|'TSK'}
export interface DashboardHotelOverviewResponse {from:string;to:string;total:DashboardOverviewScope;hotels:DashboardHotelOverview[]}
