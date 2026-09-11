import {expect,it} from 'vitest';
import {latestInvoiceActivity,invoiceBillingStatus,sortInvoiceRows} from '../src/domain/invoice-display';
import type {Invoice,InvoiceWorkflow} from '../src/domain/portfolio';
const workflow:InvoiceWorkflow={revision:1,credit_term:30,billing_required:true,first_billing_date:null,last_reminder_stage:null,last_reminder_date:null,due_date:null};
const row=(id:string,age?:number|null,aging='Unmapped'):Invoice=>({id,age,aging,hotel:'KAT',accountId:'synthetic',guest:id,invoiceNo:id,folioNo:id,date:'2026-09-01',due:null,original:100,open:100,stage:'No reminders sent'});
it('shows billing before reminder defaults and distinguishes not-required accounts',()=>{
 expect(latestInvoiceActivity(workflow)).toBe('No billing sent');expect(invoiceBillingStatus(workflow)).toBe('Not billed');
 const exempt={...workflow,billing_required:false};expect(latestInvoiceActivity(exempt)).toBe('No reminders sent');expect(invoiceBillingStatus(exempt)).toBe('Not required');
});
it('recognizes actual billing dates, including manually recorded external billing',()=>{
 const billed={...workflow,first_billing_date:'2026-08-15'};expect(latestInvoiceActivity(billed)).toBe('Billed');expect(invoiceBillingStatus(billed)).toBe('Billed');
});
it('preserves a recorded reminder even when the historical billing date is missing',()=>{
 const reminded={...workflow,last_reminder_stage:'Follow 2',last_reminder_date:'2026-09-10'};
 expect(latestInvoiceActivity(reminded)).toBe('Follow 2');expect(reminded.first_billing_date).toBeNull();
});
it('never calls missing workflow or missing setup an unbilled account',()=>{
 expect(latestInvoiceActivity(null)).toBe('Not available');expect(invoiceBillingStatus(undefined)).toBe('Not available');
 expect(latestInvoiceActivity({...workflow,billing_required:null})).toBe('Billing setup needed');
});
it('sorts by source days without mutating rows and keeps missing ages last in either direction',()=>{
 const rows=[row('old',170,'151 and Over'),row('young',8,'Up to 30'),row('unknown',null),row('middle',45,'31 - 60')];
 expect(sortInvoiceRows(rows,'aging','asc',[]).map(r=>r.id)).toEqual(['young','middle','old','unknown']);
 expect(sortInvoiceRows(rows,'aging','desc',[]).map(r=>r.id)).toEqual(['old','middle','young','unknown']);
 expect(rows.map(r=>r.id)).toEqual(['old','young','unknown','middle']);
});
it('uses the hotel source range when age is absent and never alphabetically guesses bucket order',()=>{
 const rows=[row('later',undefined,'Aged'),row('recent',undefined,'Z-recent'),row('unknown',null,'0-ish')];
 expect(sortInvoiceRows(rows,'aging','asc',[{label:'Aged',start:81},{label:'Z-recent',start:0}]).map(r=>r.id)).toEqual(['recent','later','unknown']);
 expect(sortInvoiceRows(rows,'guest','asc',[]).map(r=>r.id)).toEqual(['later','recent','unknown']);
});
