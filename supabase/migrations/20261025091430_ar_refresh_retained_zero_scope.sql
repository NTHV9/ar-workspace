-- The former correlated EXISTS expanded the full retention-reference UNION for
-- every zero invoice (2,072 loops on the measured KAT account). Resolve the same
-- account's exact retained references once per page, then test invoice membership.
-- Keep existing money/source rules, private grants, 500-row ordering and offsets.
create or replace function public.ar_refresh_previous_invoices(p_hotel text,p_account_id text,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_hotel is null or not ar_private.is_supported_hotel(p_hotel) or p_account_id is null or length(p_account_id) not between 1 and 200 or p_offset is null or p_offset<0 then raise exception 'refresh_scope_invalid';end if;
 with scoped_references as materialized(
  select r.storage_key,r.owner,r.invoice_ids from ar_private.retention_storage_references r
  where r.hotel=p_hotel and r.account_id=p_account_id
 ),retained_ids as materialized(
  select distinct unnest(r.invoice_ids) as id from scoped_references r where
   exists(select 1 from storage.objects o where o.bucket_id='ar-working-files' and o.name=r.storage_key)
   or exists(select 1 from ar_private.drive_archive_files f join ar_private.drive_archives a on a.id=f.archive_id
    where f.storage_key=r.storage_key and a.owner=r.owner and a.kind='job' and f.state='verified'
    and not exists(select 1 from ar_private.retention_items t where t.store='drive' and t.object_id=f.drive_file_id and t.state='deleted'))
 )
 select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) into result from(
  select i.id,i.invoice_no,i.open from public.ar_invoices i
  where i.hotel=p_hotel and i.account_id=p_account_id and (i.open<>0 or i.id in(select id from retained_ids))
  order by i.id offset p_offset limit 500
 )x;return result;
end$$;
revoke all on function public.ar_refresh_previous_invoices(text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.ar_refresh_previous_invoices(text,text,integer) to service_role;
