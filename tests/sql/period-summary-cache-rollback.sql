-- Synthetic-only, including cache eviction; all changes roll back.
begin;
do $$
declare a uuid;d date:=(now() at time zone 'Asia/Bangkok')::date;v jsonb;direct jsonb;stamp timestamptz;g bigint;r text;s text;task jsonb;stats jsonb;
begin
 select id into a from auth.users where lower(email)='ar@katathani.com';
 update ar_private.operations_budget set activated_at=now(),blocked=false,limits=coalesce(limits,'{}')||jsonb_build_object('databaseBytes',100000000000,'safetyPercent',10);
 if has_table_privilege('service_role','ar_private.period_summary_cache','select') or has_function_privilege('anon','public.ar_dashboard_region_cached_segment(uuid,date,date,text,text,text)','execute') or has_function_privilege('authenticated','public.ar_period_summary_plan(text)','execute') then raise exception 'private cache exposed';end if;
 if public.ar_dashboard_region_cached_segment(null,d,d,null,'phuket','entries')->>'error'<>'dashboard_forbidden' or public.ar_dashboard_region_cached_segment(a,d,d,null,'bad','entries')->>'error'<>'dashboard_invalid' then raise exception 'cache authorization/validation missing';end if;
 foreach r in array array['phuket','khao-lak'] loop
  foreach s in array array['entries','activity','balances','external','payments','paid'] loop
   direct:=public.ar_dashboard_region_segment(a,d,d,null,r,s);
   v:=public.ar_dashboard_region_cached_segment(a,d,d,null,r,s);
   if v is distinct from direct then raise exception 'cached value changed % %',r,s;end if;
   select computed_at into stamp from ar_private.period_summary_cache where owner=a and region=r and date_from=d and date_to=d and account_type='' and segment=s;
   if stamp is null then raise exception 'cache did not fill % %',r,s;end if;
   v:=public.ar_dashboard_region_cached_segment(a,d,d,null,r,s);
   if not exists(select 1 from ar_private.period_summary_cache where owner=a and region=r and segment=s and computed_at=stamp) then raise exception 'warm hit recomputed';end if;
  end loop;
 end loop;
 select revision into g from ar_private.period_summary_generation where singleton;
 begin
  update public.ar_refresh_state set status=status;
  raise exception 'synthetic_rollback';
 exception when raise_exception then if sqlerrm<>'synthetic_rollback' then raise;end if;end;
 if (select revision from ar_private.period_summary_generation where singleton)<>g then raise exception 'rolled-back write invalidates';end if;
 update public.ar_refresh_state set status=status;
 if (select revision from ar_private.period_summary_generation where singleton)<=g then raise exception 'published change not invalidated';end if;
 v:=public.ar_dashboard_region_cached_segment(a,d,d,null,'phuket','entries');
 if not exists(select 1 from ar_private.period_summary_cache where region='phuket' and segment='entries' and generation>g) then raise exception 'stale generation served';end if;
 v:=public.ar_period_summary_plan('khao-lak');
 if jsonb_array_length(v->'tasks') not between 1 and 18 or exists(select 1 from jsonb_array_elements(v->'tasks') t where t->>'region'<>'khao-lak') then raise exception 'precompute plan escaped region';end if;
 -- Budget refusal falls back to the original value, with no new cache row.
 update ar_private.operations_budget set blocked=true;
 v:=public.ar_dashboard_region_cached_segment(a,d-4,d-3,'Synthetic custom','phuket','entries');
 if v is distinct from public.ar_dashboard_region_segment(a,d-4,d-3,'Synthetic custom','phuket','entries') or exists(select 1 from ar_private.period_summary_cache where account_type='Synthetic custom') then raise exception 'budget fallback changed';end if;
 update ar_private.operations_budget set blocked=false;
 -- Seed disposable derived rows only to exercise deterministic bounded eviction.
 insert into ar_private.period_summary_cache(owner,region,date_from,date_to,account_type,segment,generation,computed_at,expires_at,preset,value)
 select a,'phuket',d,d,'synthetic-cap-'||n,'entries',g,clock_timestamp(),clock_timestamp()+interval '1 hour',false,'{}'::jsonb from generate_series(1,195)n;
 perform public.ar_dashboard_region_cached_segment(a,d-6,d-5,'Synthetic eviction','phuket','entries');
 stats:=public.ar_period_summary_stats();if (stats->>'entries')::int>192 then raise exception 'unbounded cache';end if;
end $$;
rollback;
