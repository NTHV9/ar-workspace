-- Run against either local source or local restored database; only count/digest output.
do $$
declare actor uuid:='00000000-0000-4000-8000-000000000001';r jsonb;n bigint;rev integer;
begin
 select count(*) into n from public.ar_sent_events;if n<>1 then raise exception 'expected one synthetic sent event';end if;
 select revision into rev from public.ar_invoice_workflow where hotel='KAT' and account_id='SYNTHETIC-RESTORE-ACCOUNT' and invoice_id='SYNTHETIC-RESTORE-INVOICE';
 r:=public.ar_mail_confirm_sent(actor,'00000000-0000-4000-8000-000000000013','synthetic-restore-gmail-id',now());
 if r->>'state' is distinct from 'sent' or (select count(*) from public.ar_sent_events)<>n then raise exception 'restored send replay duplicated or lost event';end if;
 if (select revision from public.ar_invoice_workflow where hotel='KAT' and account_id='SYNTHETIC-RESTORE-ACCOUNT' and invoice_id='SYNTHETIC-RESTORE-INVOICE')<>rev then raise exception 'restored send replay changed workflow';end if;
 if not exists(select 1 from public.ar_invoice_workflow where account_id='SYNTHETIC-RESTORE-ACCOUNT' and first_billing_date is not null and due_date=first_billing_date+30) then raise exception 'billing date/term not restored';end if;
 if not exists(select 1 from public.ar_account_settings where hotel='KAT' and account_id='SYNTHETIC-RESTORE-ACCOUNT' and credit_term=30 and billing_required and billing_recipients->'to'='["synthetic@example.test"]') then raise exception 'account configuration not restored';end if;
 if has_function_privilege('anon','public.ar_mail_confirm_sent(uuid,uuid,text,timestamptz)','EXECUTE') or has_function_privilege('authenticated','public.ar_mail_claim(uuid,uuid,uuid,integer,text,text,text,jsonb)','EXECUTE') or has_table_privilege('authenticated','public.ar_account_settings','UPDATE') then raise exception 'restored privilege leak';end if;
 if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='ar_sent_events' and c.relrowsecurity) then raise exception 'restored RLS missing';end if;
end $$;
do $$
begin
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
 execute 'set local role authenticated';
 if (select count(*) from public.ar_accounts)<>0 or (select count(*) from public.ar_sent_events)<>0 then raise exception 'unapproved synthetic user can read restored business rows';end if;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
 if (select count(*) from public.ar_accounts)<>1 or (select count(*) from public.ar_sent_events)<>1 then raise exception 'approved synthetic user cannot read restored business rows';end if;
 execute 'reset role';
end $$;
select jsonb_build_object('accounts',(select count(*) from public.ar_accounts),'invoices',(select count(*) from public.ar_invoices),'settings',(select count(*) from public.ar_account_settings),'sentEvents',(select count(*) from public.ar_sent_events),'workflowHash',(select md5(string_agg(to_jsonb(w)::text,'' order by hotel,account_id,invoice_id)) from public.ar_invoice_workflow w),'settingsHash',(select md5(string_agg(to_jsonb(s)::text,'' order by hotel,account_id)) from public.ar_account_settings s),'sentHash',(select md5(string_agg(to_jsonb(e)::text,'' order by delivery_id)) from public.ar_sent_events e)) as synthetic_restore_fingerprint;
