begin;
do $$
declare actor uuid;op uuid:=gen_random_uuid();obj uuid:=gen_random_uuid();read_id uuid:=gen_random_uuid();key text:='jobs/'||gen_random_uuid()||'/originals/'||gen_random_uuid()||'.pdf';limits jsonb:='{"storedBytes":100,"egressBytes":100,"databaseBytes":100,"safetyPercent":20,"maxConcurrent":4,"measurementMaxAgeSeconds":300}';r jsonb;m jsonb;synthetic_run uuid:=gen_random_uuid();k text;v integer;ids uuid[]:=array[]::uuid[];probe uuid;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 r:=public.ar_operations_budget_current(actor,limits);if r?'error' or r->>'egressScope'<>'managed_file_transfers_since_activation' or r->>'activatedAt' is null then raise exception 'scoped budget initialization: %',r;end if;
 if (r->'measurement'->>'periodEnd')::timestamptz<=now() or r->'measurement'->'used'->'databaseBytes'='null'::jsonb then raise exception 'local usage missing';end if;
 -- Above all former caps, and unknown/stale/expired diagnostics, never deny admission.
 update ar_private.operations_budget set measurement=null where singleton;
 r:=public.ar_operations_budget_reserve(actor,read_id,'synthetic_quota','{"storedBytes":2,"egressBytes":2,"databaseBytes":2}',limits);
 if r->>'state' is distinct from 'reserved' then raise exception 'warn-only baseline quota rejection: %',r;end if;
 perform public.ar_operations_budget_release(actor,read_id);
 -- Stored/egress/database former limits at 80%, 100%, 150% and zero headroom.
 foreach k in array array['storedBytes','egressBytes','databaseBytes'] loop
  foreach v in array array[80,100,150] loop
   m:=jsonb_build_object('periodStart',now()-interval '1 day','periodEnd',now()+interval '1 day','used',jsonb_build_object('storedBytes',v,'egressBytes',v,'databaseBytes',v),'headroom',jsonb_build_object('storedBytes',0,'egressBytes',0,'databaseBytes',0),'observedAt',jsonb_build_object('storedBytes',now()-interval '1 hour','egressBytes',null,'databaseBytes',now()-interval '1 hour'));
   update ar_private.operations_budget set measurement=m where singleton;
   if ar_private.operations_budget_admit('{"storedBytes":1,"egressBytes":1,"databaseBytes":1}',limits) is not null then raise exception 'quota threshold denied';end if;
  end loop;
 end loop;
 update ar_private.operations_budget set measurement=jsonb_set(m,'{periodEnd}',to_jsonb(now()-interval '1 minute')) where singleton;
 if ar_private.operations_budget_admit('{"storedBytes":1,"egressBytes":1,"databaseBytes":1}',limits) is not null then raise exception 'expired diagnostic denied';end if;
 limits:=limits||'{"storedBytes":1,"egressBytes":1,"databaseBytes":1}'::jsonb;
 -- No rollover or unknown baseline clears an existing reservation.
 for v in 1..4 loop
  probe:=gen_random_uuid();ids:=array_append(ids,probe);
  r:=public.ar_operations_budget_reserve(actor,probe,'synthetic_concurrency','{"storedBytes":1,"egressBytes":0,"databaseBytes":0}',limits);
  if r?'error' then raise exception 'early concurrency denial';end if;
 end loop;
 r:=public.ar_operations_budget_current(actor,limits);
 if r?'error' or (r->>'active')::integer is distinct from 4 then raise exception 'rollover lost active reservation accounting: %',r;end if;
 r:=public.ar_operations_budget_reserve(actor,gen_random_uuid(),'synthetic_concurrency','{"storedBytes":1,"egressBytes":0,"databaseBytes":0}',limits);
 if r->>'error' is distinct from 'budget_concurrency_exceeded' then raise exception 'concurrency weakened';end if;
 foreach probe in array ids loop perform public.ar_operations_budget_release(actor,probe);end loop;
 read_id:=gen_random_uuid();
 update ar_private.operations_budget set blocked=true where singleton;
 r:=public.ar_operations_budget_reserve(actor,read_id,'synthetic_quota','{"storedBytes":1,"egressBytes":1,"databaseBytes":1}',limits);
 if r?'error' then raise exception 'historical blocked flag rejected work: %',r;end if;
 if not (select blocked from ar_private.operations_budget where singleton) then raise exception 'historical flag erased';end if;
 perform public.ar_operations_budget_start(actor,read_id,limits);
 if public.ar_operations_budget_start(actor,read_id,limits)->>'proceed' is distinct from 'false' then raise exception 'duplicate start';end if;
 if public.ar_operations_budget_release(actor,read_id)->>'error' is distinct from 'budget_release_unsafe' then raise exception 'started release';end if;
 update ar_private.operations_budget set blocked=false where singleton;
 r:=public.ar_operations_budget_finish(actor,read_id,'{"storedBytes":2,"egressBytes":2,"databaseBytes":2}');
 if r->>'overrun' is distinct from 'true' or (select blocked from ar_private.operations_budget where singleton) then raise exception 'overrun evidence/global block';end if;
 read_id:=gen_random_uuid();
 r:=public.ar_storage_write_begin(actor,op,key,4,repeat('a',64),'application/pdf',limits);if r->>'proceed' is distinct from 'true' then raise exception 'budget upload begin: %',r;end if;
 if public.ar_storage_write_begin(actor,op,key,4,repeat('a',64),'application/pdf',limits)->>'proceed' is distinct from 'false' then raise exception 'duplicate upload dispatch';end if;
 if public.ar_storage_write_begin(actor,op,key,4,repeat('b',64),'application/pdf',limits)->>'error' is distinct from 'storage_operation_conflict' then raise exception 'immutable upload fingerprint';end if;
 if public.ar_storage_write_begin(actor,op,key,4,repeat('a',64),'image/png',limits)->>'error' is distinct from 'storage_operation_conflict' then raise exception 'immutable upload MIME';end if;
 perform public.ar_storage_write_finish(actor,op,false);
 if (select state from ar_private.operations_budget_reservations where id=op)<>'started' then raise exception 'uncertain upload refunded';end if;
 insert into storage.objects(id,bucket_id,name,metadata) values(obj,'ar-working-files',key,'{"size":4}');
 r:=public.ar_storage_write_finish(actor,op,true);if r->>'verified' is distinct from 'true' or (select state from ar_private.operations_budget_reservations where id=op)<>'finished' then raise exception 'upload not settled: %',r;end if;
 if public.ar_storage_write_begin(actor,op,key,4,repeat('a',64),'application/pdf',limits)->>'verified' is distinct from 'true' then raise exception 'verified immutable retry';end if;
 r:=public.ar_storage_read_budget(actor,read_id,key,4,limits);if r->>'byteCount'<>'4' or (select accounting_basis from ar_private.operations_budget_reservations where id=read_id)<>'read_upper_bound' then raise exception 'read not conservatively charged';end if;
 if public.ar_storage_read_budget(actor,read_id,key,4,limits)->>'error'<>'budget_read_already_charged' then raise exception 'read charge replay';end if;
 if public.ar_storage_read_budget(actor,gen_random_uuid(),key,3,limits)->>'error'<>'storage_object_size_changed' then raise exception 'wrong response bound accepted';end if;
 update storage.objects set updated_at=clock_timestamp()+interval '1 second' where id=obj;
 if public.ar_storage_write_begin(actor,op,key,4,repeat('a',64),'application/pdf',limits)->>'error'<>'storage_object_changed' then raise exception 'changed object reused';end if;
 r:=public.ar_operations_budget_current(actor,limits);if (r->>'chargedEgress')::bigint<4 or (r->>'active')::integer<>0 then raise exception 'read charge or completed capacity';end if;
 if public.ar_storage_write_begin(gen_random_uuid(),gen_random_uuid(),key,4,repeat('a',64),'application/pdf',limits)->>'error'<>'budget_forbidden' then raise exception 'actor gate';end if;
 if has_function_privilege('anon','public.ar_storage_read_budget(uuid,uuid,text,bigint,jsonb)','execute') then raise exception 'anonymous budget access';end if;
 update ar_private.operations_budget b set limits=jsonb_set(b.limits,'{databaseBytes}','1') where singleton;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items) values('KAT','SYNTHETIC-OVER-BUDGET','Synthetic','SYNTHETIC',0,0,0);
 update public.ar_accounts set name='Synthetic updated' where hotel='KAT' and id='SYNTHETIC-OVER-BUDGET';
 if not exists(select 1 from public.ar_accounts where hotel='KAT' and id='SYNTHETIC-OVER-BUDGET' and name='Synthetic updated') then raise exception 'business insert/update failed';end if;
 insert into ar_private.financial_runs(id,owner,hotel,source_from,source_to,reason,proof,status,initial_import,lease_until)
 values(synthetic_run,actor,'TSK','1906-01-12','1906-01-12','backfill','synthetic-quota-policy','running',false,clock_timestamp()+interval '30 minutes');
 insert into ar_private.financial_run_accounts(run_id,account_id,ordinal,history_ready,payment_mapping_ready,payment_mapping_count) values(synthetic_run,'SYNTHETIC-QUOTA',0,true,true,1);
 insert into ar_private.financial_payment_mapping_work(run_id,account_id,batch,payments) values(synthetic_run,'SYNTHETIC-QUOTA',0,'[{}]');
 update ar_private.financial_payment_mapping_work w set results='[{}]' where w.run_id=synthetic_run and w.account_id='SYNTHETIC-QUOTA';
 if exists(select 1 from pg_trigger where tgrelid='ar_private.mail_deliveries'::regclass and tgname='operations_database_guard') then raise exception 'guard prevents settlement of in-flight provider work';end if;
end$$;
select 'Quota warnings preserve atomic dispatch, usage counts, integrity and business writes' as result;
rollback;
