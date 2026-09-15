-- Technical change logs only. Financial records, publications, Snapshots and files are retained.
create function ar_private.financial_log_expires_at(p_observed timestamptz)
returns timestamptz language sql immutable strict set search_path='' as $$
 select ((p_observed at time zone 'Asia/Bangkok') + interval '1 month') at time zone 'Asia/Bangkok';
$$;
revoke all on function ar_private.financial_log_expires_at(timestamptz) from public,anon,authenticated,service_role;

create index financial_changes_expiry on ar_private.financial_changes
 (ar_private.financial_log_expires_at(observed_at),id);

-- A singleton holds bounded maintenance metadata and a transaction-local deletion claim.
-- No app role may read/write the claim directly or choose a retention cutoff.
create table ar_private.financial_log_retention_state(
 singleton boolean primary key default true check(singleton),
 active_xid xid8,active_pid integer,active_before timestamptz,
 last_attempt_at timestamptz,last_success_at timestamptz,
 last_deleted integer not null default 0 check(last_deleted between 0 and 1000),
 total_deleted bigint not null default 0 check(total_deleted>=0),
 last_error text check(last_error='cleanup_failed'),
 check((active_xid is null and active_pid is null and active_before is null)
    or (active_xid is not null and active_pid is not null and active_before is not null))
);
alter table ar_private.financial_log_retention_state enable row level security;
revoke all on ar_private.financial_log_retention_state from public,anon,authenticated,service_role;
insert into ar_private.financial_log_retention_state(singleton) values(true);

create function ar_private.financial_change_retention_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' and exists(
  select 1 from ar_private.financial_log_retention_state s
  where s.singleton and s.active_xid=pg_current_xact_id() and s.active_pid=pg_backend_pid()
   and ar_private.financial_log_expires_at(old.observed_at)<=s.active_before
 ) then return old;end if;
 raise exception 'financial_immutable';
end$$;
revoke all on function ar_private.financial_change_retention_guard() from public,anon,authenticated,service_role;
-- Other append-only tables continue using the original, unchanged immutable function.
drop trigger financial_changes_immutable on ar_private.financial_changes;
create trigger financial_changes_immutable before update or delete on ar_private.financial_changes
 for each row execute function ar_private.financial_change_retention_guard();

create function public.ar_financial_log_prune(p_actor uuid,p_limit integer default 1000)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 cutoff timestamptz:=statement_timestamp();deleted_count integer:=0;more_eligible boolean;
begin
 if not ar_private.financial_actor(p_actor) then raise exception 'financial_forbidden';end if;
 if p_limit is null or p_limit not between 1 and 1000 then raise exception 'financial_log_limit_invalid';end if;
 -- Concurrent ticks do not queue behind one another or share a deletion claim.
 perform 1 from ar_private.financial_log_retention_state where singleton for update skip locked;
 if not found then
  return jsonb_build_object('status','busy','deleted',0,'moreEligible',true,'retentionMonths',1,'checkedAt',cutoff);
 end if;
 update ar_private.financial_log_retention_state set last_attempt_at=cutoff,last_deleted=0,last_error=null where singleton;
 begin
  update ar_private.financial_log_retention_state
   set active_xid=pg_current_xact_id(),active_pid=pg_backend_pid(),active_before=cutoff where singleton;
  with candidates as materialized(
   select id from ar_private.financial_changes
   where ar_private.financial_log_expires_at(observed_at)<=cutoff
   order by ar_private.financial_log_expires_at(observed_at),id
   limit p_limit for update skip locked
  )
  delete from ar_private.financial_changes f using candidates c
   where f.id=c.id and ar_private.financial_log_expires_at(f.observed_at)<=cutoff;
  get diagnostics deleted_count=row_count;
  update ar_private.financial_log_retention_state
   set active_xid=null,active_pid=null,active_before=null,last_success_at=cutoff,
       last_deleted=deleted_count,total_deleted=total_deleted+deleted_count where singleton;
  select exists(select 1 from ar_private.financial_changes
   where ar_private.financial_log_expires_at(observed_at)<=cutoff) into more_eligible;
 exception when others then
  -- This subtransaction rolls back every deletion in the batch. Never store SQLERRM/payloads.
  update ar_private.financial_log_retention_state
   set active_xid=null,active_pid=null,active_before=null,last_deleted=0,last_error='cleanup_failed' where singleton;
  return jsonb_build_object('status','error','deleted',0,'moreEligible',false,'retentionMonths',1,'checkedAt',cutoff,'error','cleanup_failed');
 end;
 return jsonb_build_object('status','succeeded','deleted',deleted_count,'moreEligible',more_eligible,'retentionMonths',1,'checkedAt',cutoff);
end$$;
revoke all on function public.ar_financial_log_prune(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.ar_financial_log_prune(uuid,integer) to service_role;
