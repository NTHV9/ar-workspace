-- Fictional identifiers only; fixture is rolled back in the owned synthetic DB.
begin;
do $$
declare o uuid:=ar_private.access_owner();l uuid:=gen_random_uuid();l2 uuid:=gen_random_uuid();r jsonb;g bigint;bad boolean:=false;begin
 insert into ar_private.tracker_bindings(region,owner,file_id,enabled,bootstrap_confirmed) values('phuket',o,'synthetic_probe_file_123456',true,true) on conflict(region) do update set owner=excluded.owner,file_id=excluded.file_id,enabled=true,bootstrap_confirmed=true;
 r:=public.ar_tracker_probe_claim(o,'phuket',l);
 if r->>'status'<>'claimed' or r->>'priorVersion' is not null or r->>'fileId'<>'synthetic_probe_file_123456' then raise exception 'initial claim';end if;
 if public.ar_tracker_probe_claim(o,'phuket',l)->>'status'<>'busy' or public.ar_tracker_probe_claim(o,'phuket',l2)->>'status'<>'busy' then raise exception 'overlap';end if;
 r:=public.ar_tracker_probe_finish('phuket',l,'123');if r->>'status'<>'changed' or r->>'id' is null then raise exception 'initial wake';end if;
 select generation into g from ar_private.tracker_wakes where region='phuket';
 if public.ar_tracker_probe_claim(o,'phuket',l2)->>'status'<>'busy' then raise exception 'cooldown';end if;
 update ar_private.tracker_probe_state set last_checked_at=now()-interval '6 seconds' where region='phuket';
 r:=public.ar_tracker_probe_claim(o,'phuket',l2);if r->>'priorVersion'<>'123' then raise exception 'baseline';end if;
 r:=public.ar_tracker_probe_finish('phuket',l2,'123');if r->>'status'<>'unchanged' or r->>'id' is distinct from (select id::text from ar_private.tracker_wakes where region='phuket') or (select generation from ar_private.tracker_wakes where region='phuket')<>g then raise exception 'unchanged pending hint or churn';end if;
 update ar_private.tracker_probe_state set last_checked_at=now()-interval '6 seconds' where region='phuket';
 l:=gen_random_uuid();perform public.ar_tracker_probe_claim(o,'phuket',l);
 if public.ar_tracker_probe_finish('phuket',l2,'124')->>'status'<>'stale' then raise exception 'wrong token';end if;
 if public.ar_tracker_probe_finish('phuket',l,null)->>'status'<>'failed' or (select prior_version from ar_private.tracker_probe_state where region='phuket')<>'123' then raise exception 'failure baseline';end if;
 update ar_private.tracker_probe_state set last_checked_at=now()-interval '6 seconds' where region='phuket';l2:=gen_random_uuid();perform public.ar_tracker_probe_claim(o,'phuket',l2);
 r:=public.ar_tracker_probe_finish('phuket',l2,'124');if r->>'status'<>'changed' or (select generation from ar_private.tracker_wakes where region='phuket')<>g+1 then raise exception 'changed wake';end if;
 update ar_private.tracker_probe_state set last_checked_at=now()-interval '6 seconds' where region='phuket';l:=gen_random_uuid();perform public.ar_tracker_probe_claim(o,'phuket',l);
 update ar_private.tracker_probe_state set lock_until=now()-interval '1 second' where region='phuket';
 if public.ar_tracker_probe_finish('phuket',l,'125')->>'status'<>'stale' then raise exception 'expired';end if;
 update ar_private.tracker_probe_state set last_checked_at=now()-interval '6 seconds' where region='phuket';l2:=gen_random_uuid();perform public.ar_tracker_probe_claim(o,'phuket',l2);
 if public.ar_tracker_probe_finish('phuket',l,null)->>'status'<>'stale' or (select lock_id from ar_private.tracker_probe_state where region='phuket')<>l2 then raise exception 'stale release';end if;
 update ar_private.tracker_bindings set file_id='synthetic_probe_rebound_12345' where region='phuket';
 if public.ar_tracker_probe_finish('phuket',l2,'125')->>'status'<>'stale' then raise exception 'rebound finish';end if;
 l:=gen_random_uuid();r:=public.ar_tracker_probe_claim(o,'phuket',l);if r->>'status'<>'claimed' or r->>'priorVersion' is not null then raise exception 'rebind reset';end if;
 begin perform public.ar_tracker_probe_finish('phuket',l,'12x');exception when others then bad:=sqlerrm='tracker_probe_invalid';end;if not bad then raise exception 'invalid version';end if;bad:=false;
 begin perform public.ar_tracker_probe_claim(gen_random_uuid(),'phuket',gen_random_uuid());exception when others then bad:=sqlerrm='tracker_forbidden';end;if not bad then raise exception 'owner guard';end if;bad:=false;
 begin perform public.ar_tracker_probe_claim(o,'invalid',gen_random_uuid());exception when others then bad:=sqlerrm='tracker_forbidden';end;if not bad then raise exception 'region guard';end if;
 update ar_private.tracker_bindings set enabled=false where region='phuket';if public.ar_tracker_probe_claim(o,'phuket',gen_random_uuid())->>'status'<>'disabled' or public.ar_tracker_probe_finish('phuket',l,'125')->>'status'<>'stale' then raise exception 'disabled binding';end if;
 if has_function_privilege('authenticated','public.ar_tracker_probe_claim(uuid,text,uuid)','EXECUTE') or has_function_privilege('anon','public.ar_tracker_probe_finish(text,uuid,text)','EXECUTE') or not has_function_privilege('service_role','public.ar_tracker_probe_claim(uuid,text,uuid)','EXECUTE') then raise exception 'service grants';end if;
end $$;
-- Queue failure must roll back the hint baseline and leave the lease retryable.
create function ar_private.synthetic_probe_queue_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic_enqueue_failure';end$$;
do $$
declare o uuid:=ar_private.access_owner();l uuid:=gen_random_uuid();bad boolean:=false;before_state jsonb;m ar_private.access_members;begin
 update ar_private.tracker_bindings set enabled=true where region='phuket';
 update ar_private.tracker_probe_state set last_checked_at=now()-interval '6 seconds',lock_until=null where region='phuket';
 perform public.ar_tracker_probe_claim(o,'phuket',l);
 select to_jsonb(s) into before_state from ar_private.tracker_probe_state s where region='phuket';
 create trigger synthetic_probe_enqueue_failure before insert or update on ar_private.tracker_wakes for each row execute function ar_private.synthetic_probe_queue_failure();
 begin perform public.ar_tracker_probe_finish('phuket',l,'999');exception when others then bad:=sqlerrm='synthetic_enqueue_failure';end;
 if not bad or before_state is distinct from (select to_jsonb(s) from ar_private.tracker_probe_state s where region='phuket') then raise exception 'enqueue atomicity';end if;
 drop trigger synthetic_probe_enqueue_failure on ar_private.tracker_wakes;
 if public.ar_tracker_probe_finish('phuket',l,'999')->>'status'<>'changed' then raise exception 'enqueue retry';end if;
 update ar_private.tracker_probe_state set last_checked_at=now()-interval '6 seconds' where region='phuket';
 if public.ar_tracker_probe_claim(o,'phuket',l)->>'status'<>'busy' then raise exception 'completed token replay';end if;
 select * into m from ar_private.access_members where email='ar@katathani.com';delete from ar_private.access_members where email=m.email;bad:=false;
 begin perform public.ar_tracker_probe_claim(o,'phuket',gen_random_uuid());exception when others then bad:=sqlerrm='tracker_forbidden';end;
 if not bad then raise exception 'membership guard';end if;
 insert into ar_private.access_members select m.*;
end $$;
do $$
declare o uuid:=ar_private.access_owner();l uuid;r jsonb;g bigint;v text;begin
 -- Fingerprints are equality tokens: undo may restore an earlier, lower value.
 -- Exercise 1 -> 2 -> 1 without imposing any monotonic ordering on the token.
 foreach v in array array['1','2','1'] loop
  select generation into g from ar_private.tracker_wakes where region='phuket';
  update ar_private.tracker_probe_state set last_checked_at=now()-interval '6 seconds' where region='phuket';
  l:=gen_random_uuid();r:=public.ar_tracker_probe_claim(o,'phuket',l);
  if r->>'status'<>'claimed' then raise exception 'fingerprint claim';end if;
  r:=public.ar_tracker_probe_finish('phuket',l,v);
  if r->>'status'<>'changed' or (select prior_version from ar_private.tracker_probe_state where region='phuket')<>v or (select generation from ar_private.tracker_wakes where region='phuket')<>g+1 then raise exception 'restored fingerprint must enqueue exactly once';end if;
 end loop;
end $$;
do $$
declare o uuid:=ar_private.access_owner();l uuid:=gen_random_uuid();r jsonb;g bigint;begin
 -- A consumed wake is no longer a dispatch hint; unchanged still does not enqueue.
 update ar_private.tracker_wakes set consumed=generation where region='phuket';
 select generation into g from ar_private.tracker_wakes where region='phuket';
 update ar_private.tracker_probe_state set last_checked_at=now()-interval '6 seconds' where region='phuket';
 perform public.ar_tracker_probe_claim(o,'phuket',l);r:=public.ar_tracker_probe_finish('phuket',l,'1');
 if r->>'status'<>'unchanged' or r->>'id' is not null or (select generation from ar_private.tracker_wakes where region='phuket')<>g then raise exception 'consumed hint or churn';end if;
 -- This fixture created no sheet rows/history/channels. Remove only its synthetic wake
 -- so existing durable-queue FK protection is preserved while testing cache cascade.
 delete from ar_private.tracker_wakes where region='phuket' and file_id='synthetic_probe_rebound_12345';
 delete from ar_private.tracker_bindings where region='phuket' and file_id='synthetic_probe_rebound_12345';
 if exists(select 1 from ar_private.tracker_probe_state where region='phuket') then raise exception 'probe cache did not cascade';end if;
end $$;
rollback;
