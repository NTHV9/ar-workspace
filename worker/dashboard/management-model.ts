import type {HotelId} from '../../src/domain/hotels';
import type {DashboardBalancesResponse} from './model';
export interface ManagementMeasure {count:number|null;amount:string|null}
export interface ManagementBand extends ManagementMeasure {key:number;label:string}
export interface ManagementHotel extends ManagementMeasure {hotel:HotelId;credits:number|null;creditAmount:string|null;over60:number|null;over90:number|null;unbilled61:number|null;bands:ManagementBand[]}
export interface ManagementAccount extends ManagementMeasure {hotel:HotelId;accountId:string;accountNo:string|null;accountName:string;accountType:string;oldest:number;unbilled:number;unbilledAmount:string}
export interface ManagementCohort extends ManagementMeasure {key:'issued'|'billed'|'unbilled'|'not_required'|'setup'|'credit';label:string;hotels:(ManagementMeasure&{hotel:HotelId})[]}
export interface ManagementDashboardData extends Pick<DashboardBalancesResponse,'asOfDate'|'mode'|'capturedAt'|'sourceAt'|'missingHotels'|'freshness'|'metrics'|'openBalanceBreakdown'> {
 from:string;to:string;complete:boolean;agesComplete:boolean;cohortComplete:boolean;hotels:ManagementHotel[];
 types:(ManagementMeasure&{type:string;over60:number|null})[];cohort:ManagementCohort[];accountsOver60:ManagementAccount[]|null;
}
