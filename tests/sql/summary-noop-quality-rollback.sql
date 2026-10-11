-- Synthetic migration113 regression; caller wraps in BEGIN/ROLLBACK.
insert into public.ar_accounts(hotel,id,name,type,open,over90,items) values('KAT','SYNTHETIC113','Synthetic audit','SYNTHETIC',0,0,0) on conflict do nothing;
do $$begin
 if (select count(*) from pg_trigger where tgfoid='ar_private.invalidate_period_insert()'::regprocedure and tgtype=4 and tgnewtable='ar_new_rows' and tgoldtable is null and tgenabled='O')<>18
 or (select count(*) from pg_trigger where tgfoid='ar_private.invalidate_period_update()'::regprocedure and tgtype=16 and tgnewtable='ar_new_rows' and tgoldtable is null and tgenabled='O')<>18
 or (select count(*) from pg_trigger where tgfoid='ar_private.invalidate_period_delete()'::regprocedure and tgtype=8 and tgoldtable='ar_old_rows' and tgnewtable is null and tgenabled='O')<>17
 or (select count(*) from pg_trigger where tgfoid='ar_private.invalidate_period_summaries()'::regprocedure and tgtype=32 and tgenabled='O')<>17
 or (select count(*) from pg_trigger where tgrelid='ar_private.tracker_accepted_facts'::regclass and tgfoid in('ar_private.invalidate_period_insert()'::regprocedure,'ar_private.invalidate_period_update()'::regprocedure))<>2
 or (select count(*) from pg_trigger where tgrelid='ar_private.mail_deliveries'::regclass and tgfoid='ar_private.invalidate_period_summaries()'::regprocedure and tgtype in(17,9) and tgenabled='O')<>2 then raise exception 'cache invalidation event manifest differs';end if;
end $$;
do $$
declare g bigint;r record;cols text;
begin
 for r in select t.tgrelid::regclass as tab from pg_trigger t where t.tgname like '%invalidate_period%_update' and not t.tgisinternal loop
  select revision into g from ar_private.period_summary_generation;
  execute format('update %s set %I=%I where false',r.tab,(select attname from pg_attribute where attrelid=r.tab and attnum>0 and not attisdropped order by attnum limit 1),(select attname from pg_attribute where attrelid=r.tab and attnum>0 and not attisdropped order by attnum limit 1));
  select string_agg(quote_ident(attname),',' order by attnum) into cols from pg_attribute where attrelid=r.tab and attnum>0 and not attisdropped and attgenerated='';
  execute format('insert into %s(%s) select %s from %s where false',r.tab,cols,cols,r.tab);
  execute format('delete from %s where false',r.tab);
  if (select revision from ar_private.period_summary_generation)<>g then raise exception 'zero rows invalidated: %',r.tab;end if;
 end loop;
end $$;

-- Generic complete-row mechanics, including multiplicity, nulls and JSONB.
create temporary table summary_probe(id integer primary key,note text,payload jsonb,source_at timestamptz);
create trigger probe_insert after insert on summary_probe referencing new table as ar_new_rows for each statement execute function ar_private.invalidate_period_insert();
create trigger probe_update after update on summary_probe referencing new table as ar_new_rows for each statement execute function ar_private.invalidate_period_update();
create trigger probe_delete after delete on summary_probe referencing old table as ar_old_rows for each statement execute function ar_private.invalidate_period_delete();
create trigger probe_truncate after truncate on summary_probe for each statement execute function ar_private.invalidate_period_summaries();
create function pg_temp.assert_delta(before_revision bigint,delta integer,label text) returns void language plpgsql as $$
begin if (select revision from ar_private.period_summary_generation)<>before_revision+delta then raise exception 'unexpected generation: %',label;end if;end $$;
do $$declare g bigint;stmt text;begin
 select revision into g from ar_private.period_summary_generation;
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items) values('KAT','SYNTHETIC113','ignored','SYNTHETIC',0,0,0) on conflict do nothing;
 perform pg_temp.assert_delta(g,0,'actual account conflict do nothing');
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items) values('KAT','SYNTHETIC113','ignored','SYNTHETIC',0,0,0) on conflict(hotel,id) do update set name=ar_accounts.name;
 perform pg_temp.assert_delta(g,1,'actual account identical conflict conservatively invalidates');
 update public.ar_accounts set account_no=null where hotel='KAT' and id='SYNTHETIC113';
 select revision into g from ar_private.period_summary_generation;
 update public.ar_accounts set account_no='synthetic nullable' where hotel='KAT' and id='SYNTHETIC113';perform pg_temp.assert_delta(g,1,'actual nullable metadata');
 update public.ar_accounts set "sourceWarnings"='[{"synthetic":"changed"}]' where hotel='KAT' and id='SYNTHETIC113';perform pg_temp.assert_delta(g,2,'actual source JSON');
 update public.ar_accounts set synced_at=clock_timestamp() where hotel='KAT' and id='SYNTHETIC113';perform pg_temp.assert_delta(g,3,'actual source time');
 select revision into g from ar_private.period_summary_generation;
 insert into summary_probe values(1,null,'{}',null),(2,'b','{}',null);perform pg_temp.assert_delta(g,1,'real insert');
 foreach stmt in array array[
 'insert into summary_probe select * from summary_probe where false',
 'update summary_probe set note=note where false','delete from summary_probe where false',
 'insert into summary_probe values(1,null,''{}'',null) on conflict do nothing',
 'insert into summary_probe values(1,null,''{}'',null) on conflict(id) do update set note=excluded.note,payload=excluded.payload,source_at=excluded.source_at',
 'update summary_probe set note=note,payload=payload,source_at=source_at'] loop
 select revision into g from ar_private.period_summary_generation;execute stmt;perform pg_temp.assert_delta(g,case when stmt like '%where false%' or stmt like '%do nothing' then 0 else 1 end,stmt);end loop;
 foreach stmt in array array[
 'update summary_probe set note=''a'' where id=1',
 'update summary_probe set note=null where id=1',
 'update summary_probe set payload=''null'' where id=1',
 'update summary_probe set source_at=clock_timestamp() where id=1',
 'update summary_probe set note=case when id=1 then ''mixed'' else note end',
 'insert into summary_probe values(1,''changed'',''{}'',null),(3,null,''{}'',null) on conflict(id) do update set note=excluded.note',
 'delete from summary_probe where id=3','truncate summary_probe','truncate summary_probe'] loop
 select revision into g from ar_private.period_summary_generation;execute stmt;
 perform pg_temp.assert_delta(g,case when stmt like 'insert%' then 2 else 1 end,stmt);end loop;
 insert into summary_probe select id,null,'{}',null from generate_series(1,20) id;
 select revision into g from ar_private.period_summary_generation;
 update summary_probe set note=note;perform pg_temp.assert_delta(g,1,'twenty identical rows conservatively invalidate');
 insert into summary_probe values(21,null,'{}',null);
 select revision into g from ar_private.period_summary_generation;
 update summary_probe set note=note;perform pg_temp.assert_delta(g,1,'twenty-one conservatively invalidate');
 update summary_probe set note='genuine' where id=1;perform pg_temp.assert_delta(g,2,'small genuine after large batch');
 -- Two genuine writes with a cache entry populated between them in this transaction.
 select revision into g from ar_private.period_summary_generation;
 update public.ar_refresh_state set error_code='synthetic first' where hotel='KAT';perform pg_temp.assert_delta(g,1,'real source update');
 insert into ar_private.period_summary_cache values(ar_private.access_owner(),'phuket',current_date,current_date,'SYNTHETIC113','balances',g+1,now(),now()+interval '30 minutes',false,'{}');
 update public.ar_refresh_state set error_code='synthetic second' where hotel='KAT';perform pg_temp.assert_delta(g,2,'second update after cache');
 if exists(select 1 from ar_private.period_summary_cache where account_type='SYNTHETIC113' and generation=(select revision from ar_private.period_summary_generation)) then raise exception 'stale cache considered current';end if;
 update public.ar_refresh_state set error_code=error_code where hotel='KAT';perform pg_temp.assert_delta(g,3,'identical real source conservatively invalidates');
end $$;
do $$declare g bigint;delivery_id uuid:=gen_random_uuid();begin
 insert into ar_private.mail_deliveries(id,owner,mode,message_id,snapshot,state) values(delivery_id,ar_private.access_owner(),'test','synthetic113','{"expected":{"mailbox":"phuket","sender":"ar@katathani.com"}}','pending');
 select revision into g from ar_private.period_summary_generation;
 update ar_private.mail_deliveries set state='created' where mail_deliveries.id=delivery_id;perform pg_temp.assert_delta(g,0,'draft');
 update ar_private.mail_deliveries set state='sent' where mail_deliveries.id=delivery_id;perform pg_temp.assert_delta(g,1,'actual sent');
 begin
  update ar_private.mail_deliveries set state='pending' where mail_deliveries.id=delivery_id;
  raise exception 'sent immutability lost';
 exception when others then if sqlerrm<>'sent_evidence_immutable' then raise;end if;end;
 perform pg_temp.assert_delta(g,1,'immutable sent');
 update ar_private.mail_deliveries set reason='synthetic metadata' where mail_deliveries.id=delivery_id;perform pg_temp.assert_delta(g,1,'sent metadata');
 delete from ar_private.mail_deliveries where mail_deliveries.id=delivery_id;perform pg_temp.assert_delta(g,2,'deleted sent');
end $$;
do $$declare name text;role text;begin
 foreach name in array array['invalidate_period_insert','invalidate_period_update','invalidate_period_delete'] loop
 foreach role in array array['anon','authenticated','service_role'] loop
 if has_function_privilege(role,'ar_private.'||name||'()','execute') then raise exception 'helper privilege leak';end if;
 end loop;
 if not exists(select 1 from pg_proc where oid=('ar_private.'||name||'()')::regprocedure and prosecdef and proconfig=array['search_path=""']) then raise exception 'helper security definition';end if;
 end loop;
end $$;


