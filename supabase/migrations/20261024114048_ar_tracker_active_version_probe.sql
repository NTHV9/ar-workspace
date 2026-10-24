-- Lightweight provider version hints, separate from financial and sync history.
create table ar_private.tracker_probe_state(
 region text primary key references ar_private.tracker_bindings(region) on delete cascade,
 owner uuid not null,file_id text not null,
 prior_version text check(prior_version ~ '^[0-9]{1,30}$'),last_checked_at timestamptz,
 lock_id uuid,lock_until timestamptz
);
alter table ar_private.tracker_probe_state enable row level security;
revoke all on ar_private.tracker_probe_state from public,anon,authenticated,service_role;

create function public.ar_tracker_probe_claim(p_owner uuid,p_region text,p_lock uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b ar_private.tracker_bindings;s ar_private.tracker_probe_state;t timestamptz:=clock_timestamp();begin
 if p_owner is null or p_owner is distinct from ar_private.access_owner() then raise exception 'tracker_forbidden';end if;
 perform ar_private.tracker_authorize(p_owner,p_region);
 if p_lock is null then raise exception 'tracker_probe_invalid';end if;
 -- The binding lock serializes claims, finishes and binding changes in that order.
 select * into b from ar_private.tracker_bindings where region=p_region for update;
 if b.region is null or b.owner is distinct from p_owner or not b.enabled or not b.bootstrap_confirmed then return jsonb_build_object('status','disabled');end if;
 insert into ar_private.tracker_probe_state(region,owner,file_id) values(p_region,p_owner,b.file_id) on conflict(region) do nothing;
 select * into s from ar_private.tracker_probe_state where region=p_region for update;
 if s.owner is distinct from p_owner or s.file_id is distinct from b.file_id then
  update ar_private.tracker_probe_state set owner=p_owner,file_id=b.file_id,prior_version=null,last_checked_at=null,lock_id=null,lock_until=null where region=p_region returning * into s;
 end if;
 if s.lock_id=p_lock or s.lock_until>t or s.last_checked_at>t-interval '5 seconds' then return jsonb_build_object('status','busy');end if;
 update ar_private.tracker_probe_state set last_checked_at=t,lock_id=p_lock,lock_until=t+interval '45 seconds' where region=p_region;
 return jsonb_build_object('status','claimed','fileId',b.file_id,'priorVersion',s.prior_version);
end $$;

create function public.ar_tracker_probe_finish(p_region text,p_lock uuid,p_version text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b ar_private.tracker_bindings;s ar_private.tracker_probe_state;j uuid;begin
 if p_version is not null and p_version !~ '^[0-9]{1,30}$' then raise exception 'tracker_probe_invalid';end if;
 select * into b from ar_private.tracker_bindings where region=p_region for update;
 select * into s from ar_private.tracker_probe_state where region=p_region for update;
 if b.region is null or s.region is null or p_lock is null or s.lock_id is distinct from p_lock or s.lock_until is null or s.lock_until<=clock_timestamp()
 or not b.enabled or not b.bootstrap_confirmed or b.owner is distinct from ar_private.access_owner() or s.owner is distinct from b.owner or s.file_id is distinct from b.file_id
 or not coalesce(p_region=any((ar_private.access_member(b.owner)).regions),false) then return jsonb_build_object('status','stale');end if;
 if p_version is null then
  update ar_private.tracker_probe_state set lock_until=null where region=p_region;
  return jsonb_build_object('status','failed');
 end if;
 if s.prior_version is not distinct from p_version then
  update ar_private.tracker_probe_state set lock_until=null where region=p_region;
  -- Retry dispatch of already durable work without enqueueing or advancing generation.
  select id into j from ar_private.tracker_wakes where region=p_region and owner=b.owner and file_id=b.file_id and generation>consumed;
  return jsonb_strip_nulls(jsonb_build_object('status','unchanged','id',j));
 end if;
 -- Durable wake and baseline advancement commit together; enqueue failures roll back both.
 j:=ar_private.tracker_wake_enqueue(p_region,b.owner,b.file_id);
 update ar_private.tracker_probe_state set prior_version=p_version,lock_until=null where region=p_region;
 return jsonb_build_object('status','changed','id',j);
end $$;
revoke all on function public.ar_tracker_probe_claim(uuid,text,uuid),public.ar_tracker_probe_finish(text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.ar_tracker_probe_claim(uuid,text,uuid),public.ar_tracker_probe_finish(text,uuid,text) to service_role;

