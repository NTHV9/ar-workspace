create function public.ar_mail_reconcile_guard(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(61704,815);
 update ar_private.mail_reconcile_runs set lease_until=now()+interval '15 minutes'
 where id=p_id and state='running' and lease_until>now();return found;
end $$;
revoke all on function public.ar_mail_reconcile_guard(uuid) from public,anon,authenticated;
grant execute on function public.ar_mail_reconcile_guard(uuid) to service_role;
