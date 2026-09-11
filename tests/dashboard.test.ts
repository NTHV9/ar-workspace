import {describe,expect,it} from 'vitest';
import {activityTotals,addAmounts,dashboardScope,queueTotals,scopeQuery,validDay,type DashboardQueueRow} from '../src/dashboard/model';
import {dashboardLink,dashboardReturn,dashboardReportContext} from '../src/dashboard/links';
import {defaultCollectionPolicy} from '../src/domain/collection-policy';
const scope={hotel:'All',day:'2026-09-10',type:'Agent',account:''};
const row:DashboardQueueRow={hotel:'KAT',account_id:'synthetic',id:'1',account_name:'Synthetic account',account_type:'Agent',guest:'Synthetic guest',invoice_no:'1',folio_no:'2',open:100,collection_role:'standalone',collection_selectable:true,verification_state:'verified',transaction_date:'2026-08-01',workflow:{revision:0,billing_required:false,credit_term:30,first_billing_date:null,last_reminder_stage:'Final',last_reminder_date:'2026-09-11',due_date:'2026-09-01'}};
describe('dashboard scope and dates',()=>{
 it('uses a Thai-day default and leaves an invalid selected day visible for correction',()=>{expect(dashboardScope(new URLSearchParams(),'All','2026-09-11').day).toBe('2026-09-11');expect(dashboardScope(new URLSearchParams('dashboardDay='),'All').day).toBe('');expect(validDay('2026-02-30')).toBe(false);});
 it('clears an account from another hotel without mixing identities',()=>{expect(dashboardScope(new URLSearchParams({dashboardAccount:'["KAT","same-id"]'}),'TSK').account).toBe('');expect(scopeQuery({...scope,account:'["KAT","same-id"]'},true).get('hotel')).toBe('KAT');});
 it('preserves source-day filters and the original dashboard when following a money link',()=>{const url=new URL(dashboardLink({...scope,account:'["KAT","same-id"]'},'payments'),'https://example.test');expect(url.searchParams.get('financial')).toBe('1');expect(url.searchParams.get('hotel')).toBe('KAT');const back=new URL(dashboardReturn(url.searchParams),'https://example.test');expect(back.searchParams.get('hotel')).toBe('All');expect(back.searchParams.get('dashboardDay')).toBe(scope.day);expect(back.searchParams.get('dashboardAccount')).toBe('["KAT","same-id"]');});
 it('retains custom reminder keys for exact activity drilldown',()=>{const q=new URL(dashboardLink(scope,'sent','custom-round'),'https://example.test').searchParams;expect(dashboardReportContext(q,'All')).toMatchObject({kind:'custom-round',mode:'activity',from:scope.day,to:scope.day,type:'Agent'});});
});
describe('daily counts do not change current work',()=>{
 it('uses the current date for work, independent of the selected historical activity day',()=>{const data=queueTotals([row],{...scope,day:'2026-01-01'},defaultCollectionPolicy,'2026-09-11');expect(data?.urgent).toEqual({count:1,amount:'100.00'});});
 it('excludes children and keeps terminal urgency visible alongside an explicit hold',()=>{const data=queueTotals([row,{...row,id:'child',collection_role:'child'},{...row,id:'held',exceptions:{held:true,needsReview:false,dispute:'',reopenedAt:null},exception_status:'available'}],scope,defaultCollectionPolicy,'2026-09-11');expect(data?.urgent.count).toBe(2);expect(data?.held.count).toBe(1);expect(queueTotals(undefined,scope,null)).toBeNull();});
});
describe('billing channels, reminders and money',()=>{
 const activity={kinds:[{kind:'First billing',invoices:2,amount:100.1},{kind:'Rebilling',invoices:1,amount:40.2},{kind:'Follow 1',invoices:3,amount:200.2},{kind:'custom-round',invoices:1,amount:0.1}],invoices:7,messages:4,missingAmounts:0};
 const external={records:2,invoices:5,firstBillingInvoices:3,amount:'1000.00',unknownAmounts:0};
 it('combines first-billing counts, not whole external-record amounts or rebilling counts',()=>{expect(activityTotals(activity,external)).toMatchObject({firstBilled:5,reminderCount:4,reminderAmount:'200.30',emailBillingCount:3,emailBillingAmount:'140.30'});});
 it('does not turn a failed channel or unknown classification into zero first billings',()=>{expect(activityTotals(activity,undefined).firstBilled).toBeNull();expect(activityTotals({...activity,kinds:[...activity.kinds,{kind:'Billing classification unavailable',invoices:1,amount:null}]},external).firstBilled).toBeNull();expect(activityTotals(undefined,external).reminderCount).toBeNull();});
 it('preserves unknown amounts and exact decimal satang',()=>{expect(addAmounts(['0.10','0.20'])).toBe('0.30');expect(addAmounts(['0.10',null])).toBeNull();expect(activityTotals({...activity,kinds:[{kind:'Follow 1',invoices:1,amount:null}]},external).reminderAmount).toBeNull();});
});
