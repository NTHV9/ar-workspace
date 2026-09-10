begin;
do $$
declare actor uuid;op uuid:=gen_random_uuid();obj uuid:=gen_random_uuid();read_id uuid:=gen_random_uuid();key text:='jobs/'||gen_random_uuid()||'/originals/'||gen_random_uuid()||'.pdf';limits jsonb:='{"storedBytes":1073741824,"egressBytes":2147483648,"databaseBytes":268435456,"safetyPercent":20,"maxConcurrent":4,"measurementMaxAgeSeconds":300}';r jsonb;m jsonb;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 r:=public.ar_operations_budget_current(actor,limits);if r?'error' or r->>'egressScope'<>'managed_file_transfers_since_activation' or r->>'activatedAt' is null then raise exception 'scoped budget initialization: %',r;end if;
 if (r->'measurement'->>'periodEnd')::timestamptz<=now() or r->'measurement'->'used'->'databaseBytes'='null'::jsonb then raise exception 'local usage missing';end if;
 r:=public.ar_storage_write_begin(actor,op,key,4,repeat('a',64),'application/pdf',limits);if r->>'proceed'<>'true' then raise exception 'budget upload begin: %',r;end if;
 if public.ar_storage_write_begin(actor,op,key,4,repeat('a',64),'application/pdf',limits)->>'proceed'<>'false' then raise exception 'duplicate upload dispatch';end if;
 if public.ar_storage_write_begin(actor,op,key,4,repeat('b',64),'application/pdf',limits)->>'error'<>'storage_operation_conflict' then raise exception 'immutable upload fingerprint';end if;
 perform public.ar_storage_write_finish(actor,op,false);
 if (select state from ar_private.operations_budget_reservations where id=op)<>'started' then raise exception 'uncertain upload refunded';end if;
 insert into storage.objects(id,bucket_id,name,metadata) values(obj,'ar-working-files',key,'{"size":4}');
 r:=public.ar_storage_write_finish(actor,op,true);if r->>'verified'<>'true' or (select state from ar_private.operations_budget_reservations where id=op)<>'finished' then raise exception 'upload not settled: %',r;end if;
 if public.ar_storage_write_begin(actor,op,key,4,repeat('a',64),'application/pdf',limits)->>'verified'<>'true' then raise exception 'verified immutable retry';end if;
 r:=public.ar_storage_read_budget(actor,read_id,key,4,limits);if r->>'byteCount'<>'4' or (select accounting_basis from ar_private.operations_budget_reservations where id=read_id)<>'read_upper_bound' then raise exception 'read not conservatively charged';end if;
 if public.ar_storage_read_budget(actor,read_id,key,4,limits)->>'error'<>'budget_read_already_charged' then raise exception 'read charge replay';end if;
 if public.ar_storage_read_budget(actor,gen_random_uuid(),key,3,limits)->>'error'<>'storage_object_size_changed' then raise exception 'wrong response bound accepted';end if;
 update storage.objects set updated_at=clock_timestamp()+interval '1 second' where id=obj;
 if public.ar_storage_write_begin(actor,op,key,4,repeat('a',64),'application/pdf',limits)->>'error'<>'storage_object_changed' then raise exception 'changed object reused';end if;
 r:=public.ar_operations_budget_current(actor,limits);if (r->>'chargedEgress')::bigint<4 or (r->>'active')::integer<>0 then raise exception 'read charge or completed capacity';end if;
 if public.ar_storage_write_begin(gen_random_uuid(),gen_random_uuid(),key,4,repeat('a',64),'application/pdf',limits)->>'error'<>'budget_forbidden' then raise exception 'actor gate';end if;
 if has_function_privilege('anon','public.ar_storage_read_budget(uuid,uuid,text,bigint,jsonb)','execute') then raise exception 'anonymous budget access';end if;
 update ar_private.operations_budget b set limits=jsonb_set(b.limits,'{databaseBytes}','1') where singleton;
 begin
  insert into public.ar_accounts(hotel,id,name,type,open,over90,items) values('KAT','SYNTHETIC-OVER-BUDGET','Synthetic','SYNTHETIC',0,0,0);
  raise exception 'database growth admitted over allowance';
 exception when others then if sqlerrm<>'budget_database_exceeded' then raise;end if;end;
 if exists(select 1 from pg_trigger where tgrelid='ar_private.mail_deliveries'::regclass and tgname='operations_database_guard') then raise exception 'guard prevents settlement of in-flight provider work';end if;
end$$;
rollback;
select 'Storage budget scope/atomic dispatch/uncertainty/read charge/immutable object/permissions passed and rolled back' as result;
