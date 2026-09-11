-- Reverify zero-balance invoices while app file bytes still depend on them.
-- No amount is inferred from absence and no unrelated historical ledger is scanned.
create function public.ar_refresh_previous_invoices(p_hotel text,p_account_id text,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_hotel is null or p_hotel not in('KAT','TSK') or p_account_id is null or length(p_account_id) not between 1 and 200 or p_offset is null or p_offset<0 then raise exception 'refresh_scope_invalid';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) into result from(
  select i.id,i.invoice_no,i.open from public.ar_invoices i where i.hotel=p_hotel and i.account_id=p_account_id and (i.open<>0 or exists(
   select 1 from ar_private.retention_storage_references r where r.hotel=i.hotel and r.account_id=i.account_id and i.id=any(r.invoice_ids) and (
    exists(select 1 from storage.objects o where o.bucket_id='ar-working-files' and o.name=r.storage_key)
    or exists(select 1 from ar_private.drive_archive_files f join ar_private.drive_archives a on a.id=f.archive_id where f.storage_key=r.storage_key and a.owner=r.owner and a.kind='job' and f.state='verified' and not exists(select 1 from ar_private.retention_items t where t.store='drive' and t.object_id=f.drive_file_id and t.state='deleted'))
   )
  )) order by i.id offset p_offset limit 500
 )x;return result;
end$$;
-- Retain the atomic publisher and observation hooks. Explicitly unconfirmed
-- tracked zeros become missing in the same transaction, without changing money.
alter function public.ar_publish_refresh(uuid,integer) set schema ar_private;
alter function ar_private.ar_publish_refresh(uuid,integer) rename to publish_before_retained_zero;
revoke all on function ar_private.publish_before_retained_zero(uuid,integer) from public,anon,authenticated,service_role;
create function public.ar_publish_refresh(p_run_id uuid,p_expected_accounts integer) returns void language plpgsql security definer set search_path='' as $$
declare unconfirmed jsonb;scope record;run_status text;run_hotel text;
begin
 select hotel into run_hotel from ar_private.refresh_runs where id=p_run_id;
 if run_hotel is not null then perform pg_advisory_xact_lock(61704,case run_hotel when 'KAT' then 1 else 2 end);end if;
 select status into run_status from ar_private.refresh_runs where id=p_run_id for update;
 if run_status='succeeded' then perform ar_private.publish_before_retained_zero(p_run_id,p_expected_accounts);return;end if;
 select coalesce(jsonb_agg(jsonb_build_object('hotel',s.hotel,'account',s.account_id,'ids',s.payload->'unconfirmedInvoiceIds')),'[]'::jsonb) into unconfirmed from ar_private.refresh_stage s where s.job_id=p_run_id and jsonb_typeof(s.payload->'unconfirmedInvoiceIds')='array';
 perform ar_private.publish_before_retained_zero(p_run_id,p_expected_accounts);
 for scope in select value as item from jsonb_array_elements(unconfirmed) loop
  update public.ar_invoices i set verification_state='missing' where i.hotel=scope.item->>'hotel' and i.account_id=scope.item->>'account' and i.id in(select jsonb_array_elements_text(scope.item->'ids')) and i.open=0;
 end loop;
end$$;
revoke all on function public.ar_refresh_previous_invoices(text,text,integer),public.ar_publish_refresh(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.ar_refresh_previous_invoices(text,text,integer),public.ar_publish_refresh(uuid,integer) to service_role;
