-- Publish each verified Account's invoices as one SQL statement rather than one
-- statement per invoice. Row triggers, atomic publication, locks and wrappers stay.
do $migration$
declare
 target regprocedure:='ar_private.publish_refresh_before_daily_capture(uuid,integer)'::regprocedure;
 definition text; changed text; current_hash text;
begin
 select md5(replace(prosrc,E'\r','')) into current_hash from pg_proc where oid=target;
 if current_hash='db1aa945f29712e837ed1c22286a12e6' then return; end if;
 if current_hash<>'9d77d00e083ece70901c67325ffd8079' then
  raise exception 'publish base differs from the reviewed definition';
 end if;
 definition:=replace(pg_get_functiondef(target),E'\r','');
 changed:=replace(definition,'a jsonb; i jsonb;','a jsonb;');
 changed:=replace(changed,E'    for i in select value from jsonb_array_elements(s.payload->''invoices'') loop\n','');
 changed:=replace(changed,'      values(r.hotel,s.account_id,i->>''id''','      select r.hotel,s.account_id,i->>''id''');
 changed:=replace(changed,E'else ''verified'' end,published_at)\n      on conflict',E'else ''verified'' end,published_at\n      from jsonb_array_elements(s.payload->''invoices'') as entry(i) where true\n      on conflict');
 changed:=replace(changed,E'    end loop;\n    update public.ar_invoices',E'    update public.ar_invoices');
 execute changed;
 if (select md5(replace(prosrc,E'\r','')) from pg_proc where oid=target)<>'db1aa945f29712e837ed1c22286a12e6' then
  raise exception 'publish batch definition verification failed';
 end if;
end $migration$;

-- PostgREST hoists this setting before invoking the RPC. Keep it below the
-- Worker's existing 20s transport bound. No role/global/lock timeout is changed.
alter function public.ar_publish_refresh(uuid,integer) set statement_timeout='15s';
notify pgrst, 'reload schema';
