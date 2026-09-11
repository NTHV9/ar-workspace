alter table public.ar_invoices add constraint ar_compression_verified_flag check (collection_role='unverified' or compressed is not null);
create function public.ar_validate_collection_selection(p_hotel text,p_account_id text,p_ids text[]) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce(
   p_hotel in ('KAT','TSK') and cardinality(p_ids) between 1 and 100
   and cardinality(p_ids)=(select count(distinct v) from unnest(p_ids) v)
   and (select count(*) from public.ar_invoices i where i.hotel=p_hotel and i.account_id=p_account_id and i.id=any(p_ids) and i.collection_selectable)=cardinality(p_ids),false);
$$;
revoke all on function public.ar_validate_collection_selection(text,text,text[]) from public,anon;
grant execute on function public.ar_validate_collection_selection(text,text,text[]) to authenticated;
