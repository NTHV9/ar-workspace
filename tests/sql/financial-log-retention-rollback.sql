-- Synthetic-only regression fixture. All changes, including test triggers, roll back.
begin;
do $$
declare
 actor uuid; run uuid:=gen_random_uuid(); result jsonb; before_business jsonb;
 after_business jsonb; relation_name text; fingerprint text; recent_id bigint;
 expired_id bigint; original_total bigint; n integer;
begin
 -- Expiry adds a month in Thailand, rather than subtracting a month from today.
 if ar_private.financial_log_expires_at('2026-01-31 15:12:34+07') <> '2026-02-28 15:12:34+07'::timestamptz
 or ar_private.financial_log_expires_at('2024-01-31 15:12:34+07') <> '2024-02-29 15:12:34+07'::timestamptz
 or ar_private.financial_log_expires_at('2026-03-31 15:12:34+07') <> '2026-04-30 15:12:34+07'::timestamptz
 then raise exception 'calendar month expiry incorrect';end if;
 perform set_config('TimeZone','America/Los_Angeles',true);
 if ar_private.financial_log_expires_at('2026-01-31 00:12:34+07') <> '2026-02-28 00:12:34+07'::timestamptz
 then raise exception 'session timezone changed retention';end if;
 perform set_config('TimeZone','UTC',true);
 if has_function_privilege('anon','public.ar_financial_log_prune(uuid,integer)','execute')
 or has_function_privilege('authenticated','public.ar_financial_log_prune(uuid,integer)','execute')
 or not has_function_privilege('service_role','public.ar_financial_log_prune(uuid,integer)','execute')
 or has_table_privilege('service_role','ar_private.financial_log_retention_state','update')
 or has_table_privilege('service_role','ar_private.financial_changes','delete')
 then raise exception 'retention privilege boundary invalid';end if;
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null and not coalesce(is_anonymous,false);
 if actor is null then raise exception 'approved synthetic actor missing';end if;
 begin perform public.ar_financial_log_prune(gen_random_uuid(),1);raise exception 'invalid actor accepted';
 exception when others then if sqlerrm <> 'financial_forbidden' then raise;end if;end;
 foreach n in array array[0,-1,1001,null] loop
  begin perform public.ar_financial_log_prune(actor,n);raise exception 'invalid limit accepted';
  exception when others then if sqlerrm <> 'financial_log_limit_invalid' then raise;end if;end;
 end loop;
 insert into ar_private.financial_runs(id,owner,hotel,source_from,source_to,reason,proof,status,initial_import)
 values(run,actor,'KAT','1901-01-01','1901-01-01','manual','synthetic','succeeded',false);
 insert into ar_private.financial_changes(run_id,hotel,account_id,kind,identity,next_data,next_status,observed_at)
 select run,'KAT','SYNTHETIC-RETENTION','invoice',g.ordinal::text,'{"synthetic":true}','observed',statement_timestamp()-interval '2 months'+g.ordinal*interval '1 second' from generate_series(1,3)g(ordinal);
 select id into expired_id from ar_private.financial_changes where run_id=run order by id limit 1;
 insert into ar_private.financial_changes(run_id,hotel,account_id,kind,identity,next_data,next_status,observed_at)
 values(run,'KAT','SYNTHETIC-RETENTION','invoice','recent','{"synthetic":true}','observed',statement_timestamp()) returning id into recent_id;
 insert into ar_private.financial_changes(run_id,hotel,account_id,kind,identity,next_data,next_status,observed_at)
 values(run,'KAT','SYNTHETIC-RETENTION','invoice','future','{"synthetic":true}','observed',statement_timestamp()+interval '1 day');
 -- Compare every other application table, including business history and Snapshots.
 before_business:='{}';
 for relation_name in select format('%I.%I',schemaname,tablename) from pg_tables where schemaname in('ar_private','public') and tablename not in('financial_changes','financial_log_retention_state') order by schemaname,tablename loop
  execute format('select md5(coalesce(string_agg(to_jsonb(t)::text,''|'' order by to_jsonb(t)::text),'''')) from %s t',relation_name) into fingerprint;
  before_business:=before_business||jsonb_build_object(relation_name,fingerprint);
 end loop;
 select total_deleted into original_total from ar_private.financial_log_retention_state;
 begin delete from ar_private.financial_changes where id=expired_id;raise exception 'direct expired delete accepted';
 exception when others then if sqlerrm <> 'financial_immutable' then raise;end if;end;
 begin update ar_private.financial_changes set observed_at=statement_timestamp()-interval '3 months' where id=recent_id;raise exception 'log update accepted';
 exception when others then if sqlerrm <> 'financial_immutable' then raise;end if;end;
 -- A privileged test claim still cannot delete a recent row.
 update ar_private.financial_log_retention_state set active_xid=pg_current_xact_id(),active_pid=pg_backend_pid(),active_before=statement_timestamp();
 begin delete from ar_private.financial_changes where id=recent_id;raise exception 'claim deleted recent log';
 exception when others then if sqlerrm <> 'financial_immutable' then raise;end if;end;
 update ar_private.financial_log_retention_state set active_xid=null,active_pid=null,active_before=null;
 result:=public.ar_financial_log_prune(actor,2);
 if result->>'status'<>'succeeded' or (result->>'deleted')::integer<>2 or result->>'moreEligible'<>'true' then raise exception 'bounded first batch failed';end if;
 if exists(select 1 from ar_private.financial_changes where id=expired_id) then raise exception 'oldest log not pruned first';end if;
 if exists(select 1 from ar_private.financial_log_retention_state where active_xid is not null or active_pid is not null or active_before is not null) then raise exception 'cleanup claim leaked';end if;
 begin delete from ar_private.financial_changes where run_id=run and identity='3';raise exception 'claim survived RPC';
 exception when others then if sqlerrm <> 'financial_immutable' then raise;end if;end;
 result:=public.ar_financial_log_prune(actor,1000);
 if result->>'status'<>'succeeded' or result->>'deleted'<>'1' or result->>'moreEligible'<>'false' then raise exception 'remaining batch failed';end if;
 result:=public.ar_financial_log_prune(actor,1000);
 if result->>'deleted'<>'0' or result->>'retentionMonths'<>'1' then raise exception 'cleanup not idempotent';end if;
 if (select count(*) from ar_private.financial_changes where run_id=run)<>2 then raise exception 'recent or future log removed';end if;
 if (select total_deleted from ar_private.financial_log_retention_state)<>original_total+3 then raise exception 'bounded counter invalid';end if;
 after_business:='{}';
 for relation_name in select format('%I.%I',schemaname,tablename) from pg_tables where schemaname in('ar_private','public') and tablename not in('financial_changes','financial_log_retention_state') order by schemaname,tablename loop
  execute format('select md5(coalesce(string_agg(to_jsonb(t)::text,''|'' order by to_jsonb(t)::text),'''')) from %s t',relation_name) into fingerprint;
  after_business:=after_business||jsonb_build_object(relation_name,fingerprint);
 end loop;
 if before_business is distinct from after_business then raise exception 'retention changed other application records';end if;
end$$;

-- A failed batch is atomic and records only a static error, with no active claim.
create function pg_temp.fail_log_cleanup() returns trigger language plpgsql as $$begin raise exception 'synthetic-sensitive-error';end$$;
create trigger zz_synthetic_retention_failure before delete on ar_private.financial_changes for each row execute function pg_temp.fail_log_cleanup();
do $$
declare actor uuid;run uuid;result jsonb;before_total bigint;
begin
 select id into actor from auth.users where lower(email)='ar@katathani.com' and email_confirmed_at is not null;
 select id into run from ar_private.financial_runs where proof='synthetic' and hotel='KAT' limit 1;
 insert into ar_private.financial_changes(run_id,hotel,account_id,kind,identity,next_data,next_status,observed_at)
 values(run,'KAT','SYNTHETIC-RETENTION','invoice','failure','{}','observed',statement_timestamp()-interval '2 months');
 select total_deleted into before_total from ar_private.financial_log_retention_state;
 result:=public.ar_financial_log_prune(actor,1000);
 if result->>'status'<>'error' or result->>'error'<>'cleanup_failed' or result->>'deleted'<>'0' or result::text like '%sensitive%'
 then raise exception 'unsafe or incorrect failure result';end if;
 if not exists(select 1 from ar_private.financial_changes where run_id=run and identity='failure')
 or exists(select 1 from ar_private.financial_log_retention_state where active_xid is not null or active_pid is not null or active_before is not null or total_deleted<>before_total or last_error is distinct from 'cleanup_failed')
 then raise exception 'batch failure did not roll back/clear claim';end if;
end$$;
rollback;
