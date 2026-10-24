-- Server-owned, bounded presence. No client can set expiry, identity or hotel grants.
create table ar_private.refresh_activity(
 actor uuid not null references auth.users(id) on delete cascade,
 hotel text not null check(hotel in('KAT','TSK','TLKL','WAKL','TLFO','TSAN')),
 expires_at timestamptz not null,
 primary key(actor,hotel)
);
alter table ar_private.refresh_activity enable row level security;
revoke all on ar_private.refresh_activity from public,anon,authenticated,service_role;

create function public.ar_refresh_activity_touch(p_actor uuid,p_hotels text[]) returns void
language plpgsql security definer set search_path='' as $$
declare m ar_private.access_members;allowed text[];
begin
 m:=ar_private.access_member(p_actor);
 if m.email is null then raise exception 'access_forbidden';end if;
 allowed:=ar_private.access_hotels(m.regions);
 if p_hotels is null or cardinality(p_hotels) not between 1 and 6
  or array_position(p_hotels,null) is not null or not p_hotels<@allowed
  or cardinality(p_hotels)<>(select count(distinct h) from unnest(p_hotels) h)
 then raise exception 'access_forbidden';end if;
 insert into ar_private.refresh_activity(actor,hotel,expires_at)
 select p_actor,h,clock_timestamp()+interval '6 minutes' from unnest(p_hotels) h
 on conflict(actor,hotel) do update set expires_at=excluded.expires_at
 where ar_private.refresh_activity.expires_at<clock_timestamp()+interval '5 minutes';
end $$;

create function public.ar_refresh_active_hotels() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(hotel order by hotel),'[]'::jsonb) from (
  select distinct a.hotel from ar_private.refresh_activity a
  cross join lateral ar_private.access_member(a.actor) m
  where a.expires_at>now() and m.email is not null
   and a.hotel=any(ar_private.access_hotels(m.regions))
 ) eligible;
$$;

-- A partially completed group reuses private staged snapshots, never re-reads them.
create function public.ar_refresh_staged_accounts(p_run_id uuid,p_ids text[]) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r ar_private.refresh_runs;
begin
 if p_ids is null or cardinality(p_ids) not between 1 and 10 or array_position(p_ids,null) is not null
  or ''=any(p_ids) or cardinality(p_ids)<>(select count(distinct i) from unnest(p_ids) i)
 then raise exception 'refresh_batch_invalid';end if;
 select * into r from ar_private.refresh_runs where id=p_run_id for share;
 if r.id is null or r.status<>'running' or r.lease_until<=clock_timestamp()
  or (r.account_id is not null and p_ids<>array[r.account_id]) then raise exception 'refresh_lease_invalid';end if;
 return (select coalesce(jsonb_agg(account_id order by account_id),'[]'::jsonb)
  from ar_private.refresh_stage where job_id=r.id and hotel=r.hotel and account_id=any(p_ids));
end $$;
revoke all on function public.ar_refresh_activity_touch(uuid,text[]),public.ar_refresh_active_hotels(),public.ar_refresh_staged_accounts(uuid,text[]) from public,anon,authenticated;
grant execute on function public.ar_refresh_activity_touch(uuid,text[]),public.ar_refresh_active_hotels(),public.ar_refresh_staged_accounts(uuid,text[]) to service_role;
