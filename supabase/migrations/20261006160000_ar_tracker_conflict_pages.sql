-- Bounded read-only conflict navigation. Existing status/resolver contracts stay unchanged.
create index tracker_pending_conflict_page on ar_private.tracker_conflicts(region,created_at,id) where status='pending';
create function public.ar_tracker_conflicts_page(p_actor uuid,p_region text,p_category text,p_after_created_at timestamptz default null,p_after_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare owner_id uuid;result jsonb;
begin
 owner_id:=ar_private.tracker_authorize(p_actor,p_region);
 if p_category is null or p_category not in('all','dates','references','identity','other') or (p_after_created_at is null)<>(p_after_id is null) or not isfinite(coalesce(p_after_created_at,now())) then raise exception 'tracker_invalid';end if;
 with scoped as materialized(
  select c.*,case when field in('R','U','V','W') then 'dates' when field in('S','T','AA') then 'references' when field='identity' then 'identity' else 'other' end as category
  from ar_private.tracker_conflicts c where c.region=p_region and c.status='pending'
 ),page as materialized(
  select * from scoped where (p_category='all' or category=p_category) and (p_after_created_at is null or (created_at,id)>(p_after_created_at,p_after_id)) order by created_at,id limit 51
 ),visible as materialized(select * from page order by created_at,id limit 50)
 select jsonb_build_object('region',p_region,'category',p_category,
  'counts',jsonb_build_object('all',(select count(*) from scoped),'dates',(select count(*) from scoped where category='dates'),'references',(select count(*) from scoped where category='references'),'identity',(select count(*) from scoped where category='identity'),'other',(select count(*) from scoped where category='other')),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'rowKey',row_key,'field',field,'reason',reason,'sheetValue',sheet_value,'webValue',web_value,'revision',revision,'createdAt',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by created_at,id) from visible),'[]'::jsonb),
  'next',case when (select count(*) from page)>50 then (select jsonb_build_object('createdAt',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'id',id) from visible order by created_at desc,id desc limit 1) else null end
 ) into result;
 return result;
end $$;
revoke all on function public.ar_tracker_conflicts_page(uuid,text,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.ar_tracker_conflicts_page(uuid,text,text,timestamptz,uuid) to service_role;
