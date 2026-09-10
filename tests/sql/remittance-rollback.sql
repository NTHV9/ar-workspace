-- The diagnostic creates synthetic rows in a subtransaction and rolls them back.
-- The outer rollback additionally protects these independent permission checks.
begin;
do $$
declare actor uuid;r jsonb;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 r:=public.ar_remittance_diagnostic_check(actor);
 if r->>'passed' is distinct from 'true' or r->>'rolledBack' is distinct from 'true' or coalesce((r->>'checks')::integer,0)<20 then raise exception 'remittance diagnostic did not verify complete rollback';end if;
 r:=public.ar_remittance_options(gen_random_uuid());if r->>'error' is distinct from 'remittance_forbidden' then raise exception 'unauthorized options';end if;
 if has_function_privilege('anon','public.ar_remittance_save(uuid,uuid,jsonb)','execute') or has_function_privilege('authenticated','public.ar_remittance_set_status(uuid,uuid,uuid,integer,text,text)','execute') or has_table_privilege('authenticated','public.ar_remittances','insert') or has_table_privilege('anon','public.ar_remittance_lines','select') then raise exception 'remittance privilege leak';end if;
 if exists(select 1 from public.ar_accounts where id like 'SYNTHETIC-REMIT-%') or exists(select 1 from public.ar_remittances where account_id like 'SYNTHETIC-REMIT-%') then raise exception 'synthetic rows persisted';end if;
end $$;
rollback;
select 'remittance synthetic behavior and permissions passed; rolled back' as result;
