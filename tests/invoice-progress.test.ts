import {it,expect} from 'vitest';
import {invoiceProgress} from '../src/dashboard/invoice-progress';
import type {AgingInvoice} from '../src/dashboard/aging-model';
import type {InvoiceWorkflow} from '../src/domain/portfolio';
const workflow:InvoiceWorkflow={revision:1,billing_required:true,credit_term:30,first_billing_date:null,last_reminder_stage:null,last_reminder_date:null,due_date:null};
const row:AgingInvoice={hotel:'KAT',accountId:'A',id:'I',invoiceNo:'I',folioNo:'F',guest:'Guest',date:'2026-09-01',open:100,age:22,role:'standalone',verified:true,parentId:null,workflow,statusAvailable:true};
const status=(w:Partial<InvoiceWorkflow>,extra:Partial<AgingInvoice>={})=>invoiceProgress({...row,...extra,workflow:{...workflow,...w}},'2026-09-23');
it('distinguishes billing, no-follow-up and actual reminder states',()=>{
 expect(status({})).toBe('Not billed');
 expect(status({first_billing_date:'2026-09-01',due_date:'2026-10-01'})).toBe('Billed');
 expect(status({billing_required:false,due_date:'2026-10-01'})).toBe('No follow-up sent');
 expect(status({first_billing_date:'2026-09-01',due_date:'2026-09-10'})).toBe('Past due · No follow-up sent');
 expect(status({last_reminder_stage:'Follow 1',last_reminder_date:'2026-09-20',due_date:'2026-09-10'})).toBe('Follow-up 1 · Past due');
 expect(status({last_reminder_stage:'Final',last_reminder_date:'2026-09-20'})).toContain('Urgent');
});
it('does not advance from missing/future reminder evidence or unavailable workflow reads',()=>{
 expect(status({last_reminder_stage:'Follow 1'})).toBe('Needs review');
 expect(status({last_reminder_stage:'Follow 1',last_reminder_date:'2026-09-24'})).toBe('Needs review');
 expect(status({},{statusAvailable:false})).toBe('Status unavailable');
 expect(status({billing_required:null})).toBe('Setup needed');
 expect(status({},{held:true})).toBe('On hold');
 expect(status({},{needsReview:true})).toBe('Needs review');
 expect(status({},{open:-100})).toBe('Credit');
});
