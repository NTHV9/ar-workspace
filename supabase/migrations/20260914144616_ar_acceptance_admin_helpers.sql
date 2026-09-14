-- Definitions only: applying/replaying this migration creates no scenario,
-- temporary namespace, provider object, reservation, or business data.
-- Admin SQL callers explicitly register and reserve before invoking provision;
-- confirmed exact-provider cleanup is required before invoking retirement.
-- Neither helper is exposed through the app gateway or granted to app roles.
create function ar_private.acceptance_admin_provision(p_actor uuid,p_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $audit_helper$
declare s ar_private.acceptance_sessions;previous_scenario text:=current_setting('ar.audit.scenario',true);
begin
 if current_user in('anon','authenticated','service_role') or not ar_private.invoice_exception_actor(p_actor) or p_id is null then raise exception 'audit_session_forbidden';end if;
 select * into s from ar_private.acceptance_sessions where id=p_id and owner=p_actor for update;
 if not found then raise exception 'audit_session_forbidden';end if;
 if s.state<>'prepared' then raise exception 'audit_not_registered';end if;
 perform set_config('ar.audit.scenario',p_id::text,true);
 execute $audit_provision_sql$
-- Disposable acceptance namespace for the owner's one-Account/three-Invoice test.
-- Clone definitions from THIS rebuilt app only. No business or credential rows.
-- PRIVATE / REVIEW BEFORE APPLY. Caller owns BEGIN/COMMIT and must set
-- ar.audit.scenario. Run only after registering that new scenario and starting
-- its real global reservation: 40 MiB stored + 80 MiB egress + 24 MiB DB.
-- This intentionally preserves the old fixed gateway namespace names after
-- proving both absent; no migration history is changed.
do $$declare s ar_private.acceptance_sessions;begin
 select * into s from ar_private.acceptance_sessions where id=current_setting('ar.audit.scenario')::uuid for update;
 if not found or s.state<>'prepared' or s.recipient_hash is null or s.fixture<>'{}' then raise exception 'audit_not_registered';end if;
 if not exists(select 1 from ar_private.operations_budget_reservations where id=s.budget_id and owner=s.owner and resource='acceptance_scenario' and state='started'
 and reserved='{"storedBytes":41943040,"egressBytes":83886080,"databaseBytes":25165824}'::jsonb) then raise exception 'audit_global_reservation_required';end if;
 if exists(select 1 from ar_private.acceptance_sessions where id<>s.id and state in('prepared','active')) then raise exception 'audit_session_conflict';end if;
 if exists(select 1 from storage.buckets where id='ar-acceptance-files') or exists(select 1 from storage.objects where bucket_id='ar-acceptance-files') then raise exception 'audit_bucket_conflict';end if;
 -- LIKE + textual definition cloning must fail before any clone if the source
 -- introduces a table/type/function format this reviewed script cannot prove.
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where (n.nspname='ar_private' or n.nspname='public' and c.relname like 'ar_%') and c.relkind in('p','f','m')) then raise exception 'audit_relation_kind_requires_review';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='ar_private' or n.nspname='public' and p.proname like 'ar_%') and p.prokind='f'
 and not exists(select 1 from unnest(p.proconfig) v where v in('search_path=','search_path=""'))) then raise exception 'audit_function_search_path_requires_review';end if;
end$$;
do $$declare r record;target_schema text;definition text;remaining integer;progress integer;begin
 perform set_config('search_path','',true);
 if to_regnamespace('ar_acceptance_20260911') is not null or to_regnamespace('ar_acceptance_private_20260911') is not null then raise exception 'acceptance_namespace_exists';end if;
 if pg_database_size(current_database())>104857600 then raise exception 'acceptance_database_headroom_required';end if;
 if exists(select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in('public','ar_private') and t.typtype in('e','d')) then raise exception 'acceptance_custom_type_review_required';end if;
 create schema ar_acceptance_20260911;create schema ar_acceptance_private_20260911;
 for r in select n.nspname,c.relname,c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and (n.nspname='ar_private' or n.nspname='public' and c.relname like 'ar_%') order by n.nspname,c.relname loop
  target_schema:=case when r.nspname='public' then 'ar_acceptance_20260911' else 'ar_acceptance_private_20260911' end;
  execute format('create table %I.%I (like %I.%I including all)',target_schema,r.relname,r.nspname,r.relname);
  execute format('alter table %I.%I enable row level security',target_schema,r.relname);
 end loop;
 -- LIKE creates independent identity sequences; ordinary serial defaults are
 -- rebound below so no synthetic insert can consume an original sequence.
 for r in select n.nspname,c.relname,s.* from pg_sequence s join pg_class c on c.oid=s.seqrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','ar_private') loop
  target_schema:=case when r.nspname='public' then 'ar_acceptance_20260911' else 'ar_acceptance_private_20260911' end;
  if to_regclass(format('%I.%I',target_schema,r.relname)) is null then execute format('create sequence %I.%I as %s increment by %s minvalue %s maxvalue %s start with %s cache %s %s',target_schema,r.relname,format_type(r.seqtypid,null),r.seqincrement,r.seqmin,r.seqmax,r.seqstart,r.seqcache,case when r.seqcycle then 'cycle' else 'no cycle' end);end if;
 end loop;
 perform set_config('check_function_bodies','off',true);
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and (n.nspname='ar_private' and p.proname not in('acceptance_admin_provision','acceptance_admin_retire') or n.nspname='public' and p.proname like 'ar_%' and p.proname not like 'ar_acceptance_%') loop
  definition:=replace(replace(pg_get_functiondef(r.oid),'ar_private.','ar_acceptance_private_20260911.'),'public.','ar_acceptance_20260911.');definition:=replace(definition,'ar-working-files','ar-acceptance-files');execute definition;
 end loop;
 -- Views are replayed in dependency order. A failed attempt remains a local
 -- subtransaction; no existing object is replaced or permissions weakened.
 loop
  progress:=0;remaining:=0;
  for r in select n.nspname,c.relname,c.oid,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='v' and (n.nspname='ar_private' or n.nspname='public' and c.relname like 'ar_%') loop
   target_schema:=case when r.nspname='public' then 'ar_acceptance_20260911' else 'ar_acceptance_private_20260911' end;
   if to_regclass(format('%I.%I',target_schema,r.relname)) is not null then continue;end if;remaining:=remaining+1;
   begin
    definition:=replace(replace(pg_get_viewdef(r.oid,true),'ar_private.','ar_acceptance_private_20260911.'),'public.','ar_acceptance_20260911.');definition:=replace(definition,'ar-working-files','ar-acceptance-files');
    execute format('create view %I.%I %s as %s',target_schema,r.relname,case when r.reloptions is null then '' else 'with ('||array_to_string(r.reloptions,',')||')' end,definition);progress:=progress+1;
   exception when undefined_table or undefined_function then null;end;
  end loop;
  exit when remaining=0;if progress=0 then raise exception 'acceptance_view_dependency_unresolved';end if;
 end loop;
 for r in select n.nspname,c.relname,con.conname,con.contype,pg_get_constraintdef(con.oid) as definition from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where con.contype in('c','f') and (n.nspname='ar_private' or n.nspname='public' and c.relname like 'ar_%') loop
  target_schema:=case when r.nspname='public' then 'ar_acceptance_20260911' else 'ar_acceptance_private_20260911' end;
  if r.contype='c' then execute format('alter table %I.%I drop constraint %I',target_schema,r.relname,r.conname);end if;
  definition:=replace(replace(r.definition,'ar_private.','ar_acceptance_private_20260911.'),'public.','ar_acceptance_20260911.');definition:=replace(definition,'ar-working-files','ar-acceptance-files');
  execute format('alter table %I.%I add constraint %I %s',target_schema,r.relname,r.conname,definition);
 end loop;
 for r in select n.nspname,c.relname,a.attname,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) as definition from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace where a.attidentity='' and (n.nspname='ar_private' or n.nspname='public' and c.relname like 'ar_%') loop
  target_schema:=case when r.nspname='public' then 'ar_acceptance_20260911' else 'ar_acceptance_private_20260911' end;
  definition:=replace(replace(r.definition,'ar_private.','ar_acceptance_private_20260911.'),'public.','ar_acceptance_20260911.');definition:=replace(definition,'ar-working-files','ar-acceptance-files');if r.attgenerated<>'' then execute format('alter table %I.%I alter column %I set expression as (%s)',target_schema,r.relname,r.attname,definition);else execute format('alter table %I.%I alter column %I set default %s',target_schema,r.relname,r.attname,definition);end if;
 end loop;
 for r in select pg_get_triggerdef(t.oid,true) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and (n.nspname='ar_private' or n.nspname='public' and c.relname like 'ar_%') loop
  definition:=replace(replace(r.definition,'ar_private.','ar_acceptance_private_20260911.'),'public.','ar_acceptance_20260911.');definition:=replace(definition,'ar-working-files','ar-acceptance-files');execute definition;
 end loop;
 revoke all on schema ar_acceptance_20260911,ar_acceptance_private_20260911 from public,anon,authenticated,service_role;
 revoke all on all tables in schema ar_acceptance_20260911,ar_acceptance_private_20260911 from public,anon,authenticated,service_role;
 revoke all on all sequences in schema ar_acceptance_20260911,ar_acceptance_private_20260911 from public,anon,authenticated,service_role;
 revoke all on all functions in schema ar_acceptance_20260911,ar_acceptance_private_20260911 from public,anon,authenticated,service_role;
end$$;

-- The test allowance measures its own bucket. Production storage is already
-- covered by the separate real global reservation and real cost guard. Keep
-- the whole-database physical measurement; only the Storage inventory changes.
do $$declare definition text;needle text:='into unknown_sizes,stored from storage.objects;';begin
 definition:=pg_get_functiondef('ar_acceptance_20260911.ar_operations_budget_refresh_local(uuid)'::regprocedure);
 if strpos(definition,needle)=0 then raise exception 'audit_budget_definition_changed';end if;
 execute replace(definition,needle,'into unknown_sizes,stored from storage.objects where bucket_id=''ar-acceptance-files'';');
end$$;

-- Only definition headers for approved templates; bytes remain in the real
-- read-only ar_statement_template getter. No provider/customer rows are copied.
insert into ar_acceptance_private_20260911.statement_templates(hotel,version,active,assets)
 select hotel,version,active,'{}'::jsonb from ar_private.statement_templates where active;
-- Added after the original acceptance run. No prior-day captures are seeded.
insert into ar_acceptance_private_20260911.dashboard_capture_state(hotel) values('KAT'),('TSK');

create function ar_acceptance_private_20260911.clock_now() returns timestamptz language sql stable security definer set search_path='' as $$
 select clock_timestamp()+make_interval(days=>coalesce((select clock_offset_days from ar_private.acceptance_sessions where state='active'),0));
$$;
do $$declare r record;definition text;begin
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='ar_acceptance_private_20260911' and p.proname like 'retention_%') or (n.nspname='ar_acceptance_20260911' and p.proname like 'ar_retention_%') loop
  definition:=replace(pg_get_functiondef(r.oid),'clock_timestamp()','ar_acceptance_private_20260911.clock_now()');execute definition;
 end loop;
end$$;
revoke all on function ar_acceptance_private_20260911.clock_now() from public,anon,authenticated,service_role;

-- Exact grants restore only the existing actor-bound service gateway APIs.
-- Selection alone retains its existing real JWT/auth.uid() check.
grant execute on function public.ar_acceptance_context(uuid,uuid),public.ar_acceptance_rpc(uuid,uuid,text,jsonb),
 public.ar_acceptance_read(uuid,uuid,text,jsonb,integer,integer),public.ar_acceptance_fixture(uuid,uuid),
 public.ar_acceptance_setup(uuid,uuid),public.ar_acceptance_setup_record(uuid,uuid,text,text),
 public.ar_acceptance_activate(uuid,uuid),public.ar_acceptance_source_change(uuid,uuid,integer,text,numeric),
 public.ar_acceptance_clock(uuid,uuid,integer),public.ar_acceptance_bucket_info(uuid,uuid),
 public.ar_acceptance_close_begin(uuid,uuid),public.ar_acceptance_close_record(uuid,uuid,text) to service_role;
grant execute on function public.ar_acceptance_selection(uuid,text,text,text[]) to authenticated;

-- Run full-audit-acceptance-validate.sql in this same transaction before COMMIT.
-- Root then sets ONLY this session's validated synthetic fixture, provisions
-- providers through /api/acceptance/prepare, measures the isolated budget, and
-- enters through /api/acceptance/enter. No API activation is done by this SQL.


$audit_provision_sql$;

 execute $audit_validate_sql$
-- Read-only catalog checks. Execute before provisioning COMMIT and again before activation.
do $$declare bytes bigint;r record;definition text;required_name text;row_count bigint;begin
 if has_schema_privilege('anon','ar_acceptance_20260911','usage') or has_schema_privilege('authenticated','ar_acceptance_20260911','usage') or has_schema_privilege('service_role','ar_acceptance_private_20260911','usage') then raise exception 'audit_namespace_exposed';end if;
 if exists(select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace join pg_class ref on ref.oid=c.confrelid join pg_namespace rn on rn.oid=ref.relnamespace
 where n.nspname in('ar_acceptance_20260911','ar_acceptance_private_20260911') and rn.nspname in('public','ar_private')) then raise exception 'audit_fk_escape';end if;
 for r in select d.adbin,d.adrelid from pg_attrdef d join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('ar_acceptance_20260911','ar_acceptance_private_20260911') loop
  if pg_get_expr(r.adbin,r.adrelid)~'(^|[^a-z_])(public|ar_private)[.]' then raise exception 'audit_default_escape';end if;
 end loop;
 for r in select p.oid,p.proname,n.nspname,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('ar_acceptance_20260911','ar_acceptance_private_20260911') loop
  if not exists(select 1 from unnest(r.proconfig) v where v in('search_path=','search_path=""')) then raise exception 'audit_search_path_escape:%',r.proname;end if;
  definition:=pg_get_functiondef(r.oid);
  -- clock_now has the single intentional production registry reference.
  if r.proname='clock_now' and r.nspname='ar_acceptance_private_20260911' then definition:=replace(definition,'ar_private.acceptance_sessions','audit_clock_registry');end if;
  if definition~'(^|[^a-z_])(public|ar_private)[.]' then raise exception 'audit_function_escape:%',r.proname;end if;
  if definition like '%ar-working-files%' then raise exception 'audit_bucket_escape:%',r.proname;end if;
 end loop;
 for r in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('ar_acceptance_20260911','ar_acceptance_private_20260911') and c.relkind='v' loop
  if pg_get_viewdef(r.oid)~'(^|[^a-z_])(public|ar_private)[.]' then raise exception 'audit_view_escape:%',r.relname;end if;
 end loop;
 for r in select t.oid,t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('ar_acceptance_20260911','ar_acceptance_private_20260911') and not t.tgisinternal loop
  if pg_get_triggerdef(r.oid)~'(^|[^a-z_])(public|ar_private)[.]' then raise exception 'audit_trigger_escape:%',r.tgname;end if;
 end loop;
 select sum(pg_total_relation_size(c.oid)) into bytes from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('ar_acceptance_20260911','ar_acceptance_private_20260911') and c.relkind='r';
 if bytes>16777216 then raise exception 'audit_schema_budget';end if;
 foreach required_name in array array['ar_portfolio_accounts','ar_dashboard_balances','ar_dashboard_payment_invoices','ar_dashboard_invoice_entries','ar_dashboard_hotel_overview','ar_aging_invoice_status','ar_financial_payment_prepare','ar_financial_payment_batch_get','ar_financial_payment_batch_save','ar_document_create_v4','ar_document_review','ar_document_discard','ar_document_pending_uploads','ar_document_cleanup_candidates'] loop
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ar_acceptance_20260911' and p.proname=required_name)<>1 then raise exception 'audit_current_rpc_missing:%',required_name;end if;
 end loop;
 if exists(select 1 from ar_acceptance_20260911.ar_accounts) or exists(select 1 from ar_acceptance_private_20260911.acceptance_sessions) then raise exception 'audit_unexpected_seed';end if;
 for r in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('ar_acceptance_20260911','ar_acceptance_private_20260911') and c.relkind='r' and not(n.nspname='ar_acceptance_private_20260911' and c.relname in('statement_templates','dashboard_capture_state')) loop
  execute format('select count(*) from %I.%I',r.nspname,r.relname) into row_count;
  if row_count<>0 then raise exception 'audit_unexpected_table_seed:%',r.relname;end if;
 end loop;
end$$;
select 'catalog_fences_passed' as result;

$audit_validate_sql$;

 execute $audit_closeout_patch_sql$
-- Acceptance-only contract update. Main document/retention/mail functions stay intact.
-- Closed transient preparations may have been explicitly discarded before review;
-- open work, pending Gmail evidence, upload uncertainty, files, and legacy jobs
-- retain their existing closeout fences. The Drive deletion proof remains required.
do $$declare definition text;needle text;replacement text;original_count integer;patched_count integer;begin
 definition:=pg_get_functiondef('public.ar_acceptance_close_begin(uuid,uuid)'::regprocedure);
 needle:=$needle$if exists(select 1 from ar_acceptance_20260911.ar_document_jobs where state<>'ready' or not acknowledged) or$needle$;
 replacement:=$replacement$if exists(select 1 from ar_acceptance_20260911.ar_document_jobs where
     lifecycle='legacy' and (state<>'ready' or not acknowledged)
     or lifecycle='transient' and (closed_at is null or closed_reason not in('sent','discarded'))) or
    exists(select 1 from ar_acceptance_private_20260911.document_transient_uploads where not registered and not cancelled) or
    exists(select 1 from ar_acceptance_20260911.ar_document_jobs j where ar_acceptance_private_20260911.document_pending_mail(j.id)) or$replacement$;
 original_count:=(length(definition)-length(replace(definition,needle,'')))/length(needle);
 patched_count:=(length(definition)-length(replace(definition,replacement,'')))/length(replacement);
 if original_count=1 and patched_count=0 then execute replace(definition,needle,replacement);
 elsif original_count=0 and patched_count=1 then null; -- Exact reviewed block from a completed earlier cycle.
 else raise exception 'audit_closeout_definition_changed';end if;
end$$;

$audit_closeout_patch_sql$;
 perform set_config('ar.audit.scenario',coalesce(previous_scenario,''),true);
 return jsonb_build_object('id',p_id,'state','prepared','definitionsOnly',true);
exception when others then
 perform set_config('ar.audit.scenario',coalesce(previous_scenario,''),true);
 raise;
end
$audit_helper$;
revoke all on function ar_private.acceptance_admin_provision(uuid,uuid) from public,anon,authenticated,service_role;
create function ar_private.acceptance_admin_retire(p_actor uuid,p_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $audit_helper$
declare s ar_private.acceptance_sessions;previous_scenario text:=current_setting('ar.audit.scenario',true);
begin
 if current_user in('anon','authenticated','service_role') or not ar_private.invoice_exception_actor(p_actor) or p_id is null then raise exception 'audit_session_forbidden';end if;
 select * into s from ar_private.acceptance_sessions where id=p_id and owner=p_actor for update;
 if not found then raise exception 'audit_session_forbidden';end if;
 if s.state<>'complete' or s.summary->>'phase' is distinct from 'providers_removed' then raise exception 'audit_closeout_required';end if;
 perform set_config('ar.audit.scenario',p_id::text,true);
 execute $audit_retire_sql$
-- PRIVATE exact-scenario retirement. Execute in one caller-owned transaction.
-- Requires ar.audit.scenario GUC and completed closeAcceptance provider proof.
-- Does not delete Storage objects, Drive files, or Gmail messages. It refuses
-- to proceed until the existing exact-ID provider deletion flow is complete.
do $$declare s ar_private.acceptance_sessions;settled jsonb;r record;begin
 select * into s from ar_private.acceptance_sessions where id=current_setting('ar.audit.scenario')::uuid for update;
 if not found or s.state<>'complete' or s.summary->>'phase' is distinct from 'providers_removed' or s.completed_at is not null then raise exception 'audit_closeout_required';end if;
 if s.summary->>'folderDeleteAcknowledged' is distinct from 'true' or s.summary->>'bucketDeleteAcknowledged' is distinct from 'true' or s.recipient_hash is not null or s.fixture<>'{}' then raise exception 'audit_provider_cleanup_unconfirmed';end if;
 if exists(select 1 from ar_private.acceptance_sessions where state in('prepared','active')) then raise exception 'audit_still_active';end if;
 if exists(select 1 from storage.buckets where id='ar-acceptance-files') or exists(select 1 from storage.objects where bucket_id='ar-acceptance-files') then raise exception 'audit_provider_files_remaining';end if;
 if to_regnamespace('ar_acceptance_20260911') is null or to_regnamespace('ar_acceptance_private_20260911') is null then raise exception 'audit_namespace_missing';end if;
 if (select count(*) from ar_acceptance_20260911.ar_accounts)<>1 or exists(select 1 from ar_acceptance_20260911.ar_accounts where hotel<>'KAT' or id<>'SYN-'||s.id::text) then raise exception 'audit_account_scope_changed';end if;
 if (select count(*) from ar_acceptance_20260911.ar_invoices)<>3 or exists(select 1 from ar_acceptance_20260911.ar_invoices where hotel<>'KAT' or account_id<>'SYN-'||s.id::text or id not in('910001','910002','910003') or open<>0 or verification_state<>'cleared') then raise exception 'audit_invoice_scope_changed';end if;
 if exists(select 1 from ar_acceptance_private_20260911.retention_items where state<>'deleted') or (select count(*) from ar_acceptance_private_20260911.retention_items) is distinct from (s.summary->>'retainedFilesDeleted')::bigint then raise exception 'audit_retention_unconfirmed';end if;
 if s.summary->>'managedEgressUpperBound' is null or (s.summary->>'managedEgressUpperBound')::bigint not between 0 and 83886080 then raise exception 'audit_egress_unconfirmed';end if;
 if not exists(select 1 from ar_private.operations_budget_reservations where id=s.budget_id and owner=s.owner and resource='acceptance_scenario' and state='started') then raise exception 'audit_budget_unconfirmed';end if;
 -- No unrelated persistent FK may have been pointed into this disposable pair.
 if exists(select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace join pg_class ref on ref.oid=c.confrelid join pg_namespace rn on rn.oid=ref.relnamespace
 where rn.nspname in('ar_acceptance_20260911','ar_acceptance_private_20260911') and n.nspname not in('ar_acceptance_20260911','ar_acceptance_private_20260911')) then raise exception 'audit_external_dependency';end if;
 if exists(select 1 from pg_depend d join pg_rewrite rw on d.classid='pg_rewrite'::regclass and rw.oid=d.objid join pg_class v on v.oid=rw.ev_class join pg_namespace vn on vn.oid=v.relnamespace join pg_class ref on d.refclassid='pg_class'::regclass and ref.oid=d.refobjid join pg_namespace rn on rn.oid=ref.relnamespace
 where rn.nspname in('ar_acceptance_20260911','ar_acceptance_private_20260911') and vn.nspname not in('ar_acceptance_20260911','ar_acceptance_private_20260911')) then raise exception 'audit_external_dependency';end if;
 drop schema ar_acceptance_20260911 cascade;
 drop schema ar_acceptance_private_20260911 cascade;
 settled:=public.ar_operations_budget_finish(s.owner,s.budget_id,jsonb_build_object('storedBytes',0,'egressBytes',(s.summary->>'managedEgressUpperBound')::bigint,'databaseBytes',0));
 if settled->>'state' is distinct from 'finished' or settled?'error' then raise exception 'audit_budget_unconfirmed';end if;
 update ar_private.acceptance_sessions set completed_at=clock_timestamp(),clock_offset_days=0,summary=summary||jsonb_build_object('phase','complete','namespacesRemoved',true,'budgetSettled',true) where id=s.id;
 perform public.ar_operations_budget_refresh_local(s.owner);
 for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'ar_acceptance_%' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
 end loop;
end$$;

$audit_retire_sql$;
 perform set_config('ar.audit.scenario',coalesce(previous_scenario,''),true);
 return jsonb_build_object('id',p_id,'state','complete');
exception when others then
 perform set_config('ar.audit.scenario',coalesce(previous_scenario,''),true);
 raise;
end
$audit_helper$;
revoke all on function ar_private.acceptance_admin_retire(uuid,uuid) from public,anon,authenticated,service_role;