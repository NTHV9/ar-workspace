-- Report-only maintenance stays inert while old Worker versions may still call it.
begin;
do $$
declare actor uuid;run uuid:=gen_random_uuid();result jsonb;before_rows jsonb;after_rows jsonb;relation_name text;fingerprint text;n integer;checked timestamptz;
begin
 select id into strict actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if has_function_privilege('anon','public.ar_financial_log_prune(uuid,integer)','execute')
 or has_function_privilege('authenticated','public.ar_financial_log_prune(uuid,integer)','execute')
 or not has_function_privilege('service_role','public.ar_financial_log_prune(uuid,integer)','execute')
 or has_table_privilege('service_role','ar_private.financial_log_retention_state','update')
 or has_table_privilege('service_role','ar_private.financial_changes','delete') then raise exception 'maintenance privilege boundary changed';end if;
 if not exists(select 1 from pg_proc where oid='public.ar_financial_log_prune(uuid,integer)'::regprocedure and prosecdef and proconfig=array['search_path=""'] and pg_get_userbyid(proowner)=current_user) then raise exception 'maintenance function security changed';end if;
 insert into ar_private.financial_runs(id,owner,hotel,source_from,source_to,reason,proof,status,initial_import)
 values(run,actor,'KAT','1901-01-01','1901-01-01','manual','synthetic retired maintenance','succeeded',false);
 insert into ar_private.financial_changes(run_id,hotel,account_id,kind,identity,next_data,next_status,observed_at)
 values(run,'KAT','SYNTHETIC-RETIRED-MAINTENANCE','invoice','expired','{"synthetic":true}','observed',statement_timestamp()-interval '2 months'),
 (run,'KAT','SYNTHETIC-RETIRED-MAINTENANCE','invoice','recent','{"synthetic":true}','observed',statement_timestamp());
 -- Include EVERY canonical table, the change rows and the maintenance singleton.
 before_rows:='{}';
 for relation_name in select format('%I.%I',schemaname,tablename) from pg_tables where schemaname in('ar_private','public') order by schemaname,tablename loop
  execute format('select md5(coalesce(string_agg(to_jsonb(t)::text,''|'' order by to_jsonb(t)::text),'''')) from %s t',relation_name) into fingerprint;
  before_rows:=before_rows||jsonb_build_object(relation_name,fingerprint);
 end loop;
 begin perform public.ar_financial_log_prune(gen_random_uuid(),1);raise exception 'invalid actor accepted';exception when others then if sqlerrm<>'financial_forbidden' then raise;end if;end;
 begin perform public.ar_financial_log_prune(null,1);raise exception 'null actor accepted';exception when others then if sqlerrm<>'financial_forbidden' then raise;end if;end;
 foreach n in array array[0,-1,1001,null] loop
  begin perform public.ar_financial_log_prune(actor,n);raise exception 'invalid limit accepted';exception when others then if sqlerrm<>'financial_log_limit_invalid' then raise;end if;end;
 end loop;
 checked:=clock_timestamp();
 foreach n in array array[1,1000,1] loop
  result:=public.ar_financial_log_prune(actor,n);
  if result-'checkedAt'<>'{"status":"succeeded","deleted":0,"moreEligible":false,"retentionMonths":1}'::jsonb
   or (result->>'checkedAt')::timestamptz<statement_timestamp() or (result->>'checkedAt')::timestamptz>clock_timestamp() then raise exception 'retired history maintenance still performs work or changed contract: %',result;end if;
 end loop;
 after_rows:='{}';
 for relation_name in select format('%I.%I',schemaname,tablename) from pg_tables where schemaname in('ar_private','public') order by schemaname,tablename loop
  execute format('select md5(coalesce(string_agg(to_jsonb(t)::text,''|'' order by to_jsonb(t)::text),'''')) from %s t',relation_name) into fingerprint;
  after_rows:=after_rows||jsonb_build_object(relation_name,fingerprint);
 end loop;
 if before_rows is distinct from after_rows then raise exception 'retired maintenance changed history/state/canonical data';end if;
 if public.ar_financial_service_actor() is distinct from actor then raise exception 'live storage/retention actor changed';end if;
end$$;
select 'Retired history maintenance response/auth/argument contract and every application table preserved; rolling back' as result;
rollback;
