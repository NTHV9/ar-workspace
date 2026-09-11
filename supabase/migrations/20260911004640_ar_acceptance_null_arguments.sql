-- Match PostgREST SQL NULL semantics for nullable JSON arguments.
create or replace function public.ar_acceptance_rpc(p_actor uuid,p_id uuid,p_name text,p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if arg.type_name in('json','jsonb') then expr:=format('case when $1->%L=''null''::jsonb then null else ($1->%L)::%s end',arg.name,arg.name,arg.type_name);
  elsif arg.type_name in('text[]','uuid[]','integer[]','bigint[]') then expr:=format('case when $1->%L=''null''::jsonb then null else array(select jsonb_array_elements_text($1->%L))::%s end',arg.name,arg.name,arg.type_name);
  elsif arg.type_name in('text','uuid','integer','bigint','boolean','date','timestamp with time zone','numeric') then expr:=format('($1->>%L)::%s',arg.name,arg.type_name);
  else return jsonb_build_object('error','acceptance_argument_unsupported');end if;
  parts:=parts||format('%I => %s',arg.name,expr);
 end loop;
 if exists(select 1 from jsonb_object_keys(p_args)k where not(k=any(known))) then return jsonb_build_object('error','acceptance_invalid');end if;
 execute format('select to_jsonb(ar_acceptance_20260911.%I(%s))',p_name,array_to_string(parts,',')) into result using p_args;return result;
end$$;
