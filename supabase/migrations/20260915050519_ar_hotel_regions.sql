-- Additive six-property support. Legacy unscoped reads remain Phuket.
-- Reviewed against live catalog definitions only; no customer rows were exported.
-- Property keys remain part of every operational Account/Invoice identity.
create function ar_private.is_supported_hotel(p_hotel text) returns boolean
language sql immutable parallel safe set search_path='' as $$
 select coalesce(p_hotel=any(array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']::text[]),false)
$$;
create function ar_private.report_scope_hotels(p_scope text) returns text[]
language sql immutable parallel safe set search_path='' as $$
 select case when p_scope is null or p_scope in('All','Phuket') then array['KAT','TSK']::text[]
 when p_scope='KhaoLak' then array['TLKL','WAKL','TLFO','TSAN']::text[]
 when ar_private.is_supported_hotel(p_scope) then array[p_scope] else '{}'::text[] end
$$;
create function ar_private.hotel_in_report_scope(p_hotel text,p_scope text) returns boolean
language sql immutable parallel safe set search_path='' as $$
 select coalesce(p_hotel=any(ar_private.report_scope_hotels(p_scope)),false)
$$;
revoke all on function ar_private.is_supported_hotel(text),ar_private.report_scope_hotels(text),ar_private.hotel_in_report_scope(text,text) from public,anon;
grant execute on function ar_private.is_supported_hotel(text),ar_private.report_scope_hotels(text),ar_private.hotel_in_report_scope(text,text) to authenticated,service_role;

-- Explicit catalog constraint inventory. Composite hotel/account foreign keys stay intact.
alter table ar_private.daily_ar_captures drop constraint daily_ar_captures_hotel_check;
alter table ar_private.daily_ar_captures add constraint daily_ar_captures_hotel_check check(ar_private.is_supported_hotel(hotel));
alter table ar_private.dashboard_capture_state drop constraint dashboard_capture_state_hotel_check;
alter table ar_private.dashboard_capture_state add constraint dashboard_capture_state_hotel_check check(ar_private.is_supported_hotel(hotel));
alter table ar_private.dashboard_daily_captures drop constraint dashboard_daily_captures_hotel_check;
alter table ar_private.dashboard_daily_captures add constraint dashboard_daily_captures_hotel_check check(ar_private.is_supported_hotel(hotel));
alter table ar_private.external_billing_records drop constraint external_billing_records_hotel_check;
alter table ar_private.external_billing_records add constraint external_billing_records_hotel_check check(ar_private.is_supported_hotel(hotel));
alter table ar_private.financial_runs drop constraint financial_runs_hotel_check;
alter table ar_private.financial_runs add constraint financial_runs_hotel_check check(ar_private.is_supported_hotel(hotel));
alter table ar_private.refresh_runs drop constraint refresh_runs_hotel_check;
alter table ar_private.refresh_runs add constraint refresh_runs_hotel_check check(ar_private.is_supported_hotel(hotel));
alter table ar_private.refresh_stage drop constraint refresh_stage_hotel_check;
alter table ar_private.refresh_stage add constraint refresh_stage_hotel_check check(ar_private.is_supported_hotel(hotel));
alter table ar_private.statement_templates drop constraint statement_templates_hotel_check;
alter table ar_private.statement_templates add constraint statement_templates_hotel_check check(ar_private.is_supported_hotel(hotel));
alter table public.ar_document_jobs drop constraint ar_document_jobs_hotel_check;
alter table public.ar_document_jobs add constraint ar_document_jobs_hotel_check check(ar_private.is_supported_hotel(hotel));
alter table public.ar_invoice_exceptions drop constraint ar_invoice_exceptions_hotel_check;
alter table public.ar_invoice_exceptions add constraint ar_invoice_exceptions_hotel_check check(ar_private.is_supported_hotel(hotel));
alter table public.ar_refresh_state drop constraint ar_refresh_state_hotel_check;
alter table public.ar_refresh_state add constraint ar_refresh_state_hotel_check check(ar_private.is_supported_hotel(hotel));
alter table public.ar_remittances drop constraint ar_remittances_hotel_check;
alter table public.ar_remittances add constraint ar_remittances_hotel_check check(ar_private.is_supported_hotel(hotel));

-- Foundation tables previously relied on gateway validation; retain their keys and
-- additionally prevent unsupported property identities at the storage boundary.
alter table public.ar_accounts add constraint ar_accounts_hotel_check check(ar_private.is_supported_hotel(hotel));
alter table public.ar_account_settings add constraint ar_account_settings_hotel_check check(ar_private.is_supported_hotel(hotel));
-- Setup only: no source refresh, settings, templates, or business history is seeded.
insert into public.ar_refresh_state(hotel) values('TLKL'),('WAKL'),('TLFO'),('TSAN') on conflict(hotel) do nothing;
insert into ar_private.dashboard_capture_state(hotel) values('TLKL'),('WAKL'),('TLFO'),('TSAN') on conflict(hotel) do nothing;

-- Exact replacement manifest. Hash + occurrence guards fail closed on drift.
-- No catalog-wide rewrite, no acceptance-admin/static fixture modification.

-- ar_private.dashboard_capture(uuid,integer)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='ar_private.dashboard_capture(uuid,integer)'::regprocedure;
 if md5(body)<>'cc29d98347b7ca5dd8449e3579012b71' then raise exception 'hotel_regions_definition_drift:dashboard_capture';end if;
 definition:=replace(pg_get_functiondef('ar_private.dashboard_capture(uuid,integer)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$case r.hotel when 'KAT' then 1 else 2 end$needle$,$replacement$array_position(array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']::text[],r.hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:dashboard_capture';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- ar_private.document_create_before_source_policy(uuid,uuid,text,text,text[],text,text,text,text)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='ar_private.document_create_before_source_policy(uuid,uuid,text,text,text[],text,text,text,text)'::regprocedure;
 if md5(body)<>'8dc6d24576d7974c6e9c6d9304d36fa8' then raise exception 'hotel_regions_definition_drift:document_create_before_source_policy';end if;
 definition:=replace(pg_get_functiondef('ar_private.document_create_before_source_policy(uuid,uuid,text,text,text[],text,text,text,text)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$p_hotel not in ('KAT','TSK')$needle$,$replacement$not ar_private.is_supported_hotel(p_hotel)$replacement$,1),
  ($needle$case p_hotel when 'KAT' then 1 else 2 end$needle$,$replacement$array_position(array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']::text[],p_hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:document_create_before_source_policy';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- ar_private.financial_publish_without_mapping_coverage(uuid,uuid,text[])
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='ar_private.financial_publish_without_mapping_coverage(uuid,uuid,text[])'::regprocedure;
 if md5(body)<>'13b5015c18b7e8d63a155d1062872124' then raise exception 'hotel_regions_definition_drift:financial_publish_without_mapping_coverage';end if;
 definition:=replace(pg_get_functiondef('ar_private.financial_publish_without_mapping_coverage(uuid,uuid,text[])'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$case r.hotel when 'KAT' then 1 else 2 end$needle$,$replacement$array_position(array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']::text[],r.hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:financial_publish_without_mapping_coverage';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- ar_private.financial_report_without_mapping_coverage(uuid,text,text,text,text,date,date,integer,integer)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='ar_private.financial_report_without_mapping_coverage(uuid,text,text,text,text,date,date,integer,integer)'::regprocedure;
 if md5(body)<>'ee51eb744ee1c79d3aa0372943a78d33' then raise exception 'hotel_regions_definition_drift:financial_report_without_mapping_coverage';end if;
 definition:=replace(pg_get_functiondef('ar_private.financial_report_without_mapping_coverage(uuid,text,text,text,text,date,date,integer,integer)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$p_hotel not in('KAT','TSK')$needle$,$replacement$cardinality(ar_private.report_scope_hotels(p_hotel))=0$replacement$,1),
  ($needle$p_hotel is null or h.hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(h.hotel,p_hotel)$replacement$,1),
  ($needle$p_hotel is null or hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(hotel,p_hotel)$replacement$,4),
  ($needle$p_hotel is null or p.hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(p.hotel,p_hotel)$replacement$,2),
  ($needle$p_hotel is null$needle$,$replacement$not ar_private.is_supported_hotel(p_hotel)$replacement$,1),
  ($needle$from (values('KAT'::text),('TSK'::text))$needle$,$replacement$from unnest(ar_private.report_scope_hotels(p_hotel))$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:financial_report_without_mapping_coverage';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- ar_private.invoice_exception_scope(text,text,text)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='ar_private.invoice_exception_scope(text,text,text)'::regprocedure;
 if md5(body)<>'735d53d7320694d9485b54b89b74e460' then raise exception 'hotel_regions_definition_drift:invoice_exception_scope';end if;
 definition:=replace(pg_get_functiondef('ar_private.invoice_exception_scope(text,text,text)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$p_hotel in('KAT','TSK')$needle$,$replacement$ar_private.is_supported_hotel(p_hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:invoice_exception_scope';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- ar_private.publish_before_dashboard(uuid,integer)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='ar_private.publish_before_dashboard(uuid,integer)'::regprocedure;
 if md5(body)<>'76e88bdb60d96036cb2dee60a1592987' then raise exception 'hotel_regions_definition_drift:publish_before_dashboard';end if;
 definition:=replace(pg_get_functiondef('ar_private.publish_before_dashboard(uuid,integer)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$case run_hotel when 'KAT' then 1 else 2 end$needle$,$replacement$array_position(array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']::text[],run_hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:publish_before_dashboard';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- ar_private.publish_refresh_before_daily_capture(uuid,integer)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='ar_private.publish_refresh_before_daily_capture(uuid,integer)'::regprocedure;
 if md5(body)<>'245661d0178c3bef4ace47e78203fadd' then raise exception 'hotel_regions_definition_drift:publish_refresh_before_daily_capture';end if;
 definition:=replace(pg_get_functiondef('ar_private.publish_refresh_before_daily_capture(uuid,integer)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$case r.hotel when 'KAT' then 1 else 2 end$needle$,$replacement$array_position(array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']::text[],r.hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:publish_refresh_before_daily_capture';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- ar_private.retention_context(uuid,text,text)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='ar_private.retention_context(uuid,text,text)'::regprocedure;
 if md5(body)<>'86c42dee07955ba3f5cc931d3983752b' then raise exception 'hotel_regions_definition_drift:retention_context';end if;
 definition:=replace(pg_get_functiondef('ar_private.retention_context(uuid,text,text)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$hotel not in('KAT','TSK')$needle$,$replacement$not ar_private.is_supported_hotel(hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:retention_context';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_account_workspace_read(uuid,text,text,text,integer,integer)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_account_workspace_read(uuid,text,text,text,integer,integer)'::regprocedure;
 if md5(body)<>'19c9695f29269e786d153d2ea41f7411' then raise exception 'hotel_regions_definition_drift:ar_account_workspace_read';end if;
 definition:=replace(pg_get_functiondef('public.ar_account_workspace_read(uuid,text,text,text,integer,integer)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$p_hotel not in ('KAT','TSK')$needle$,$replacement$not ar_private.is_supported_hotel(p_hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_account_workspace_read';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_aging_invoice_status(uuid,text,text,text,text,jsonb,text,text,boolean,integer,integer,text,jsonb)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_aging_invoice_status(uuid,text,text,text,text,jsonb,text,text,boolean,integer,integer,text,jsonb)'::regprocedure;
 if md5(body)<>'7a5ebd2d18bc38e8a1d25ad9aff8d2d4' then raise exception 'hotel_regions_definition_drift:ar_aging_invoice_status';end if;
 definition:=replace(pg_get_functiondef('public.ar_aging_invoice_status(uuid,text,text,text,text,jsonb,text,text,boolean,integer,integer,text,jsonb)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$p_hotel not in('KAT','TSK')$needle$,$replacement$cardinality(ar_private.report_scope_hotels(p_hotel))=0$replacement$,1),
  ($needle$p_hotel is null or a.hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(a.hotel,p_hotel)$replacement$,2),
  ($needle$p_hotel is null or h.hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(h.hotel,p_hotel)$replacement$,1),
  ($needle$from(values('KAT'::text),('TSK'::text))$needle$,$replacement$from unnest(ar_private.report_scope_hotels(p_hotel))$replacement$,1),
  ($needle$x->>0 not in('KAT','TSK')$needle$,$replacement$not ar_private.is_supported_hotel(x->>0)$replacement$,1),
  ($needle$p_hotel is not null and x->>0<>p_hotel$needle$,$replacement$not ar_private.hotel_in_report_scope(x->>0,p_hotel)$replacement$,1),
  ($needle$p_hotel='KAT' and p_tsk_account is not null or p_hotel='TSK' and p_kat_account is not null$needle$,$replacement$p_tsk_account is not null and not ar_private.hotel_in_report_scope('TSK',p_hotel) or p_kat_account is not null and not ar_private.hotel_in_report_scope('KAT',p_hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_aging_invoice_status';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_claim_refresh(uuid)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_claim_refresh(uuid)'::regprocedure;
 if md5(body)<>'cade98f957786f266d22a26e4b86f58f' then raise exception 'hotel_regions_definition_drift:ar_claim_refresh';end if;
 definition:=replace(pg_get_functiondef('public.ar_claim_refresh(uuid)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$case r.hotel when 'KAT' then 1 else 2 end$needle$,$replacement$array_position(array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']::text[],r.hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_claim_refresh';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_dashboard_balances(uuid,date,text,text,text,text,text,integer,integer)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_dashboard_balances(uuid,date,text,text,text,text,text,integer,integer)'::regprocedure;
 if md5(body)<>'72e852f990c7ce5b78dfa21f7d680ab3' then raise exception 'hotel_regions_definition_drift:ar_dashboard_balances';end if;
 definition:=replace(pg_get_functiondef('public.ar_dashboard_balances(uuid,date,text,text,text,text,text,integer,integer)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$p_hotel not in('KAT','TSK')$needle$,$replacement$cardinality(ar_private.report_scope_hotels(p_hotel))=0$replacement$,1),
  ($needle$p_hotel is null or hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(hotel,p_hotel)$replacement$,2),
  ($needle$p_hotel is null or h.hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(h.hotel,p_hotel)$replacement$,3),
  ($needle$p_hotel is null or c.hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(c.hotel,p_hotel)$replacement$,4),
  ($needle$p_hotel is null or a.hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(a.hotel,p_hotel)$replacement$,1),
  ($needle$p_hotel is null or w.hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(w.hotel,p_hotel)$replacement$,1),
  ($needle$p_hotel is null or s.hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(s.hotel,p_hotel)$replacement$,1),
  ($needle$p_hotel is null$needle$,$replacement$not ar_private.is_supported_hotel(p_hotel)$replacement$,1),
  ($needle$from(values('KAT'::text),('TSK'::text))$needle$,$replacement$from unnest(ar_private.report_scope_hotels(p_hotel))$replacement$,3)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_dashboard_balances';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_dashboard_invoice_entries(uuid,date,date,text,text,text,integer,integer)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_dashboard_invoice_entries(uuid,date,date,text,text,text,integer,integer)'::regprocedure;
 if md5(body)<>'a8d6deb3141028eba2755c4828dcd423' then raise exception 'hotel_regions_definition_drift:ar_dashboard_invoice_entries';end if;
 definition:=replace(pg_get_functiondef('public.ar_dashboard_invoice_entries(uuid,date,date,text,text,text,integer,integer)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$p_hotel not in('KAT','TSK')$needle$,$replacement$cardinality(ar_private.report_scope_hotels(p_hotel))=0$replacement$,1),
  ($needle$p_hotel is null or h.hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(h.hotel,p_hotel)$replacement$,1),
  ($needle$p_hotel is null or r.hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(r.hotel,p_hotel)$replacement$,1),
  ($needle$p_hotel is null or a.hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(a.hotel,p_hotel)$replacement$,1),
  ($needle$p_hotel is null or i.hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(i.hotel,p_hotel)$replacement$,1),
  ($needle$p_hotel is null$needle$,$replacement$not ar_private.is_supported_hotel(p_hotel)$replacement$,1),
  ($needle$from (values('KAT'::text),('TSK'::text))$needle$,$replacement$from unnest(ar_private.report_scope_hotels(p_hotel))$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_dashboard_invoice_entries';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_dashboard_payment_invoices(uuid,date,date,text,text,text,integer,integer)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_dashboard_payment_invoices(uuid,date,date,text,text,text,integer,integer)'::regprocedure;
 if md5(body)<>'f56cf4982620960cd6bdf2ebf112f608' then raise exception 'hotel_regions_definition_drift:ar_dashboard_payment_invoices';end if;
 definition:=replace(pg_get_functiondef('public.ar_dashboard_payment_invoices(uuid,date,date,text,text,text,integer,integer)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$p_hotel not in('KAT','TSK')$needle$,$replacement$cardinality(ar_private.report_scope_hotels(p_hotel))=0$replacement$,1),
  ($needle$p_hotel is null or h.hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(h.hotel,p_hotel)$replacement$,2),
  ($needle$p_hotel is null or p.hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(p.hotel,p_hotel)$replacement$,1),
  ($needle$p_hotel is null$needle$,$replacement$not ar_private.is_supported_hotel(p_hotel)$replacement$,1),
  ($needle$from(values('KAT'::text),('TSK'::text))$needle$,$replacement$from unnest(ar_private.report_scope_hotels(p_hotel))$replacement$,2)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_dashboard_payment_invoices';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_external_billing_preview(uuid,jsonb)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_external_billing_preview(uuid,jsonb)'::regprocedure;
 if md5(body)<>'d5b57a7436ffc0ebd7f136bb6e2b02b8' then raise exception 'hotel_regions_definition_drift:ar_external_billing_preview';end if;
 definition:=replace(pg_get_functiondef('public.ar_external_billing_preview(uuid,jsonb)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$h not in('KAT','TSK')$needle$,$replacement$not ar_private.is_supported_hotel(h)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_external_billing_preview';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_external_billing_read(uuid,text,text,date,date,integer,integer,text)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_external_billing_read(uuid,text,text,date,date,integer,integer,text)'::regprocedure;
 if md5(body)<>'dcc49e6d8265f90f3d2d64a445590ef6' then raise exception 'hotel_regions_definition_drift:ar_external_billing_read';end if;
 definition:=replace(pg_get_functiondef('public.ar_external_billing_read(uuid,text,text,date,date,integer,integer,text)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$p_hotel not in('KAT','TSK')$needle$,$replacement$cardinality(ar_private.report_scope_hotels(p_hotel))=0$replacement$,1),
  ($needle$p_hotel is null or r.hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(r.hotel,p_hotel)$replacement$,1),
  ($needle$p_hotel is null$needle$,$replacement$not ar_private.is_supported_hotel(p_hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_external_billing_read';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_fail_refresh(uuid,text)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_fail_refresh(uuid,text)'::regprocedure;
 if md5(body)<>'d0e49ae59e44389fdf094c718a1b7c09' then raise exception 'hotel_regions_definition_drift:ar_fail_refresh';end if;
 definition:=replace(pg_get_functiondef('public.ar_fail_refresh(uuid,text)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$case r.hotel when 'KAT' then 1 else 2 end$needle$,$replacement$array_position(array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']::text[],r.hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_fail_refresh';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_financial_claim(uuid,uuid)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_financial_claim(uuid,uuid)'::regprocedure;
 if md5(body)<>'73d4e93d79d8fe7a543e2a57761cf5cd' then raise exception 'hotel_regions_definition_drift:ar_financial_claim';end if;
 definition:=replace(pg_get_functiondef('public.ar_financial_claim(uuid,uuid)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$case r.hotel when 'KAT' then 1 else 2 end$needle$,$replacement$array_position(array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']::text[],r.hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_financial_claim';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_financial_diagnostic_candidates(text,integer)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_financial_diagnostic_candidates(text,integer)'::regprocedure;
 if md5(body)<>'935d387d7b902d42aa5e474fbb11f1ed' then raise exception 'hotel_regions_definition_drift:ar_financial_diagnostic_candidates';end if;
 definition:=replace(pg_get_functiondef('public.ar_financial_diagnostic_candidates(text,integer)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$p_hotel not in('KAT','TSK')$needle$,$replacement$not ar_private.is_supported_hotel(p_hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_financial_diagnostic_candidates';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_financial_publish(uuid,uuid,text[])
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_financial_publish(uuid,uuid,text[])'::regprocedure;
 if md5(body)<>'76549d61e1528dbb29508a8af0bf94e2' then raise exception 'hotel_regions_definition_drift:ar_financial_publish';end if;
 definition:=replace(pg_get_functiondef('public.ar_financial_publish(uuid,uuid,text[])'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$case r.hotel when 'KAT' then 1 else 2 end$needle$,$replacement$array_position(array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']::text[],r.hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_financial_publish';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_financial_report(uuid,text,text,text,text,date,date,integer,integer)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_financial_report(uuid,text,text,text,text,date,date,integer,integer)'::regprocedure;
 if md5(body)<>'c60dd77e4a15c31dbfe25a8f66801a5d' then raise exception 'hotel_regions_definition_drift:ar_financial_report';end if;
 definition:=replace(pg_get_functiondef('public.ar_financial_report(uuid,text,text,text,text,date,date,integer,integer)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$p_hotel is null or i.hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(i.hotel,p_hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_financial_report';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_financial_request(uuid,uuid,jsonb,date,date,text,integer)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_financial_request(uuid,uuid,jsonb,date,date,text,integer)'::regprocedure;
 if md5(body)<>'1b1829e81c672e41930f0d6536ce9396' then raise exception 'hotel_regions_definition_drift:ar_financial_request';end if;
 definition:=replace(pg_get_functiondef('public.ar_financial_request(uuid,uuid,jsonb,date,date,text,integer)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$p_request->>'hotel' not in('KAT','TSK')$needle$,$replacement$not ar_private.is_supported_hotel(p_request->>'hotel')$replacement$,1),
  ($needle$case h when 'KAT' then 1 else 2 end$needle$,$replacement$array_position(array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']::text[],h)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_financial_request';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_observation_reports(uuid,text,text,text,text,date,date,boolean,integer,integer)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_observation_reports(uuid,text,text,text,text,date,date,boolean,integer,integer)'::regprocedure;
 if md5(body)<>'e4377e36e9f29aefa078f50e2575089e' then raise exception 'hotel_regions_definition_drift:ar_observation_reports';end if;
 definition:=replace(pg_get_functiondef('public.ar_observation_reports(uuid,text,text,text,text,date,date,boolean,integer,integer)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$p_hotel not in('KAT','TSK')$needle$,$replacement$cardinality(ar_private.report_scope_hotels(p_hotel))=0$replacement$,1),
  ($needle$p_hotel is null or hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(hotel,p_hotel)$replacement$,2),
  ($needle$p_hotel is null or a.hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(a.hotel,p_hotel)$replacement$,1),
  ($needle$p_hotel is null or i.hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(i.hotel,p_hotel)$replacement$,1),
  ($needle$p_hotel is null$needle$,$replacement$not ar_private.is_supported_hotel(p_hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_observation_reports';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_refresh_previous_invoices(text,text,integer)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_refresh_previous_invoices(text,text,integer)'::regprocedure;
 if md5(body)<>'48ab8bba0f4a6bf5f5185c1d5661d425' then raise exception 'hotel_regions_definition_drift:ar_refresh_previous_invoices';end if;
 definition:=replace(pg_get_functiondef('public.ar_refresh_previous_invoices(text,text,integer)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$p_hotel not in('KAT','TSK')$needle$,$replacement$not ar_private.is_supported_hotel(p_hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_refresh_previous_invoices';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_remittance_invoices(uuid,text,text,text,integer,integer)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_remittance_invoices(uuid,text,text,text,integer,integer)'::regprocedure;
 if md5(body)<>'6607b2a8749af90843ea379fc11c3c10' then raise exception 'hotel_regions_definition_drift:ar_remittance_invoices';end if;
 definition:=replace(pg_get_functiondef('public.ar_remittance_invoices(uuid,text,text,text,integer,integer)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$p_hotel not in('KAT','TSK')$needle$,$replacement$not ar_private.is_supported_hotel(p_hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_remittance_invoices';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_remittance_list(uuid,jsonb)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_remittance_list(uuid,jsonb)'::regprocedure;
 if md5(body)<>'0fd0bb1b812f9a4f835d49697466aacf' then raise exception 'hotel_regions_definition_drift:ar_remittance_list';end if;
 definition:=replace(pg_get_functiondef('public.ar_remittance_list(uuid,jsonb)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$v_hotel not in('KAT','TSK')$needle$,$replacement$cardinality(ar_private.report_scope_hotels(v_hotel))=0$replacement$,1),
  ($needle$v_hotel is null or r.hotel=v_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(r.hotel,v_hotel)$replacement$,1),
  ($needle$v_hotel is null$needle$,$replacement$not ar_private.is_supported_hotel(v_hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_remittance_list';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_remittance_save(uuid,uuid,jsonb)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_remittance_save(uuid,uuid,jsonb)'::regprocedure;
 if md5(body)<>'9de55943111f94e73d4cba76a1d2decd' then raise exception 'hotel_regions_definition_drift:ar_remittance_save';end if;
 definition:=replace(pg_get_functiondef('public.ar_remittance_save(uuid,uuid,jsonb)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$scope_hotel not in('KAT','TSK')$needle$,$replacement$not ar_private.is_supported_hotel(scope_hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_remittance_save';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_reports_read(uuid,text,text,text,text,date,date,integer,integer,text,text)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_reports_read(uuid,text,text,text,text,date,date,integer,integer,text,text)'::regprocedure;
 if md5(body)<>'077c6dc5eea842178f7e431350405968' then raise exception 'hotel_regions_definition_drift:ar_reports_read';end if;
 definition:=replace(pg_get_functiondef('public.ar_reports_read(uuid,text,text,text,text,date,date,integer,integer,text,text)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$p_hotel not in ('KAT','TSK')$needle$,$replacement$cardinality(ar_private.report_scope_hotels(p_hotel))=0$replacement$,1),
  ($needle$p_hotel is null or hotel=p_hotel$needle$,$replacement$ar_private.hotel_in_report_scope(hotel,p_hotel)$replacement$,3),
  ($needle$p_hotel is null$needle$,$replacement$not ar_private.is_supported_hotel(p_hotel)$replacement$,2)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_reports_read';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_request_refresh(text,text,text,integer)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_request_refresh(text,text,text,integer)'::regprocedure;
 if md5(body)<>'5017739e62976d12e580e6b00735f890' then raise exception 'hotel_regions_definition_drift:ar_request_refresh';end if;
 definition:=replace(pg_get_functiondef('public.ar_request_refresh(text,text,text,integer)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$p_hotel not in ('KAT','TSK')$needle$,$replacement$not ar_private.is_supported_hotel(p_hotel)$replacement$,1),
  ($needle$case p_hotel when 'KAT' then 1 else 2 end$needle$,$replacement$array_position(array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']::text[],p_hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_request_refresh';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_settings_save(uuid,text,text,integer,boolean,integer,jsonb,jsonb)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_settings_save(uuid,text,text,integer,boolean,integer,jsonb,jsonb)'::regprocedure;
 if md5(body)<>'a5f43fee4c94561fba16c08be6804837' then raise exception 'hotel_regions_definition_drift:ar_settings_save';end if;
 definition:=replace(pg_get_functiondef('public.ar_settings_save(uuid,text,text,integer,boolean,integer,jsonb,jsonb)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$p_hotel not in ('KAT','TSK')$needle$,$replacement$not ar_private.is_supported_hotel(p_hotel)$replacement$,1),
  ($needle$case p_hotel when 'KAT' then 1 else 2 end$needle$,$replacement$array_position(array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']::text[],p_hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_settings_save';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_settings_save_v2(uuid,text,text,integer,boolean,integer,jsonb,jsonb,jsonb)
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_settings_save_v2(uuid,text,text,integer,boolean,integer,jsonb,jsonb,jsonb)'::regprocedure;
 if md5(body)<>'216e5370ebe1d99737f382d2b8355577' then raise exception 'hotel_regions_definition_drift:ar_settings_save_v2';end if;
 definition:=replace(pg_get_functiondef('public.ar_settings_save_v2(uuid,text,text,integer,boolean,integer,jsonb,jsonb,jsonb)'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$case p_hotel when 'KAT' then 1 else 2 end$needle$,$replacement$array_position(array['KAT','TSK','TLKL','WAKL','TLFO','TSAN']::text[],p_hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_settings_save_v2';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- public.ar_validate_collection_selection(text,text,text[])
do $patch$
declare definition text;body text;needle text;replacement text;expected integer;r record;
begin
 select replace(prosrc,E'\r','') into body from pg_proc where oid='public.ar_validate_collection_selection(text,text,text[])'::regprocedure;
 if md5(body)<>'1227925c9f1193216ba94742db3384fa' then raise exception 'hotel_regions_definition_drift:ar_validate_collection_selection';end if;
 definition:=replace(pg_get_functiondef('public.ar_validate_collection_selection(text,text,text[])'::regprocedure),E'\r','');
 for r in select * from(values
  ($needle$p_hotel in ('KAT','TSK')$needle$,$replacement$ar_private.is_supported_hotel(p_hotel)$replacement$,1)) as edits(needle,replacement,expected) loop
  if (length(definition)-length(replace(definition,r.needle,'')))/length(r.needle)<>r.expected then raise exception 'hotel_regions_patch_drift:ar_validate_collection_selection';end if;
  definition:=replace(definition,r.needle,r.replacement);
 end loop;
 execute definition;
end $patch$;

-- Same stable composition as the Phuket overview, with explicit ordered region.
create function public.ar_dashboard_region_overview(p_actor uuid,p_from date,p_to date,p_type text,p_region text)
 returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare
 h text;segment text;part jsonb;scope jsonb;total jsonb;hotels jsonb:='[]'::jsonb;code text;region_scope text;
begin
 if not ar_private.financial_actor(p_actor) then return jsonb_build_object('error','dashboard_forbidden');end if;
 if p_region is null or p_region not in('phuket','khao-lak') then return jsonb_build_object('error','dashboard_invalid');end if;
 region_scope:=case p_region when 'phuket' then 'Phuket' else 'KhaoLak' end;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
  or p_from<date '0001-01-01' or p_to>date '9999-12-31' or p_from>p_to or p_to-p_from>3660
  or p_to>(now() at time zone 'Asia/Bangkok')::date
  or p_type is not null and (length(p_type) not between 1 and 200 or p_type<>btrim(p_type) or p_type~'[[:cntrl:]]')
  then return jsonb_build_object('error','dashboard_invalid');end if;
 foreach h in array array_prepend(region_scope,ar_private.report_scope_hotels(region_scope)) loop
  scope:='{}'::jsonb;
  foreach segment in array array['balances','activity','external','entries','payments','paid'] loop
   part:=null;
   begin
    case segment
     when 'balances' then part:=public.ar_dashboard_balances(p_actor,p_to,h,null,p_type,null,null,0,1);
     when 'activity' then part:=public.ar_reports_read(p_actor,'activity',h,null,p_type,p_from,p_to,0,1,null,null);
     when 'external' then part:=public.ar_external_billing_read(p_actor,h,null,p_from,p_to,0,1,p_type);
     when 'entries' then part:=public.ar_dashboard_invoice_entries(p_actor,p_from,p_to,h,null,p_type,0,1);
     when 'payments' then part:=public.ar_financial_report(p_actor,'payments',h,null,p_type,p_from,p_to,0,1);
     when 'paid' then part:=public.ar_dashboard_payment_invoices(p_actor,p_from,p_to,h,null,p_type,0,1);
    end case;
   exception when others then
    if sqlstate in('42501','28000','28P01') or sqlerrm~'(^|_)(forbidden|unauthorized)(_|$)' then return jsonb_build_object('error','dashboard_forbidden');end if;
    if sqlstate='22023' or sqlerrm~'(^|_)invalid(_|$)' then return jsonb_build_object('error','dashboard_invalid');end if;
    part:=null;
   end;
   code:=part->>'error';
   if code~'(^|_)(forbidden|unauthorized)(_|$)' then return jsonb_build_object('error','dashboard_forbidden');end if;
   if code~'(^|_)invalid(_|$)' then return jsonb_build_object('error','dashboard_invalid');end if;
   if jsonb_typeof(part) is distinct from 'object' or part?'error' then part:=null;
   elsif segment in('entries','payments') then
    if jsonb_typeof(part->'summary') is distinct from 'object' or jsonb_typeof(part->'coverage') is distinct from 'object' then part:=null;
    else part:=jsonb_build_object('summary',part->'summary','coverage',part->'coverage');end if;
   elsif segment in('activity','external') then
    if jsonb_typeof(part->'summary') is distinct from 'object' or jsonb_typeof(part->'total') is distinct from 'number' then part:=null;
    else part:=jsonb_build_object('rows','[]'::jsonb,'total',part->'total','summary',part->'summary');end if;
   else part:=jsonb_set(part,'{rows}','[]'::jsonb);
   end if;
   scope:=scope||jsonb_build_object(segment,part);
  end loop;
  if h=region_scope then total:=scope;else hotels:=hotels||jsonb_build_array(scope||jsonb_build_object('hotel',h));end if;
 end loop;
 return jsonb_build_object('region',p_region,'from',p_from,'to',p_to,'total',total,'hotels',hotels);
end$function$;
revoke all on function public.ar_dashboard_region_overview(uuid,date,date,text,text) from public,anon,authenticated,service_role;
grant execute on function public.ar_dashboard_region_overview(uuid,date,date,text,text) to service_role;

-- New distinct RPC avoids ambiguous PostgREST overload resolution.
create function public.ar_portfolio_region_accounts(p_actor uuid,p_region text) returns jsonb
language plpgsql stable security definer set search_path='' as $function$
declare result jsonb;scope text;
begin
 if not ar_private.financial_actor(p_actor) then return jsonb_build_object('error','portfolio_forbidden');end if;
 if p_region is null or p_region not in('phuket','khao-lak') then return jsonb_build_object('error','portfolio_invalid');end if;
 scope:=case p_region when 'phuket' then 'Phuket' else 'KhaoLak' end;
 with counts as materialized(
  select hotel,account_id,count(*) as items from public.ar_invoices
  where ar_private.hotel_in_report_scope(hotel,scope) and open<>0 and collection_role<>'child' group by hotel,account_id
 ),accounts as(
  select a.hotel,a.id,to_jsonb(a)||jsonb_build_object('items',coalesce(c.items,0)) as value
  from public.ar_accounts a left join counts c on c.hotel=a.hotel and c.account_id=a.id where ar_private.hotel_in_report_scope(a.hotel,scope)
 )
 select jsonb_build_object('accounts',coalesce((select jsonb_agg(value order by hotel,id) from accounts),'[]'::jsonb),'source','opera',
  'status',case when exists(select 1 from public.ar_refresh_state where ar_private.hotel_in_report_scope(hotel,scope) and last_success_at is not null) then 'connected' else 'not_connected' end,
  'region',p_region,'refresh',jsonb_build_object('hotels',coalesce((select jsonb_agg(to_jsonb(s) order by array_position(ar_private.report_scope_hotels(scope),s.hotel)) from public.ar_refresh_state s where ar_private.hotel_in_report_scope(s.hotel,scope)),'[]'::jsonb),'running',exists(select 1 from ar_private.refresh_runs r where ar_private.hotel_in_report_scope(r.hotel,scope) and (r.status='queued' or r.status='running' and r.lease_until>statement_timestamp())))) into result;
 return result;
end$function$;
revoke all on function public.ar_portfolio_region_accounts(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.ar_portfolio_region_accounts(uuid,text) to service_role;

-- Legacy callers retain their original shape and Phuket scope, including refresh.
create or replace function public.ar_portfolio_accounts(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin return public.ar_portfolio_region_accounts(p_actor,'phuket')-'region';end
$$;

create function public.ar_remittance_region_options(p_actor uuid,p_region text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;scope text;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','remittance_forbidden');end if;
 if p_region is null or p_region not in('phuket','khao-lak') then return jsonb_build_object('error','remittance_invalid');end if;
 scope:=case p_region when 'phuket' then 'Phuket' else 'KhaoLak' end;
 with historical as materialized (
  select distinct on (hotel,account_id) hotel,account_id,account_name,account_type,account_no
  from public.ar_remittances where owner=p_actor and ar_private.hotel_in_report_scope(hotel,scope) order by hotel,account_id,created_at desc,id
 ), accounts as (
  select a.hotel,a.id as account_id,a.name,a.type,a.account_no,a.verification_state in('verified','cleared') as verified
  from public.ar_accounts a where ar_private.hotel_in_report_scope(a.hotel,scope)
  union all
  select h.hotel,h.account_id,h.account_name,h.account_type,h.account_no,false
  from historical h where not exists(select 1 from public.ar_accounts a where a.hotel=h.hotel and a.id=h.account_id)
 ), types as (
  select type from public.ar_accounts where ar_private.hotel_in_report_scope(hotel,scope)
  union select account_type from public.ar_remittances where owner=p_actor and ar_private.hotel_in_report_scope(hotel,scope)
 )
 select jsonb_build_object('region',p_region,
  'accounts',coalesce((select jsonb_agg(jsonb_build_object('hotel',a.hotel,'accountId',a.account_id,'name',a.name,'type',a.type,'accountNo',a.account_no,'verified',a.verified) order by array_position(ar_private.report_scope_hotels(scope),a.hotel),a.name,a.account_id) from accounts a),'[]'::jsonb),
  'accountTypes',coalesce((select jsonb_agg(type order by type) from types),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.ar_remittance_region_options(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.ar_remittance_region_options(uuid,text) to service_role;
create or replace function public.ar_remittance_options(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin return public.ar_remittance_region_options(p_actor,'phuket')-'region';end
$$;

create function public.ar_refresh_region_status(p_region text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare scope text;
begin
 if p_region is null or p_region not in('phuket','khao-lak') then return jsonb_build_object('error','refresh_invalid');end if;
 scope:=case p_region when 'phuket' then 'Phuket' else 'KhaoLak' end;
 return jsonb_build_object(
  'hotels',coalesce((select jsonb_agg(to_jsonb(s) order by array_position(ar_private.report_scope_hotels(scope),s.hotel)) from public.ar_refresh_state s where ar_private.hotel_in_report_scope(s.hotel,scope)),'[]'::jsonb),
  'running',exists(select 1 from ar_private.refresh_runs r where ar_private.hotel_in_report_scope(r.hotel,scope) and (r.status='queued' or r.status='running' and r.lease_until>statement_timestamp())));
end $$;
revoke all on function public.ar_refresh_region_status(text) from public,anon,authenticated,service_role;
grant execute on function public.ar_refresh_region_status(text) to service_role;
create or replace function public.ar_refresh_status() returns jsonb
language sql stable security invoker set search_path='' as $$
 select public.ar_refresh_region_status('phuket')
$$;

-- Financial completion polling must scope before LIMIT, not filter the latest
-- global ten rows afterward. Preserve the original actor and owner boundary.
create function public.ar_financial_region_status(p_actor uuid,p_region text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare scope text;
begin
 if not ar_private.financial_actor(p_actor) then raise exception 'financial_forbidden';end if;
 if p_region is null or p_region not in('phuket','khao-lak') then raise exception 'financial_invalid';end if;
 scope:=case p_region when 'phuket' then 'Phuket' else 'KhaoLak' end;
 return jsonb_build_object(
  'runs',coalesce((select jsonb_agg(ar_private.financial_run_json(r)||jsonb_build_object('finishedAt',r.finished_at,'error',r.error_code) order by r.created_at desc,r.id desc)
   from (select * from ar_private.financial_runs where owner=p_actor and ar_private.hotel_in_report_scope(hotel,scope) order by created_at desc,id desc limit 10) r),'[]'::jsonb),
  'running',exists(select 1 from ar_private.financial_runs where owner=p_actor and ar_private.hotel_in_report_scope(hotel,scope) and status in('queued','running')));
end $$;
revoke all on function public.ar_financial_region_status(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.ar_financial_region_status(uuid,text) to service_role;
create or replace function public.ar_financial_status(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin return public.ar_financial_region_status(p_actor,'phuket');end
$$;
