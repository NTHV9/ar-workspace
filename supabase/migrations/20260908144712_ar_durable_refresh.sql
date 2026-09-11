-- DRAFT: additive to 20260908132012_ar_foundation; not applied by its author.
-- Preflight before applying: verify foundation table columns/PKs, is_member(),
-- service_role BYPASSRLS, and that ar_private is NOT an exposed API schema.
-- No CLI is installed locally; draft filename is supplied for connector review.
-- Only validated, fully paginated backend snapshots may be staged. Expected
-- account count must come from the completed scope enumeration, not stage count.
-- Expired jobs are terminal: retry creates a NEW run ID. Never reclaim an old ID;
-- this fences late workers without exposing a lease token through the browser.
-- Refresh state represents FULL-HOTEL freshness; account refresh does not update it.
-- Existing values, account settings, grouping and history are retained.

alter table public.ar_accounts
  add column account_no text,
  add column business_date date,
  add column "agingBuckets" jsonb,
  add column verification_state text not null default 'unknown'
    check (verification_state in ('unknown','verified','cleared','missing'));
alter table public.ar_invoices
  add column age integer,
  add column current_amount numeric(18,2),
  add column applied_amount numeric(18,2),
  add column reference text,
  add column reservation_id text,
  add column folio_date date,
  add column internal_folio_window_id text,
  add column verification_state text not null default 'unknown'
    check (verification_state in ('unknown','verified','cleared','missing')),
  add column synced_at timestamptz;

create table ar_private.refresh_runs (
  id uuid primary key default gen_random_uuid(),
  hotel text not null check (hotel in ('KAT','TSK')),
  account_id text check (account_id is null or length(btrim(account_id)) > 0),
  reason text not null check (reason in ('manual','open','scheduled')),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  created_at timestamptz not null default clock_timestamp(),
  started_at timestamptz, finished_at timestamptz, lease_until timestamptz,
  error_code text
);
create index ar_refresh_pending on ar_private.refresh_runs(hotel,created_at)
  where status in ('queued','running');
create unique index ar_refresh_one_running on ar_private.refresh_runs(hotel)
  where status = 'running';
create table ar_private.refresh_stage (
  job_id uuid not null references ar_private.refresh_runs(id),
  hotel text not null check (hotel in ('KAT','TSK')),
  account_id text not null,
  payload jsonb not null,
  primary key(job_id,hotel,account_id)
);
alter table ar_private.refresh_runs enable row level security;
alter table ar_private.refresh_stage enable row level security;
revoke all on ar_private.refresh_runs, ar_private.refresh_stage from public, anon, authenticated;
grant usage on schema ar_private to service_role;
grant select,insert,update,delete on ar_private.refresh_runs, ar_private.refresh_stage to service_role;

create table public.ar_refresh_state (
  hotel text primary key check(hotel in ('KAT','TSK')),
  last_success_at timestamptz, last_attempt_at timestamptz,
  status text not null default 'unknown' check(status in ('unknown','queued','running','succeeded','failed')),
  error_code text, run_id uuid
);
alter table public.ar_refresh_state enable row level security;
revoke all on public.ar_refresh_state from public,anon,authenticated;
grant select on public.ar_refresh_state to authenticated;
grant select,insert,update on public.ar_refresh_state,public.ar_accounts,public.ar_invoices to service_role;
create policy ar_member_read on public.ar_refresh_state for select to authenticated
  using ((select ar_private.is_member()));
insert into public.ar_refresh_state(hotel) values ('KAT'),('TSK');

create function public.ar_request_refresh(p_hotel text,p_account_id text,p_reason text,p_stale_minutes integer default 30)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r ar_private.refresh_runs;
begin
  if p_hotel is null or p_hotel not in ('KAT','TSK') or p_reason is null or p_reason not in ('manual','open','scheduled')
    or p_stale_minutes is null or p_stale_minutes < 1
    or (p_account_id is not null and length(btrim(p_account_id)) = 0) then
    raise exception 'invalid_refresh_request';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(61704,case p_hotel when 'KAT' then 1 else 2 end);
  select * into r from ar_private.refresh_runs
    where hotel=p_hotel and (status='queued' or (status='running' and lease_until>clock_timestamp()))
      and (account_id is null or account_id=p_account_id)
    order by case status when 'running' then 0 else 1 end,created_at limit 1;
  if found then return jsonb_build_object('id',r.id,'status',r.status,'created',false); end if;
  if p_reason='open' and exists(select 1 from public.ar_refresh_state
    where hotel=p_hotel and last_success_at>clock_timestamp()-make_interval(mins=>p_stale_minutes)) then
    return jsonb_build_object('status','fresh','created',false);
  end if;
  insert into ar_private.refresh_runs(hotel,account_id,reason) values(p_hotel,p_account_id,p_reason) returning * into r;
  if p_account_id is null then
    update public.ar_refresh_state set status='queued',error_code=null,run_id=r.id where hotel=p_hotel;
  end if;
  return jsonb_build_object('id',r.id,'status',r.status,'created',true);
end; $$;

create function public.ar_claim_refresh(p_run_id uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare r ar_private.refresh_runs; expired ar_private.refresh_runs;
begin
  select * into r from ar_private.refresh_runs where id=p_run_id;
  if not found then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(61704,case r.hotel when 'KAT' then 1 else 2 end);
  -- Reaping never reuses a run ID, and cannot clobber a newer state row.
  for expired in update ar_private.refresh_runs set status='failed',finished_at=clock_timestamp(),
    error_code='lease_expired',lease_until=null
    where hotel=r.hotel and status='running' and lease_until<=clock_timestamp() returning * loop
    update public.ar_refresh_state set status='failed',error_code='lease_expired'
      where hotel=expired.hotel and run_id=expired.id;
    delete from ar_private.refresh_stage where job_id=expired.id;
  end loop;
  if exists(select 1 from ar_private.refresh_runs where hotel=r.hotel and status='running') then return false; end if;
  update ar_private.refresh_runs set status='running',started_at=clock_timestamp(),lease_until=clock_timestamp()+interval '10 minutes'
    where id=p_run_id and status='queued' returning * into r;
  if not found then return false; end if;
  if r.account_id is null then
    update public.ar_refresh_state set status='running',last_attempt_at=r.started_at,error_code=null,run_id=r.id where hotel=r.hotel;
  end if;
  return true;
end; $$;

create function public.ar_renew_refresh(p_run_id uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  update ar_private.refresh_runs set lease_until=clock_timestamp()+interval '10 minutes'
    where id=p_run_id and status='running' and lease_until>clock_timestamp();
  return found;
end; $$;

create function public.ar_stage_account(p_run_id uuid,p_snapshot jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare r ar_private.refresh_runs; a jsonb; i jsonb;
begin
  select * into r from ar_private.refresh_runs where id=p_run_id for update;
  if not found or r.status<>'running' or r.lease_until<=clock_timestamp() then raise exception 'refresh_lease_invalid'; end if;
  a:=p_snapshot->'account';
  if jsonb_typeof(a) is distinct from 'object' or a->>'hotel' is distinct from r.hotel
    or coalesce(a->>'id','')='' or (r.account_id is not null and a->>'id' is distinct from r.account_id)
    or a->>'currency' is distinct from 'THB' or jsonb_typeof(p_snapshot->'invoices') is distinct from 'array' then
    raise exception 'invalid_snapshot_scope';
  end if;
  for i in select value from jsonb_array_elements(p_snapshot->'invoices') loop
    if i->>'hotel' is distinct from r.hotel or i->>'account_id' is distinct from a->>'id'
      or coalesce(i->>'id','')='' or jsonb_typeof(i->'open') is distinct from 'number' then
      raise exception 'invalid_invoice_scope';
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_snapshot->'invoices')) <>
     (select count(distinct value->>'id') from jsonb_array_elements(p_snapshot->'invoices')) then
    raise exception 'duplicate_invoice_identity';
  end if;
  -- Ambiguous HTTP retry is safe only when the entire snapshot is identical.
  if exists(select 1 from ar_private.refresh_stage where job_id=r.id and hotel=r.hotel and account_id=a->>'id') then
    if exists(select 1 from ar_private.refresh_stage where job_id=r.id and hotel=r.hotel and account_id=a->>'id' and payload=p_snapshot) then
      return;
    end if;
    raise exception 'conflicting_account_snapshot';
  end if;
  insert into ar_private.refresh_stage(job_id,hotel,account_id,payload) values(r.id,r.hotel,a->>'id',p_snapshot);
end; $$;

create function public.ar_publish_refresh(p_run_id uuid,p_expected_accounts integer) returns void
language plpgsql security invoker set search_path = '' as $$
declare r ar_private.refresh_runs; s ar_private.refresh_stage; a jsonb; i jsonb; published_at timestamptz;
begin
  select * into r from ar_private.refresh_runs where id=p_run_id;
  if not found then raise exception 'refresh_run_missing'; end if;
  perform pg_catalog.pg_advisory_xact_lock(61704,case r.hotel when 'KAT' then 1 else 2 end);
  select * into r from ar_private.refresh_runs where id=p_run_id for update;
  if r.status='succeeded' then return; end if;
  if r.status<>'running' or r.lease_until<=clock_timestamp() then raise exception 'refresh_lease_invalid'; end if;
  if p_expected_accounts is null or p_expected_accounts<0
    or (r.account_id is not null and p_expected_accounts<>1)
    or (select count(*) from ar_private.refresh_stage where job_id=r.id)<>p_expected_accounts then
    raise exception 'refresh_incomplete';
  end if;
  published_at:=clock_timestamp();
  for s in select * from ar_private.refresh_stage where job_id=r.id loop
    a:=s.payload->'account';
    insert into public.ar_accounts(hotel,id,name,type,account_no,open,over90,items,currency,"creditLimit",oldest,"agingBuckets",business_date,verification_state,synced_at)
    values(r.hotel,a->>'id',a->>'name',a->>'type',a->>'account_no',(a->>'open')::numeric,(a->>'over90')::numeric,
      (a->>'items')::integer,a->>'currency',(a->>'creditLimit')::numeric,(a->>'oldest')::integer,a->'agingBuckets',
      (a->>'business_date')::date,'verified',published_at)
    on conflict(hotel,id) do update set name=excluded.name,type=excluded.type,account_no=excluded.account_no,
      open=excluded.open,over90=excluded.over90,items=excluded.items,currency=excluded.currency,
      "creditLimit"=excluded."creditLimit",oldest=excluded.oldest,"agingBuckets"=excluded."agingBuckets",
      business_date=excluded.business_date,verification_state=excluded.verification_state,synced_at=excluded.synced_at;
    for i in select value from jsonb_array_elements(s.payload->'invoices') loop
      insert into public.ar_invoices(hotel,account_id,id,guest,invoice_no,folio_no,transaction_date,original,open,aging,age,
        current_amount,applied_amount,reference,reservation_id,folio_date,internal_folio_window_id,verification_state,synced_at)
      values(r.hotel,s.account_id,i->>'id',i->>'guest',i->>'invoice_no',i->>'folio_no',(i->>'transaction_date')::date,
        (i->>'original')::numeric,(i->>'open')::numeric,i->>'aging',(i->>'age')::integer,(i->>'current_amount')::numeric,
        (i->>'applied_amount')::numeric,i->>'reference',i->>'reservation_id',(i->>'folio_date')::date,
        i->>'internal_folio_window_id',case when (i->>'open')::numeric=0 then 'cleared' else 'verified' end,published_at)
      on conflict(hotel,account_id,id) do update set guest=excluded.guest,invoice_no=excluded.invoice_no,folio_no=excluded.folio_no,
        transaction_date=excluded.transaction_date,original=excluded.original,open=excluded.open,aging=excluded.aging,
        age=excluded.age,current_amount=excluded.current_amount,applied_amount=excluded.applied_amount,
        reference=excluded.reference,reservation_id=excluded.reservation_id,folio_date=excluded.folio_date,
        internal_folio_window_id=excluded.internal_folio_window_id,verification_state=excluded.verification_state,synced_at=excluded.synced_at;
    end loop;
    update public.ar_invoices inv set verification_state='missing'
      where inv.hotel=r.hotel and inv.account_id=s.account_id
      and inv.verification_state<>'cleared'
      and not exists(select 1 from jsonb_array_elements(s.payload->'invoices') v where v->>'id'=inv.id);
  end loop;
  if r.account_id is null then
    update public.ar_accounts ac set verification_state='missing' where ac.hotel=r.hotel
      and not exists(select 1 from ar_private.refresh_stage st where st.job_id=r.id and st.account_id=ac.id);
    update public.ar_invoices inv set verification_state='missing' where inv.hotel=r.hotel
      and inv.verification_state<>'cleared'
      and not exists(select 1 from ar_private.refresh_stage st where st.job_id=r.id and st.account_id=inv.account_id);
    update public.ar_refresh_state set last_success_at=published_at,status='succeeded',error_code=null,run_id=r.id where hotel=r.hotel;
  end if;
  update ar_private.refresh_runs set status='succeeded',finished_at=published_at,lease_until=null,error_code=null where id=r.id;
  delete from ar_private.refresh_stage where job_id=r.id;
end; $$;

create function public.ar_fail_refresh(p_run_id uuid,p_error_code text) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare r ar_private.refresh_runs;
begin
  -- Codes only, never upstream errors, URLs, credentials or response bodies.
  if p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{0,63}$' then raise exception 'invalid_error_code'; end if;
  select * into r from ar_private.refresh_runs where id=p_run_id;
  if not found then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(61704,case r.hotel when 'KAT' then 1 else 2 end);
  update ar_private.refresh_runs set status='failed',finished_at=clock_timestamp(),lease_until=null,error_code=p_error_code
    where id=p_run_id and status='running' and lease_until>clock_timestamp() returning * into r;
  if not found then return false; end if;
  update public.ar_refresh_state set status='failed',error_code=p_error_code where hotel=r.hotel and run_id=r.id;
  delete from ar_private.refresh_stage where job_id=r.id;
  return true;
end; $$;

create function public.ar_refresh_status() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'hotels',coalesce((select jsonb_agg(to_jsonb(s) order by s.hotel) from public.ar_refresh_state s),'[]'::jsonb),
    'running',exists(select 1 from ar_private.refresh_runs r
      where r.status='queued' or (r.status='running' and r.lease_until>statement_timestamp()))
  );
$$;

create function public.ar_refresh_job(p_run_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',r.id,'hotel',r.hotel,'account_id',r.account_id,'reason',r.reason,
    'status',r.status,'lease_until',r.lease_until,'error_code',r.error_code)
  from ar_private.refresh_runs r where r.id=p_run_id;
$$;

revoke all on function public.ar_request_refresh(text,text,text,integer),public.ar_claim_refresh(uuid),
  public.ar_renew_refresh(uuid),public.ar_stage_account(uuid,jsonb),public.ar_publish_refresh(uuid,integer),
  public.ar_fail_refresh(uuid,text),public.ar_refresh_job(uuid),public.ar_refresh_status() from public,anon,authenticated;
grant execute on function public.ar_request_refresh(text,text,text,integer),public.ar_claim_refresh(uuid),
  public.ar_renew_refresh(uuid),public.ar_stage_account(uuid,jsonb),public.ar_publish_refresh(uuid,integer),
  public.ar_fail_refresh(uuid,text),public.ar_refresh_job(uuid),public.ar_refresh_status() to service_role;
