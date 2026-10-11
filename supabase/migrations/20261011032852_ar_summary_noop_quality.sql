-- Migration 113: ignore empty statements, retaining every genuine change.
-- No historical quality rows are removed; cache keys, TTL and Sent triggers stay.
do $guard$
begin
 if (select md5(replace(prosrc,chr(13),'')) from pg_proc where oid='ar_private.invalidate_period_summaries()'::regprocedure)<>'e7ee29a8af3383e8a1313fae4b7c7eb1' then
  raise exception 'summary invalidator definition drift';
 end if;
end $guard$;

create function ar_private.invalidate_period_insert() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from ar_new_rows) then
  update ar_private.period_summary_generation set revision=revision+1 where singleton;
 end if;
 return null;
end $$;
create function ar_private.invalidate_period_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from ar_old_rows) then
  update ar_private.period_summary_generation set revision=revision+1 where singleton;
 end if;
 return null;
end $$;
create function ar_private.invalidate_period_update() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Deliberately conservative for nonempty updates, including identical rows.
 -- Comparing full OLD/NEW batches cost more than the avoided invalidation in
 -- representative stress tests. Capture only NEW rows and skip zero-row writes.
 if exists(select 1 from ar_new_rows) then
  update ar_private.period_summary_generation set revision=revision+1 where singleton;
 end if;
 return null;
end $$;
revoke all on function ar_private.invalidate_period_insert(),ar_private.invalidate_period_delete(),ar_private.invalidate_period_update() from public,anon,authenticated,service_role;

do $triggers$
declare name text;old_name text;expected_type integer;original_count integer;
begin
 select count(*) into original_count from pg_trigger where not tgisinternal and tgfoid='ar_private.invalidate_period_summaries()'::regprocedure;
 if original_count<>20 then raise exception 'summary trigger inventory drift';end if;
 foreach name in array array[
 'public.ar_accounts','public.ar_invoices','public.ar_invoice_workflow','public.ar_account_settings','public.ar_refresh_state','public.ar_sent_events',
 'ar_private.external_billing_records','ar_private.collection_policy_head','ar_private.collection_policy_versions',
 'ar_private.dashboard_daily_captures','ar_private.dashboard_daily_invoices','ar_private.dashboard_capture_state',
 'ar_private.financial_accounts','ar_private.financial_invoice_entries','ar_private.financial_payments','ar_private.financial_applications','ar_private.financial_publications',
 'ar_private.tracker_accepted_facts'] loop
  old_name:=case when name='ar_private.tracker_accepted_facts' then 'tracker_invalidate_period' else 'ar_invalidate_period_summaries' end;
  expected_type:=case when name='ar_private.tracker_accepted_facts' then 20 else 60 end;
  if not exists(select 1 from pg_trigger where tgrelid=name::regclass and tgname=old_name and tgtype=expected_type and tgenabled='O' and not tgisinternal and tgnargs=0 and tgqual is null and tgfoid='ar_private.invalidate_period_summaries()'::regprocedure) then
   raise exception 'summary trigger definition drift: %',name;
  end if;
  execute format('drop trigger %I on %s',old_name,name::regclass);
  execute format('create trigger %I after insert on %s referencing new table as ar_new_rows for each statement execute function ar_private.invalidate_period_insert()',old_name||'_insert',name::regclass);
  execute format('create trigger %I after update on %s referencing new table as ar_new_rows for each statement execute function ar_private.invalidate_period_update()',old_name||'_update',name::regclass);
  if name<>'ar_private.tracker_accepted_facts' then
   execute format('create trigger %I after delete on %s referencing old table as ar_old_rows for each statement execute function ar_private.invalidate_period_delete()',old_name||'_delete',name::regclass);
   execute format('create trigger %I after truncate on %s for each statement execute function ar_private.invalidate_period_summaries()',old_name,name::regclass);
  end if;
 end loop;
end $triggers$;

do $quality$
declare target regprocedure:='ar_private.publish_refresh_before_daily_capture(uuid,integer)'::regprocedure;
 definition text;needle text:=$needle$insert into ar_private.refresh_quality(run_id,hotel,account_id,warnings) values(r.id,r.hotel,s.account_id,coalesce(a->'sourceWarnings','[]'::jsonb));$needle$;
begin
 if (select md5(replace(prosrc,chr(13),'')) from pg_proc where oid=target)<>'db1aa945f29712e837ed1c22286a12e6' then raise exception 'refresh publisher definition drift';end if;
 definition:=replace(pg_get_functiondef(target),chr(13),'');
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'refresh quality insertion drift';end if;
 execute replace(definition,needle,$replacement$if coalesce(a->'sourceWarnings','[]'::jsonb)<>'[]'::jsonb then
      insert into ar_private.refresh_quality(run_id,hotel,account_id,warnings) values(r.id,r.hotel,s.account_id,coalesce(a->'sourceWarnings','[]'::jsonb));
    end if;$replacement$);
end $quality$;
