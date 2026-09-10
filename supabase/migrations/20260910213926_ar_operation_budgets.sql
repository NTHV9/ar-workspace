-- DRAFT: not applied. Atomic application budget ledger; no provider/Storage calls or deletion.
-- Read usage/as-of/headroom from verified sources before admitting work. No unknown->zero.
create table ar_private.operations_budget (
 singleton boolean primary key default true check(singleton),measurement jsonb,local_measured_at timestamptz,
 activated_at timestamptz,blocked boolean not null default false,updated_at timestamptz not null default now()
);
insert into ar_private.operations_budget(singleton) values(true);
create table ar_private.operations_budget_reservations (
 id uuid primary key,owner uuid not null references auth.users(id),resource text not null check(resource~'^[a-z][a-z0-9_]{0,63}$'),
 reserved jsonb not null,actual jsonb,state text not null default 'reserved' check(state in('reserved','started','finished','released')),
 detached boolean not null default false,accounting_basis text not null default 'verified' check(accounting_basis in('verified','read_upper_bound')),overrun boolean not null default false,created_at timestamptz not null default now(),started_at timestamptz,finished_at timestamptz,released_at timestamptz,
 check((state='finished')=(actual is not null)),check(not overrun or state='finished')
);
create index operations_budget_reservations_state on ar_private.operations_budget_reservations(state);
alter table ar_private.operations_budget enable row level security;
alter table ar_private.operations_budget_reservations enable row level security;
revoke all on ar_private.operations_budget,ar_private.operations_budget_reservations from public,anon,authenticated,service_role;

create function ar_private.operations_budget_bytes(v jsonb,p_nullable boolean default false) returns boolean language plpgsql immutable set search_path='' as $$
declare k text;
begin
 if jsonb_typeof(v) is distinct from 'object' then return false;end if;
 if not(v?&array['storedBytes','egressBytes','databaseBytes']) or v-array['storedBytes','egressBytes','databaseBytes']<>'{}'::jsonb then return false;end if;
 foreach k in array array['storedBytes','egressBytes','databaseBytes'] loop
  if p_nullable and v->k='null'::jsonb then continue;end if;
  if jsonb_typeof(v->k) is distinct from 'number' or length(v->>k)>16 or (v->>k)!~'^(0|[1-9][0-9]*)$' then return false;end if;
  if (v->>k)::numeric>9007199254740991 then return false;end if;
 end loop;return true;
end $$;

create function ar_private.operations_budget_limits(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text;cap numeric;
begin
 if jsonb_typeof(v) is distinct from 'object' then return false;end if;
 if not(v?&array['storedBytes','egressBytes','databaseBytes','safetyPercent','maxConcurrent','measurementMaxAgeSeconds']) or v-array['storedBytes','egressBytes','databaseBytes','safetyPercent','maxConcurrent','measurementMaxAgeSeconds']<>'{}'::jsonb then return false;end if;
 foreach k in array array['storedBytes','egressBytes','databaseBytes','safetyPercent','maxConcurrent','measurementMaxAgeSeconds'] loop
  if jsonb_typeof(v->k) is distinct from 'number' or length(v->>k)>11 or (v->>k)!~'^[1-9][0-9]*$' then return false;end if;
  cap:=case k when 'storedBytes' then 17179869184 when 'egressBytes' then 34359738368 when 'databaseBytes' then 1073741824 when 'safetyPercent' then 90 when 'maxConcurrent' then 16 else 900 end;
  if (v->>k)::numeric>cap then return false;end if;
 end loop;
 return (v->>'safetyPercent')::integer>=20 and (v->>'measurementMaxAgeSeconds')::integer>=30;
end $$;

create function ar_private.operations_budget_receipt(r ar_private.operations_budget_reservations) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'resource',r.resource,'state',r.state,'reserved',r.reserved,'actual',r.actual,'overrun',r.overrun);
$$;

-- Caller holds the singleton FOR UPDATE lock before invoking this helper.
create function ar_private.operations_budget_admit(p_bytes jsonb,p_limits jsonb,p_start boolean default false,p_ignore_concurrency boolean default false) returns text language plpgsql set search_path='' as $$
declare b ar_private.operations_budget;k text;observed timestamptz;v_start timestamptz;v_end timestamptz;active bigint;charge numeric;projected numeric;margin numeric;reason text;
begin
 if not ar_private.operations_budget_bytes(p_bytes,false) or not ar_private.operations_budget_limits(p_limits) then return 'budget_invalid';end if;
 select * into b from ar_private.operations_budget where singleton;
 if b.blocked then return 'budget_review_required';end if;
 if b.measurement is null then return 'budget_usage_unverified';end if;
 v_start:=(b.measurement->>'periodStart')::timestamptz;v_end:=(b.measurement->>'periodEnd')::timestamptz;
 if clock_timestamp()<v_start or clock_timestamp()>=v_end then return 'budget_period_closed';end if;
 select count(*) into active from ar_private.operations_budget_reservations where state in('reserved','started') and not detached;
 if not p_ignore_concurrency and ((not p_start and active>=(p_limits->>'maxConcurrent')::integer) or (p_start and active>(p_limits->>'maxConcurrent')::integer)) then return 'budget_concurrency_exceeded';end if;
 margin:=(100-(p_limits->>'safetyPercent')::numeric)/100;
 foreach k in array array['storedBytes','egressBytes','databaseBytes'] loop
  if (p_bytes->>k)::numeric=0 then continue;end if;
  if b.measurement->'used'->k='null'::jsonb or b.measurement->'headroom'->k='null'::jsonb or b.measurement->'observedAt'->k='null'::jsonb then return 'budget_usage_unverified';end if;
  observed:=(b.measurement->'observedAt'->>k)::timestamptz;
  -- Egress is a known cycle baseline plus this atomic ledger, not a dashboard poll
  -- before every download. Local Storage/DB measurements have an independent age guard.
  if observed>clock_timestamp() or (k<>'egressBytes' and observed<clock_timestamp()-make_interval(secs=>(p_limits->>'measurementMaxAgeSeconds')::integer)) then return 'budget_measurement_stale';end if;
  -- All unresolved reservations remain charged. No timer or measurement clears them.
  select coalesce(sum(case when state in('reserved','started') then (reserved->>k)::numeric
   when state='finished' and ((k='egressBytes' and finished_at>=v_start) or (k<>'egressBytes' and (b.local_measured_at is null or finished_at>b.local_measured_at))) then (actual->>k)::numeric else 0 end),0) into charge from ar_private.operations_budget_reservations;
  if not p_start then charge:=charge+(p_bytes->>k)::numeric;end if;projected:=(b.measurement->'used'->>k)::numeric+charge;
  reason:=case k when 'storedBytes' then 'budget_storage_exceeded' when 'egressBytes' then 'budget_egress_exceeded' else 'budget_database_exceeded' end;
  if projected>floor((p_limits->>k)::numeric*margin) then return reason;end if;
  if charge>floor((b.measurement->'headroom'->>k)::numeric*margin) then return 'budget_headroom_exceeded';end if;
 end loop;return null;
end $$;

create function public.ar_operations_budget_measure(p_actor uuid,p_measurement jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b ar_private.operations_budget;m jsonb;k text;observed timestamptz;v_start timestamptz;v_end timestamptz;value numeric;new_period boolean;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','budget_forbidden');end if;
 if jsonb_typeof(p_measurement) is distinct from 'object' then return jsonb_build_object('error','budget_invalid');end if;
 if not(p_measurement?&array['observedAt','periodStart','periodEnd','used','headroom']) or p_measurement-array['observedAt','periodStart','periodEnd','used','headroom']<>'{}'::jsonb
  or not ar_private.operations_budget_bytes(p_measurement->'used',true) or not ar_private.operations_budget_bytes(p_measurement->'headroom',true)
  then return jsonb_build_object('error','budget_invalid');end if;
 if jsonb_typeof(p_measurement->'observedAt') is distinct from 'object' then return jsonb_build_object('error','budget_invalid');end if;
 if not((p_measurement->'observedAt')?&array['storedBytes','egressBytes','databaseBytes']) or (p_measurement->'observedAt')-array['storedBytes','egressBytes','databaseBytes']<>'{}'::jsonb then return jsonb_build_object('error','budget_invalid');end if;
 foreach k in array array['periodStart','periodEnd'] loop
  if jsonb_typeof(p_measurement->k) is distinct from 'string' or (p_measurement->>k)!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then return jsonb_build_object('error','budget_invalid');end if;
 end loop;
 v_start:=(p_measurement->>'periodStart')::timestamptz;v_end:=(p_measurement->>'periodEnd')::timestamptz;
 if v_start>=v_end then return jsonb_build_object('error','budget_invalid');end if;
 select * into b from ar_private.operations_budget where singleton for update;
 new_period:=b.measurement is not null and (v_start<>(b.measurement->>'periodStart')::timestamptz or v_end<>(b.measurement->>'periodEnd')::timestamptz);
 if new_period and v_start<(b.measurement->>'periodEnd')::timestamptz then return jsonb_build_object('error','budget_conflict');end if;
 foreach k in array array['storedBytes','egressBytes','databaseBytes'] loop
  if p_measurement->'observedAt'->k='null'::jsonb then continue;end if;
  if jsonb_typeof(p_measurement->'observedAt'->k) is distinct from 'string' or (p_measurement->'observedAt'->>k)!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then return jsonb_build_object('error','budget_invalid');end if;
  observed:=(p_measurement->'observedAt'->>k)::timestamptz;
  if observed<v_start or observed>=v_end or observed>clock_timestamp() then return jsonb_build_object('error','budget_invalid');end if;
  if b.measurement is not null and not new_period and observed<(b.measurement->'observedAt'->>k)::timestamptz then return jsonb_build_object('error','budget_conflict');end if;
 end loop;
 m:=p_measurement;
 -- External measurements never silently forgive in-flight charges. A new verified
 -- billing cycle can replace the egress baseline; old unresolved work remains charged.
 if b.measurement is not null then
  foreach k in array array['storedBytes','egressBytes','databaseBytes'] loop
   if k='egressBytes' and new_period then continue;end if;
   if m->'used'->k<>'null'::jsonb and b.measurement->'used'->k<>'null'::jsonb then
    value:=greatest((m->'used'->>k)::numeric,(b.measurement->'used'->>k)::numeric);m:=jsonb_set(m,array['used',k],to_jsonb(value));
   end if;
   if m->'headroom'->k<>'null'::jsonb and b.measurement->'headroom'->k<>'null'::jsonb then
    value:=least((m->'headroom'->>k)::numeric,(b.measurement->'headroom'->>k)::numeric);m:=jsonb_set(m,array['headroom',k],to_jsonb(value));
   end if;
  end loop;
 end if;
 update ar_private.operations_budget set measurement=m,local_measured_at=null,updated_at=clock_timestamp() where singleton;return m;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return jsonb_build_object('error','budget_invalid');
end $$;

create function public.ar_operations_budget_refresh_local(p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b ar_private.operations_budget;m jsonb;unknown_sizes bigint;stored numeric;database_bytes bigint;observed timestamptz;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','budget_forbidden');end if;
 select * into b from ar_private.operations_budget where singleton for update;
 if b.measurement is null then return jsonb_build_object('error','budget_usage_unverified');end if;
 observed:=clock_timestamp();
 if observed<(b.measurement->>'periodStart')::timestamptz or observed>=(b.measurement->>'periodEnd')::timestamptz then return jsonb_build_object('error','budget_period_closed');end if;
 select count(*) filter(where coalesce(metadata->>'size','')!~'^(0|[1-9][0-9]{0,15})$'),
  coalesce(sum(case when metadata->>'size'~'^(0|[1-9][0-9]{0,15})$' then (metadata->>'size')::numeric else 0 end),0)
 into unknown_sizes,stored from storage.objects;
 database_bytes:=pg_database_size(current_database());m:=b.measurement;
 m:=jsonb_set(m,'{used,storedBytes}',case when unknown_sizes>0 or stored>9007199254740991 then 'null'::jsonb else to_jsonb(stored) end);
 m:=jsonb_set(m,'{used,databaseBytes}',to_jsonb(database_bytes));
 m:=jsonb_set(m,'{observedAt,storedBytes}',to_jsonb(observed));m:=jsonb_set(m,'{observedAt,databaseBytes}',to_jsonb(observed));
 -- Finished writes preceding this locked snapshot are now represented by actual
 -- object metadata/DB footprint. Pending/started reservations are never excluded.
 update ar_private.operations_budget set measurement=m,local_measured_at=observed,updated_at=observed where singleton;return m;
end $$;

create function public.ar_operations_budget_reserve(p_actor uuid,p_id uuid,p_resource text,p_bytes jsonb,p_limits jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.operations_budget_reservations;reason text;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','budget_forbidden');end if;
 if p_id is null or p_resource is null or p_resource!~'^[a-z][a-z0-9_]{0,63}$' or not ar_private.operations_budget_bytes(p_bytes,false) then return jsonb_build_object('error','budget_invalid');end if;
 if p_bytes='{"storedBytes":0,"egressBytes":0,"databaseBytes":0}'::jsonb then return jsonb_build_object('error','budget_invalid');end if;
 perform singleton from ar_private.operations_budget where singleton for update;
 select * into r from ar_private.operations_budget_reservations where id=p_id;
 if found then
  if r.owner<>p_actor or r.resource<>p_resource or r.reserved is distinct from p_bytes then return jsonb_build_object('error','budget_conflict');end if;
  return ar_private.operations_budget_receipt(r);
 end if;
 reason:=ar_private.operations_budget_admit(p_bytes,p_limits,false);if reason is not null then return jsonb_build_object('error',reason);end if;
 insert into ar_private.operations_budget_reservations(id,owner,resource,reserved) values(p_id,p_actor,p_resource,p_bytes) returning * into r;
 return ar_private.operations_budget_receipt(r);
end $$;

create function public.ar_operations_budget_start(p_actor uuid,p_id uuid,p_limits jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.operations_budget_reservations;reason text;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','budget_forbidden');end if;
 perform singleton from ar_private.operations_budget where singleton for update;
 select * into r from ar_private.operations_budget_reservations where id=p_id and owner=p_actor;
 if not found then return jsonb_build_object('error','budget_missing');end if;
 if r.state<>'reserved' then return jsonb_build_object('reservation',ar_private.operations_budget_receipt(r),'proceed',false);end if;
 reason:=ar_private.operations_budget_admit(r.reserved,p_limits,true);if reason is not null then return jsonb_build_object('error',reason);end if;
 update ar_private.operations_budget_reservations set state='started',started_at=clock_timestamp() where id=p_id returning * into r;
 return jsonb_build_object('reservation',ar_private.operations_budget_receipt(r),'proceed',true);
end $$;

create function public.ar_operations_budget_finish(p_actor uuid,p_id uuid,p_actual jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.operations_budget_reservations;v_overrun boolean;k text;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','budget_forbidden');end if;
 if not ar_private.operations_budget_bytes(p_actual,false) then return jsonb_build_object('error','budget_invalid');end if;
 perform singleton from ar_private.operations_budget where singleton for update;
 select * into r from ar_private.operations_budget_reservations where id=p_id and owner=p_actor;
 if not found then return jsonb_build_object('error','budget_missing');end if;
 if r.state='finished' then
  if r.actual is distinct from p_actual then return jsonb_build_object('error','budget_conflict');end if;return ar_private.operations_budget_receipt(r);
 end if;
 if r.state<>'started' then return jsonb_build_object('error','budget_not_started');end if;
 v_overrun:=false;foreach k in array array['storedBytes','egressBytes','databaseBytes'] loop
  if (p_actual->>k)::numeric>(r.reserved->>k)::numeric then v_overrun:=true;end if;
 end loop;
 update ar_private.operations_budget_reservations set actual=p_actual,state='finished',overrun=v_overrun,finished_at=clock_timestamp() where id=p_id returning * into r;
 if v_overrun then update ar_private.operations_budget set blocked=true,updated_at=clock_timestamp() where singleton;end if;
 return ar_private.operations_budget_receipt(r);
end $$;

create function public.ar_operations_budget_release(p_actor uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r ar_private.operations_budget_reservations;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','budget_forbidden');end if;
 perform singleton from ar_private.operations_budget where singleton for update;
 select * into r from ar_private.operations_budget_reservations where id=p_id and owner=p_actor;
 if not found then return jsonb_build_object('error','budget_missing');end if;
 if r.state='released' then return ar_private.operations_budget_receipt(r);end if;
 if r.state<>'reserved' then return jsonb_build_object('error','budget_release_unsafe');end if;
 update ar_private.operations_budget_reservations set state='released',released_at=clock_timestamp() where id=p_id returning * into r;
 return ar_private.operations_budget_receipt(r);
end $$;

revoke all on function ar_private.operations_budget_bytes(jsonb,boolean),ar_private.operations_budget_limits(jsonb),ar_private.operations_budget_receipt(ar_private.operations_budget_reservations),ar_private.operations_budget_admit(jsonb,jsonb,boolean,boolean) from public,anon,authenticated,service_role;
revoke all on function public.ar_operations_budget_measure(uuid,jsonb),public.ar_operations_budget_refresh_local(uuid),public.ar_operations_budget_reserve(uuid,uuid,text,jsonb,jsonb),public.ar_operations_budget_start(uuid,uuid,jsonb),public.ar_operations_budget_finish(uuid,uuid,jsonb),public.ar_operations_budget_release(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ar_operations_budget_measure(uuid,jsonb),public.ar_operations_budget_refresh_local(uuid),public.ar_operations_budget_reserve(uuid,uuid,text,jsonb,jsonb),public.ar_operations_budget_start(uuid,uuid,jsonb),public.ar_operations_budget_finish(uuid,uuid,jsonb),public.ar_operations_budget_release(uuid,uuid) to service_role;
