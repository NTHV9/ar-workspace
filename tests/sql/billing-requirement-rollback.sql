-- Billing requirement is useful even while the credit term is still unknown.
begin;
do $$
declare actor uuid;scope text:='SYNTHETIC-RULES-'||gen_random_uuid();r jsonb;before_history jsonb;empty jsonb:='{"to":[],"cc":[],"bcc":[]}';
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state)
 values('KAT',scope,'Synthetic partial billing rules','SYNTHETIC',100,0,1,'verified'),('TSK',scope,'Synthetic separate hotel','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 values('KAT',scope,'A','2026-09-01',100,100,'verified','standalone',false,now()),('TSK',scope,'A','2026-09-01',100,100,'verified','standalone',false,now());
 r:=public.ar_settings_save_v2(actor,'KAT',scope,0,false,null,empty,empty,'{}');
 if r?'error' or r->>'billing_required' is distinct from 'false' then raise exception 'partial settings save failed';end if;
 if not exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='A' and billing_required=false and credit_term is null and due_date is null and settings_revision is null) then raise exception 'Billing not required still appears as setup needed when credit term is blank';end if;
 if exists(select 1 from public.ar_invoice_workflow where hotel='TSK' and account_id=scope and billing_required is not null) then raise exception 'rules leaked to another hotel';end if;
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 values('KAT',scope,'B','2026-09-02',100,100,'verified','standalone',false,now());
 if not exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='B' and billing_required=false and credit_term is null and due_date is null) then raise exception 'new arrival lost partial rule';end if;
 r:=public.ar_settings_save_v2(actor,'KAT',scope,0,true,0,empty,empty,'{}');
 if r->>'error' is distinct from 'settings_revision_conflict' then raise exception 'stale setting save accepted';end if;
 r:=public.ar_settings_save_v2(actor,'KAT',scope,1,true,null,empty,empty,'{}');
 if r?'error' or exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and (billing_required is distinct from true or credit_term is not null or settings_revision is not null)) then raise exception 'partial rules frozen before completion';end if;
 r:=public.ar_settings_save_v2(actor,'KAT',scope,2,false,0,empty,empty,'{}');
 if r?'error' or exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and (billing_required is distinct from false or credit_term is distinct from 0 or settings_revision is distinct from 3 or due_date is distinct from base_date or revision<>3)) then raise exception 'explicit zero term was not finalized or workflow revision lost';end if;
 update public.ar_invoice_workflow set last_reminder_stage='Friendly',last_reminder_date='2026-09-02',revision=revision+1 where hotel='KAT' and account_id=scope and invoice_id='A';
 select jsonb_agg(to_jsonb(w) order by invoice_id) into before_history from public.ar_invoice_workflow w where hotel='KAT' and account_id=scope;
 r:=public.ar_settings_save_v2(actor,'KAT',scope,3,true,30,empty,empty,'{}');
 if r?'error' or before_history is distinct from (select jsonb_agg(to_jsonb(w) order by invoice_id) from public.ar_invoice_workflow w where hotel='KAT' and account_id=scope) then raise exception 'established rules or history changed';end if;
 -- Exercise migration repair scope with an old, unassigned workflow.
 insert into public.ar_account_settings(hotel,account_id,billing_required,credit_term,revision) values('TSK',scope,false,null,1);
 perform ar_private.apply_unassigned_billing_rules('TSK',scope);
 if not exists(select 1 from public.ar_invoice_workflow where hotel='TSK' and account_id=scope and billing_required=false and due_date is null) then raise exception 'saved partial rule was not repaired';end if;
 r:=public.ar_settings_save_v2(actor,'TSK',scope,1,null,30,empty,empty,'{}');
 if r?'error' or not exists(select 1 from public.ar_invoice_workflow where hotel='TSK' and account_id=scope and billing_required is null and credit_term=30 and due_date is null and settings_revision is null) then raise exception 'term-only input fabricated billing requirement';end if;
 if has_function_privilege('authenticated','ar_private.apply_unassigned_billing_rules(text,text,text)','execute') or has_function_privilege('service_role','public.ar_settings_save(uuid,text,text,integer,boolean,integer,jsonb,jsonb)','execute') then raise exception 'private writer became public';end if;
 if exists(select 1 from public.ar_sent_events where account_id=scope) then raise exception 'settings fabricated send history';end if;
end $$;
rollback;
