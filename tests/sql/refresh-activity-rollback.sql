\set ON_ERROR_STOP on
begin;
-- Synthetic local qualification only; never creates users or changes grants in production.
do $$begin if current_database() not like 'ar_active_refresh_%' then raise exception 'local_fixture_only';end if;end$$;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
 ('00000000-0000-4000-8000-000000000001','admin@example.test',now(),false),
 ('00000000-0000-4000-8000-000000000002','staff@example.test',now(),false);
insert into ar_private.access_members(email,active,regions,auth_user_id,setup_state) values
 ('admin@example.test',true,array['phuket','khao-lak'],'00000000-0000-4000-8000-000000000001','ready'),
 ('staff@example.test',true,array['phuket'],'00000000-0000-4000-8000-000000000002','ready');
do $$declare a uuid:='00000000-0000-4000-8000-000000000001';s uuid:='00000000-0000-4000-8000-000000000002';rejected boolean;
begin
 if public.ar_refresh_active_hotels()<>'[]'::jsonb then raise exception 'idle_gate';end if;
 perform public.ar_refresh_activity_touch(a,array['KAT']);
 perform public.ar_refresh_activity_touch(s,array['KAT','TSK']);
 if public.ar_refresh_active_hotels()<>'["KAT","TSK"]'::jsonb then raise exception 'shared_scope';end if;
 perform public.ar_refresh_activity_touch(s,array['KAT','TSK']);
 if (select count(*) from ar_private.refresh_activity)<>3 then raise exception 'duplicate_presence';end if;
 if exists(select 1 from ar_private.refresh_activity where expires_at>clock_timestamp()+interval '6 minutes' or expires_at<now()+interval '5 minutes') then raise exception 'server_expiry';end if;
 rejected:=false;begin perform public.ar_refresh_activity_touch(s,array['TSAN']);exception when others then rejected:=true;end;if not rejected then raise exception 'cross_region';end if;
 rejected:=false;begin perform public.ar_refresh_activity_touch(s,array['KAT','KAT']);exception when others then rejected:=true;end;if not rejected then raise exception 'duplicate_input';end if;
 rejected:=false;begin perform public.ar_refresh_activity_touch('00000000-0000-4000-8000-000000000099',array['KAT']);exception when others then rejected:=true;end;if not rejected then raise exception 'unknown_actor';end if;
 update ar_private.access_members set active=false where auth_user_id=s;
 if public.ar_refresh_active_hotels()<>'["KAT"]'::jsonb then raise exception 'revoked_presence';end if;
 update ar_private.access_members set active=true,regions=array['khao-lak'] where auth_user_id=s;
 if public.ar_refresh_active_hotels()<>'["KAT"]'::jsonb then raise exception 'changed_region';end if;
 update ar_private.refresh_activity set expires_at=now()-interval '1 second';
 if public.ar_refresh_active_hotels()<>'[]'::jsonb then raise exception 'expired_presence';end if;
 if has_table_privilege('authenticated','ar_private.refresh_activity','select') or has_table_privilege('service_role','ar_private.refresh_activity','insert') then raise exception 'table_privilege';end if;
 if has_function_privilege('anon','public.ar_refresh_activity_touch(uuid,text[])','execute') or has_function_privilege('authenticated','public.ar_refresh_active_hotels()','execute') then raise exception 'rpc_privilege';end if;
end$$;
insert into ar_private.refresh_runs(id,hotel,account_id,status,lease_until) values('00000000-0000-4000-8000-000000000010','KAT',null,'running',now()+interval '10 minutes');
insert into ar_private.refresh_stage(job_id,hotel,account_id) values
 ('00000000-0000-4000-8000-000000000010','KAT','a'),('00000000-0000-4000-8000-000000000010','KAT','b');
do $$declare rejected boolean; j uuid:='00000000-0000-4000-8000-000000000010';begin
 if public.ar_refresh_staged_accounts(j,array['a','c'])<>'["a"]'::jsonb then raise exception 'staged_scope';end if;
 rejected:=false;begin perform public.ar_refresh_staged_accounts(j,array['a','a']);exception when others then rejected:=true;end;if not rejected then raise exception 'staged_duplicates';end if;
 update ar_private.refresh_runs set lease_until=now()-interval '1 second' where id=j;
 rejected:=false;begin perform public.ar_refresh_staged_accounts(j,array['a']);exception when others then rejected:=true;end;if not rejected then raise exception 'expired_run';end if;
 if has_function_privilege('authenticated','public.ar_refresh_staged_accounts(uuid,text[])','execute') then raise exception 'staged_privilege';end if;
end$$;
rollback;
select 'PASS: shared activity, scope, expiry, revocation, ACL and staged-ID recovery; synthetic fixture rolled back';
