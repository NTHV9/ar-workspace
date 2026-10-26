-- Forward-only quota policy. No historical receipts, flags, grants or triggers are reset.
-- Compatibility signature: callers continue holding the singleton lock.
-- Provider quota and local allowances are advisory. Technical limits still apply.
create or replace function ar_private.operations_budget_admit(p_bytes jsonb,p_limits jsonb,p_start boolean default false,p_ignore_concurrency boolean default false) returns text language plpgsql set search_path='' as $$
declare b ar_private.operations_budget;k text;v_start timestamptz;active bigint;charge numeric;
begin
 if not ar_private.operations_budget_bytes(p_bytes,false) or not ar_private.operations_budget_limits(p_limits) then return 'budget_invalid';end if;
 select * into b from ar_private.operations_budget where singleton;
 v_start:=coalesce((b.measurement->>'periodStart')::timestamptz,date_trunc('month',clock_timestamp() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok');
 select count(*) into active from ar_private.operations_budget_reservations where state in('reserved','started') and not detached;
 if not p_ignore_concurrency and ((not p_start and active>=(p_limits->>'maxConcurrent')::integer) or (p_start and active>(p_limits->>'maxConcurrent')::integer)) then return 'budget_concurrency_exceeded';end if;
 foreach k in array array['storedBytes','egressBytes','databaseBytes'] loop
  -- Never discard unresolved work on measurement failure or cycle rollover.
  select coalesce(sum(case when state in('reserved','started') then (reserved->>k)::numeric
   when state='finished' and ((k='egressBytes' and finished_at>=v_start) or (k<>'egressBytes' and (b.local_measured_at is null or finished_at>b.local_measured_at))) then (actual->>k)::numeric else 0 end),0) into charge from ar_private.operations_budget_reservations;
  if not p_start then charge:=charge+(p_bytes->>k)::numeric;end if;
  if charge>9007199254740991 then return 'budget_invalid';end if;
 end loop;
 return null;
end $$;

create or replace function public.ar_operations_budget_finish(p_actor uuid,p_id uuid,p_actual jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 -- Keep the immutable per-reservation overrun evidence without a global hold.
 return ar_private.operations_budget_receipt(r);
end $$;

create or replace function public.ar_operations_budget_refresh_local(p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b ar_private.operations_budget;m jsonb;unknown_sizes bigint;stored numeric;database_bytes bigint;observed timestamptz;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','budget_forbidden');end if;
 select * into b from ar_private.operations_budget where singleton for update;
 if b.measurement is null then return jsonb_build_object('error','budget_usage_unverified');end if;
 observed:=clock_timestamp();
 if observed<(b.measurement->>'periodStart')::timestamptz or observed>=(b.measurement->>'periodEnd')::timestamptz then return b.measurement;end if;
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

create or replace function ar_private.operations_database_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Retain statement-trigger compatibility without telemetry writes or quota denial.
 -- Local size remains measured on the existing bounded status path.
 return null;
end$$;


create or replace function public.ar_operations_budget_current(p_actor uuid,p_limits jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b ar_private.operations_budget;period_start timestamptz;period_end timestamptz;now_at timestamptz:=clock_timestamp();m jsonb;
begin
 if not ar_private.remittance_actor(p_actor) then return jsonb_build_object('error','budget_forbidden');end if;if not ar_private.operations_budget_limits(p_limits) then return jsonb_build_object('error','budget_invalid');end if;
 select * into b from ar_private.operations_budget where singleton for update;
 update ar_private.operations_budget set limits=p_limits where singleton;
 period_start:=date_trunc('month',now_at at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';period_end:=(date_trunc('month',now_at at time zone 'Asia/Bangkok')+interval '1 month') at time zone 'Asia/Bangkok';
 if b.measurement is null or now_at<(b.measurement->>'periodStart')::timestamptz or now_at>=(b.measurement->>'periodEnd')::timestamptz then
  m:=jsonb_build_object('periodStart',period_start,'periodEnd',period_end,'observedAt',jsonb_build_object('storedBytes',null,'databaseBytes',null,'egressBytes',now_at),'used',jsonb_build_object('storedBytes',null,'databaseBytes',null,'egressBytes',0),'headroom',p_limits-array['safetyPercent','maxConcurrent','measurementMaxAgeSeconds']);
  -- Application calendar diagnostics are not provider cycles. An expired/future
  -- external observation cannot reject this locked internal rollover.
  update ar_private.operations_budget set measurement=m,local_measured_at=null,updated_at=now_at where singleton;
  update ar_private.operations_budget set activated_at=coalesce(activated_at,now_at) where singleton;
 end if;
 select * into b from ar_private.operations_budget where singleton;
 if b.local_measured_at is null or b.local_measured_at<now_at-interval '2 minutes' then m:=public.ar_operations_budget_refresh_local(p_actor);if m?'error' then return m;end if;end if;
 select * into b from ar_private.operations_budget where singleton;
 return jsonb_build_object('measurement',b.measurement,'activatedAt',b.activated_at,'blocked',b.blocked,'egressScope','managed_file_transfers_since_activation','active',(select count(*) from ar_private.operations_budget_reservations where state in('reserved','started') and not detached),'unresolved',(select count(*) from ar_private.operations_budget_reservations where state='started'),'chargedEgress',(select coalesce(sum((actual->>'egressBytes')::bigint),0) from ar_private.operations_budget_reservations where state='finished' and finished_at>=(b.measurement->>'periodStart')::timestamptz));
end$$;
