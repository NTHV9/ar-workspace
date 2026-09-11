import {accountIdentity,dashboardScope,type DashboardScope} from './model';
import type {ReportContext} from '../reports/Reports';
import type {RemittanceContext} from '../remittance/Remittances';
export type DashboardDestination='invoice_entries'|'payments'|'external'|'email_billing'|'sent'|'remittance'|'portfolio'|'account'|'urgent'|'billing'|'collection'|'review'|'held'|'setup';
export function dashboardUrl(scope:DashboardScope){const q=new URLSearchParams({dashboard:'1',hotel:scope.hotel,dashboardDay:scope.day});if(scope.type)q.set('dashboardType',scope.type);if(scope.account)q.set('dashboardAccount',scope.account);return '/?'+q;}
export function dashboardLink(scope:DashboardScope,destination:DashboardDestination,stage?:string){
 const q=new URLSearchParams(dashboardUrl(scope).slice(2));q.delete('dashboard');q.set('fromDashboard','1');q.set('dashboardHotel',scope.hotel);
 const identity=accountIdentity(scope.account);if(identity)q.set('hotel',identity[0]);
 const queue={urgent:'Urgent',billing:'Billing',collection:'Collection due',review:'Needs review',held:'On hold',setup:'Setup needed'};
 if(destination in queue){q.set('collections','1');q.set('qstage',queue[destination as keyof typeof queue]);if(destination==='collection')q.set('qwhen','Ready');if(scope.type)q.set('qtype',scope.type);if(identity)q.set('qaccount',identity.join(':'));}
 else if(destination==='invoice_entries'||destination==='payments'){q.set('financial','1');q.set('dashboardDetail',destination);}
 else if(destination==='external')q.set('externalBilling','1');
 else if(destination==='email_billing'||destination==='sent'){q.set('reports','1');q.set('dashboardDetail',destination==='email_billing'?'First billing':stage??'');}
 else if(destination==='remittance')q.set('remittances','1');
  else if(destination==='account'&&identity){q.set('hotel',scope.hotel);q.set('dashboard','1');q.delete('fromDashboard');q.set('account',identity[1]);q.set('property',identity[0]);}
 else {if(scope.type)q.set('type',scope.type);if(identity){q.set('account',identity[1]);q.set('property',identity[0]);}}
 return '/?'+q;
}
export function dashboardReturn(params:URLSearchParams){return dashboardUrl(dashboardScope(params,params.get('dashboardHotel')??params.get('hotel')??'All'));}
export function dashboardReportContext(params:URLSearchParams,hotel:string):ReportContext|undefined {
 if(params.get('fromDashboard')!=='1')return;const scope=dashboardScope(params,hotel);
 return {hotel,mode:'activity',type:scope.type,account:scope.account,kind:params.get('dashboardDetail')??'',from:scope.day,to:scope.day,page:0};
}
export function dashboardRemittanceContext(params:URLSearchParams,hotel:string):RemittanceContext|undefined {
 if(params.get('fromDashboard')!=='1')return;const scope=dashboardScope(params,hotel);
 return {hotel,view:'pending',type:scope.type,account:scope.account,search:'',from:scope.day,to:scope.day,includeVoided:false,page:0};
}
