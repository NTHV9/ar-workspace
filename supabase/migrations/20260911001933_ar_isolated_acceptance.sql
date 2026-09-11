-- Disposable acceptance namespace for the owner's one-Account/three-Invoice test.
-- Clone definitions from THIS rebuilt app only. No business or credential rows.
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
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and (n.nspname='ar_private' or n.nspname='public' and p.proname like 'ar_%') loop
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

create table ar_private.acceptance_sessions(
 id uuid primary key,owner uuid not null references auth.users(id),state text not null check(state in('prepared','active','complete')),
 source_sha text not null,recipient_hash text,clock_offset_days integer not null default 0 check(clock_offset_days between 0 and 62),fixture jsonb not null default '{}',
 budget_id uuid,drive_folder_id text,created_at timestamptz not null default clock_timestamp(),completed_at timestamptz,summary jsonb,
 check(recipient_hash is null or recipient_hash~'^[0-9a-f]{64}$')
);
create unique index acceptance_one_active on ar_private.acceptance_sessions((true)) where state in('prepared','active');
alter table ar_private.acceptance_sessions enable row level security;
revoke all on ar_private.acceptance_sessions from public,anon,authenticated,service_role;
create function public.ar_acceptance_context(p_actor uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s ar_private.acceptance_sessions;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','acceptance_forbidden');end if;
 select * into s from ar_private.acceptance_sessions where id=p_id and owner=p_actor and state='active';if not found then return jsonb_build_object('error','acceptance_inactive');end if;
 return jsonb_build_object('id',s.id,'owner',s.owner,'sourceSha',s.source_sha,'recipientHash',s.recipient_hash,'clockOffsetDays',s.clock_offset_days,'driveFolderId',s.drive_folder_id);
end$$;
-- Only Worker-selected app RPCs are callable; no SQL text or identifier is taken
-- from a browser. Typed named arguments preserve the original function contract.
create function public.ar_acceptance_rpc(p_actor uuid,p_id uuid,p_name text,p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb;fn record;arg record;parts text[]:='{}';known text[]:='{}';expr text;result jsonb;matches integer;
begin
 context:=public.ar_acceptance_context(p_actor,p_id);if context?'error' then return context;end if;
 if p_name not like 'ar_retention_%' and (select coalesce(sum(pg_total_relation_size(c.oid)),0) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('ar_acceptance_20260911','ar_acceptance_private_20260911') and c.relkind='r')>16777216 then return jsonb_build_object('error','acceptance_database_budget');end if;
 if p_name is null or p_name!~'^ar_[a-z0-9_]+$' or jsonb_typeof(p_args) is distinct from 'object' then return jsonb_build_object('error','acceptance_invalid');end if;
 if p_args?'p_actor' and p_args->>'p_actor' is distinct from p_actor::text or p_args?'p_owner' and p_args->>'p_owner' is distinct from p_actor::text then return jsonb_build_object('error','acceptance_forbidden');end if;
 select count(*) into matches from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ar_acceptance_20260911' and p.proname=p_name;
 if matches<>1 then return jsonb_build_object('error','acceptance_rpc_unsupported');end if;
 select p.* into fn from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ar_acceptance_20260911' and p.proname=p_name;
 for arg in select i,fn.proargnames[i] as name,format_type(fn.proargtypes[i-1],null) as type_name from generate_series(1,fn.pronargs)i loop
  known:=known||arg.name;if not(p_args?arg.name) then continue;end if;
  if arg.type_name in('json','jsonb') then expr:=format('($1->%L)::%s',arg.name,arg.type_name);
  elsif arg.type_name in('text[]','uuid[]','integer[]','bigint[]') then expr:=format('case when $1->%L=''null''::jsonb then null else array(select jsonb_array_elements_text($1->%L))::%s end',arg.name,arg.name,arg.type_name);
  elsif arg.type_name in('text','uuid','integer','bigint','boolean','date','timestamp with time zone','numeric') then expr:=format('($1->>%L)::%s',arg.name,arg.type_name);
  else return jsonb_build_object('error','acceptance_argument_unsupported');end if;
  parts:=parts||format('%I => %s',arg.name,expr);
 end loop;
 if exists(select 1 from jsonb_object_keys(p_args)k where not(k=any(known))) then return jsonb_build_object('error','acceptance_invalid');end if;
 execute format('select to_jsonb(ar_acceptance_20260911.%I(%s))',p_name,array_to_string(parts,',')) into result using p_args;return result;
end$$;
revoke all on function public.ar_acceptance_context(uuid,uuid),public.ar_acceptance_rpc(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ar_acceptance_context(uuid,uuid),public.ar_acceptance_rpc(uuid,uuid,text,jsonb) to service_role;

create function public.ar_acceptance_read(p_actor uuid,p_id uuid,p_table text,p_query jsonb,p_limit integer default 500,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb;result jsonb;filters jsonb:='[]';pair record;orders text[]:='{}';sort text;column_name text;direction text;selected text[];projection text;
begin
 context:=public.ar_acceptance_context(p_actor,p_id);if context?'error' then return context;end if;
 if p_table is null or p_table not in('ar_accounts','ar_invoices','ar_invoice_workflow','ar_invoice_exceptions','ar_collection_rows','ar_document_jobs') or jsonb_typeof(p_query) is distinct from 'object' or p_limit is null or p_limit not between 1 and 500 or p_offset is null or p_offset<0 then return jsonb_build_object('error','acceptance_invalid');end if;
 for pair in select key,value from jsonb_each_text(p_query) loop
  if pair.key in('select','order') then continue;end if;
  if pair.key not in('hotel','account_id','id','owner','open') or pair.value!~'^(eq|neq)[.]' then return jsonb_build_object('error','acceptance_filter_invalid');end if;
  if pair.key='open' and substr(pair.value,strpos(pair.value,'.')+1)!~'^-?[0-9]+([.][0-9]+)?$' then return jsonb_build_object('error','acceptance_filter_invalid');end if;
  filters:=filters||jsonb_build_array(jsonb_build_object('key',pair.key,'op',split_part(pair.value,'.',1),'value',substr(pair.value,strpos(pair.value,'.')+1)));
 end loop;
 foreach sort in array string_to_array(coalesce(p_query->>'order','id'),',') loop
  column_name:=split_part(sort,'.',1);direction:=coalesce(nullif(split_part(sort,'.',2),''),'asc');
  if direction not in('asc','desc') or not exists(select 1 from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='ar_acceptance_20260911' and c.relname=p_table and a.attname=column_name and not a.attisdropped and a.attnum>0) then return jsonb_build_object('error','acceptance_order_invalid');end if;
  orders:=orders||format('%I %s',column_name,direction);
 end loop;
 if coalesce(p_query->>'select','*')='*' then projection:='to_jsonb(t)';else
  selected:=string_to_array(p_query->>'select',',');if exists(select 1 from unnest(selected)s where s!~'^[a-z_]+$') then return jsonb_build_object('error','acceptance_select_invalid');end if;
  projection:='(select jsonb_object_agg(k,v) from jsonb_each(to_jsonb(t))x(k,v) where k=any($4))';
 end if;
 execute format($query$
  select coalesce(jsonb_agg(value),'[]'::jsonb) from (
   select %s as value from ar_acceptance_20260911.%I t where not exists(
    select 1 from jsonb_array_elements($1)f where case
     when f->>'key'='open' then case when f->>'op'='eq' then (to_jsonb(t)->'open') is distinct from to_jsonb((f->>'value')::numeric) else (to_jsonb(t)->'open') is not distinct from to_jsonb((f->>'value')::numeric) end
     when f->>'op'='eq' then (to_jsonb(t)->>(f->>'key')) is distinct from f->>'value'
     else (to_jsonb(t)->>(f->>'key')) is not distinct from f->>'value' end
   ) order by %s limit $2 offset $3
  ) page
 $query$,projection,p_table,array_to_string(orders,',')) into result using filters,p_limit,p_offset,selected;
 return result;
end$$;

create function public.ar_acceptance_fixture(p_actor uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','acceptance_forbidden');end if;
 return coalesce((select fixture from ar_private.acceptance_sessions where id=p_id and owner=p_actor and state='active'),jsonb_build_object('error','acceptance_inactive'));
end$$;
-- Preserve the real authenticated identity for the one original selection RPC
-- whose contract reads auth.uid()/JWT rather than an explicit service actor.
create function public.ar_acceptance_selection(p_id uuid,p_hotel text,p_account_id text,p_ids text[]) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not ar_private.is_member() or not exists(select 1 from ar_private.acceptance_sessions where id=p_id and owner=auth.uid() and state='active') then raise exception 'acceptance_forbidden';end if;
 return ar_acceptance_20260911.ar_validate_collection_selection(p_hotel,p_account_id,p_ids);
end$$;
revoke all on function public.ar_acceptance_read(uuid,uuid,text,jsonb,integer,integer),public.ar_acceptance_fixture(uuid,uuid),public.ar_acceptance_selection(uuid,text,text,text[]) from public,anon,authenticated,service_role;
grant execute on function public.ar_acceptance_read(uuid,uuid,text,jsonb,integer,integer),public.ar_acceptance_fixture(uuid,uuid) to service_role;
grant execute on function public.ar_acceptance_selection(uuid,text,text,text[]) to authenticated;

alter table ar_private.acceptance_sessions add column bucket_verified boolean not null default false,add column parent_folder_id text,add column fixture_revision integer not null default 0;
create function public.ar_acceptance_setup(p_actor uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','acceptance_forbidden');end if;
 return coalesce((select to_jsonb(s)-'recipient_hash'-'fixture' from ar_private.acceptance_sessions s where id=p_id and owner=p_actor and state in('prepared','active')),jsonb_build_object('error','acceptance_inactive'));
end$$;
create function public.ar_acceptance_setup_record(p_actor uuid,p_id uuid,p_kind text,p_value text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s ar_private.acceptance_sessions;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','acceptance_forbidden');end if;
 select * into s from ar_private.acceptance_sessions where id=p_id and owner=p_actor and state='prepared' for update;if not found then return jsonb_build_object('error','acceptance_inactive');end if;
 if p_kind='folder' then
  if p_value!~'^[A-Za-z0-9_-]{10,200}$' then raise exception 'acceptance_invalid';end if;
  update ar_private.acceptance_sessions set drive_folder_id=coalesce(drive_folder_id,p_value) where id=p_id;
 elsif p_kind='parent' then
  if p_value!~'^[A-Za-z0-9_-]{10,200}$' or s.parent_folder_id is not null and s.parent_folder_id<>p_value then raise exception 'acceptance_invalid';end if;
  update ar_private.acceptance_sessions set parent_folder_id=p_value where id=p_id;
 elsif p_kind='bucket' and p_value='verified' then update ar_private.acceptance_sessions set bucket_verified=true where id=p_id;
 else raise exception 'acceptance_invalid';end if;
 return public.ar_acceptance_setup(p_actor,p_id);
end$$;
create function public.ar_acceptance_activate(p_actor uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s ar_private.acceptance_sessions;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','acceptance_forbidden');end if;
 select * into s from ar_private.acceptance_sessions where id=p_id and owner=p_actor for update;if not found or s.state='complete' then return jsonb_build_object('error','acceptance_inactive');end if;
 if s.state='active' then return public.ar_acceptance_context(p_actor,p_id);end if;
 if not s.bucket_verified or s.drive_folder_id is null or s.parent_folder_id is null or s.recipient_hash is null or not exists(select 1 from ar_private.operations_budget_reservations where id=s.budget_id and owner=p_actor and resource='acceptance_scenario' and state='started') then return jsonb_build_object('error','acceptance_preparation_incomplete');end if;
 if exists(select 1 from ar_acceptance_20260911.ar_accounts) then raise exception 'acceptance_data_not_empty';end if;
 insert into ar_acceptance_private_20260911.collection_policy_versions select * from ar_private.collection_policy_versions;
 insert into ar_acceptance_private_20260911.collection_policy_head select * from ar_private.collection_policy_head;
 insert into ar_acceptance_private_20260911.collection_stage_keys select * from ar_private.collection_stage_keys;
 insert into ar_acceptance_private_20260911.operations_budget(singleton) values(true);
 insert into ar_acceptance_private_20260911.source_observation_state(singleton) values(true);
 insert into ar_acceptance_20260911.ar_refresh_state(hotel) values('KAT'),('TSK');
 insert into ar_acceptance_private_20260911.drive_targets(owner,folder_id,revision,name,verified_at,visibility) values(p_actor,s.drive_folder_id,1,'SYNTHETIC acceptance files',clock_timestamp(),'restricted');
 update ar_private.acceptance_sessions set state='active' where id=p_id;return public.ar_acceptance_context(p_actor,p_id);
end$$;
create function public.ar_acceptance_source_change(p_actor uuid,p_id uuid,p_revision integer,p_invoice text,p_open numeric) returns jsonb language plpgsql security definer set search_path='' as $$
declare s ar_private.acceptance_sessions;n integer;original numeric;
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','acceptance_forbidden');end if;
 select * into s from ar_private.acceptance_sessions where id=p_id and owner=p_actor and state='active' for update;if not found then raise exception 'acceptance_inactive';end if;
 if s.fixture_revision<>p_revision then raise exception 'acceptance_revision_conflict';end if;
 select ordinal::integer-1,(value->>'original')::numeric into n,original from jsonb_array_elements(s.fixture->'invoices') with ordinality x(value,ordinal) where value->>'id'=p_invoice;
 if n is null or p_open is null or p_open<0 or p_open>original or round(p_open,2)<>p_open then raise exception 'acceptance_invalid';end if;
 update ar_private.acceptance_sessions set fixture=jsonb_set(fixture,array['invoices',n::text,'open'],to_jsonb(p_open)),fixture_revision=fixture_revision+1 where id=p_id;
 return jsonb_build_object('revision',p_revision+1);
end$$;
create function ar_acceptance_private_20260911.clock_now() returns timestamptz language sql stable security definer set search_path='' as $$
 select clock_timestamp()+make_interval(days=>coalesce((select clock_offset_days from ar_private.acceptance_sessions where state='active'),0));
$$;
-- Only disposable retention checks use the controllable clock. Provider OAuth,
-- actual send dates and the real global budget retain the real clock.
do $$declare r record;definition text;begin
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='ar_acceptance_private_20260911' and p.proname like 'retention_%') or (n.nspname='ar_acceptance_20260911' and p.proname like 'ar_retention_%') loop
  definition:=replace(pg_get_functiondef(r.oid),'clock_timestamp()','ar_acceptance_private_20260911.clock_now()');execute definition;
 end loop;
end$$;
create function public.ar_acceptance_clock(p_actor uuid,p_id uuid,p_days integer) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not ar_private.invoice_exception_actor(p_actor) then return jsonb_build_object('error','acceptance_forbidden');end if;
 if p_days is null or p_days not between 0 and 62 or not exists(select 1 from ar_private.acceptance_sessions where id=p_id and owner=p_actor and state='active') then raise exception 'acceptance_invalid';end if;
 update ar_private.acceptance_sessions set clock_offset_days=p_days where id=p_id;
 -- This is explicitly a synthetic source observation, never a production clock
 -- change or an OPERA payment date. Unknown source records are not promoted.
 update ar_acceptance_20260911.ar_invoices set synced_at=ar_acceptance_private_20260911.clock_now() where verification_state in('verified','cleared');
 return jsonb_build_object('clockOffsetDays',p_days);
end$$;
revoke all on function ar_acceptance_private_20260911.clock_now() from public,anon,authenticated,service_role;
revoke all on function public.ar_acceptance_setup(uuid,uuid),public.ar_acceptance_setup_record(uuid,uuid,text,text),public.ar_acceptance_activate(uuid,uuid),public.ar_acceptance_source_change(uuid,uuid,integer,text,numeric),public.ar_acceptance_clock(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.ar_acceptance_setup(uuid,uuid),public.ar_acceptance_setup_record(uuid,uuid,text,text),public.ar_acceptance_activate(uuid,uuid),public.ar_acceptance_source_change(uuid,uuid,integer,text,numeric),public.ar_acceptance_clock(uuid,uuid,integer) to service_role;

create function public.ar_acceptance_bucket_info(p_actor uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not ar_private.invoice_exception_actor(p_actor) or not exists(select 1 from ar_private.acceptance_sessions where id=p_id and owner=p_actor and state in('prepared','active')) then return jsonb_build_object('error','acceptance_forbidden');end if;
 return jsonb_build_object('exists',exists(select 1 from storage.buckets where id='ar-acceptance-files'),'private',exists(select 1 from storage.buckets where id='ar-acceptance-files' and not public),'objects',(select count(*) from storage.objects where bucket_id='ar-acceptance-files'));
end$$;
revoke all on function public.ar_acceptance_bucket_info(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ar_acceptance_bucket_info(uuid,uuid) to service_role;
