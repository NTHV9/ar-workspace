-- The disposable scenario is retired. Keep definitions as history but remove
-- executable Data API entry points, including the former authenticated selector.
do $$declare r record;begin
 if exists(select 1 from ar_private.acceptance_sessions where state in('prepared','active')) then raise exception 'acceptance_still_active';end if;
 for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'ar_acceptance_%' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
 end loop;
end$$;
