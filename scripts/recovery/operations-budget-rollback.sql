-- Local synthetic fixture only. Every measurement/reservation/object metadata row rolls back.
begin;
do $$
declare actor uuid:='00000000-0000-4000-8000-000000000001';a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();m jsonb;r jsonb;limits jsonb;
begin
 limits:='{"storedBytes":1000,"egressBytes":1000,"databaseBytes":1073741824,"safetyPercent":20,"maxConcurrent":4,"measurementMaxAgeSeconds":300}';
 r:=public.ar_operations_budget_reserve(actor,a,'synthetic_upload','{"storedBytes":700,"egressBytes":0,"databaseBytes":0}',limits);
 if r->>'error' is distinct from 'budget_usage_unverified' then raise exception 'unknown budget admitted';end if;
 m:=jsonb_build_object('observedAt',jsonb_build_object('storedBytes',now(),'egressBytes',now()-interval '2 hours','databaseBytes',now()),'periodStart',date_trunc('month',now()),'periodEnd',date_trunc('month',now())+interval '1 month','used',jsonb_build_object('storedBytes',100,'egressBytes',100,'databaseBytes',0),'headroom',jsonb_build_object('storedBytes',10000,'egressBytes',10000,'databaseBytes',1073741824));
 r:=public.ar_operations_budget_measure(actor,m);if r?'error' then raise exception 'known baseline rejected: %',r;end if;
 r:=public.ar_operations_budget_reserve(actor,a,'synthetic_upload','{"storedBytes":700,"egressBytes":0,"databaseBytes":0}',limits);if r->>'state' is distinct from 'reserved' then raise exception 'exact cap rejected: %',r;end if;
 r:=public.ar_operations_budget_reserve(actor,b,'synthetic_upload','{"storedBytes":1,"egressBytes":0,"databaseBytes":0}',limits);if r->>'error' is distinct from 'budget_storage_exceeded' then raise exception 'reserved bytes omitted';end if;
 r:=public.ar_operations_budget_start(actor,a,limits);if r->>'proceed' is distinct from 'true' then raise exception 'first dispatch rejected: %',r;end if;
 r:=public.ar_operations_budget_start(actor,a,limits);if r->>'proceed' is distinct from 'false' then raise exception 'duplicate dispatch';end if;
 r:=public.ar_operations_budget_release(actor,a);if r->>'error' is distinct from 'budget_release_unsafe' then raise exception 'uncertain started work released';end if;
 r:=public.ar_operations_budget_finish(actor,a,'{"storedBytes":600,"egressBytes":0,"databaseBytes":0}');if r->>'state' is distinct from 'finished' then raise exception 'finish rejected';end if;
 r:=public.ar_operations_budget_finish(actor,a,'{"storedBytes":600,"egressBytes":0,"databaseBytes":0}');if r->>'state' is distinct from 'finished' then raise exception 'finish replay rejected';end if;
 r:=public.ar_operations_budget_finish(actor,a,'{"storedBytes":599,"egressBytes":0,"databaseBytes":0}');if r->>'error' is distinct from 'budget_conflict' then raise exception 'different finish accepted';end if;
 r:=public.ar_operations_budget_reserve(actor,b,'synthetic_upload','{"storedBytes":100,"egressBytes":0,"databaseBytes":0}',limits);if r->>'state' is distinct from 'reserved' then raise exception 'finished bytes/remaining capacity incorrect';end if;
 r:=public.ar_operations_budget_release(actor,b);if r->>'state' is distinct from 'released' then raise exception 'never-started release rejected';end if;
 r:=public.ar_operations_budget_reserve(actor,c,'synthetic_egress','{"storedBytes":0,"egressBytes":700,"databaseBytes":0}',limits);if r->>'state' is distinct from 'reserved' then raise exception 'cycle egress baseline incorrectly requires new dashboard read';end if;
 r:=public.ar_operations_budget_start(actor,c,limits);if r->>'proceed' is distinct from 'true' then raise exception 'egress start rejected';end if;
 r:=public.ar_operations_budget_finish(actor,c,'{"storedBytes":0,"egressBytes":701,"databaseBytes":0}');if r->>'overrun' is distinct from 'true' then raise exception 'overrun not recorded';end if;
 r:=public.ar_operations_budget_reserve(actor,gen_random_uuid(),'synthetic_upload','{"storedBytes":1,"egressBytes":0,"databaseBytes":0}',limits);if r->>'error' is distinct from 'budget_review_required' then raise exception 'overrun hold bypassed';end if;
 r:=public.ar_operations_budget_refresh_local(actor);if (r->'used'->>'storedBytes')::numeric<>0 or (r->'used'->>'databaseBytes')::numeric<=0 then raise exception 'local measurement missing';end if;
 if has_function_privilege('authenticated','public.ar_operations_budget_reserve(uuid,uuid,text,jsonb,jsonb)','execute') or has_table_privilege('service_role','ar_private.operations_budget_reservations','update') then raise exception 'budget client grant leak';end if;
end $$;
rollback;
select 'Local budget allowance, dispatch, pending safety, overrun, measurement and permissions passed; rolled back' as result;
