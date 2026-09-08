-- A queued workflow can fail before acquiring its lease. Terminate that exact run
-- as well; never leave an orphan queued run blocking all future matching requests.
create or replace function public.ar_fail_refresh(p_run_id uuid,p_error_code text) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare r ar_private.refresh_runs;
begin
  if p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{0,63}$' then raise exception 'invalid_error_code'; end if;
  select * into r from ar_private.refresh_runs where id=p_run_id;
  if not found then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(61704,case r.hotel when 'KAT' then 1 else 2 end);
  update ar_private.refresh_runs set status='failed',finished_at=clock_timestamp(),lease_until=null,error_code=p_error_code
    where id=p_run_id and status in ('queued','running') returning * into r;
  if not found then return false; end if;
  update public.ar_refresh_state set status='failed',error_code=p_error_code where hotel=r.hotel and run_id=r.id;
  delete from ar_private.refresh_stage where job_id=r.id;
  return true;
end; $$;
revoke all on function public.ar_fail_refresh(uuid,text) from public,anon,authenticated;
grant execute on function public.ar_fail_refresh(uuid,text) to service_role;
