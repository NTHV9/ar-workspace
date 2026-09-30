-- Synthetic real-writer regression: an account requirement change reaches old invoices.
begin;
do $$
declare actor uuid;scope text:='SYNTHETIC-PROPAGATE-'||gen_random_uuid();r jsonb;empty jsonb:='{"to":[],"cc":[],"bcc":[]}';before_sent bigint;old_revision integer;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state)
 values('KAT',scope,'Synthetic account requirement','SYNTHETIC',400,0,4,'verified'),('TSK',scope,'Synthetic hotel isolation','SYNTHETIC',100,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 select 'KAT',scope,id,'2026-09-01'::date,100,case when id='cleared' then 0 else 100 end,'verified','standalone',false,now() from unnest(array['unbilled','billed','manual','cleared'])id;
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 values('TSK',scope,'unbilled','2026-09-01',100,100,'verified','standalone',false,now());
 r:=public.ar_settings_save_v2(actor,'KAT',scope,0,true,30,empty,empty,'{}');
 if r?'error' then raise exception 'initial save failed';end if;
 update public.ar_invoice_workflow set billing_required=true,credit_term=30,settings_revision=1 where hotel='KAT' and account_id=scope and invoice_id='cleared';
 update public.ar_invoice_workflow set first_billing_date='2026-09-04',last_reminder_stage='Friendly',last_reminder_date='2026-09-05' where hotel='KAT' and account_id=scope and invoice_id='billed';
 update public.ar_invoice_workflow set rules_manually_set=true,credit_term=7 where hotel='KAT' and account_id=scope and invoice_id='manual';
 select count(*) into before_sent from public.ar_sent_events where account_id=scope;
 select revision into old_revision from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='unbilled';
 r:=public.ar_settings_save_v2(actor,'KAT',scope,1,false,30,empty,empty,'{}');
 if r?'error' then raise exception 'requirement save failed';end if;
 if exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and billing_required is distinct from false) then raise exception 'old invoice retained Billing required';end if;
 if not exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='unbilled' and due_date='2026-10-01' and revision=old_revision+1) then raise exception 'due date or stale-editor revision not updated';end if;
 if not exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='manual' and due_date='2026-10-01' and credit_term=30 and not rules_manually_set) then raise exception 'manual rules did not follow Account settings';end if;
 if not exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='billed' and due_date='2026-10-01' and first_billing_date='2026-09-04' and last_reminder_stage='Friendly' and last_reminder_date='2026-09-05') then raise exception 'actual history lost';end if;
 if exists(select 1 from public.ar_invoice_workflow where hotel='TSK' and account_id=scope and billing_required is not null) then raise exception 'cross-hotel propagation';end if;
 if (select count(*) from ar_private.invoice_workflow_history where hotel='KAT' and account_id=scope and details->>'change_source'='account_billing_rules' and details->>'account_settings_revision'='2')<>4 then raise exception 'propagation audit incomplete';end if;
 -- Reverse direction uses actual billing date, not a made-up billing event.
 r:=public.ar_settings_save_v2(actor,'KAT',scope,2,true,30,empty,empty,'{}');
 if r?'error' or not exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='billed' and due_date='2026-10-04') then raise exception 'reverse requirement did not retain actual billing anchor';end if;
 if exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='unbilled' and due_date is not null) then raise exception 'invented billing date';end if;
 -- A term-only change must also reach existing invoices and preserve actual anchors.
 r:=public.ar_settings_save_v2(actor,'KAT',scope,3,true,7,empty,empty,'{}');
 if r?'error' or exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and credit_term is distinct from 7) then raise exception 'term-only change did not propagate';end if;
 if not exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='billed' and due_date='2026-09-11') then raise exception 'term-only due date wrong';end if;
 -- Zero is explicit; an unknown term must not be invented as zero.
 r:=public.ar_settings_save_v2(actor,'KAT',scope,4,false,0,empty,empty,'{}');
 if r?'error' or exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and (credit_term is distinct from 0 or due_date is distinct from base_date)) then raise exception 'zero term not propagated';end if;
 r:=public.ar_settings_save_v2(actor,'KAT',scope,5,false,null,empty,empty,'{}');
 if r?'error' or exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and (credit_term is not null or due_date is not null)) then raise exception 'unknown term fabricated a due date';end if;
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 values('KAT',scope,'arrival','2026-09-10',100,100,'verified','standalone',false,now());
 if not exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and invoice_id='arrival' and billing_required=false and credit_term is null and due_date is null) then raise exception 'new arrival lost latest rules';end if;
 if has_function_privilege('authenticated','ar_private.apply_account_billing_rules(uuid,text,text)','execute') or has_function_privilege('service_role','ar_private.apply_account_billing_rules(uuid,text,text)','execute') then raise exception 'internal rules writer exposed';end if;
 r:=public.ar_settings_save_v2(actor,'KAT',scope,1,false,30,empty,empty,'{}');
 if r->>'error' is distinct from 'settings_revision_conflict' then raise exception 'stale save accepted';end if;
 if exists(select 1 from public.ar_invoice_workflow where hotel='KAT' and account_id=scope and billing_required is distinct from false) then raise exception 'stale save changed invoices';end if;
 if (select count(*) from public.ar_sent_events where account_id=scope)<>before_sent then raise exception 'settings invented sends';end if;
 if exists(select 1 from public.ar_invoices where hotel='KAT' and account_id=scope and original<>100) then raise exception 'accounting amount changed';end if;
end $$;
rollback;
