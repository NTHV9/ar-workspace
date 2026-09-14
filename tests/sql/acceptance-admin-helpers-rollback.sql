-- Local synthetic admin-helper contract. All DDL/data/provider metadata rolls back.
begin;
do $$
declare actor uuid;scenario uuid:=gen_random_uuid();budget uuid:=gen_random_uuid();r jsonb;
 scope text;before_accounts bigint;role_name text;function_name text;cycle integer;
begin
 for cycle in 1..2 loop
 scenario:=gen_random_uuid();budget:=gen_random_uuid();
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 select count(*) into before_accounts from public.ar_accounts;scope:='SYN-'||scenario;
 if to_regnamespace('ar_acceptance_20260911') is not null or to_regnamespace('ar_acceptance_private_20260911') is not null then raise exception 'admin_install_created_namespace';end if;
 foreach function_name in array array['ar_private.acceptance_admin_provision(uuid,uuid)','ar_private.acceptance_admin_retire(uuid,uuid)'] loop
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(role_name,function_name,'execute') then raise exception 'admin_helper_exposed';end if;
  end loop;
  if (select prosecdef from pg_proc where oid=function_name::regprocedure) then raise exception 'admin_helper_elevates_privilege';end if;
 end loop;
 insert into ar_private.acceptance_sessions(id,owner,state,source_sha,recipient_hash,budget_id) values(scenario,actor,'prepared',repeat('a',40),repeat('b',64),budget);
 perform set_config('ar.audit.scenario','outer-synthetic-sentinel',true);
 begin
  perform ar_private.acceptance_admin_provision(gen_random_uuid(),scenario);
  raise exception 'admin_wrong_actor_allowed';
 exception when others then if sqlerrm<>'audit_session_forbidden' then raise;end if;end;
 begin
  perform ar_private.acceptance_admin_provision(actor,scenario);
  raise exception 'admin_missing_reservation_allowed';
 exception when others then if sqlerrm<>'audit_global_reservation_required' then raise;end if;end;
 if current_setting('ar.audit.scenario')<>'outer-synthetic-sentinel' then raise exception 'admin_context_leaked_on_failure';end if;
 insert into ar_private.operations_budget_reservations(id,owner,resource,reserved,state,started_at)
 values(budget,actor,'acceptance_scenario','{"storedBytes":41943040,"egressBytes":83886080,"databaseBytes":25165824}','started',clock_timestamp());
 if cycle=2 then
  begin
   -- A closeout block that differs from the exact reviewed replacement must
   -- fail closed and roll back every newly created namespace in that call.
   execute replace(pg_get_functiondef('public.ar_acceptance_close_begin(uuid,uuid)'::regprocedure),$old$lifecycle='legacy' and$old$,$changed$lifecycle='legacy' AND$changed$);
   perform ar_private.acceptance_admin_provision(actor,scenario);
   raise exception 'admin_unknown_closeout_shape_allowed';
  exception when others then if sqlerrm<>'audit_closeout_definition_changed' then raise;end if;end;
  if to_regnamespace('ar_acceptance_20260911') is not null or to_regnamespace('ar_acceptance_private_20260911') is not null then raise exception 'admin_failed_shape_left_namespace';end if;
 end if;
 r:=ar_private.acceptance_admin_provision(actor,scenario);
 if r->>'state' is distinct from 'prepared' or r->>'id' is distinct from scenario::text then raise exception 'admin_provision_failed';end if;
 if current_setting('ar.audit.scenario')<>'outer-synthetic-sentinel' then raise exception 'admin_context_leaked_on_success';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ar_acceptance_private_20260911' and p.proname in('acceptance_admin_provision','acceptance_admin_retire')) then raise exception 'admin_helpers_recursively_cloned';end if;
 if exists(select 1 from ar_acceptance_20260911.ar_accounts) or exists(select 1 from storage.buckets where id='ar-acceptance-files') then raise exception 'admin_provision_created_business_or_provider_data';end if;
 begin
  perform ar_private.acceptance_admin_retire(actor,scenario);
  raise exception 'admin_early_retirement_allowed';
 exception when others then if sqlerrm<>'audit_closeout_required' then raise;end if;end;
 -- Local fixture simulates completed, empty provider containers. This is not
 -- live provider proof; the production helper requires the existing closeout summary.
 insert into ar_acceptance_private_20260911.collection_policy_versions select * from ar_private.collection_policy_versions;
 insert into ar_acceptance_private_20260911.collection_policy_head select * from ar_private.collection_policy_head;
 insert into ar_acceptance_private_20260911.collection_stage_keys select * from ar_private.collection_stage_keys;
 insert into ar_acceptance_20260911.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT',scope,'Synthetic admin helper','SYNTHETIC',0,0,3,'verified');
 insert into ar_acceptance_20260911.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at)
 select 'KAT',scope,id,current_date,1000,0,'cleared','standalone',false,clock_timestamp() from unnest(array['910001','910002','910003'])id;
 update ar_private.acceptance_sessions set state='complete',recipient_hash=null,fixture='{}',summary='{"phase":"providers_removed","folderDeleteAcknowledged":true,"bucketDeleteAcknowledged":true,"retainedFilesDeleted":0,"managedEgressUpperBound":0}' where id=scenario;
 r:=ar_private.acceptance_admin_retire(actor,scenario);
 if r->>'state' is distinct from 'complete' or r->>'id' is distinct from scenario::text then raise exception 'admin_retirement_failed';end if;
 if to_regnamespace('ar_acceptance_20260911') is not null or to_regnamespace('ar_acceptance_private_20260911') is not null then raise exception 'admin_retirement_left_namespace';end if;
 if current_setting('ar.audit.scenario')<>'outer-synthetic-sentinel' then raise exception 'admin_retire_context_leaked';end if;
 if not exists(select 1 from ar_private.operations_budget_reservations where id=budget and state='finished') then raise exception 'admin_retire_budget_unsettled';end if;
 if has_function_privilege('service_role','public.ar_acceptance_context(uuid,uuid)','execute') or has_function_privilege('authenticated','public.ar_acceptance_selection(uuid,text,text,text[])','execute') then raise exception 'admin_retire_gateway_still_exposed';end if;
 if (select count(*) from public.ar_accounts)<>before_accounts then raise exception 'admin_changed_real_accounts';end if;
 end loop;
end$$;
rollback;
select 'Two admin-helper cycles passed: invoker permissions, registration/owner/budget guards, static provision, exact retirement, GUC restoration and original scope; rolled back' as result;
