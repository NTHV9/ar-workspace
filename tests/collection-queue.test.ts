import {expect,it} from 'vitest';
import {nextCollectionAction,stageLabel,type QueueInvoice} from '../src/domain/collection';
const invoice:QueueInvoice={hotel:'KAT',account_id:'account',id:'1',guest:'Synthetic guest',invoice_no:'INV-1',folio_no:'FOL-1',open:100,collection_role:'standalone',collection_selectable:true,verification_state:'verified',transaction_date:'2026-08-01',workflow:{revision:0,billing_required:false,credit_term:30,first_billing_date:null,last_reminder_stage:null,last_reminder_date:null,due_date:'2026-09-10'}};
it('uses calendar boundaries: Friendly due-7 and Follow-up 1 the day after due',()=>{expect(nextCollectionAction(invoice,'2026-09-02')).toMatchObject({stage:'Friendly',date:'2026-09-03',ready:false});expect(nextCollectionAction(invoice,'2026-09-03')).toMatchObject({stage:'Friendly',ready:true});expect(nextCollectionAction(invoice,'2026-09-10')).toMatchObject({stage:'Friendly'});expect(nextCollectionAction(invoice,'2026-09-11')).toMatchObject({stage:'Follow 1',ready:true});});
it('does not repeat Friendly or skip unsent follow-up stages',()=>{const sent={...invoice,workflow:{...invoice.workflow!,last_reminder_stage:'Friendly',last_reminder_date:'2026-09-03'}};expect(nextCollectionAction(sent,'2026-09-08')).toMatchObject({stage:'Follow 1',date:'2026-09-11',ready:false});sent.workflow.last_reminder_stage='Follow 1';sent.workflow.last_reminder_date='2026-09-11';expect(nextCollectionAction(sent,'2026-10-30')).toMatchObject({stage:'Follow 2',date:'2026-09-18',ready:true});});
it('shows Urgent immediately after Final even when rules are incomplete',()=>{expect(nextCollectionAction({...invoice,workflow:{...invoice.workflow!,credit_term:null,last_reminder_stage:'Final',last_reminder_date:'2026-09-10'}},'2026-09-10')).toMatchObject({stage:'Urgent',ready:true});});
it('does not fabricate zero term or due date and keeps unverified balances visible',()=>{expect(nextCollectionAction({...invoice,workflow:null},'2026-09-10')).toMatchObject({stage:'Setup needed'});expect(nextCollectionAction({...invoice,verification_state:'unverified'},'2026-09-10')).toMatchObject({stage:'Needs review'});expect(nextCollectionAction({...invoice,open:0},'2026-09-10')).toBeNull();expect(nextCollectionAction({...invoice,collection_role:'child'},'2026-09-10')).toBeNull();});
it('billing-required invoices remain in Billing until actual first billing',()=>{expect(nextCollectionAction({...invoice,workflow:{...invoice.workflow!,billing_required:true,due_date:null}},'2026-09-10')).toMatchObject({stage:'Billing',ready:true});});
it('uses full Follow-up labels without rewriting stored stage keys',()=>{expect(stageLabel('Follow 1')).toBe('Follow-up 1');expect(stageLabel('Follow 3')).toBe('Follow-up 3');expect(stageLabel('Friendly')).toBe('Friendly');});
it.each([0,1,3,6])('skips Friendly for credit term %i without making follow-up ready before its due-date offset',credit_term=>{
 const row={...invoice,workflow:{...invoice.workflow!,credit_term}};
 expect(nextCollectionAction(row,'2026-09-03')).toMatchObject({stage:'Follow 1',date:'2026-09-11',ready:false,latest:'No reminders sent'});
 expect(nextCollectionAction(row,'2026-09-11')).toMatchObject({stage:'Follow 1',date:'2026-09-11',ready:true});
});
it.each([7,8,30])('retains Friendly at and above the seven-day boundary (%i)',credit_term=>{
 expect(nextCollectionAction({...invoice,workflow:{...invoice.workflow!,credit_term}},'2026-09-03')).toMatchObject({stage:'Friendly',ready:true});
});
it('does not infer a short term when missing, or rewrite previously sent Friendly history',()=>{
 expect(nextCollectionAction({...invoice,workflow:{...invoice.workflow!,credit_term:null}},'2026-09-03')).toMatchObject({stage:'Setup needed'});
 const row={...invoice,workflow:{...invoice.workflow!,credit_term:3,last_reminder_stage:'Friendly',last_reminder_date:'2026-09-03'}};
 expect(nextCollectionAction(row,'2026-09-04')).toMatchObject({stage:'Follow 1',date:'2026-09-11',ready:false,latest:'Friendly'});
 expect(row.workflow.last_reminder_stage).toBe('Friendly');
});
